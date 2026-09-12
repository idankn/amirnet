import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Question } from '../types';

/**
 * Practice reminders.
 *
 * This is the buildable half of "interrupt me while I'm scrolling". iOS gives
 * no way to know which app is in the foreground and no way to draw over one,
 * so nothing can react to Instagram specifically — see CLAUDE.md section 3.
 * What a schedule CAN do is occupy the same idle minutes, which is most of the
 * value.
 *
 * Notifications are scheduled as one repeating daily entry per slot rather
 * than a single repeating interval, because an interval that repeats forever
 * also fires at 04:00. The window is the point.
 *
 * The reminder CARRIES the question rather than advertising one. Its four
 * options are the notification's action buttons, so the whole exchange —
 * question, answer, verdict — happens without opening the app. That is as
 * close to "a question appears and I must answer it" as iOS permits: the
 * system reserves taking over the screen for calls and alarms, and the
 * Screen Time shield that can block another app cannot hold a question
 * (ShieldConfiguration is a static title/subtitle/two buttons).
 *
 * Known limitation, and it is iOS's: action buttons are revealed by expanding
 * or long-pressing the notification. They are not visible in the collapsed
 * banner.
 */

const STORAGE_KEY = 'reminders.settings.v1';

/**
 * iOS keeps at most 64 pending local notifications per app and silently drops
 * the rest. Staying under it deliberately, with headroom, so a user who picks
 * a short interval gets a clear warning instead of notifications that quietly
 * stop partway through the day.
 */
export const MAX_SLOTS = 60;

/**
 * Only sentence completion goes into a notification.
 *
 * This is a data constraint, not a preference: an action button shows a short
 * label, and in the bank sentence-completion options run 8-14 characters while
 * restatement options run 94-130. A restatement in a notification would be
 * four truncated buttons, which is worse than no question at all.
 */
export const NOTIFICATION_QUESTION_TYPE = 'sentence_completion';

/** Answer actions are `answer-<option index>` within a per-question category. */
const ANSWER_PREFIX = 'answer-';
const CATEGORY_PREFIX = 'practice-q-';

export interface ReminderSettings {
  enabled: boolean;
  /** Minutes between reminders. */
  intervalMinutes: number;
  /** 24h clock. Reminders fire from startHour to endHour inclusive. */
  startHour: number;
  endHour: number;
}

export const DEFAULT_SETTINGS: ReminderSettings = {
  enabled: false,
  intervalMinutes: 60,
  startHour: 16,
  endHour: 22,
};

export const INTERVAL_CHOICES = [5, 15, 30, 60, 120] as const;

/** The clock times reminders would fire at, given a setting. */
export function slotsFor(s: ReminderSettings): { hour: number; minute: number }[] {
  const slots: { hour: number; minute: number }[] = [];
  const start = s.startHour * 60;
  const end = s.endHour * 60;
  if (end < start || s.intervalMinutes < 1) return slots;

  for (let t = start; t <= end; t += s.intervalMinutes) {
    slots.push({ hour: Math.floor(t / 60) % 24, minute: t % 60 });
    if (slots.length >= MAX_SLOTS) break;
  }
  return slots;
}

/** How many slots the window would want, ignoring the cap. */
export function slotsWanted(s: ReminderSettings): number {
  const span = s.endHour * 60 - s.startHour * 60;
  if (span < 0 || s.intervalMinutes < 1) return 0;
  return Math.floor(span / s.intervalMinutes) + 1;
}

export async function loadSettings(): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(s: ReminderSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // A failed write costs the user their preference, not their session.
  }
}

/**
 * Scheduled local notifications are a native capability. On web the module
 * exists but its methods throw, so every entry point checks this rather than
 * discovering it at the call site.
 */
export const isSupported = Platform.OS !== 'web';

