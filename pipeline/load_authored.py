"""Load hand-authored questions into the bank and run stage 3 on them.

    python -m pipeline.load_authored authored/sentence_completion_001.jsonl

This is the no-API-key path into the bank. Questions written by hand skip
stage 2 (generation) but still face stage 3 (mechanical validation), so a
malformed item is caught before it ever reaches a user.

**What this does NOT do is stage 4.** Nothing loaded here has been solved blind
by a second model, so nothing loaded here is safe to ship. Items land with
status='draft' and validator_verdict=NULL, which is precisely how you tell them
apart from validated ones later:

    python -m pipeline.cli status

Run the blind check over everything still sitting in draft once an API key is
available — that is what moves them to 'validated'.
"""

import argparse
import json
import sys
from pathlib import Path

from pydantic import ValidationError

from . import config, db, validate
from .schemas import SentenceCompletionItem


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path, help="JSONL file of authored questions")
    parser.add_argument("--dry-run", action="store_true",
                        help="validate only, write nothing")
    args = parser.parse_args()

    if not args.path.exists():
        sys.exit(f"No such file: {args.path}")

    conn = db.connect()
    existing = db.existing_prompts(conn, "sentence_completion")

    loaded = 0
    rejected = 0
    seen_in_file: list[str] = []

    for lineno, line in enumerate(args.path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("//"):
            continue

        try:
            raw = json.loads(line)
        except json.JSONDecodeError as exc:
            sys.exit(f"{args.path}:{lineno}: not valid JSON — {exc}")

        target = raw.pop("target_word", None)
        cefr = raw.pop("cefr", None)
        if not target or cefr not in config.CEFR_LEVELS:
            sys.exit(
                f"{args.path}:{lineno}: every item needs target_word and a cefr "
                f"of {config.CEFR_LEVELS}"
            )

        try:
            item = SentenceCompletionItem.model_validate(raw)
        except ValidationError as exc:
            sys.exit(f"{args.path}:{lineno}: {exc}")

        # Stage 3, against the bank AND against earlier items in this same file
        # — a batch can contradict itself as easily as it can contradict the bank.
        problems = validate.sentence_completion(item, target, existing + seen_in_file)
        if problems:
            rejected += 1
            print(f"  line {lineno} ({target}) rejected:")
            for p in problems:
                print(f"      - {p}")
            continue

        seen_in_file.append(item.sentence)
        if args.dry_run:
            loaded += 1
            continue

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
            status="draft",
        )
        loaded += 1

    conn.close()

    total = loaded + rejected
    print(f"\n{loaded}/{total} passed stage 3" + (" (dry run — nothing written)" if args.dry_run else ""))
    if rejected:
        print(f"{rejected} rejected. Fix them in {args.path} and re-run.")
    if loaded and not args.dry_run:
        print(
            "\nThese are drafts and have NOT been blind-checked. Run stage 4 "
            "before shipping them to anyone."
        )


if __name__ == "__main__":
    main()
