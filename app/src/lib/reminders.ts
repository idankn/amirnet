import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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
 */

const STORAGE_KEY = 'reminders.settings.v1';

/**
 * iOS keeps at most 64 pending local notifications per app and silently drops
 * the rest. Staying under it deliberately, with headroom, so a user who picks
 * a short interval gets a clear warning instead of notifications that quietly
 * stop partway through the day.
 */
export const MAX_SLOTS = 60;

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

const BODIES = [
  'שאלה אחת. דקה אחת.',
  'רגע — שאלה מהירה?',
  'שאלה אחת לפני שממשיכים.',
  'דקה של תרגול?',
];

/**
 * Replace the whole schedule with one built from `settings`.
 *
 * Always clears first: scheduling on top of an existing schedule is how people
 * end up with notifications from a setting they changed a week ago.
 */
export async function reschedule(settings: ReminderSettings): Promise<number> {
  if (!isSupported) return 0;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!settings.enabled) return 0;

  const slots = slotsFor(settings);
  for (let i = 0; i < slots.length; i++) {
    const { hour, minute } = slots[i];
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'אמירנט',
        body: BODIES[i % BODIES.length],
        // Read on tap so the app opens into practice rather than the home screen.
        data: { action: 'practice' },
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

/**
 * Call `onPractice` when the user opens the app by tapping a reminder.
 *
 * Covers both routes: a cold start, where the tap launched the app, and a tap
 * while it was already running. Returns a cleanup function.
 *
 * Guarded by platform because the underlying native module does not exist on
 * web — the hook version of this throws there and takes the whole app down,
 * which is exactly what happened the first time.
 */
export function onReminderTap(onPractice: () => void): () => void {
  if (!isSupported) return () => {};

  let cancelled = false;

  // Cold start: the tap that launched the app.
  void Notifications.getLastNotificationResponseAsync().then((response) => {
    if (cancelled) return;
    if (response?.notification.request.content.data?.action === 'practice') {
      onPractice();
    }
  });

  // Already running.
  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    if (response.notification.request.content.data?.action === 'practice') {
      onPractice();
    }
  });

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
