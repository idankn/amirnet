"""Load hand-authored vocabulary entries into the bank.

    python -m pipeline.load_vocab authored/vocab_001.jsonl

Vocab is a different shape from questions: a word list, not multiple choice.
It gets its own validation because the failure modes differ — a definition that
uses the word it defines, or an example that doesn't contain the word, are
useless in ways stage 3 for questions would never catch.

Definitions and examples must be written, never lifted. A commercial
dictionary's wording is copyrighted; ours is not.
"""

import argparse
import json
import re
import sys
from pathlib import Path

from . import config, db, wordlist


def validate_entry(entry: dict, known_levels: dict[str, str]) -> list[str]:
    """Checks that are decidable without a model. Empty list means it passed."""
    problems: list[str] = []
    word = (entry.get("word") or "").strip().lower()
    definition = (entry.get("definition_en") or "").strip()
    example = (entry.get("example") or "").strip()
    cefr = (entry.get("cefr") or "").strip()

    if not word:
        problems.append("missing word")
        return problems
    if not definition:
        problems.append("missing definition_en")
    if cefr not in config.CEFR_LEVELS:
        problems.append(f"cefr must be one of {config.CEFR_LEVELS}, got {cefr!r}")

    # The level must match the source dataset, or the app shows a level that
    # traces to nothing — exactly the unverifiable claim the CEFR anchor exists
    # to prevent.
    actual = known_levels.get(word)
    if actual and cefr and actual != cefr:
        problems.append(f"cefr {cefr} disagrees with the word list ({actual})")

    # Match inflected forms, not just the exact headword: "modify" has to
    # recognise "modified", "require" has to recognise "requiring". Dropping a
    # trailing 'e' or 'y' covers the spelling changes English makes when it
    # inflects, which is enough here.
    stem = word[:-1] if word.endswith(("e", "y")) else word
    inflected = rf"\b{re.escape(stem)}\w*\b"

    # A definition containing the word it defines teaches nothing.
    if definition and re.search(inflected, definition, re.I):
        problems.append("definition contains the word it defines")

    # An example that doesn't use the word cannot show it in context.
    if example and not re.search(inflected, example, re.I):
        problems.append("example sentence does not contain the word")

    if example and len(example.split()) < 6:
        problems.append("example is too short to give real context")

    return problems


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.path.exists():
        sys.exit(f"No such file: {args.path}")

    known_levels = {t.word: t.cefr for t in wordlist.load()}

    conn = db.connect()
    loaded = rejected = 0

    for lineno, line in enumerate(args.path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("//"):
            continue

        try:
            entry = json.loads(line)
        except json.JSONDecodeError as exc:
            sys.exit(f"{args.path}:{lineno}: not valid JSON — {exc}")

        problems = validate_entry(entry, known_levels)
        if problems:
            rejected += 1
            print(f"  line {lineno} ({entry.get('word')}) rejected:")
            for p in problems:
                print(f"      - {p}")
            continue

        if not args.dry_run:
            conn.execute(
                """
                INSERT INTO vocab (word, pos, definition_en, example,
                                   translation_he, cefr_level, source, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
                ON CONFLICT(word) DO UPDATE SET
                    pos = excluded.pos,
                    definition_en = excluded.definition_en,
                    example = excluded.example,
                    translation_he = excluded.translation_he,
                    cefr_level = excluded.cefr_level
                """,
                (
                    entry["word"].strip(),
                    entry.get("pos"),
                    entry["definition_en"].strip(),
                    entry.get("example"),
                    entry.get("translation_he"),
                    entry["cefr"],
                    "authored",
                ),
            )
        loaded += 1

    conn.commit()
    total = loaded + rejected
    print(f"\n{loaded}/{total} passed" + (" (dry run — nothing written)" if args.dry_run else ""))

    if not args.dry_run:
        rows = conn.execute(
            "SELECT cefr_level, COUNT(*) n FROM vocab GROUP BY cefr_level ORDER BY cefr_level"
        ).fetchall()
        print("Vocab in bank:", {r["cefr_level"]: r["n"] for r in rows})
    conn.close()


if __name__ == "__main__":
    main()
