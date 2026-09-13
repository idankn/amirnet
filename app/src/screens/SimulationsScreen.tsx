import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  SIMULATION_SLOT_COUNT,
  type SimulationSlotState,
} from '../lib/simulations';
import { EXAM_SECTIONS, EXAM_TOTAL_MINUTES, EXAM_TOTAL_QUESTIONS } from '../types';
import { colors, hebrew, radii, spacing, type } from '../theme';

interface Props {
  /** Keyed by slot index, 0..SIMULATION_SLOT_COUNT-1. */
  slots: Record<number, SimulationSlotState>;
  onStart: (slot: number) => void;
  onExit: () => void;
}

const STATUS_LABEL: Record<SimulationSlotState['status'], string> = {
  not_started: 'טרם הותחלה',
  in_progress: 'הותחלה ולא הושלמה',
  completed: 'הושלמה',
};

/**
 * Five separate full sittings, each tracked on its own.
 *
 * The five draw from disjoint slices of the bank where the bank has enough
 * content to support that (see `partitionBank`), so working through all five
 * is five genuinely different sittings rather than the same pool reshuffled.
 * Each still runs the real adaptive, per-section-timed engine — this screen
 * only picks which slot's sitting to start.
 */
export function SimulationsScreen({ slots, onStart, onExit }: Props) {
  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={onExit} hitSlop={12}>
          <Text style={styles.backText}>← יציאה</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>סימולציות מלאות</Text>
        <Text style={styles.body}>
          {EXAM_SECTIONS.length} פרקים · {EXAM_TOTAL_QUESTIONS} שאלות ·{' '}
          {EXAM_TOTAL_MINUTES} דקות בכל סימולציה. חמש סימולציות נפרדות, כל אחת
          עם השאלות שלה, כדי שלא תתרגלו את אותה בחינה פעמיים.
        </Text>

        <View style={styles.list}>
          {Array.from({ length: SIMULATION_SLOT_COUNT }, (_, i) => {
            const slot = slots[i] ?? { status: 'not_started' as const };
            const summary = slot.summary;
            return (
              <Pressable
                key={i}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => onStart(i)}
              >
                <View
                  style={[
                    styles.glyphBox,
                    slot.status === 'completed'
                      ? styles.glyphDone
                      : slot.status === 'in_progress'
                        ? styles.glyphPartial
                        : styles.glyphNew,
                  ]}
                >
                  <Text
                    style={[
                      styles.glyph,
                      slot.status === 'completed'
                        ? styles.glyphTextDone
                        : slot.status === 'in_progress'
                          ? styles.glyphTextPartial
                          : styles.glyphTextNew,
                    ]}
                  >
                    {i + 1}
                  </Text>
                </View>

                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>סימולציה {i + 1}</Text>
                  <Text style={styles.cardBlurb}>
                    {summary
                      ? `${STATUS_LABEL[slot.status]} · ${summary.correct}/${summary.total} נכון`
                      : STATUS_LABEL[slot.status]}
                  </Text>
                </View>

                <Text style={styles.cardMeta}>
                  {slot.status === 'not_started' ? 'התחלה' : 'התחלה מחדש'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.footnote}>
          התחלת סימולציה תמיד מתחילה מהפרק הראשון שלה מחדש — כמו בבחינה
          האמיתית, אין אפשרות להמשיך סימולציה שנעצרה באמצע.
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

  list: { gap: spacing.md },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: spacing.lg,
  },
  cardPressed: { opacity: 0.85 },

  glyphBox: {
    width: 40,
    height: 40,
    borderRadius: radii.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphNew: { backgroundColor: colors.brandSoft },
  glyphPartial: { backgroundColor: colors.accentSoft },
  glyphDone: { backgroundColor: colors.correctSoft },
  glyph: { fontSize: 17, fontWeight: '600' },
  glyphTextNew: { color: colors.brand },
  glyphTextPartial: { color: colors.accent },
  glyphTextDone: { color: colors.correct },

  cardBody: { flex: 1, gap: 2 },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    ...hebrew,
  },
  cardBlurb: { ...type.caption, ...hebrew },
  cardMeta: { ...type.caption, ...hebrew, color: colors.textSecondary },

  footnote: { ...type.caption, ...hebrew, marginTop: spacing.lg },
});
