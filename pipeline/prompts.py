"""Prompt construction for stage 2 (generation) and stage 4 (blind check).

Two rules shape everything here:

1. Never ask for a question with no context. Every generation request carries
   gold examples, a target word, and a requested difficulty. Free-form requests
   are what produce banks that don't feel like the real exam.
2. The stage 4 solver must never see the answer key, the explanation, or the
   fact that a specific option is intended to be correct.
"""

import json

from . import config
from .schemas import BLANK, RestatementItem, SentenceCompletionItem

# ---------------------------------------------------------------- shared

_ORIGINALITY = (
    "Everything you write must be original. Mirror the structure, sentence "
    "length, register and difficulty of standardized English exams, but never "
    "reproduce or lightly reword a sentence from a real exam, textbook, or "
    "published practice test."
)

# ---------------------------------------------------------------- stage 2

SENTENCE_COMPLETION_SYSTEM = f"""\
You write sentence-completion questions for AMIRNET, the Israeli standardized \
English placement exam. Test-takers are 18–25, preparing for university admission, \
and read English as a second language.

{_ORIGINALITY}

Each question is one sentence with a single blank, four options, and one correct answer.

Hard requirements:
- The sentence is {config.SENTENCE_COMPLETION_MIN_WORDS}–\
{config.SENTENCE_COMPLETION_MAX_WORDS} words, counting the blank as one word.
- Exactly one blank, written as {BLANK}.
- The correct answer is the target word you are given. Build the sentence so that \
this word — and only this word — completes it sensibly.
- The sentence must supply enough context to determine the answer from meaning. A \
reader who knows all four words should be able to choose without guessing.
- No syntactic giveaway. All four options must fit the slot grammatically: same part \
of speech, and compatible with the surrounding article, preposition and agreement. \
If three options can be eliminated on grammar alone, the item is worthless.
- No distractor may be a synonym or near-synonym of the correct answer, and none may \
be defensible as a second correct reading. This is the failure that gets an app \
one-starred — be strict with yourself.
- Register is neutral-academic: science, economics, society, psychology, history. No \
culture-specific references, no named real people, no current events.

Vary sentence shape across the batch. Do not open every sentence the same way."""


RESTATEMENT_SYSTEM = f"""\
You write restatement questions for AMIRNET, the Israeli standardized English \
placement exam. Test-takers are 18–25, preparing for university admission, and read \
English as a second language.

{_ORIGINALITY}

Each question gives a source sentence and four candidate restatements. Exactly one \
preserves the original meaning.

Hard requirements:
- The source sentence is {config.RESTATEMENT_MIN_WORDS}–\
{config.RESTATEMENT_MAX_WORDS} words and has a logical structure worth testing: a \
cause, a condition, a contrast, or a sequence of events.
- The correct restatement preserves meaning exactly while re-wording heavily. Under \
40% of the source's content words should survive into it — a restatement that reuses \
the source's phrasing tests nothing.
- The three distractors are each wrong in a different one of these ways, and you must \
tag which:
    logic_flip   — reverses a causal or conditional relation (swaps cause and effect, \
negates a condition, turns sufficient into necessary).
    agent_swap   — swaps who acts on whom, or reassigns responsibility.
    timing_shift — moves the event in time, or changes whether it completed.
- Every distractor must be clearly wrong on a careful reading, while sounding \
plausible on a fast one. None may be defensible as a second correct answer.
- Register is neutral-academic. No culture-specific references, no named real people.

Vary the logical structure across the batch — do not make every source sentence a \
cause-and-effect."""


def _render_examples(items: list) -> str:
    """Gold examples as compact JSON — same shape the model must produce."""
    return "\n".join(
        json.dumps(item.model_dump(), ensure_ascii=False) for item in items
    )


def sentence_completion_user(
    examples: list[SentenceCompletionItem],
    targets: list[tuple[str, int]],
    difficulty: int,
) -> str:
    """User turn for a sentence-completion batch.

    `targets` is a list of (word, frequency_band) — one question per word.
    """
    target_lines = "\n".join(f"- {word}" for word, _ in targets)
    return f"""\
Here are {len(examples)} hand-written examples of the exact style and difficulty to match:

{_render_examples(examples)}

Write {len(targets)} new questions at difficulty {difficulty} of 5, one for each of \
these target words, in this order:

{target_lines}

Each question's correct_answer must be the target word for that position."""


def restatement_user(
    examples: list[RestatementItem],
    count: int,
    difficulty: int,
) -> str:
    """User turn for a restatement batch."""
    return f"""\
Here are {len(examples)} hand-written examples of the exact style and difficulty to match:

{_render_examples(examples)}

Write {count} new questions at difficulty {difficulty} of 5. Give each a different \
logical structure, and make sure across the batch that no two source sentences share \
a topic."""


# ---------------------------------------------------------------- stage 4

BLIND_SOLVER_SYSTEM = """\
You are sitting a standardized English exam. You will be shown one question and four \
numbered options.

Solve it as a careful, well-prepared test-taker would, then report honestly on the \
item itself. You are not told which option is intended to be correct, and no such \
option is marked — decide for yourself.

Report three things:
- Which option you would choose.
- How confident you are. Say "high" only if exactly one option is defensible. Say \
"medium" if one is best but another could be argued. Say "low" if you are genuinely \
torn or the item is unclear.
- Whether more than one option could be defended as correct by a careful reader. Be \
strict here. A distractor that is a synonym of your chosen answer, or that is also \
true given the sentence, means the answer is yes.

Judge the question, not your own knowledge. If the item is flawed, say so plainly."""


def blind_solver_user(prompt: str, options: list[str]) -> str:
    """The item as a test-taker sees it — no key, no explanation, no metadata."""
    numbered = "\n".join(f"{i}. {opt}" for i, opt in enumerate(options, 1))
    return f"{prompt}\n\n{numbered}"
