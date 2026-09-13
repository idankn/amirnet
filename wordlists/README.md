# Target word lists

Sentence-completion and vocab items are built around a chosen target word rather
than generated free-form. Each word carries a **CEFR level**, which makes the
question's difficulty a property of its input instead of something the model
estimates — the difference between a level claim that traces to published data
and one we invented.

## Building

    python -m pipeline.build_wordlist

Reads `sources/` and writes `targets.tsv`. **Do not edit `targets.tsv` by hand** —
it is generated and will be overwritten.

Current output: **6,538 words**

| CEFR | Words | AMIRNET score | Meaning |
|------|-------|---------------|---------|
| A2 | 1,222 | 85–99 | Basic |
| B1 | 2,094 | 100–119 | Lower Advanced |
| B2 | 2,327 | 120–133 | Upper Advanced |
| C1 | 895 | 134+ | **Exemption** |

A1 and C2 are excluded: A1 sits below the exam's floor, C2 above the exemption
threshold. Only nouns, verbs, adjectives and adverbs are kept — a blank on a
preposition tests grammar, and the completion section is a vocabulary section.

Where a word appears at several levels, the **easiest** is kept. If a learner
meets *issue* as a B1 noun, the word is known by B1, and generating it as C1
would overstate the resulting question's difficulty.

## Attribution — required

Both sources permit commercial use **on condition of attribution**. This is the
entire cost of using them, so it is not optional. It must appear in the app's
about screen as well as here.

> Vocabulary levels derived from the **CEFR-J Wordlist Version 1.5**, compiled by
> Yukio Tono, © Tono Laboratory, Tokyo University of Foreign Studies, and the
> **Octanove Vocabulary Profile C1/C2 Version 1.0**, licensed under
> [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/).

Distributed via [openlanguageprofiles/olp-en-cefrj](https://github.com/openlanguageprofiles/olp-en-cefrj).

## Licences checked 5 September 2026

| Source | Licence | Commercial |
|---|---|---|
| CEFR-J Wordlist v1.5 | Free with citation | ✅ |
| Octanove Vocabulary Profile C1/C2 | CC BY-SA 4.0 | ✅ |
| Academic Word List (Coxhead) | CC BY-NC-ND 3.0 | ❌ **Non-commercial** |
| Oxford 3000 / 5000 | OUP proprietary | ❌ |
| English Vocabulary Profile | Non-commercial only | ❌ |

The AWL was in an earlier version of the plan. It cannot ship in a paid app.
Do not reintroduce it.

**MALO's own materials are not a source.** nite.org.il carries a bare
"© All rights reserved" with no licensing pathway. Use their free practice test
to calibrate level by hand as a test-taker; never to copy from.

## Known level overrides (2026-09-13)

A manual audit of the shipped vocab bank found 70 words whose CEFR-J/Octanove
level looked clearly wrong against general CEFR usage — mostly near-synonym
pairs landing two tiers apart within the bank itself (`achieve` A2 vs `attain`
B1; `cooperate` B2 vs `collaborate` C1), plus a handful of common
Hebrew-cognate words sitting at C1 (`diversity`, `sustainable`, `naive`,
`criteria`) and one outright miscall (`multiply` at B2 — primary-school
arithmetic). `app/src/data/vocab.json`'s `cefr` field was corrected by hand for
these words; the same correction was written directly into `bank.db`'s `vocab`
table so it survives a re-export.

**This is a deliberate divergence from `wordlists/targets.tsv` for these
specific words only** — `targets.tsv` itself was NOT edited (it stays a
faithful, regeneratable mirror of the licensed source lists) and
`pipeline/load_vocab.py`'s validator still checks new entries against it as
usual. If any of these 70 words is ever re-authored in a future
`authored/vocab_0NN.jsonl` batch, the validator will accept only the
`targets.tsv`-original level, which would silently re-introduce the mismatch
this override fixed — check this list first before re-adding one of them.
