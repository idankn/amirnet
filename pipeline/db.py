"""SQLite access for the question bank.

Thin on purpose — the pipeline stages own the logic, this module just knows how
rows are shaped. Every generated item lands as `draft` and only moves to
`validated` once stages 3 and 4 have both passed on it.
"""

import sqlite3
from pathlib import Path

from . import config


def connect(db_path: Path | None = None) -> sqlite3.Connection:
    """Open the bank, creating it from schema.sql if it isn't there yet."""
    path = Path(db_path) if db_path else config.DB_PATH
    fresh = not path.exists()

    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")

    if fresh:
        conn.executescript(config.SCHEMA_PATH.read_text(encoding="utf-8"))
        conn.commit()

    return conn


def insert_question(
    conn: sqlite3.Connection,
    *,
    qtype: str,
    prompt: str,
    correct_answer: str,
    explanation: str,
    distractors: list[tuple[str, str | None]],
    target_word: str | None = None,
    frequency_band: int | None = None,
    cefr_level: str | None = None,
    difficulty_est: int | None = None,
    source: str = config.SOURCE_AI,
    status: str = "draft",
    passage_id: int | None = None,
) -> int:
    """Insert one question plus its distractors. Returns the question id.

    `distractors` is a list of (text, distractor_type) — distractor_type is the
    restatement trap tag, or None for types that don't use it.
    """
    cur = conn.execute(
        """
        INSERT INTO questions (
            type, passage_id, prompt, correct_answer, explanation,
            target_word, frequency_band, cefr_level, difficulty_est, source, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            qtype,
            passage_id,
            prompt,
            correct_answer,
            explanation,
            target_word,
            frequency_band,
            cefr_level,
            difficulty_est,
            source,
            status,
        ),
    )
    question_id = cur.lastrowid

    conn.executemany(
        """
        INSERT INTO distractors (question_id, text, distractor_type, position)
        VALUES (?, ?, ?, ?)
        """,
        [
            (question_id, text, dtype, i)
            for i, (text, dtype) in enumerate(distractors)
        ],
    )
    conn.commit()
    return question_id


def set_verdict(
    conn: sqlite3.Connection,
    question_id: int,
    *,
    status: str,
    validator_verdict: str | None = None,
    reject_reason: str | None = None,
) -> None:
    """Record the outcome of a validation stage against a question."""
    conn.execute(
        """
        UPDATE questions
           SET status = ?,
               validator_verdict = COALESCE(?, validator_verdict),
               reject_reason = COALESCE(?, reject_reason),
               updated_at = datetime('now')
         WHERE id = ?
        """,
        (status, validator_verdict, reject_reason, question_id),
    )
    conn.commit()


def existing_prompts(conn: sqlite3.Connection, qtype: str) -> list[str]:
    """Every prompt already in the bank for a type — the duplicate corpus.

    Includes rejected items deliberately: if we rejected a sentence once, we
    don't want to spend another validation round on a near-copy of it.
    """
    rows = conn.execute(
        "SELECT prompt FROM questions WHERE type = ?", (qtype,)
    ).fetchall()
    return [r["prompt"] for r in rows]


def get_question(conn: sqlite3.Connection, question_id: int) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM questions WHERE id = ?", (question_id,)
    ).fetchone()


def get_distractors(conn: sqlite3.Connection, question_id: int) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT * FROM distractors WHERE question_id = ? ORDER BY position",
        (question_id,),
    ).fetchall()


def counts_by_status(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    """Bank composition — what the end-of-September checkpoint is measured against."""
    return conn.execute(
        """
        SELECT type, status, COUNT(*) AS n
          FROM questions
         GROUP BY type, status
         ORDER BY type, status
        """
    ).fetchall()
