import {
  EXAM_SECTIONS,
  type ExamSection,
  type Question,
  type QuestionBank,
} from './types';

/** Difficulty as stored on a question: 1 (easiest) to 5. */
export const MIN_DIFFICULTY = 1;
export const MAX_DIFFICULTY = 5;

/**
 * The tier the sitting opens at.
 *
 * MALO's wording is that the test begins with a section of "moderately
 * difficult" questions and adapts from there — so this is the exam's choice,
 * not a knob for us to tune.
 */
export const OPENING_DIFFICULTY = 3;

export interface AssembledSection {
  spec: ExamSection;
  questions: Question[];
  /** The tier this section was aimed at — what adaptivity actually moves. */
  targetDifficulty: number;
  /** Set only when the bank could not fill the section. */
  shortfall?: { got: number; wanted: number };
}

function clamp(difficulty: number): number {
  return Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, difficulty));
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function meanDifficulty(questions: Question[]): number {
  if (questions.length === 0) return OPENING_DIFFICULTY;
  return questions.reduce((n, q) => n + q.difficulty, 0) / questions.length;
}

/**
 * Where the next section sits, given how the last one went.
 *
 * The exam is adaptive BETWEEN sections, not per question: a whole section is
 * scored, then the next is pitched one tier up or down. One tier at a time is
 * deliberate — four questions is far too small a sample to justify a bigger
 * jump, and a sitting that lurches between tiers stops resembling the real
 * test.
 *
 * An unanswered section moves nothing. Running out of time is not evidence
 * about difficulty, and treating it as a wrong answer would push a struggling
 * user down a tier for what is really a pacing problem.
 */
export function nextDifficulty(
  currentTarget: number,
  correct: number,
  answered: number,
): number {
  if (answered === 0) return clamp(currentTarget);
  const ratio = correct / answered;
  const step = ratio >= 0.75 ? 1 : ratio <= 0.4 ? -1 : 0;
  return clamp(currentTarget + step);
}

/**
 * Build one section, aimed at a difficulty tier and avoiding anything already
 * used in this sitting.
 *
 * Two rules the exam imposes that shape this:
 *
 *  - A reading section is five questions off ONE passage, not five questions
 *    picked at random from across passages.
 *  - No question repeats within a sitting.
 *
 * Where the bank can't fill a section it is returned short rather than padded
 * with repeats, and the gap is recorded — a simulation that quietly runs 3
 * questions instead of 4 is worse than one that admits it.
 */
export function assembleSection(
  bank: QuestionBank,
  spec: ExamSection,
  used: Set<string>,
  targetDifficulty: number,
): AssembledSection {
  const target = clamp(targetDifficulty);
  let picked: Question[] = [];

  if (spec.type === 'reading') {
    const candidates = bank.passages
      .map((passage) => ({
        passage,
        available: bank.questions.filter(
          (q) => q.passageId === passage.id && !used.has(q.id),
        ),
      }))
      .filter((c) => c.available.length > 0);

    // Prefer a passage that can fill the section outright; among those, the one
    // whose questions sit closest to the target tier. Only if none can fill it
    // do we fall back to the longest partial — a short reading section still
    // beats no passage at all.
    const complete = candidates.filter(
      (c) => c.available.length >= spec.questionCount,
    );
    const pool = complete.length > 0 ? complete : candidates;

    if (pool.length > 0) {
      const best = shuffled(pool).sort((a, b) => {
        if (complete.length === 0 && b.available.length !== a.available.length) {
          return b.available.length - a.available.length;
        }
        return (
          Math.abs(meanDifficulty(a.available) - target) -
          Math.abs(meanDifficulty(b.available) - target)
        );
      })[0];
      picked = best.available.slice(0, spec.questionCount);
    }
  } else {
    // Shuffle first, then sort by distance from the target tier. Array.sort is
    // stable, so the shuffle is what breaks ties between equally-close
    // questions — otherwise the same items would surface every sitting.
    picked = shuffled(
      bank.questions.filter((q) => q.type === spec.type && !used.has(q.id)),
    )
      .sort(
        (a, b) =>
          Math.abs(a.difficulty - target) - Math.abs(b.difficulty - target),
      )
      .slice(0, spec.questionCount);
  }

  return {
    spec,
    questions: picked,
    targetDifficulty: target,
    shortfall:
      picked.length < spec.questionCount
        ? { got: picked.length, wanted: spec.questionCount }
        : undefined,
  };
}

/**
 * What a full sitting would be missing, checked against the bank up front.
 *
 * Sections are assembled one at a time as the sitting adapts, so a gap would
 * otherwise only surface as a short section twenty minutes in. This is a
 * static check — it counts what the bank holds rather than simulating a
 * sitting — which is enough to warn before the first question.
 */
export function examShortfalls(bank: QuestionBank): string[] {
  const gaps: string[] = [];

  const readingSections = EXAM_SECTIONS.filter((s) => s.type === 'reading');
  if (readingSections.length > 0) {
    const perSection = readingSections[0].questionCount;
    const usablePassages = bank.passages.filter(
      (p) =>
        bank.questions.filter((q) => q.passageId === p.id).length >= perSection,
    ).length;
    if (usablePassages < readingSections.length) {
      gaps.push(
        `הבנת הנקרא: ${usablePassages} קטעים מתאימים מתוך ${readingSections.length}`,
      );
    }
  }

  const needed = new Map<string, number>();
  for (const spec of EXAM_SECTIONS) {
    if (spec.type === 'reading') continue;
    needed.set(spec.type, (needed.get(spec.type) ?? 0) + spec.questionCount);
  }
  for (const [type, count] of needed) {
    const have = bank.questions.filter((q) => q.type === type).length;
    if (have < count) gaps.push(`${type}: ${have}/${count}`);
  }

  return gaps;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
