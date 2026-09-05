export type QuestionType =
  | 'sentence_completion'
  | 'restatement'
  | 'reading'
  | 'listening'
  | 'vocab_in_context'
  | 'word_formation';

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
}

/** Hebrew display names for the question types. */
export const TYPE_LABELS: Record<QuestionType, string> = {
  sentence_completion: 'השלמת משפטים',
  restatement: 'ניסוח מחדש',
  reading: 'הבנת הנקרא',
  listening: 'הבנת הנשמע',
  vocab_in_context: 'אוצר מילים בהקשר',
  word_formation: 'תצורת מילים',
};