/** Ask for permission. Returns whether we may post notifications. */
export async function ensurePermission(): Promise<boolean> {
  if (!isSupported) return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/** Questions usable in a notification, shuffled, capped at `count`. */
export function pickReminderQuestions(bank: Question[], count: number): Question[] {
  const usable = bank.filter(
    (q) => q.type === NOTIFICATION_QUESTION_TYPE && q.options.length > 0,
  );
  const out = [...usable];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  // Fewer questions than slots is fine — the list wraps, so a long window
  // repeats rather than scheduling empty reminders.
  if (out.length === 0) return [];
  const picked: Question[] = [];
  for (let i = 0; i < count; i++) picked.push(out[i % out.length]);
  return picked;
}

/**
 * Replace the whole schedule with one built from `settings`.
 *
 * Always clears first: scheduling on top of an existing schedule is how people
 * end up with notifications from a setting they changed a week ago.
 *
 * Each slot gets its own category, because a category's buttons are fixed at
 * registration and every question needs its own four.
 */
export async function reschedule(
  settings: ReminderSettings,
  bank: Question[] = [],
): Promise<number> {
  if (!isSupported) return 0;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!settings.enabled) return 0;

  const slots = slotsFor(settings);
  const questions = pickReminderQuestions(bank, slots.length);

  for (let i = 0; i < slots.length; i++) {
    const { hour, minute } = slots[i];
    const question: Question | undefined = questions[i];

    let categoryIdentifier: string | undefined;
    if (question) {
      categoryIdentifier = CATEGORY_PREFIX + i;
      await Notifications.setNotificationCategoryAsync(
        categoryIdentifier,
        question.options.map((text, optionIndex) => ({
          identifier: ANSWER_PREFIX + optionIndex,
          buttonTitle: text,
          // Answering must not drag the user into the app — that is the whole
          // point. The verdict comes back as its own notification.
          options: { opensAppToForeground: false },
        })),
      );
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'אמירנט',
        body: question ? question.prompt : 'שאלה אחת. דקה אחת.',
        categoryIdentifier,
        // Cuts through Focus and Do Not Disturb. Not 'critical', which needs a
        // separate Apple entitlement and is meant for genuine emergencies.
        interruptionLevel: 'timeSensitive',
        data: question
          ? {
              action: 'answer',
              questionId: question.id,
              correctIndex: question.correctIndex,
              explanation: question.explanation,
              correctText: question.options[question.correctIndex],
            }
          : { action: 'practice' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  }
  return slots.length;
}

/**
 * Foreground behaviour. A banner while the app is already open would interrupt
 * the very practice it is asking for, so it stays silent there.
 */
export function configureHandler(): void {
  if (!isSupported) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: false,
      shouldShowBanner: false,
      shouldShowList: true,
    }),
  });
}

/** The verdict, delivered the same way the question was. */
async function sendVerdict(
  correct: boolean,
  correctText: string,
  explanation: string,
): Promise<void> {
  if (!isSupported) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: correct ? '✓ נכון' : '✗ לא נכון',
      body: correct
        ? explanation || 'תשובה נכונה.'
        : `התשובה הנכונה: ${correctText}${explanation ? '\n' + explanation : ''}`,
      interruptionLevel: 'passive',
    },
    // null fires it immediately rather than scheduling it.
    trigger: null,
  });
}

export interface ReminderAnswer {
  questionId: string;
  chosenIndex: number;
  correct: boolean;
}

/**
 * Respond to a reminder the user acted on.
 *
 * Two routes, both covered: a cold start where the tap launched the app, and a
 * response while it was already running. Returns a cleanup function.
 *
 * Guarded by platform because the underlying native module does not exist on
 * web — the hook version of this throws there and takes the whole app down,
 * which is exactly what happened the first time.
 */
export function onReminderResponse(handlers: {
  /** The notification body was tapped — open into practice. */
  onPractice: () => void;
  /** An answer button was used. The app may still be in the background. */
  onAnswer?: (answer: ReminderAnswer) => void;
}): () => void {
  if (!isSupported) return () => {};

  let cancelled = false;

  const handle = (response: Notifications.NotificationResponse) => {
    if (cancelled) return;
    const data = response.notification.request.content.data as
      | Record<string, unknown>
      | undefined;
    if (!data) return;

    const actionId = response.actionIdentifier;

    if (actionId.startsWith(ANSWER_PREFIX)) {
      const chosenIndex = Number(actionId.slice(ANSWER_PREFIX.length));
      const correctIndex = Number(data.correctIndex);
      if (!Number.isInteger(chosenIndex) || !Number.isInteger(correctIndex)) return;
      const correct = chosenIndex === correctIndex;

      void sendVerdict(
        correct,
        String(data.correctText ?? ''),
        String(data.explanation ?? ''),
      );
      handlers.onAnswer?.({
        questionId: String(data.questionId ?? ''),
        chosenIndex,
        correct,
      });
      return;
    }

    // Anything else — including DEFAULT_ACTION_IDENTIFIER, the plain tap.
    if (data.action === 'practice' || data.action === 'answer') {
      handlers.onPractice();
    }
  };

  // Cold start: the response that launched the app.
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (response) handle(response);
  });

  // Already running.
  const sub = Notifications.addNotificationResponseReceivedListener(handle);

  return () => {
    cancelled = true;
    sub.remove();
  };
}

/** Android needs a channel before anything will show. */
export async function configureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('practice', {
    name: 'תרגול',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}
