"""Command line for the generation pipeline.

    python -m pipeline.cli init
    python -m pipeline.cli status
    python -m pipeline.cli generate --type sentence_completion --count 8 --difficulty 3
    python -m pipeline.cli review --type sentence_completion
"""

import argparse
import os
import random
import sys

import anthropic

from . import config, db, generate, gold, validate, verify

TYPES = ("sentence_completion", "restatement")


def _client() -> anthropic.Anthropic:
    if not os.environ.get("ANTHROPIC_API_KEY"):
        sys.exit(
            "ANTHROPIC_API_KEY is not set.\n"
            "Get a key at console.anthropic.com, then:\n"
            "  PowerShell:  $env:ANTHROPIC_API_KEY = 'sk-ant-...'\n"
            "  bash:        export ANTHROPIC_API_KEY=sk-ant-..."
        )
    return anthropic.Anthropic()


# ---------------------------------------------------------------- commands

def cmd_init(args) -> None:
    conn = db.connect()
    conn.close()
    print(f"Bank ready at {config.DB_PATH}")


def cmd_status(args) -> None:
    print("Gold set (stage 1 — hand-written):")
    for qtype, n in gold.status().items():
        note = "" if n >= 15 else "   <- thin; generation quality tracks this"
        print(f"  {qtype:<22} {n:>4}{note}")

    conn = db.connect()
    rows = db.counts_by_status(conn)
    conn.close()

    print("\nBank:")
    if not rows:
        print("  empty")
        return

    validated = 0
    for r in rows:
        print(f"  {r['type']:<22} {r['status']:<12} {r['n']:>4}")
        if r["status"] in ("validated", "live"):
            validated += r["n"]
    print(f"\n  validated + live: {validated}   (end-of-September checkpoint: 300)")


def cmd_generate(args) -> None:
    """Stage 2 -> 3 -> 4 in one pass."""
    client = _client()
    conn = db.connect()

    try:
        gold.load(args.type)
    except gold.GoldSetError as exc:
        conn.close()
        sys.exit(f"{exc}")

    print(f"Generating {args.count} {args.type} drafts at difficulty {args.difficulty}...")
    generator = generate.GENERATORS[args.type]
    kwargs = {"count": args.count, "difficulty": args.difficulty}
    if args.type == "sentence_completion":
        kwargs["band"] = args.band

    try:
        ids = generator(client, conn, **kwargs)
    except (generate.GenerationError, anthropic.APIError) as exc:
        conn.close()
        sys.exit(f"Generation failed: {exc}")

    print(f"  {len(ids)} drafts written.\n")

    # Stage 3 — mechanical checks. Cheap, so it runs first and spares us a
    # stage 4 call on anything already known to be malformed.
    survivors = []
    for qid in ids:
        problems = validate.run(conn, qid)
        if problems:
            db.set_verdict(
                conn, qid, status="rejected", reject_reason="; ".join(problems)
            )
            print(f"  [stage 3] #{qid} rejected: {problems[0]}")
        else:
            survivors.append(qid)

    print(f"\nStage 3: {len(survivors)}/{len(ids)} passed.\n")

    # Stage 4 — the blind check.
    passed = []
    for qid in survivors:
        try:
            result = verify.check(client, conn, qid)
        except (anthropic.APIError, RuntimeError) as exc:
            print(f"  [stage 4] #{qid} could not be checked: {exc}")
            continue
        if result.passed:
            passed.append(qid)
            print(f"  [stage 4] #{qid} validated")
        else:
            print(f"  [stage 4] #{qid} {result.verdict}: {result.reason}")

    conn.close()

    kept = len(passed)
    print(f"\nStage 4: {kept}/{len(survivors)} passed.")
    print(f"Net: {kept} validated from {len(ids)} generated ({kept / len(ids):.0%} yield).")
    if kept:
        print(f"\nNow sample by hand:  python -m pipeline.cli review --type {args.type}")


def cmd_review(args) -> None:
    """Stage 5 — manual sampling.

    You review 10% of what survived stage 4. If more than 3 in 20 are bad, the
    batch is junk and the prompt needs fixing — that is the signal this command
    exists to give you.
    """
    conn = db.connect()
    rows = conn.execute(
        """
        SELECT id FROM questions
         WHERE status = 'validated' AND type = ?
         ORDER BY id
        """,
        (args.type,),
    ).fetchall()

    if not rows:
        conn.close()
        sys.exit(f"No validated {args.type} questions to review.")

    n = args.n or max(1, round(len(rows) * 0.10))
    sample = random.sample([r["id"] for r in rows], min(n, len(rows)))

    print(f"Reviewing {len(sample)} of {len(rows)} validated {args.type} items.")
    print("Mark each: [k]eep  [r]eject  [q]uit\n")

    rejected = 0
    for i, qid in enumerate(sample, 1):
        row = db.get_question(conn, qid)
        options = [row["correct_answer"]] + [
            d["text"] for d in db.get_distractors(conn, qid)
        ]

        print(f"--- {i}/{len(sample)}  #{qid}  difficulty {row['difficulty_est']}")
        print(f"{row['prompt']}\n")
        print(f"  * {options[0]}")
        for opt in options[1:]:
            print(f"    {opt}")
        print(f"\n  {row['explanation']}\n")

        answer = input("  [k/r/q] ").strip().lower()
        if answer == "q":
            break
        if answer == "r":
            reason = input("  what's wrong with it? ").strip()
            db.set_verdict(
                conn,
                qid,
                status="rejected",
                reject_reason=f"manual review: {reason}",
            )
            rejected += 1
        print()

    conn.close()

    print(f"Rejected {rejected} of {len(sample)}.")
    if len(sample) >= 20 and rejected > 3:
        print(
            "\nMore than 3 in 20 failed — treat this batch as junk and fix the "
            "prompt before generating more."
        )


def cmd_validate(args) -> None:
    conn = db.connect()
    problems = validate.run(conn, args.id)
    conn.close()
    if problems:
        print(f"#{args.id} fails stage 3:")
        for p in problems:
            print(f"  - {p}")
    else:
        print(f"#{args.id} passes stage 3.")


# ---------------------------------------------------------------- wiring

def main(argv=None) -> None:
    # Windows consoles default to a legacy codepage. Generated English text
    # routinely contains curly quotes and dashes, which raise
    # UnicodeEncodeError on print() there — mid-review, after the API spend.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(prog="pipeline", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("init", help="create the question bank").set_defaults(func=cmd_init)
    sub.add_parser("status", help="gold set and bank counts").set_defaults(func=cmd_status)

    p_gen = sub.add_parser("generate", help="run stages 2-4 on a new batch")
    p_gen.add_argument("--type", choices=TYPES, required=True)
    p_gen.add_argument("--count", type=int, default=8, help="questions per batch")
    p_gen.add_argument("--difficulty", type=int, choices=range(1, 6), default=3)
    p_gen.add_argument("--band", type=int, choices=range(1, 6), help="frequency band to draw target words from")
    p_gen.set_defaults(func=cmd_generate)

    p_rev = sub.add_parser("review", help="stage 5 manual sampling")
    p_rev.add_argument("--type", choices=TYPES, required=True)
    p_rev.add_argument("--n", type=int, help="how many to review (default: 10%%)")
    p_rev.set_defaults(func=cmd_review)

    p_val = sub.add_parser("validate", help="re-run stage 3 on one question")
    p_val.add_argument("id", type=int)
    p_val.set_defaults(func=cmd_validate)

    args = parser.parse_args(argv)
    args.func(args)


if __name__ == "__main__":
    main()
