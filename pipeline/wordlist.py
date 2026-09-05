"""Target words for generation, with their frequency band.

Sentence-completion and vocab items are built *around* a chosen target word
rather than generated free-form — that is what keeps the bank inside the
frequency band the real exam sits in, and what makes coverage measurable.

Source these from open frequency lists and the Academic Word List. Check each
list's licence before use; do not scrape a commercial word list.

File format — `wordlists/targets.tsv`, one word per line:

    word<TAB>band

where band is 1 (most frequent) to 5 (least). Lines starting with # are ignored.
"""

import sqlite3
from pathlib import Path

from . import config


class WordListError(Exception):
    pass


TARGETS_PATH = config.ROOT / "wordlists" / "targets.tsv"


def load(path: Path | None = None) -> list[tuple[str, int]]:
    """Read the target word list as (word, band) pairs."""
    p = Path(path) if path else TARGETS_PATH
    if not p.exists():
        raise WordListError(
            f"Missing word list: {p}\n"
            f"See wordlists/README.md for where to source one."
        )

    words: list[tuple[str, int]] = []
    for lineno, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 2:
            raise WordListError(f"{p}:{lineno}: expected 'word<TAB>band', got {line!r}")
        word, band = parts[0].strip(), parts[1].strip()
        if not band.isdigit() or not 1 <= int(band) <= 5:
            raise WordListError(f"{p}:{lineno}: band must be 1–5, got {band!r}")
        words.append((word, int(band)))

    if not words:
        raise WordListError(f"{p} is empty.")
    return words


def unused(
    conn: sqlite3.Connection,
    n: int,
    *,
    band: int | None = None,
    path: Path | None = None,
) -> list[tuple[str, int]]:
    """Pick `n` target words the bank hasn't built a question around yet.

    Words already attempted — including ones whose question was rejected — are
    skipped, so a run doesn't keep grinding on the same vocabulary.
    """
    rows = conn.execute(
        "SELECT DISTINCT target_word FROM questions WHERE target_word IS NOT NULL"
    ).fetchall()
    taken = {r["target_word"].lower() for r in rows}

    pool = [
        (w, b)
        for w, b in load(path)
        if w.lower() not in taken and (band is None or b == band)
    ]
    return pool[:n]
