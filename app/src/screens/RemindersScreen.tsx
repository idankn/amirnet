import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import {
  DEFAULT_SETTINGS,
  INTERVAL_CHOICES,
  MAX_SLOTS,
  ensurePermission,
  loadSettings,
  reschedule,
  saveSettings,
  slotsFor,
  slotsWanted,
  isSupported,
  type ReminderSettings,
} from '../lib/reminders';
import type { Question } from '../types';
import { colors, hebrew, radii, spacing, type } from '../theme';

interface Props {
  onExit: () => void;
  /**
   * Questions the reminder can carry. A reminder holds its question rather
   * than advertising one, so the schedule needs the bank at the moment it is
   * built.
   */
  bank: Question[];
}

const HOURS = [6, 8, 10, 12, 14, 16, 18, 20, 22, 23];

function label(minutes: number): string {
  if (minutes < 60) return `כל ${minutes} דקות`;
  if (minutes === 60) return 'כל שעה';
  return `כל ${minutes / 60} שעות`;
}

function clock(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function RemindersScreen({ onExit, bank }: Props) {
  const [settings, setSettings] = useState<ReminderSettings>(DEFAULT_SETTINGS);
  const [denied, setDenied] = useState(false);
  const [scheduled, setScheduled] = useState<number | null>(null);

  useEffect(() => {
    loadSettings().then(setSettings);
  }, []);

  async function apply(next: ReminderSettings) {
    setSettings(next);
    await saveSettings(next);

    if (next.enabled) {
      const allowed = await ensurePermission();
      if (!allowed) {
        setDenied(true);
        setSettings({ ...next, enabled: false });
        await saveSettings({ ...next, enabled: false });
        return;
      }
      setDenied(false);
    }
    setScheduled(await reschedule(next, bank));
  }

  const slots = slotsFor(settings);
  const wanted = slotsWanted(settings);
  const capped = wanted > MAX_SLOTS;

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={onExit} hitSlop={12}>
          <Text style={styles.backText}>← יציאה</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>תזכורות תרגול</Text>
        <Text style={styles.body}>
          התראה שנפתחת ישר לשאלה, בלי לעבור דרך המסך הראשי.
        </Text>

        {!isSupported && (
          <Text style={styles.warning}>
            תזכורות עובדות רק באפליקציה עצמה, לא בדפדפן.
          </Text>
        )}

        <View style={styles.row}>
          <Text style={styles.rowLabel}>תזכורות פעילות</Text>
          <Switch
            value={settings.enabled}
            disabled={!isSupported}
            onValueChange={(v) => apply({ ...settings, enabled: v })}
            trackColor={{ true: colors.brand, false: colors.border }}
          />
        </View>

        {denied && (
          <Text style={styles.warning}>
            ההרשאה להתראות נדחתה. אפשר לאשר אותה בהגדרות המכשיר.
          </Text>
        )}

        <Text style={styles.sectionHeading}>תדירות</Text>
        <View style={styles.chips}>
          {INTERVAL_CHOICES.map((m) => (
            <Pressable
              key={m}
              style={[
                styles.chip,
                settings.intervalMinutes === m && styles.chipOn,
              ]}
              onPress={() => apply({ ...settings, intervalMinutes: m })}
            >
              <Text
                style={[
                  styles.chipText,
                  settings.intervalMinutes === m && styles.chipTextOn,
                ]}
              >
                {label(m)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionHeading}>משעה</Text>
        <View style={styles.chips}>
          {HOURS.filter((h) => h < settings.endHour).map((h) => (
            <Pressable
              key={h}
              style={[styles.chip, settings.startHour === h && styles.chipOn]}
              onPress={() => apply({ ...settings, startHour: h })}
            >
              <Text
                style={[
                  styles.chipText,
                  settings.startHour === h && styles.chipTextOn,
                ]}
              >
                {clock(h, 0)}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.sectionHeading}>עד שעה</Text>
        <View style={styles.chips}>
          {HOURS.filter((h) => h > settings.startHour).map((h) => (
            <Pressable
              key={h}
              style={[styles.chip, settings.endHour === h && styles.chipOn]}
              onPress={() => apply({ ...settings, endHour: h })}
            >
              <Text
                style={[
                  styles.chipText,
                  settings.endHour === h && styles.chipTextOn,
                ]}
              >
                {clock(h, 0)}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>
            {settings.enabled
              ? `${slots.length} תזכורות ביום`
              : 'התזכורות כבויות'}
          </Text>
          {settings.enabled && slots.length > 0 && (
            <Text style={styles.summaryBody}>
              הראשונה ב-{clock(slots[0].hour, slots[0].minute)}, האחרונה ב-
              {clock(slots[slots.length - 1].hour, slots[slots.length - 1].minute)}.
            </Text>
          )}
          {/* iOS drops pending notifications past its own cap, so say so
              rather than let the day quietly stop halfway through. */}
          {capped && (
            <Text style={styles.warning}>
              בתדירות הזו iOS לא יאפשר יותר מ-{MAX_SLOTS} תזכורות ביום, אז הן
              ייפסקו ב-{clock(slots[slots.length - 1].hour, slots[slots.length - 1].minute)}.
              תדירות נמוכה יותר תכסה את כל החלון.
            </Text>
          )}
          {scheduled !== null && !capped && settings.enabled && (
            <Text style={styles.summaryBody}>נשמר.</Text>
          )}
        </View>

        <Text style={styles.footnote}>
          האפליקציה לא יכולה לדעת מתי אתה באינסטגרם או בטיקטוק — iOS לא מאפשר
          את זה לאף אפליקציה. התזכורות עובדות לפי שעון.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },

  topBar: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  backText: { ...type.label, ...hebrew, color: colors.brand },

  title: { ...type.title, ...hebrew },
  body: { ...type.body, ...hebrew, marginBottom: spacing.sm },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: spacing.lg,
  },
  rowLabel: { fontSize: 16, fontWeight: '500', color: colors.textPrimary, ...hebrew },

  sectionHeading: {
    ...type.label,
    ...hebrew,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...type.label, ...hebrew, color: colors.textPrimary },
  chipTextOn: { color: colors.surface },

  summary: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    ...hebrew,
  },
  summaryBody: { ...type.caption, ...hebrew, color: colors.textBody },
  warning: { ...type.caption, ...hebrew, color: colors.brand },

  footnote: { ...type.caption, ...hebrew, marginTop: spacing.lg },
});
