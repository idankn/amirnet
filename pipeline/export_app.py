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
SHUFFLE_SEED = 20260905


def _entry(qid: str, qtype: str, prompt: str, correct: str,
           distractors: list[str], explanation: str, difficulty: int,
           rng: random.Random) -> dict:
    options = [correct, *distractors]
    rng.shuffle(options)
    return {
        "id": qid,
        "type": qtype,
        "prompt": prompt,
        "options": options,
        "correctIndex": options.index(correct),
        "explanation": explanation,
        "difficulty": difficulty,
    }


def from_gold(rng: random.Random) -> list[dict]:
    out = []
    for item in gold.load("sentence_completion"):
        out.append(_entry(
            f"sc-{len(out) + 1}", "sentence_completion", item.sentence,
            item.correct_answer, list(item.distractors), item.explanation,
            item.difficulty_est, rng,
        ))
    n_sc = len(out)
    for item in gold.load("restatement"):
        out.append(_entry(
            f"rs-{len(out) - n_sc + 1}", "restatement", item.source_sentence,
            item.correct_answer, [d.text for d in item.distractors],
            item.explanation, item.difficulty_est, rng,
        ))
    return out


def from_db(rng: random.Random) -> list[dict]:
    conn = db.connect()
    rows = conn.execute(
        """
        SELECT * FROM questions
         WHERE status IN ('validated', 'live')
         ORDER BY type, id
        """
    ).fetchall()

    out = []
    for row in rows:
        distractors = [d["text"] for d in db.get_distractors(conn, row["id"])]
        out.append(_entry(
            f"q-{row['id']}", row["type"], row["prompt"], row["correct_answer"],
            distractors, row["explanation"] or "", row["difficulty_est"] or 3, rng,
        ))
    conn.close()
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-db", action="store_true",
                        help="export validated items from the bank instead of the gold set")
    args = parser.parse_args()

    rng = random.Random(SHUFFLE_SEED)
    questions = from_db(rng) if args.from_db else from_gold(rng)

    if not questions:
        raise SystemExit("Nothing to export.")

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(questions, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    by_type: dict[str, int] = {}
    for q in questions:
        by_type[q["type"]] = by_type.get(q["type"], 0) + 1

    source = "bank" if args.from_db else "gold set"
    print(f"Exported {len(questions)} questions from the {source} to {OUT_PATH}")
    for qtype, n in sorted(by_type.items()):
        print(f"  {qtype:<22} {n:>4}")


if __name__ == "__main__":
    main()
