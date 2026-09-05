"""Load the gold set into the bank as drafts.

    python -m pipeline.load_gold

The gold set's first job is to be few-shot examples for generation, and it
stays that. But those items are also hand-written questions, and leaving them
only in `gold/*.jsonl` meant the bank held sentence completions and nothing
else — so an export from the bank silently lost every restatement and reading
item.

They land as drafts, like anything else that hasn't been blind-checked.
Re-running is safe: an item already in the bank is skipped rather than
duplicated.
"""

import sqlite3

from . import db, gold


def _already_there(conn: sqlite3.Connection, qtype: str, prompt: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM questions WHERE type = ? AND prompt = ? LIMIT 1",
        (qtype, prompt),
    ).fetchone()
    return row is not None


def main() -> None:
    conn = db.connect()
    added = skipped = 0

    for item in gold.load("sentence_completion"):
        if _already_there(conn, "sentence_completion", item.sentence):
            skipped += 1
            continue
        db.insert_question(
            conn,
            qtype="sentence_completion",
            prompt=item.sentence,
            correct_answer=item.correct_answer,
            explanation=item.explanation,
            distractors=[(d, None) for d in item.distractors],
            target_word=item.correct_answer,
            difficulty_est=item.difficulty_est,
            source="gold",
        )
        added += 1

    for item in gold.load("restatement"):
        if _already_there(conn, "restatement", item.source_sentence):
            skipped += 1
            continue
        db.insert_question(
            conn,
            qtype="restatement",
            prompt=item.source_sentence,
            correct_answer=item.correct_answer,
            explanation=item.explanation,
            distractors=[(d.text, d.distractor_type) for d in item.distractors],
            difficulty_est=item.difficulty_est,
            source="gold",
        )
        added += 1

    # Reading needs its passage inserted first — the questions reference it.
    for item in gold.load("reading"):
        existing = conn.execute(
            "SELECT id FROM passages WHERE body = ?", (item.body,)
        ).fetchone()
        if existing:
            passage_id = existing["id"]
        else:
            cur = conn.execute(
                """
                INSERT INTO passages (kind, topic, body, word_count, source, status)
                VALUES ('reading', ?, ?, ?, 'authored', 'draft')
                """,
                (item.topic, item.body, len(item.body.split())),
            )
            passage_id = cur.lastrowid

        for question in item.questions:
            if _already_there(conn, "reading", question.prompt):
                skipped += 1
                continue
            db.insert_question(
                conn,
                qtype="reading",
                passage_id=passage_id,
                prompt=question.prompt,
                correct_answer=question.correct_answer,
                explanation=question.explanation,
                distractors=[(d, None) for d in question.distractors],
                difficulty_est=question.difficulty_est,
                source="gold",
            )
            added += 1

    conn.commit()
    rows = db.counts_by_status(conn)
    conn.close()

    print(f"Added {added}, skipped {skipped} already present.")
    for r in rows:
        print(f"  {r['type']:<22} {r['status']:<12} {r['n']:>4}")


if __name__ == "__main__":
    main()
