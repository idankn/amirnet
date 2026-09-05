"""Export questions into the app as bundled JSON.

    python -m pipeline.export_app            # from the gold set
    python -m pipeline.export_app --from-db  # from validated items in the bank

The gold set is the source while the bank is still empty, so the app has real
content to render from day one. Once generation has run, `--from-db` is the
real path — it pulls only items that cleared stages 3 and 4.

Options are shuffled here with a fixed seed so the export is reproducible and
the answer isn't always first. The app re-shuffles per session at runtime; this
is just so the bundled file isn't itself an answer key in order.
"""

import argparse
import json
import random
from pathlib import Path

from . import config, db, gold

OUT_PATH = config.ROOT / "app" / "src" / "data" / "questions.json"
VOCAB_OUT_PATH = config.ROOT / "app" / "src" / "data" / "vocab.json"
SHUFFLE_SEED = 20260905


def export_vocab(include_drafts: bool = False) -> int:
    """Write the vocab list for the app. Returns how many entries were written."""
    statuses = ("draft", "validated", "live") if include_drafts else ("validated", "live")
    conn = db.connect()
    rows = conn.execute(
        f"""
        SELECT word, pos, definition_en, example, translation_he, cefr_level
          FROM vocab
         WHERE cefr_level IS NOT NULL
           AND status IN ({",".join("?" * len(statuses))})
         ORDER BY cefr_level, word
        """,
        statuses,
    ).fetchall()
    conn.close()

    entries = [
        {
            "word": r["word"],
            "pos": r["pos"] or "",
            "definition": r["definition_en"],
            "example": r["example"] or "",
            "translation": r["translation_he"] or "",
            "cefr": r["cefr_level"],
        }
        for r in rows
    ]

    VOCAB_OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    VOCAB_OUT_PATH.write_text(
        json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return len(entries)


def _entry(qid: str, qtype: str, prompt: str, correct: str,
           distractors: list[str], explanation: str, difficulty: int,
           rng: random.Random, passage_id: str | None = None) -> dict:
    options = [correct, *distractors]
    rng.shuffle(options)
    entry = {
        "id": qid,
        "type": qtype,
        "prompt": prompt,
        "options": options,
        "correctIndex": options.index(correct),
        "explanation": explanation,
        "difficulty": difficulty,
    }
    if passage_id:
        entry["passageId"] = passage_id
    return entry


def from_gold(rng: random.Random) -> tuple[list[dict], list[dict]]:
    passages: list[dict] = []
    questions: list[dict] = []

    for i, item in enumerate(gold.load("sentence_completion"), 1):
        questions.append(_entry(
            f"sc-{i}", "sentence_completion", item.sentence,
            item.correct_answer, list(item.distractors), item.explanation,
            item.difficulty_est, rng,
        ))

    for i, item in enumerate(gold.load("restatement"), 1):
        questions.append(_entry(
            f"rs-{i}", "restatement", item.source_sentence,
            item.correct_answer, [d.text for d in item.distractors],
            item.explanation, item.difficulty_est, rng,
        ))

    for p, item in enumerate(gold.load("reading"), 1):
        passage_id = f"p-{p}"
        passages.append({
            "id": passage_id,
            "topic": item.topic,
            "body": item.body,
        })
        for q, question in enumerate(item.questions, 1):
            questions.append(_entry(
                f"rd-{p}-{q}", "reading", question.prompt,
                question.correct_answer, list(question.distractors),
                question.explanation, question.difficulty_est, rng,
                passage_id=passage_id,
            ))

    return passages, questions


def from_db(rng: random.Random, include_drafts: bool = False) -> tuple[list[dict], list[dict]]:
    statuses = ("draft", "validated", "live") if include_drafts else ("validated", "live")
    conn = db.connect()
    rows = conn.execute(
        f"""
        SELECT * FROM questions
         WHERE status IN ({",".join("?" * len(statuses))})
         ORDER BY type, passage_id, id
        """,
        statuses,
    ).fetchall()

    passages: list[dict] = []
    seen_passages: set[int] = set()
    questions: list[dict] = []

    for row in rows:
        passage_id = None
        if row["passage_id"] is not None:
            passage_id = f"p-{row['passage_id']}"
            if row["passage_id"] not in seen_passages:
                seen_passages.add(row["passage_id"])
                p = conn.execute(
                    "SELECT * FROM passages WHERE id = ?", (row["passage_id"],)
                ).fetchone()
                if p is not None:
                    passages.append({
                        "id": passage_id,
                        "topic": p["topic"] or "",
                        "body": p["body"],
                    })

        distractors = [d["text"] for d in db.get_distractors(conn, row["id"])]
        questions.append(_entry(
            f"q-{row['id']}", row["type"], row["prompt"], row["correct_answer"],
            distractors, row["explanation"] or "", row["difficulty_est"] or 3,
            rng, passage_id=passage_id,
        ))

    conn.close()
    return passages, questions


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-db", action="store_true",
                        help="export items from the bank instead of the gold set")
    parser.add_argument("--include-drafts", action="store_true",
                        help="ALSO export drafts that have not passed the blind check. "
                             "For previewing your own writing only — never for a build "
                             "that reaches users.")
    args = parser.parse_args()

    rng = random.Random(SHUFFLE_SEED)
    passages, questions = (
        from_db(rng, args.include_drafts) if args.from_db else from_gold(rng)
    )

    if not questions:
        raise SystemExit("Nothing to export.")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps({"passages": passages, "questions": questions},
                   ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    by_type: dict[str, int] = {}
    for q in questions:
        by_type[q["type"]] = by_type.get(q["type"], 0) + 1

    source = "bank" if args.from_db else "gold set"
    print(f"Exported {len(questions)} questions "
          f"and {len(passages)} passages from the {source} to {OUT_PATH}")
    for qtype, n in sorted(by_type.items()):
        print(f"  {qtype:<22} {n:>4}")

    n_vocab = export_vocab(args.include_drafts)
    print(f"Exported {n_vocab} vocab entries to {VOCAB_OUT_PATH}")

    if args.include_drafts:
        print(
            "\n*** Includes UNVERIFIED drafts. No second model has solved these\n"
            "    blind, so some may have two defensible answers. Preview only."
        )


if __name__ == "__main__":
    main()
