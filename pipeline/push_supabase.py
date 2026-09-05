"""Push question content into Supabase.

    set SUPABASE_URL=https://xxxx.supabase.co
    set SUPABASE_SERVICE_ROLE_KEY=...
    python -m pipeline.push_supabase              # from the gold set
    python -m pipeline.push_supabase --from-db    # from validated bank items

**The service role key bypasses row-level security entirely.** It is not the
anon key the app ships with — it can read and write every row for every user.
Keep it in your environment, never in the repo, never in the app bundle, and
never in a screenshot. If it leaks, rotate it in the Supabase dashboard
immediately.

Content is the only thing written here. Profiles, attempts and reports belong
to users and are never touched by this script.
"""

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

from . import config, db, gold
from .export_app import from_db, from_gold
import random

# The free demo: a fixed slice that stays free forever, sized to let someone
# meet every question type at least once. Reading counts whole passages, since
# a passage's questions make no sense split up.
FREE_SAMPLE = {
    "sentence_completion": 5,
    "restatement": 3,
}
FREE_READING_PASSAGES = 1


def _request(url: str, key: str, payload: list[dict], on_conflict: str) -> None:
    """Upsert rows via PostgREST."""
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{url}?on_conflict={on_conflict}",
        data=body,
        method="POST",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
    )
    try:
        urllib.request.urlopen(req)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")
        raise SystemExit(f"Supabase rejected the write ({exc.code}):\n{detail}") from exc


def mark_free(passages: list[dict], questions: list[dict]) -> None:
    """Flag the demo slice, in place.

    Deterministic given the same input, so re-running doesn't silently move
    which questions are free — a user who bookmarked a free question should
    still find it free tomorrow.
    """
    rng = random.Random(config.__dict__.get("FREE_SAMPLE_SEED", 1234))

    free_passage_ids = {p["id"] for p in passages[:FREE_READING_PASSAGES]}
    for p in passages:
        p["is_free"] = p["id"] in free_passage_ids

    by_type: dict[str, list[dict]] = {}
    for q in questions:
        by_type.setdefault(q["type"], []).append(q)

    free_ids: set[str] = set()
    for qtype, n in FREE_SAMPLE.items():
        pool = sorted(by_type.get(qtype, []), key=lambda q: q["id"])
        free_ids.update(q["id"] for q in pool[:n])

    for q in questions:
        # A reading question is free exactly when its passage is.
        if q.get("passageId"):
            q["is_free"] = q["passageId"] in free_passage_ids
        else:
            q["is_free"] = q["id"] in free_ids


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--from-db", action="store_true",
                        help="push validated bank items instead of the gold set")
    parser.add_argument("--dry-run", action="store_true",
                        help="show what would be pushed, write nothing")
    args = parser.parse_args()

    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not args.dry_run and (not url or not key):
        sys.exit(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n"
            "Find both in your Supabase dashboard under Project Settings -> API.\n"
            "The service role key is secret — do not commit it."
        )

    rng = random.Random(20260905)
    passages, questions = from_db(rng) if args.from_db else from_gold(rng)
    mark_free(passages, questions)

    passage_rows = [
        {"id": p["id"], "topic": p["topic"], "body": p["body"], "is_free": p["is_free"]}
        for p in passages
    ]
    question_rows = [
        {
            "id": q["id"],
            "type": q["type"],
            "passage_id": q.get("passageId"),
            "prompt": q["prompt"],
            "options": q["options"],
            "correct_index": q["correctIndex"],
            "explanation": q["explanation"],
            "difficulty": q["difficulty"],
            "is_free": q["is_free"],
        }
        for q in questions
    ]

    n_free = sum(1 for q in question_rows if q["is_free"])
    print(f"{len(passage_rows)} passages, {len(question_rows)} questions")
    print(f"  free demo:  {n_free}")
    print(f"  members:    {len(question_rows) - n_free}")

    if args.dry_run:
        print("\n--dry-run: nothing written.")
        for q in question_rows:
            if q["is_free"]:
                print(f"  free: {q['id']:<10} {q['prompt'][:60]}")
        return

    # Passages first — questions reference them.
    _request(f"{url}/rest/v1/passages", key, passage_rows, "id")
    _request(f"{url}/rest/v1/questions", key, question_rows, "id")
    print("\nPushed.")


if __name__ == "__main__":
    main()
