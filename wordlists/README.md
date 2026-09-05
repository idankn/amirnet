# Target word lists

Sentence-completion items are built around a chosen target word rather than
generated free-form. That is what keeps the bank inside the frequency band the
real exam sits in, and what makes vocabulary coverage something you can measure
instead of guess.

## Format

`targets.tsv`, one word per line:

    word<TAB>band

`band` is 1 (most frequent) to 5 (least). Lines starting with `#` are ignored.

A word is used at most once — `wordlist.unused()` skips anything the bank has
already built a question around, including items that were later rejected, so a
run doesn't keep grinding on the same vocabulary.

## Sourcing

Target for launch is a defensible **800–1,200 words**, not a giant bank.

Use open frequency lists and the Academic Word List, filtered to the band the
official simulations sit in. **Check each list's licence before you use it** —
they vary, and some corpus-derived lists are published under terms that don't
allow redistribution inside a commercial product.

Do not scrape a commercial dictionary or a prep site. Definitions and example
sentences are generated (yours); a commercial dictionary's are not.

## The starter list

`targets.tsv` currently holds a small set of general academic words, enough to
exercise the pipeline end to end. Band values in it are rough guesses, not
corpus-derived — replace the whole file once you have a properly sourced list
with real frequency data, since the band is what the difficulty calibration
rests on.
