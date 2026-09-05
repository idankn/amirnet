export type QuestionType =
  | 'sentence_completion'
  | 'restatement'
  | 'reading'
  | 'listening'
  | 'word_formation'
  | 'writing';

export interface Passage {
  /** English body text — render LTR, in the serif face. */
  id: string;
  topic: string;
  body: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  /** The sentence or stem. English — render LTR. */
  prompt: string;
  /** Four options, already shuffled. English — render LTR. */
  options: string[];
  correctIndex: number;
  /** Shown after answering. English. */
  explanation: string;
  /** 1 (easiest) to 5. Drives section assembly, since the exam is adaptive between sections. */
  difficulty: number;
  /** Set on reading and listening items — the passage this question hangs off. */
  passageId?: string;
}

export interface QuestionBank {
  passages: Passage[];
  questions: Question[];
}

/** Hebrew display names. */
export const TYPE_LABELS: Record<QuestionType, string> = {
  sentence_completion: 'השלמת משפטים',
  restatement: 'ניסוח מחדש',
  reading: 'הבנת הנקרא',
  listening: 'הבנת הנשמע',
  word_formation: 'תצורת מילים',
  writing: 'משימת כתיבה',
};

/** One-line Hebrew description, shown under each type on the home screen. */
export const TYPE_BLURBS: Record<QuestionType, string> = {
  sentence_completion: 'משפט עם מילה חסרה, ארבע אפשרויות',
  restatement: 'לזהות איזה ניסוח שומר על המשמעות',
  reading: 'קטע אקדמי ואחריו חמש שאלות',
  listening: 'קטע מוקלט ואחריו שאלות',
  word_formation: 'להתאים את צורת המילה להקשר',
  writing: 'משימת כתיבה קצרה עם משוב',
};

/**
 * Which types appear only as experimental sections. MALO does not guarantee
 * these on any given sitting, so the app should never imply a user will meet
 * them — only that they might.
 */
export const EXPERIMENTAL_TYPES: QuestionType[] = [
  'listening',
  'word_formation',
  'writing',
];

/** Every type the app knows about, in the order the home screen lists them. */
export const ALL_TYPES: QuestionType[] = [
  'sentence_completion',
  'restatement',
  'reading',
  'listening',
  'word_formation',
  'writing',
];

export interface ExamSection {
  type: QuestionType;
  questionCount: number;
  seconds: number;
}

/**
 * The real AMIRNET structure — six fixed sections, 39 minutes, 23 questions.
 * Verified against MALO's examinee guidelines; see CLAUDE.md section 2.
 *
 * The order matters and is not what you would guess: reading sits third,
 * between the two sentence-completion blocks and the restatement pair. Do not
 * reorder these to something tidier.
 *
 * Experimental sections (7–8) are deliberately absent — they are conditional
 * on the sitting, and the app must not imply they always appear.
 */
export const EXAM_SECTIONS: ExamSection[] = [
  { type: 'sentence_completion', questionCount: 4, seconds: 4 * 60 },
  { type: 'sentence_completion', questionCount: 4, seconds: 4 * 60 },
  { type: 'reading', questionCount: 5, seconds: 15 * 60 },
  { type: 'restatement', questionCount: 3, seconds: 6 * 60 },
  { type: 'restatement', questionCount: 3, seconds: 6 * 60 },
  { type: 'sentence_completion', questionCount: 4, seconds: 4 * 60 },
];

export const EXAM_TOTAL_QUESTIONS = EXAM_SECTIONS.reduce(
  (n, s) => n + s.questionCount,
  0,
);
export const EXAM_TOTAL_MINUTES = Math.round(
  EXAM_SECTIONS.reduce((n, s) => n + s.seconds, 0) / 60,
);
