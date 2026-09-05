"""Load hand-authored questions into the bank and run stage 3 on them.

    python -m pipeline.load_authored authored/sentence_completion_001.jsonl
    python -m pipeline.load_authored authored/restatement_001.jsonl
    python -m pipeline.load_authored authored/reading_001.jsonl

This is the no-API-key path into the bank. Questions written by hand skip
stage 2 (generation) but still face stage 3 (mechanical validation), so a
malformed item is caught before it ever reaches a user.

The type is inferred from each item's shape rather than from a flag, so a file
cannot be loaded as the wrong type by mistake:

    sentence          -> sentence_completion
    source_sentence   -> restatement
    body + questions  -> reading (a passage and its five questions)

**What this does NOT do is stage 4.** Nothing loaded here has been solved blind
by a second model, so nothing loaded here is safe to ship. Items land with
status='draft', which is how you find them again:

    python -m pipeline.cli status
"""

import argparse
import json
import sys
from pathlib import Path

from pydantic import ValidationError

from . import config, db, validate
from .schemas import ReadingItem, RestatementItem, SentenceCompletionItem


class Rejected(Exception):
    def __init__(self, problems: list[str]):
        super().__init__("; ".join(problems))
        self.problems = problems


def _load_sentence_completion(conn, raw: dict, seen: list[str], dry: bool) -> int:
    target = raw.pop("target_word", None)
    cefr = raw.pop("cefr", None)
    if not target or cefr not in config.CEFR_LEVELS:
        raise Rejected([f"needs target_word and a cefr of {config.CEFR_LEVELS}"])

    item = SentenceCompletionItem.model_validate(raw)
    existing = db.existing_prompts(conn, "sentence_completion")
    problems = validate.sentence_completion(item, target, existing + seen)
    if problems:
        raise Rejected(problems)

    seen.append(item.sentence)
    if dry:
        return 1

    db.insert_question(
        conn,
        qtype="sentence_completion",
        prompt=item.sentence,
        correct_answer=item.correct_answer,
        explanation=item.explanation,
        distractors=[(d, None) for d in item.distractors],
        target_word=target,
        cefr_level=cefr,
        difficulty_est=item.difficulty_est,
        source="authored",
    )
    return 1


def _load_restatement(conn, raw: dict, seen: list[str], dry: bool) -> int:
    cefr = raw.pop("cefr", None)
    if cefr is not None and cefr not in config.CEFR_LEVELS:
        raise Rejected([f"cefr must be one of {config.CEFR_LEVELS}"])

    item = RestatementItem.model_validate(raw)
    existing = db.existing_prompts(conn, "restatement")
    problems = validate.restatement(item, existing + seen)
    if problems:
        raise Rejected(problems)

    seen.append(item.source_sentence)
    if dry:
        return 1

    db.insert_question(
        conn,
        qtype="restatement",
        prompt=item.source_sentence,
        correct_answer=item.correct_answer,
        explanation=item.explanation,
        distractors=[(d.text, d.distractor_type) for d in item.distractors],
        cefr_level=cefr,
        difficulty_est=item.difficulty_est,
        source="authored",
    )
    return 1


def _load_reading(conn, raw: dict, seen: list[str], dry: bool) -> int:
    cefr = raw.pop("cefr", None)
    if cefr is not None and cefr not in config.CEFR_LEVELS:
        raise Rejected([f"cefr must be one of {config.CEFR_LEVELS}"])

    item = ReadingItem.model_validate(raw)

    problems: list[str] = []
    n_words = len(item.body.split())
    if not config.READING_MIN_WORDS <= n_words <= config.READING_MAX_WORDS:
        problems.append(
            f"passage is {n_words} words, outside "
            f"{config.READING_MIN_WORDS}–{config.READING_MAX_WORDS}"
        )
    kinds = [q.kind for q in item.questions]
    if len(set(kinds)) != len(kinds):
        problems.append(f"each of the five kinds must appear once, got {kinds}")
    if item.body in seen:
        problems.append("duplicate passage")
    if problems:
        raise Rejected(problems)

    seen.append(item.body)
    if dry:
        return len(item.questions)

    cur = conn.execute(
        """
        INSERT INTO passages (kind, topic, body, word_count, source, status)
        VALUES ('reading', ?, ?, ?, 'authored', 'draft')
        """,
        (item.topic, item.body, n_words),
    )
    passage_id = cur.lastrowid

    for question in item.questions:
        db.insert_question(
            conn,
            qtype="reading",
            passage_id=passage_id,
            prompt=question.prompt,
            correct_answer=question.correct_answer,
            explanation=question.explanation,
            distractors=[(d, None) for d in question.distractors],
            cefr_level=cefr,
            difficulty_est=question.difficulty_est,
            source="authored",
        )
    return len(item.questions)


def _dispatch(raw: dict):
    """Pick the loader from the item's shape, so a file can't be mistyped."""
    if "sentence" in raw:
        return _load_sentence_completion
    if "source_sentence" in raw:
        return _load_restatement
    if "body" in raw and "questions" in raw:
        return _load_reading
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path, help="JSONL file of authored questions")
    parser.add_argument("--dry-run", action="store_true",
                        help="validate only, write nothing")
    args = parser.parse_args()

    if not args.path.exists():
        sys.exit(f"No such file: {args.path}")

    conn = db.connect()
    loaded = rejected = 0
    seen: list[str] = []

    for lineno, line in enumerate(args.path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("//"):
            continue

        try:
            raw = json.loads(line)
        except json.JSONDecodeError as exc:
            sys.exit(f"{args.path}:{lineno}: not valid JSON — {exc}")

        loader = _dispatch(raw)
        if loader is None:
            sys.exit(
                f"{args.path}:{lineno}: cannot tell what type this is. Expected "
                f"'sentence', 'source_sentence', or 'body' + 'questions'."
            )

        try:
            loaded += loader(conn, raw, seen, args.dry_run)
        except Rejected as exc:
            rejected += 1
            print(f"  line {lineno} rejected:")
            for p in exc.problems:
                print(f"      - {p}")
        except ValidationError as exc:
            sys.exit(f"{args.path}:{lineno}: {exc}")

    conn.commit()
    conn.close()

    print(f"\n{loaded} questions loaded, {rejected} items rejected"
          + (" (dry run — nothing written)" if args.dry_run else ""))
    if loaded and not args.dry_run:
        print(
            "\nThese are drafts and have NOT been blind-checked. Run stage 4 "
            "before shipping them to anyone."
        )


if __name__ == "__main__":
    main()
