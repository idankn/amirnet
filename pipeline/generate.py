"""Stage 2 — batch generation.

Produces draft questions and writes them to the bank. Nothing here decides
whether a question is any good; that is stages 3 and 4. Everything this module
writes lands with status='draft'.
"""

import sqlite3

import anthropic

from . import config, db, gold, prompts, wordlist
from .schemas import RestatementBatch, SentenceCompletionBatch

# Room for a batch plus adaptive thinking. If you raise the batch size much
# above ~10, raise this too — a truncated response is a wasted call.
MAX_TOKENS = 16000


class GenerationError(Exception):
    pass


def _parse_batch(client: anthropic.Anthropic, system: str, user: str, output_format):
    """One generation call, returning the validated batch object."""
    response = client.messages.parse(
        model=config.GENERATOR_MODEL,
        max_tokens=MAX_TOKENS,
        thinking={"type": "adaptive"},
        output_config={"effort": "high"},
        system=system,
        messages=[{"role": "user", "content": user}],
        output_format=output_format,
    )

    if response.stop_reason == "refusal":
        detail = getattr(response.stop_details, "explanation", "") or ""
        raise GenerationError(f"Model declined the request. {detail}".strip())
    if response.stop_reason == "max_tokens":
        raise GenerationError(
            "Response hit max_tokens and was truncated — lower the batch size "
            f"or raise MAX_TOKENS (currently {MAX_TOKENS})."
        )

    return response.parsed_output


def sentence_completion(
    client: anthropic.Anthropic,
    conn: sqlite3.Connection,
    *,
    count: int,
    difficulty: int,
    level: str = config.DEFAULT_LEVEL,
) -> list[int]:
    """Generate `count` sentence-completion drafts, one per unused target word.

    `level` is a CEFR level. It is the real difficulty control: the target
    word carries that level from a cited dataset, so the resulting question
    inherits it rather than being labelled by guesswork.
    """
    targets = wordlist.unused(conn, count, level=level)
    if not targets:
        raise GenerationError(
            f"No unused target words left at level {level}. "
            "Rebuild the list with: python -m pipeline.build_wordlist"
        )

    examples = gold.sample("sentence_completion")
    batch = _parse_batch(
        client,
        prompts.SENTENCE_COMPLETION_SYSTEM,
        prompts.sentence_completion_user(examples, targets, difficulty, level),
        SentenceCompletionBatch,
    )

    ids = []
    # The model is asked for one item per target word, in order — but zip
    # rather than index so a short response degrades instead of crashing.
    for item, target in zip(batch.items, targets):
        ids.append(
            db.insert_question(
                conn,
                qtype="sentence_completion",
                prompt=item.sentence,
                correct_answer=item.correct_answer,
                explanation=item.explanation,
                distractors=[(d, None) for d in item.distractors],
                target_word=target.word,
                cefr_level=target.cefr,
                difficulty_est=item.difficulty_est,
            )
        )
    return ids


def restatement(
    client: anthropic.Anthropic,
    conn: sqlite3.Connection,
    *,
    count: int,
    difficulty: int,
) -> list[int]:
    """Generate `count` restatement drafts.

    Unlike sentence completion these aren't anchored to a target word — the
    source sentence's logical structure is what varies.
    """
    examples = gold.sample("restatement")
    batch = _parse_batch(
        client,
        prompts.RESTATEMENT_SYSTEM,
        prompts.restatement_user(examples, count, difficulty),
        RestatementBatch,
    )

    ids = []
    for item in batch.items:
        ids.append(
            db.insert_question(
                conn,
                qtype="restatement",
                prompt=item.source_sentence,
                correct_answer=item.correct_answer,
                explanation=item.explanation,
                distractors=[(d.text, d.distractor_type) for d in item.distractors],
                difficulty_est=item.difficulty_est,
            )
        )
    return ids


GENERATORS = {
    "sentence_completion": sentence_completion,
    "restatement": restatement,
}
