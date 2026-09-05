import { supabase } from './supabase';
import type { Passage, Question, QuestionType } from '../types';

/** Free user is out of questions for today. Drives the upgrade prompt. */
export class DailyLimitError extends Error {
  constructor() {
    super('daily_limit_reached');
    this.name = 'DailyLimitError';
  }
}

/** Feature is part of membership. */
export class MembersOnlyError extends Error {
  constructor() {
    super('members_only');
    this.name = 'MembersOnlyError';
  }
}

export class AuthRequiredError extends Error {
  constructor() {
    super('auth_required');
    this.name = 'AuthRequiredError';
  }
}

export interface Usage {
  signedIn: boolean;
  member?: boolean;
  used?: number;
  /** null for members — unlimited. */
  limit?: number | null;
}

export interface PracticeBatch {
  questions: Question[];
  passages: Passage[];
  usage: Usage;
}

/** Postgres raises these by name; turn them into something typed. */
function translate(message: string): Error {
  if (message.includes('daily_limit_reached')) return new DailyLimitError();
  if (message.includes('members_only')) return new MembersOnlyError();
  if (message.includes('auth_required')) return new AuthRequiredError();
  return new Error(message);
}

interface RawQuestion {
  id: string;
  type: string;
  passage_id: string | null;
  prompt: string;
  options: string[];
  correct_index: number;
  explanation: string | null;
  difficulty: number | null;
}

function toQuestion(row: RawQuestion): Question {
  const correct = row.options[row.correct_index];
  const options = [...row.options];
  // Re-shuffle per load, so a question seen twice isn't answerable from
  // remembered position rather than remembered English.
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }
  return {
    id: row.id,
    type: row.type as QuestionType,
    passageId: row.passage_id ?? undefined,
    prompt: row.prompt,
    options,
    correctIndex: options.indexOf(correct),
    explanation: row.explanation ?? '',
    difficulty: row.difficulty ?? 3,
  };
}

/**
 * Ask for practice questions.
 *
 * There is no local question store and no client-side quota check — the server
 * counts the request against today's allowance before it returns anything, and
 * refuses once it's spent. That is deliberate: the bank never reaches the
 * device in bulk, so the limit is a real constraint rather than a UI state.
 */
export async function requestPractice(
  type: QuestionType,
  count = 10,
): Promise<PracticeBatch> {
  const { data, error } = await supabase.rpc('request_practice', {
    p_type: type,
    p_count: count,
  });
  if (error) throw translate(error.message);

  return {
    questions: (data.questions as RawQuestion[]).map(toQuestion),
    passages: (data.passages ?? []) as Passage[],
    usage: data.usage as Usage,
  };
}

/** A full timed sitting. Members only — the server enforces it. */
export async function requestSimulation(): Promise<{
  questions: Question[];
  passages: Passage[];
}> {
  const { data, error } = await supabase.rpc('request_simulation');
  if (error) throw translate(error.message);
  return {
    questions: (data.questions as RawQuestion[]).map(toQuestion),
    passages: (data.passages ?? []) as Passage[],
  };
}

export async function fetchUsage(): Promise<Usage> {
  const { data, error } = await supabase.rpc('usage_today');
  if (error) throw translate(error.message);
  return data as Usage;
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
