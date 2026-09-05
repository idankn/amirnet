# CLAUDE.md — AMIRNET / Psychometric prep app

Context hand-off for Claude Code. Read this first. It captures product decisions,
verified exam facts, the design system, and the content pipeline agreed so far.

---

## 1. What this is

An **iOS app** (App Store) to prepare for Israeli standardized English/psychometric
exams. The current focus is **AMIRNET (אמירנט)** — the standalone English placement
exam — built on the same engine as a broader **Psychometric (פסיכומטרי)** prep app.
Both share one question engine: `question → answers → explanation`, same screen
structure, different content.

**Why AMIRNET now (timing):** From the **December 2026** exam cycle, MALO (מאל"ו)
separates English out of the psychometric test. AMIRNET can be taken year-round with
no fixed dates, so demand is continuous rather than spiking around 4 psychometric
dates/year. This is a genuine but crowded opening — several AMIRNET apps already
exist, so **differentiation matters more than being first**.

**Target audience:** ~18–25, Israeli, preparing for university admission. UI is
Hebrew (RTL); the practice content is English (LTR).

---

## 2. Verified exam facts

**Verified 5 September 2026 against nite.org.il** (the AMIRNET overview, FAQ,
examinee guidelines, and the 26 March 2026 change notice). Sources are listed at
the end of this section. Treat prep-institute numbers as unverified; where a prep
site and MALO disagree, MALO wins.

### The exact section structure — build the simulation to this

Six fixed sections, **39 minutes, 23 questions**, in this order. The order is not
what you would guess (reading sits third, between the sentence-completion and
restatement blocks) — do not reorder it:

| # | Section | Questions | Time |
|---|---------------------|-----------|--------|
| 1 | Sentence completion | 4 | 4 min |
| 2 | Sentence completion | 4 | 4 min |
| 3 | Reading comprehension | 5 | 15 min |
| 4 | Restatement | 3 | 6 min |
| 5 | Restatement | 3 | 6 min |
| 6 | Sentence completion | 4 | 4 min |
| 7–8 | Experimental | varies | varies |

Total test is **7 or 8 sections, ~50 minutes**. The two variants differ:
an **8-section** test ends with **two experimental sections**; a **7-section**
test ends with **one writing task**.

Note what the per-section timings imply about difficulty: 4 minutes for 4
sentence completions is **60 seconds each**; 6 minutes for 3 restatements is
**2 minutes each**; 15 minutes for a passage plus 5 questions. An item that takes
a prepared test-taker three minutes is not exam-shaped, however good it is.

### Timing and navigation

- **Per-section timer, not per-question.** Unused time does NOT roll over —
  MALO's wording: "there is no way to accumulate unused time during the test."
  Finishing early buys nothing.
- Inside a section you can move freely between questions, **mark a question for
  review**, and change answers. (The mark-for-review affordance is a real exam
  feature — the app should have it.)
- You **cannot return to a previous section** once it ends; progression is
  automatic when time expires.
- You may advance early **only if every question in the section has an answer
  selected.**

### Adaptivity

Adaptive **between sections**, not per question. The test opens with a section of
**moderately difficult** questions, scores it, and picks the next section's
difficulty accordingly. This makes `difficulty_est` load-bearing: sections are
assembled from difficulty-tiered pools, so the field is part of the engine, not
just metadata.

### Scoring

- Scale is **50–150**, equivalent to the English domain of the psychometric test.
  (The 200–800 scale belongs to the psychometric test, which keeps it.)
- **Experimental sections are scored, asymmetrically — this is now confirmed.**
  MALO's FAQ: wrong answers in an experimental section "will not lower your
  score, but correct answers can raise your score by one or two points." This
  resolves the item that was previously flagged UNVERIFIED with prep sites
  contradicting each other. It is a real, if small, upside-only bonus — worth
  telling users about, since it changes whether it's worth guessing there.

### Experimental sections

Conditional — "may include", never guaranteed on a given sitting: listening
comprehension, in-context grammar, word formation, and a **writing task**.
Marketing angle stands: "you can't choose which experimental sections you'll
get, so meet each type at least once." Do NOT promise the writing task appears.

### Text-to-speech

Confirmed: from **19 April 2026**, all AMIRNET examinees can have texts and
questions read aloud via reading software — this is standard for everyone, not an
accommodation. The same notice added the writing task as an experimental section.
Let users practise with read-aloud on.

### Other

- **Speaking:** not a section today. Future direction only.
- No sample questions or practice are shown mid-test, so a test-taker who never
  met a listening section before meets it cold, on the clock.
- From December 2026 AMIRNET becomes the sole instrument for English, taken
  year-round with no fixed dates. Institutions start using the new format for
  admissions in the 2027–28 academic year (opening October 2027).

**Sources:** [AMIRNET overview](https://www.nite.org.il/other-tests/amirnet/?lang=en) ·
[FAQ](https://www.nite.org.il/other-tests/amirnet/faq/?lang=en) ·
[Guidelines for examinees](https://www.nite.org.il/other-tests/amirnet/tips/?lang=en) ·
[Change notice, 26 Mar 2026](https://www.nite.org.il/news/notice-260326/?lang=en) ·
[English separation notice](https://www.nite.org.il/news/notice-15022026/?lang=en)

MALO also runs a free official practice test at `amirnet-practice.nite.org.il`.
Use it to calibrate difficulty by hand. Its questions are copyrighted and are not
a source to copy from — see section 5.

---

## 3. Product decisions

### Home screen
- **Anchor = countdown to the user's exam date.** The user explicitly REJECTED using
  a numeric score scale (the psychometric 200–800, or an AMIRNET estimated score) as a
  home-screen anchor — finds it clichéd. An earlier "estimated score vs target"
  concept was dropped for this reason. Do NOT reintroduce a predicted-score feature.
- Instead of a score, the home screen shows **"question types you haven't met yet"** —
  a live list where untried types are highlighted and practised ones show a count. This
  is real information and leads straight to action.
- A single prominent **"today's practice"** button (the one a daily notification opens).

### Daily reminder
- At a user-set time, a push notification opens **directly into a timed (1-minute)
  practice question**. Not a home screen — straight into the question.

### Screen structure
- All practice types share one structure: **question → answers → explanation.**
- Simulation screen: **per-section timer** front and centre, with the line
  "unused time does not carry to the next section" beneath it.
- Answer choices behave like **radio buttons — selection is reversible** (AMIRNET lets
  you change your answer). The chosen answer fills with brand colour rather than getting
  a coloured outline.

### Writing feedback (later feature)
- 12-minute writing task with AI feedback. Feedback focuses on grammar, vocabulary and
  structure (short English task) — NOT argument. Feedback screen shows word count and
  time used as **descriptive stats, not a score** (keeping a score out was deliberate —
  don't let it creep back in as a grade).

### Serif only in English
- Frank Ruhl Libre (serif) appears ONLY in English passage text. The Hebrew UI is
  sans (Assistant). Serif in buttons/headers is what made an earlier version read like
  a printed document.

---

## 4. Design system (frozen — build a token layer, don't re-derive per screen)

Palette converged over several iterations. **Frozen here.** Berry is the single
action/brand colour; violet is an accent only (progress ring, timer bar, icons of
already-practised types). All primary buttons are berry, consistently.

| Role                        | Hex       |
|-----------------------------|-----------|
| Brand / primary action      | `#A8305A` |
| Brand dark (ring track)     | `#87264A` |
| Brand soft (icon bg, chosen)| `#F4DCE4` |
| Accent                      | `#6B4FD8` |
| Accent light (on berry)     | `#C9A6E8` |
| Accent soft                 | `#E9E1F7` |
| Page background             | `#F8F3F8` |  (cream with a violet lean — chosen over neutral cream on purpose)
| Surface / card              | `#FFFFFF` |
| Border                      | `#E8DEE8` |
| Text primary                | `#2E2A3D` |
| Text secondary              | `#8983A0` |
| Body text                   | `#6A6480` |

- **Type:** Assistant (400/500) for all UI; Frank Ruhl Libre for English passages only.
- **Radii:** 999 buttons · 18 cards · 26 screen · 10 icon squares.
- **Feel:** app, not document — real chrome (status bar, tab bar), layered surfaces
  (cream page, white cards above it), tappable affordances. The user explicitly did
  NOT want it to feel like a printed document, and wanted a "fun" but not childish feel
  for an 18–25 admissions audience.
- **Not yet designed:** dark mode (this warm palette needs separate work there), plus
  the unglamorous screens — settings, empty states, results list, error, end-of-time.

---

## 5. Content pipeline (the real bottleneck — not the code)

**Legal boundary (important):** MALO owns copyright in its questions; its official
simulations are for personal test-taker use, NOT for bundling into a commercial
product. Same for prep-site/Quizlet content (Quizlet is user-uploaded — owned by
uploaders, scraping is against ToS). **Format is not protected, only wording.** So:
generate original questions that mirror the official structure, sentence length and
difficulty; use official simulations ONLY to calibrate level, never as a source to copy.

**Vocabulary:** don't scrape a word list. Use open frequency lists (e.g. COCA-style —
check each list's licence) and the Academic Word List, filtered to the frequency band
the official sims sit in. Generate definitions and example sentences yourself (a
commercial dictionary is copyrighted; a generated example is yours). Aim for a
defensible **800–1,200 words**, not a giant bank.

**Target volume for launch:** ~850 questions + ~1,000 words. Roughly:
sentence completion ~400 · restatement ~250 · reading ~40 passages · listening ~40
passages · writing prompts ~30.

### Six-stage generation process
1. **Manual gold set** — hand-write ~40 questions AFTER studying official sims for
   sentence length, word-frequency band, distractor style. Don't skip this; it's why
   AI banks feel "not like the real exam".
2. **Batch generation** — every request includes 3–4 gold examples + a target word
   (from the frequency list) + a requested difficulty. Never "generate a question"
   with no context.
3. **Automated validation** — length in range; target word in the right frequency
   band; no duplicates vs existing bank; no distractor that is a synonym of the
   correct answer.
4. **Second-model check (critical)** — a DIFFERENT model solves the question blind
   (no key). If it disagrees or hesitates between two answers, REJECT. The #1 failure
   mode of AI questions is **two correct answers** (a distractor that's also right).
   One "the answers are wrong" review can get the app pulled — accuracy is the product.
5. **Manual sampling** — you review 10% of each batch. If >3 of 20 fail, junk the
   batch and fix the prompt. This is the throughput bottleneck, not generation.
6. **Field feedback** — a report button on every question. Low success rate + reports
   = likely broken, not hard.

Expect a high early reject rate (~2,500 generated to net ~1,000). A serious work week
nets ~300–400 validated questions.

### Generation prompt shapes (agreed)
- **Sentence completion:** 12–20 word sentence; target word from list; 3 clearly-wrong
  but plausible distractors; no syntactic cue that gives away the answer.
- **Restatement:** 15–25 word source; correct answer differs ≥60% in wording; each
  distractor wrong in a *different* way, tagged: `logic_flip` / `agent_swap` /
  `timing_shift`. (These tags are stored per distractor — see schema — so you can see
  which trap a user falls for.)
- **Reading:** 180–220 word mock-academic passage + 5 questions, one each of:
  main idea / detail / inference / word-in-context / author's purpose. At least one
  distractor per question must require reading the whole passage to rule out.
- **Second-model check prompt:** solve blind, then report (a) more than one correct
  answer? (b) confidence high/med/low (c) what's confusing. Low confidence or
  multiple-correct → REJECT.

---

## 6. Data model

The SQLite schema lives in `schema.sql` (shipped alongside this doc). Key decisions:

- **Passages separate from questions.** Reading & listening = one passage, many
  questions (via `questions.passage_id`). Standalone types leave it NULL. Same
  passages table serves listening — only `audio_path` differs.
- **Distractors in their own table** with `distractor_type` (the restatement tags
  above; NULL for other types).
- **Two difficulty fields:** `difficulty_est` (generation guess) and
  `difficulty_actual` (learned from the `attempts` table). The `question_health` view
  computes real success rate + report count per live question, so you can tell a
  *broken* question (low success + reports) from a merely *hard* one (low success only).
- **`status` + `validator_verdict` on every row** — draft → validated → live →
  retired — so the pipeline stage of every item is always known.
- **Vocab / writing_prompts** are separate shapes (word list; prompt-only — feedback
  is generated live per submission).
- **attempts / reports** power calibration and the report button. **Open decision:**
  local-only (slower to converge, fine for v1) vs a small backend that aggregates
  attempts centrally (much faster, reliable `difficulty_actual`, but extra infra).

---

## 7. Audio (listening sections)

- **Male voice, normal/neutral American accent** (matches standardized exams).
- **Pre-generate TTS once, store the file, ship with app or serve from CDN** — do NOT
  synthesize on every playback. Cheaper (pay once, not per play), works offline, no
  latency.

---

## 8. Monetization & go-to-market (open — advice given, not finalized)

- User's initial idea: free, then a 1-day trial, then ₪10 to continue. Advice given:
  1 day is too short to feel value; ₪10 signals "toy" next to ₪1,500–3,000 prep
  courses, and Apple takes 15%. **Suggested instead:** a one-time ₪60–90 for full
  access until the exam (fits the short prep window better than a monthly sub; no
  renewals to fight). A free tier early on is fine — as a way to gather reviews and see
  if people return, with a pre-decided cutoff. **Not yet decided by the user.**
- **Marketing:** Instagram + TikTok for the 18–25 audience — useful *content* (a
  question a day, common English mistakes, "what even is AMIRNET"), app in bio, not ads.
  Plus psychometric Facebook groups and prep-course cohorts where the audience is
  already concentrated and looking now.

---

## 9. Scope tension (know where the user and prior advice differ)

The user wants to ship **everything** (including listening + writing) for **December
2026** — about three months out. Prior advice was to ship a **solid core** (three
classic types + per-section timer + one full simulation) in **October**, gather
reviews, then release the differentiators (listening, writing, adaptivity, detailed
progress) in a November update — because content generation, Apple review cycles, and
per-feature bugs all eat the runway, and listening/writing (the actual differentiators)
are the slowest content to produce.

The user maintains everything is doable now. **Agreed early warning sign:** if by end
of September there isn't a working full simulation with ~300 real validated questions
in it, that's the moment to cut scope — content is what slips, not code.

---

## 10. Suggested next steps (either order)

- Build the **generation script**: runs a batch through the API, validates, runs the
  second-model check, inserts into the schema.
- Build the **iOS reading layer**: how the app queries the bank, renders a section with
  the per-section timer, records attempts.
