"""Pydantic shapes for everything the models hand back.

These are passed to `client.messages.parse(output_format=...)`, so the API
returns validated objects rather than prose we have to regex. Field
descriptions are part of the prompt the model sees — they carry real weight,
so keep them precise.
"""

from typing import Literal

from pydantic import BaseModel, Field

from . import config

# ---------------------------------------------------------------- generation

BLANK = "______"


class SentenceCompletionItem(BaseModel):
    """One sentence-completion question."""

    sentence: str = Field(
        description=(
            f"A {config.SENTENCE_COMPLETION_MIN_WORDS}–"
            f"{config.SENTENCE_COMPLETION_MAX_WORDS} word sentence with exactly one "
            f"blank written as {BLANK}. Academic register, neutral topic. No "
            "syntactic cue (article, preposition, agreement) that narrows the answer "
            "to one option without understanding the meaning."
        )
    )
    correct_answer: str = Field(
        description="The word or short phrase that fills the blank. Must be the target word."
    )
    distractors: list[str] = Field(
        min_length=config.N_DISTRACTORS,
        max_length=config.N_DISTRACTORS,
        description=(
            "Three wrong options. Each must fit the blank grammatically but be "
            "clearly wrong on meaning. None may be a synonym of the correct answer, "
            "and none may be defensible as a second correct reading."
        ),
    )
    explanation: str = Field(
        description=(
            "Two or three sentences, in English, saying why the correct answer is "
            "right and what specifically rules out the others. This is shown to the "
            "learner after they answer."
        )
    )
    difficulty_est: int = Field(
        ge=1, le=5, description="Estimated difficulty, 1 (easiest) to 5 (hardest)."
    )


class RestatementDistractor(BaseModel):
    text: str = Field(description="The wrong restatement.")
    distractor_type: Literal["logic_flip", "agent_swap", "timing_shift"] = Field(
        description=(
            "How this option is wrong. logic_flip: reverses a causal or conditional "
            "relation. agent_swap: swaps who does what to whom. timing_shift: moves "
            "the event in time or changes its completion. The three distractors in "
            "one item must use three different types."
        )
    )


class RestatementItem(BaseModel):
    """One restatement question."""

    source_sentence: str = Field(
        description=(
            f"A {config.RESTATEMENT_MIN_WORDS}–{config.RESTATEMENT_MAX_WORDS} word "
            "sentence with a clear logical structure worth restating — a cause, a "
            "condition, a contrast, or a sequence."
        )
    )
    correct_answer: str = Field(
        description=(
            "A restatement that preserves the meaning exactly while sharing as little "
            "wording as possible with the source. Reuse of the source's content words "
            "should be under 40%."
        )
    )
    distractors: list[RestatementDistractor] = Field(
        min_length=config.N_DISTRACTORS,
        max_length=config.N_DISTRACTORS,
        description="Three wrong restatements, each wrong in a different one of the three ways.",
    )
    explanation: str = Field(
        description=(
            "Two or three sentences, in English, naming the specific change each wrong "
            "option makes to the source. Shown to the learner after they answer."
        )
    )
    difficulty_est: int = Field(ge=1, le=5, description="Estimated difficulty, 1 to 5.")


class SentenceCompletionBatch(BaseModel):
    items: list[SentenceCompletionItem]


class RestatementBatch(BaseModel):
    items: list[RestatementItem]


# ---------------------------------------------------------------- stage 4

class BlindVerdict(BaseModel):
    """What the second model reports after solving an item without the key.

    Stage 4 of the pipeline. The single most valuable field is
    `has_multiple_correct` — a distractor that is also defensibly correct is the
    #1 failure mode of AI-written questions, and the one that gets an app
    pulled over "the answers are wrong" reviews.
    """

    chosen_option: int = Field(
        ge=1,
        description="1-based index of the option the solver believes is correct.",
    )
    confidence: Literal["high", "medium", "low"] = Field(
        description=(
            "high: exactly one option is defensible. medium: one is best but another "
            "is arguable. low: genuinely torn, or the item is unclear."
        )
    )
    has_multiple_correct: bool = Field(
        description=(
            "True if more than one option could be defended as correct by a careful "
            "reader. Be strict — this is the check the whole stage exists for."
        )
    )
    problem: str = Field(
        description=(
            "What is confusing, ambiguous, or wrong with the item. Empty string if "
            "nothing is."
        )
    )
