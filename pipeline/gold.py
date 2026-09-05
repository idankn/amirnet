"""The hand-written gold set — stage 1, and the thing everything downstream leans on.

Every generation request carries a few of these as examples. They are what stop
the bank drifting into generically-AI phrasing that doesn't match the real exam's
sentence length, frequency band and distractor style. Nothing here is generated;
if this directory is thin, the whole pipeline produces thin work.
"""

import json
import random
from pathlib import Path

from pydantic import ValidationError

from . import config
from .schemas import ReadingItem, RestatementItem, SentenceCompletionItem

ITEM_MODELS = {
    "sentence_completion": SentenceCompletionItem,
    "restatement": RestatementItem,
    "reading": ReadingItem,
}

# A reading example is a whole passage plus five questions — four of them in one
# prompt is a lot of tokens for little added signal, so few-shot fewer.
EXAMPLES_PER_REQUEST = {
    "reading": 2,
}


class GoldSetError(Exception):
    """Raised when the gold set is missing or malformed — never worked around."""


def gold_path(qtype: str) -> Path:
    return config.GOLD_DIR / f"{qtype}.jsonl"


def load(qtype: str) -> list[SentenceCompletionItem | RestatementItem]:
    """Read and validate the gold set for one question type.

    Validation is strict: a malformed gold example silently teaches the
    generator the wrong shape, which is worse than a crash.
    """
    if qtype not in ITEM_MODELS:
        raise GoldSetError(f"No gold set defined for question type {qtype!r}")

    path = gold_path(qtype)
    if not path.exists():
        raise GoldSetError(
            f"Missing gold set: {path}\n"
            f"Stage 1 is hand-written, not generated. Write examples there first."
        )

    model = ITEM_MODELS[qtype]
    items = []

    for lineno, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line or line.startswith("//"):
            continue
        try:
            items.append(model.model_validate(json.loads(line)))
        except (json.JSONDecodeError, ValidationError) as exc:
            raise GoldSetError(f"{path}:{lineno} is not a valid {qtype} item:\n{exc}") from exc

    if not items:
        raise GoldSetError(f"{path} has no examples in it yet.")

    return items


def sample(
    qtype: str,
    n: int | None = None,
    rng: random.Random | None = None,
) -> list[SentenceCompletionItem | RestatementItem | ReadingItem]:
    """Pick examples to few-shot one generation request.

    Sampled fresh per request rather than fixed, so a whole run isn't anchored
    on the same four sentences — that shows up as repetitive output.
    """
    if n is None:
        n = EXAMPLES_PER_REQUEST.get(qtype, config.GOLD_EXAMPLES_PER_REQUEST)
    items = load(qtype)
    picker = rng or random
    return picker.sample(items, min(n, len(items)))


def status() -> dict[str, int]:
    """How many gold examples exist per type. Used by `cli.py status`."""
    out = {}
    for qtype in ITEM_MODELS:
        try:
            out[qtype] = len(load(qtype))
        except GoldSetError:
            out[qtype] = 0
    return out
