import { supabase } from './supabase';
import type { Passage, Question, QuestionBank, QuestionType } from '../types';

/**
 * Load whatever content this viewer is allowed to see.
 *
 * Note there is no tier filter in this query, and there must not be. The
 * request asks for everything; row-level security decides what comes back —
 * the demo slice for signed-out and free users, the whole bank for members.
 * Putting the check here instead would mean anyone with the anon key could
 * bypass it by calling the API directly.
 */
export async function fetchBank(): Promise<QuestionBank> {
  const [questionsRes, passagesRes] = await Promise.all([
    supabase
      .from('questions')
      .select('id, type, passage_id, prompt, options, correct_index, explanation, difficulty'),
    supabase.from('passages').select('id, topic, body'),
  ]);

  if (questionsRes.error) throw questionsRes.error;
  if (passagesRes.error) throw passagesRes.error;

  const questions: Question[] = (questionsRes.data ?? []).map((row) =>
    reshuffle({
      id: row.id,
      type: row.type as QuestionType,
      passageId: row.passage_id ?? undefined,
      prompt: row.prompt,
      options: row.options as string[],
      correctIndex: row.correct_index,
      explanation: row.explanation ?? '',
      difficulty: row.difficulty ?? 3,
    }),
  );

  const passages: Passage[] = (passagesRes.data ?? []).map((row) => ({
    id: row.id,
    topic: row.topic ?? '',
    body: row.body,
  }));

  return { passages, questions };
}

/**
 * Re-shuffle a question's options per load.
 *
 * The stored order is fixed, so without this a user who saw a question once
 * could recognise the answer by position on a second pass — which measures
 * memory of the layout rather than of the English.
 */
function reshuffle(q: Question): Question {
  const correct = q.options[q.correctIndex];
  const options = [...q.options];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return { ...q, options, correctIndex: options.indexOf(correct) };
}

/**
 * Record an answer. Fire-and-forget: a failed write must never interrupt
 * practice, and these rows only matter in aggregate.
 */
export async function recordAttempt(params: {
  userId: string;
  questionId: string;
  chosenIndex: number;
  isCorrect: boolean;
  timeSpentMs?: number;
}): Promise<void> {
  const { error } = await supabase.from('attempts').insert({
    user_id: params.userId,
    question_id: params.questionId,
    chosen_index: params.chosenIndex,
    is_correct: params.isCorrect,
    time_spent_ms: params.timeSpentMs ?? null,
  });
  if (error) console.warn('attempt not recorded:', error.message);
}

/** The "something's wrong with this question" button. */
export async function reportQuestion(params: {
  userId: string;
  questionId: string;
  reason: string;
}): Promise<void> {
  const { error } = await supabase.from('reports').insert({
    user_id: params.userId,
    question_id: params.questionId,
    reason: params.reason,
  });
  if (error) throw error;
}
