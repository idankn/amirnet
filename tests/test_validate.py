"""Tests for stage 3 — the mechanical checks that run before any API spend.

Run:  python -m tests.test_validate

Kept dependency-free on purpose so it runs anywhere the pipeline does.
"""

import sys

from pipeline.schemas import RestatementItem, SentenceCompletionItem
from pipeline.validate import restatement, sentence_completion

FAILURES: list[str] = []


def expect(label: str, problems: list[str], *, should_pass: bool, mentions: str = "") -> None:
    ok = (not problems) if should_pass else bool(problems)
    if ok and mentions:
        ok = any(mentions in p for p in problems)

    if ok:
        print(f"  ok    {label}")
    else:
        detail = problems or ["(passed, expected a failure)"]
        print(f"  FAIL  {label}: {detail}")
        FAILURES.append(label)


def sc(sentence: str, correct: str, distractors: list[str]) -> SentenceCompletionItem:
    return SentenceCompletionItem(
        sentence=sentence,
        correct_answer=correct,
        distractors=distractors,
        explanation="x",
        difficulty_est=3,
    )


def rs(source: str, correct: str, types: list[str]) -> RestatementItem:
    return RestatementItem(
        source_sentence=source,
        correct_answer=correct,
        distractors=[
            {"text": f"wrong option {i}", "distractor_type": t}
            for i, t in enumerate(types, 1)
        ],
        explanation="x",
        difficulty_est=3,
    )


# ---------------------------------------------------------------- sentence completion

GOOD_SC = sc(
    "Although the initial results seemed promising, the researchers were reluctant "
    "to ______ their findings without further testing.",
    "publicize",
    ["postpone", "duplicate", "translate"],
)


def test_sentence_completion() -> None:
    print("sentence_completion")

    expect("well-formed item passes", sentence_completion(GOOD_SC, "publicize", []), should_pass=True)

    expect(
        "sentence under the word floor is rejected",
        sentence_completion(sc("He was ______ to leave.", "reluctant", ["eager", "quick", "able"]), "reluctant", []),
        should_pass=False,
        mentions="words, outside",
    )

    expect(
        "two blanks are rejected",
        sentence_completion(
            sc(
                "Although the initial ______ seemed promising, the team was reluctant "
                "to ______ their findings without testing.",
                "publicize",
                ["postpone", "duplicate", "translate"],
            ),
            "publicize",
            [],
        ),
        should_pass=False,
        mentions="exactly one blank",
    )

    expect(
        "distractor that is a morphological variant of the answer is rejected",
        sentence_completion(
            sc(
                "The council agreed that the new policy would ______ the pressure on "
                "local services over the coming decade.",
                "diminish",
                ["diminished", "amplify", "record"],
            ),
            "diminish",
            [],
        ),
        should_pass=False,
        mentions="morphological variant",
    )

    expect(
        "answer that is not the requested target word is rejected",
        sentence_completion(GOOD_SC, "mitigate", []),
        should_pass=False,
        mentions="not the requested target word",
    )

    expect(
        "near-duplicate of an existing item is rejected",
        sentence_completion(GOOD_SC, "publicize", [GOOD_SC.sentence]),
        should_pass=False,
        mentions="near-duplicate",
    )

    expect(
        "two identical options are rejected",
        sentence_completion(
            sc(
                "Although the initial results seemed promising, the researchers were "
                "reluctant to ______ their findings without further testing.",
                "publicize",
                ["postpone", "postpone", "translate"],
            ),
            "publicize",
            [],
        ),
        should_pass=False,
        mentions="duplicate options",
    )


# ---------------------------------------------------------------- restatement

GOOD_RS = RestatementItem(
    source_sentence=(
        "Because the factory upgraded its filters last year, emissions in the "
        "surrounding valley have fallen sharply since then."
    ),
    correct_answer=(
        "The air in that area has become considerably cleaner as a result of "
        "equipment the plant installed twelve months ago."
    ),
    distractors=[
        {"text": "The factory installed new filters because pollution had already dropped.", "distractor_type": "logic_flip"},
        {"text": "The plant is scheduled to upgrade its equipment next year.", "distractor_type": "timing_shift"},
        {"text": "Residents pressured the plant into cutting the pollution it produced.", "distractor_type": "agent_swap"},
    ],
    explanation="x",
    difficulty_est=3,
)


def test_restatement() -> None:
    print("\nrestatement")

    expect("well-formed item passes", restatement(GOOD_RS, []), should_pass=True)

    expect(
        "repeated distractor types are rejected",
        restatement(
            rs(
                "Because the factory upgraded its filters last year, emissions in the "
                "surrounding valley have fallen sharply.",
                "The air nearby became cleaner after equipment was installed twelve months ago.",
                ["logic_flip", "logic_flip", "agent_swap"],
            ),
            [],
        ),
        should_pass=False,
        mentions="must all differ",
    )

    expect(
        "answer that reuses the source's wording is rejected",
        restatement(
            rs(
                "Because the factory upgraded its filters last year, emissions in the "
                "surrounding valley have fallen sharply.",
                "The factory upgraded its filters last year, so emissions in the surrounding "
                "valley have fallen sharply.",
                ["logic_flip", "timing_shift", "agent_swap"],
            ),
            [],
        ),
        should_pass=False,
        mentions="content words",
    )

    expect(
        "source over the word ceiling is rejected",
        restatement(
            rs(
                "Because the factory upgraded its filters last year, emissions in the "
                "surrounding valley have fallen sharply since then, which the council "
                "described as a significant and welcome improvement for residents.",
                "The air nearby became cleaner after equipment was installed twelve months ago.",
                ["logic_flip", "timing_shift", "agent_swap"],
            ),
            [],
        ),
        should_pass=False,
        mentions="words, outside",
    )

    expect(
        "near-duplicate of an existing item is rejected",
        restatement(GOOD_RS, [GOOD_RS.source_sentence]),
        should_pass=False,
        mentions="near-duplicate",
    )


if __name__ == "__main__":
    test_sentence_completion()
    test_restatement()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} failed: {', '.join(FAILURES)}")
        sys.exit(1)
    print("all passed")
