"""Shared constants for the generation pipeline.

Numbers here come from CLAUDE.md — the prompt shapes and target volumes agreed
during planning. Change them here, not inline in the prompt builders.
"""

from pathlib import Path

# ---------------------------------------------------------------- paths

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "schema.sql"
DB_PATH = ROOT / "bank.db"
GOLD_DIR = ROOT / "gold"

# ---------------------------------------------------------------- models

# Stage 2 writes the questions.
GENERATOR_MODEL = "claude-opus-5"

# Stage 4 solves them blind. This MUST stay a different model from the
# generator — a model checking its own work agrees with itself, which defeats
# the entire point of the blind check.
VALIDATOR_MODEL = "claude-sonnet-5"

# ---------------------------------------------------------------- prompt shapes

# Sentence completion: 12–20 word sentence, one blank, 3 distractors.
SENTENCE_COMPLETION_MIN_WORDS = 12
SENTENCE_COMPLETION_MAX_WORDS = 20

# Restatement: 15–25 word source sentence.
RESTATEMENT_MIN_WORDS = 15
RESTATEMENT_MAX_WORDS = 25

# Every question is 1 correct answer + 3 distractors.
N_DISTRACTORS = 3

# Few-shot examples pulled from the gold set per generation request.
GOLD_EXAMPLES_PER_REQUEST = 4

# The three ways a restatement distractor is allowed to be wrong. Each
# distractor in a restatement item must use a *different* one of these, so a
# user's wrong answers reveal which trap they fall for.
RESTATEMENT_DISTRACTOR_TYPES = ("logic_flip", "agent_swap", "timing_shift")

# ---------------------------------------------------------------- validation

# Stage 3: a generated item whose prompt is this similar to something already
# in the bank is treated as a duplicate.
DUPLICATE_SIMILARITY_THRESHOLD = 0.85

# Stage 4: the blind solver must be this confident, or the item is rejected.
ACCEPTED_CONFIDENCE = ("high",)

# ---------------------------------------------------------------- bookkeeping

SOURCE_AI = "ai_generated"
SOURCE_GOLD = "manual_gold"
