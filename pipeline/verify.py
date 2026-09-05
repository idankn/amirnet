"""Stage 4 — the second-model blind check. The most important stage in the pipeline.

A different model from the generator solves each item with no answer key, then
reports whether more than one option is defensible. An item is kept only if
that model picks the intended answer, with high confidence, and sees no second
correct option.

Why a different model: a model checking its own output agrees with its own
reasoning, including the reasoning that produced a bad distractor. The
disagreement between two models is the entire signal.
"""

import random
import sqlite3
from dataclasses import dataclass

import anthropic

from . import config, db, prompts
from .schemas import BlindVerdict

MAX_TOKENS = 8000

# Written to questions.validator_verdict.
PASS = "pass"
REJECT_MULTIPLE = "reject_multiple"
REJECT_LOWCONF = "reject_lowconf"
REJECT_DISAGREE = "reject_disagree"


@dataclass
class CheckResult:
    question_id: int
    verdict: str
    reason: str
    chosen: str
    expected: str

    @property
    def passed(self) -> bool:
        return self.verdict == PASS


def _shuffled_options(
    correct: str, distractors: list[str], seed: int
) -> tuple[list[str], int]:
    """Interleave the answer among the distractors.

    Seeded by question id so a re-run reproduces the same arrangement — makes a
    disagreement reproducible when you go to look at it by hand.
    """
    options = [correct] + list(distractors)
    rng = random.Random(seed)
    rng.shuffle(options)
    return options, options.index(correct) + 1


def check(
    client: anthropic.Anthropic,
    conn: sqlite3.Connection,
    question_id: int,
) -> CheckResult:
    """Run the blind check on one question and record the verdict."""
    row = db.get_question(conn, question_id)
    if row is None:
        raise ValueError(f"No question with id {question_id}")

    distractors = [d["text"] for d in db.get_distractors(conn, question_id)]
    options, correct_index = _shuffled_options(
        row["correct_answer"], distractors, seed=question_id
    )

    response = client.messages.parse(
        model=config.VALIDATOR_MODEL,
        max_tokens=MAX_TOKENS,
        thinking={"type": "adaptive"},
        output_config={"effort": "high"},
        system=prompts.BLIND_SOLVER_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": prompts.blind_solver_user(row["prompt"], options),
            }
        ],
        output_format=BlindVerdict,
    )

    if response.stop_reason == "refusal":
        raise RuntimeError(f"Validator declined to solve question {question_id}")

    verdict: BlindVerdict = response.parsed_output
    chosen_text = (
        options[verdict.chosen_option - 1]
        if 1 <= verdict.chosen_option <= len(options)
        else "<out of range>"
    )

    # Order matters: a multiple-correct item is broken even if the solver
    # happened to pick the intended answer, so that check comes first.
    if verdict.has_multiple_correct:
        code, reason = REJECT_MULTIPLE, f"more than one defensible answer. {verdict.problem}"
    elif verdict.chosen_option != correct_index:
        code, reason = (
            REJECT_DISAGREE,
            f"solver chose {chosen_text!r}, key says {row['correct_answer']!r}. {verdict.problem}",
        )
    elif verdict.confidence not in config.ACCEPTED_CONFIDENCE:
        code, reason = REJECT_LOWCONF, f"confidence {verdict.confidence}. {verdict.problem}"
    else:
        code, reason = PASS, ""

    db.set_verdict(
        conn,
        question_id,
        status="validated" if code == PASS else "rejected",
        validator_verdict=code,
        reject_reason=reason.strip() or None,
    )

    return CheckResult(
        question_id=question_id,
        verdict=code,
        reason=reason.strip(),
        chosen=chosen_text,
        expected=row["correct_answer"],
    )
