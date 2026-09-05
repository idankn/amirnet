"""Stage 3 — automated validation.

Cheap mechanical checks that run before we spend a second API call on an item.
Everything here is decidable without a model: lengths, shape, overlap,
duplicates.

What is deliberately *not* here is true synonym detection. Deciding whether
"curtail" and "reduce" are close enough to make two options both correct needs
comprehension, so it belongs to the stage 4 blind solve. This module catches
the mechanical version — a distractor that is a morphological variant of the
answer — and leaves the semantic version to the model that can actually judge it.
"""

import difflib
import re
import sqlite3

from . import config, db
from .schemas import BLANK, RestatementItem, SentenceCompletionItem

# Function words carry no content, so they don't count toward the overlap
# measure between a restatement source and its answer.
STOPWORDS = frozenset("""
a an the and or but if while because since although though so that this these those
of in on at to for from by with without into onto over under between among during
is are was were be been being am do does did have has had will would can could may
might must shall should not no nor as than then there their it its they them he she
his her him we us our you your i me my which who whom whose what when where how
""".split())

_SUFFIXES = ("ations", "ation", "ingly", "ments", "ment", "ness", "ings", "ing",
             "ers", "est", "ies", "ied", "ily", "ly", "ed", "es", "s")


def _stem(word: str) -> str:
    """Crude suffix stripper — enough to spot 'reduce' vs 'reduced' vs 'reduction'.

    Not linguistically principled and not meant to be; it only has to catch the
    obvious morphological variants that make two options the same answer.
    """
    w = word.lower().strip(".,;:!?\"'()")
    for suffix in _SUFFIXES:
        if len(w) - len(suffix) >= 4 and w.endswith(suffix):
            return w[: -len(suffix)]
    return w


def _words(text: str) -> list[str]:
    return re.findall(r"[A-Za-z']+", text)


def _content_words(text: str) -> set[str]:
    return {_stem(w) for w in _words(text) if w.lower() not in STOPWORDS}


def _is_duplicate(prompt: str, existing: list[str]) -> str | None:
    """Return the near-identical existing prompt, if there is one."""
    norm = " ".join(_words(prompt)).lower()
    for other in existing:
        other_norm = " ".join(_words(other)).lower()
        ratio = difflib.SequenceMatcher(None, norm, other_norm).ratio()
        if ratio >= config.DUPLICATE_SIMILARITY_THRESHOLD:
            return other
    return None


def _check_options(correct: str, distractors: list[str]) -> list[str]:
    """Shared option-set checks for any multiple-choice item."""
    problems = []

    if len(distractors) != config.N_DISTRACTORS:
        problems.append(f"expected {config.N_DISTRACTORS} distractors, got {len(distractors)}")

    seen = [correct.strip().lower()] + [d.strip().lower() for d in distractors]
    if len(set(seen)) != len(seen):
        problems.append("duplicate options — two choices are the same text")

    correct_stem = {_stem(w) for w in _words(correct)}
    for d in distractors:
        if correct_stem and {_stem(w) for w in _words(d)} == correct_stem:
            problems.append(f"distractor {d!r} is a morphological variant of the answer")

    return problems


def sentence_completion(
    item: SentenceCompletionItem,
    target_word: str,
    existing: list[str],
) -> list[str]:
    """Validate one sentence-completion item. Empty list means it passed."""
    problems = _check_options(item.correct_answer, item.distractors)

    n_blanks = item.sentence.count(BLANK)
    if n_blanks != 1:
        problems.append(f"expected exactly one blank, found {n_blanks}")

    n_words = len(_words(item.sentence.replace(BLANK, " blank ")))
    if not config.SENTENCE_COMPLETION_MIN_WORDS <= n_words <= config.SENTENCE_COMPLETION_MAX_WORDS:
        problems.append(
            f"sentence is {n_words} words, outside "
            f"{config.SENTENCE_COMPLETION_MIN_WORDS}–{config.SENTENCE_COMPLETION_MAX_WORDS}"
        )

    if _stem(item.correct_answer) != _stem(target_word):
        problems.append(
            f"answer {item.correct_answer!r} is not the requested target word {target_word!r}"
        )

    if dupe := _is_duplicate(item.sentence, existing):
        problems.append(f"near-duplicate of existing item: {dupe!r}")

    return problems


def restatement(item: RestatementItem, existing: list[str]) -> list[str]:
    """Validate one restatement item. Empty list means it passed."""
    problems = _check_options(
        item.correct_answer, [d.text for d in item.distractors]
    )

    n_words = len(_words(item.source_sentence))
    if not config.RESTATEMENT_MIN_WORDS <= n_words <= config.RESTATEMENT_MAX_WORDS:
        problems.append(
            f"source is {n_words} words, outside "
            f"{config.RESTATEMENT_MIN_WORDS}–{config.RESTATEMENT_MAX_WORDS}"
        )

    types = [d.distractor_type for d in item.distractors]
    if len(set(types)) != len(types):
        problems.append(f"distractor types must all differ, got {types}")

    # The answer has to be a real re-wording, not the source with two words moved.
    source_content = _content_words(item.source_sentence)
    answer_content = _content_words(item.correct_answer)
    if source_content:
        overlap = len(source_content & answer_content) / len(source_content)
        if overlap > 0.4:
            problems.append(
                f"answer reuses {overlap:.0%} of the source's content words (max 40%)"
            )

    if dupe := _is_duplicate(item.source_sentence, existing):
        problems.append(f"near-duplicate of existing item: {dupe!r}")

    return problems


def run(conn: sqlite3.Connection, question_id: int) -> list[str]:
    """Re-validate a question already in the bank, by id.

    Used by the CLI to check drafts that were inserted before a rule changed.
    """
    row = db.get_question(conn, question_id)
    if row is None:
        raise ValueError(f"No question with id {question_id}")

    distractor_rows = db.get_distractors(conn, question_id)
    others = [
        p for p in db.existing_prompts(conn, row["type"]) if p != row["prompt"]
    ]

    if row["type"] == "sentence_completion":
        item = SentenceCompletionItem(
            sentence=row["prompt"],
            correct_answer=row["correct_answer"],
            distractors=[d["text"] for d in distractor_rows],
            explanation=row["explanation"] or "",
            difficulty_est=row["difficulty_est"] or 3,
        )
        return sentence_completion(item, row["target_word"] or "", others)

    if row["type"] == "restatement":
        item = RestatementItem(
            source_sentence=row["prompt"],
            correct_answer=row["correct_answer"],
            distractors=[
                {"text": d["text"], "distractor_type": d["distractor_type"]}
                for d in distractor_rows
            ],
            explanation=row["explanation"] or "",
            difficulty_est=row["difficulty_est"] or 3,
        )
        return restatement(item, others)

    raise ValueError(f"No stage 3 rules defined for type {row['type']!r}")
