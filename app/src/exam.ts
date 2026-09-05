import {
  EXAM_SECTIONS,
  type ExamSection,
  type Question,
  type QuestionBank,
} from './types';

export interface AssembledSection {
  spec: ExamSection;
  questions: Question[];
}

export interface AssemblyResult {
  sections: AssembledSection[];
  /** Sections that couldn't be filled, with what was missing. */
  shortfalls: string[];
}

function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build one sitting from the bank, following the real section structure.
 *
 * Two rules the exam imposes that shape this:
 *
 *  - A reading section is five questions off ONE passage, not five questions
 *    picked at random from across passages.
 *  - No question repeats within a sitting.
 *
 * Where the bank can't fill a section, the section is returned short rather
 * than padded with repeats, and the gap is reported in `shortfalls` — a
 * simulation that quietly runs 3 questions instead of 4 is worse than one that
 * admits it.
 */
export function assembleExam(bank: QuestionBank): AssemblyResult {
  const used = new Set<string>();
  const sections: AssembledSection[] = [];
  const shortfalls: string[] = [];

  for (const spec of EXAM_SECTIONS) {
    let picked: Question[] = [];

    if (spec.type === 'reading') {
      // Find a passage with enough unused questions, and take them together.
      const passageIds = shuffled(
        bank.passages.map((p) => p.id).filter((id) =>
          bank.questions.some((q) => q.passageId === id && !used.has(q.id)),
        ),
      );
      for (const passageId of passageIds) {
        const available = bank.questions.filter(
          (q) => q.passageId === passageId && !used.has(q.id),
        );
        if (available.length >= spec.questionCount) {
          picked = available.slice(0, spec.questionCount);
          break;
        }
      }
    } else {
      picked = shuffled(
        bank.questions.filter((q) => q.type === spec.type && !used.has(q.id)),
      ).slice(0, spec.questionCount);
    }

    picked.forEach((q) => used.add(q.id));
    if (picked.length < spec.questionCount) {
      shortfalls.push(
        `${spec.type}: ${picked.length}/${spec.questionCount}`,
      );
    }
    sections.push({ spec, questions: picked });
  }

  return { sections, shortfalls };
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
