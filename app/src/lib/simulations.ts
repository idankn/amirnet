import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Passage, Question, QuestionBank } from '../types';

/**
 * Five separate, independently-tracked simulation slots.
 *
 * Before this existed there was one "start a simulation" button: every tap
 * called `assembleSection` fresh against the whole bank, so a user who sat two
 * simulations on two different days had no way to tell them apart afterwards,
 * and the two sittings would often draw heavily overlapping questions since
 * dedup only ever applied WITHIN one sitting. This gives each of five slots
 * its own bank partition (see `partitionBank`) and its own persisted status,
 * so a user can work through five genuinely different full sittings and see
 * which ones they've done.
 *
 * Each slot still goes through the real adaptive engine
 * (`assembleSection`/`nextDifficulty`) — this only scopes WHICH questions a
 * slot's sitting can be assembled from, not how a sitting is built.
 */
export const SIMULATION_SLOT_COUNT = 5;

export type SimulationSlotStatus = 'not_started' | 'in_progress' | 'completed';

export interface SimulationSummary {
  total: number;
  answered: number;
  correct: number;
  /** Date.now() when the sitting reached its results screen. */
  finishedAt: number;
}

export interface SimulationSlotState {
  status: SimulationSlotStatus;
  /**
   * The most recent completed result for this slot, if any. Kept even while a
   * retake is `in_progress`, so a slot never loses its last known result
   * just because someone started it again — it's only replaced once the
   * retake itself finishes.
   */
  summary?: SimulationSummary;
}

const STORAGE_KEY = 'simulations.slots.v1';

const DEFAULT_SLOT_STATE: SimulationSlotState = { status: 'not_started' };

/** Every slot, defaulted, keyed by index 0..SIMULATION_SLOT_COUNT-1. */
export async function loadSlotStates(): Promise<
  Record<number, SimulationSlotState>
> {
  const states: Record<number, SimulationSlotState> = {};
  for (let i = 0; i < SIMULATION_SLOT_COUNT; i++) states[i] = DEFAULT_SLOT_STATE;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) Object.assign(states, JSON.parse(raw));
  } catch {
    // Falls back to all-not_started, same as a first launch.
  }
  return states;
}

async function saveSlotStates(
  states: Record<number, SimulationSlotState>,
): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  } catch {
    // A failed write costs the tracking, not the sitting itself.
  }
}

/**
 * A slot was just launched. Marked BEFORE the sitting runs, not after, so a
 * slot that never reaches its results screen (the app is killed, or the user
 * exits and cancels — the exam has no pause, and neither does this) is
 * honestly shown as started-but-unfinished rather than quietly reverting to
 * not_started.
 */
export async function markSlotStarted(
  slot: number,
): Promise<Record<number, SimulationSlotState>> {
  const states = await loadSlotStates();
  states[slot] = { ...states[slot], status: 'in_progress' };
  await saveSlotStates(states);
  return states;
}

/** A slot's sitting reached the results screen. */
export async function markSlotCompleted(
  slot: number,
  summary: SimulationSummary,
): Promise<Record<number, SimulationSlotState>> {
  const states = await loadSlotStates();
  states[slot] = { status: 'completed', summary };
  await saveSlotStates(states);
  return states;
}

function sortedById<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * Scope a bank down to one slot's share of it, so the five slots draw from
 * disjoint content wherever the bank has enough to go around.
 *
 * Passages (and the reading questions hung off them) are partitioned as
 * whole passages, round-robin by sorted id — a reading section is one
 * passage's five questions, so splitting a passage across slots would be
 * meaningless. Every other type is partitioned round-robin within its own
 * type, so no slot is starved of one type because another type split
 * unevenly.
 *
 * Sorting by id first (rather than trusting array order) makes the split
 * stable regardless of how the bank arrived — bundled JSON or a server
 * response aren't guaranteed to come back in the same order twice.
 *
 * This is a static, stateless split, not a tracked dedup system: it doesn't
 * remember what a slot has used across app runs, doesn't shrink to make room
 * for another slot, and if the bank doesn't have enough content, a slot
 * simply gets less to draw from — `examShortfalls`/`assembleSection` already
 * surface that honestly, same as they do for a single sitting today.
 */
export function partitionBank(
  bank: QuestionBank,
  slot: number,
  slotCount: number = SIMULATION_SLOT_COUNT,
): QuestionBank {
  const passages: Passage[] = sortedById(bank.passages).filter(
    (_, i) => i % slotCount === slot,
  );
  const passageIds = new Set(passages.map((p) => p.id));

  const byType = new Map<string, Question[]>();
  const passageQuestions: Question[] = [];
  for (const q of bank.questions) {
    if (q.passageId) {
      if (passageIds.has(q.passageId)) passageQuestions.push(q);
      continue;
    }
    const list = byType.get(q.type) ?? [];
    list.push(q);
    byType.set(q.type, list);
  }

  const questions: Question[] = [...passageQuestions];
  for (const list of byType.values()) {
    sortedById(list).forEach((q, i) => {
      if (i % slotCount === slot) questions.push(q);
    });
  }

  return { passages, questions };
}
