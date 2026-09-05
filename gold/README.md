# Gold set — stage 1

Hand-written examples. **Not generated.** Every generation request carries 3–4 of
these, and they are the single biggest lever on whether the bank feels like the
real exam or like generic AI output.

## The job

Target is ~40 items total, written **after** studying official MALO simulations
for three specific things:

- **Sentence length** — how long the real sentences actually run.
- **Word-frequency band** — how hard the vocabulary really is. This is the one
  people get wrong; AI-written banks drift much harder than the real exam.
- **Distractor style** — how the wrong options are wrong, and how close they sit
  to the answer.

Use the official sims to *calibrate*, never as a source to copy. Format isn't
copyrightable; wording is. Every sentence you write here must be your own.

## Files

- `sentence_completion.jsonl` — one JSON object per line
- `restatement.jsonl` — one JSON object per line

Lines starting with `//` are ignored, so you can leave notes to yourself.

The two entries currently in each file are **format demonstrations, not gold
examples** — they were written to show the shape the loader expects. Replace
them once you have real ones; leaving them in means the generator few-shots on
uncalibrated material.

## Checking your work

    python -m pipeline.cli status

Anything malformed fails loudly with a line number — a bad gold example silently
teaches the generator the wrong shape, which is worse than a crash.
