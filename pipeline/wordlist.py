"""Target words for generation, carrying a CEFR level.

Sentence-completion and vocab items are built *around* a chosen target word
rather than generated free-form. With a CEFR-labelled word, the question's
level becomes a property of its input instead of something the model estimates
— which is what makes "this is a B2 question" a defensible claim rather than a
guess dressed up as a fact.

The list is generated: `python -m pipeline.build_wordlist`. Do not hand-edit
`targets.tsv`.

File format — `wordlists/targets.tsv`:

    word<TAB>pos<TAB>cefr

Lines starting with # are ignored.
"""

import sqlite3
from dataclasses import dataclass
from pathlib import Path

from . import config


class WordListError(Exception):
    pass


TARGETS_PATH = config.ROOT / "wordlists" / "targets.tsv"


@dataclass(frozen=True)
class Target:
    word: str
    pos: str
    cefr: str


def load(path: Path | None = None) -> list[Target]:
    """Read the target word list."""
    p = Path(path) if path else TARGETS_PATH
    if not p.exists():
        raise WordListError(
            f"Missing word list: {p}\n"
            f"Build it with: python -m pipeline.build_wordlist"
        )

    targets: list[Target] = []
    for lineno, line in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != 3:
            raise WordListError(
                f"{p}:{lineno}: expected 'word<TAB>pos<TAB>cefr', got {line!r}"
            )
        word, pos, cefr = (x.strip() for x in parts)
        if cefr not in config.CEFR_LEVELS:
            raise WordListError(
                f"{p}:{lineno}: level must be one of {config.CEFR_LEVELS}, got {cefr!r}"
            )
        targets.append(Target(word=word, pos=pos, cefr=cefr))

    if not targets:
        raise WordListError(f"{p} is empty.")
    return targets


def unused(
    conn: sqlite3.Connection,
    n: int,
    *,
    level: str | None = None,
    pos: str | None = None,
    path: Path | None = None,
) -> list[Target]:
    """Pick `n` target words the bank hasn't built a question around yet.

    Words already attempted — including ones whose question was rejected — are
    skipped, so a run doesn't keep grinding on the same vocabulary.
    """
    if level is not None and level not in config.CEFR_LEVELS:
        raise WordListError(
            f"Unknown CEFR level {level!r}; expected one of {config.CEFR_LEVELS}"
        )

    rows = conn.execute(
        "SELECT DISTINCT target_word FROM questions WHERE target_word IS NOT NULL"
    ).fetchall()
    taken = {r["target_word"].lower() for r in rows}

    pool = [
        t
        for t in load(path)
        if t.word.lower() not in taken
        and (level is None or t.cefr == level)
        and (pos is None or t.pos == pos)
    ]
    return pool[:n]


def counts_by_level(path: Path | None = None) -> dict[str, int]:
    """How many target words exist per level. Used by `cli.py status`."""
    out: dict[str, int] = {lvl: 0 for lvl in config.CEFR_LEVELS}
    for t in load(path):
        out[t.cefr] = out.get(t.cefr, 0) + 1
    return out
