import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, hebrew, radii, spacing, type } from '../theme';
import {
  ALL_TYPES,
  EXAM_SECTIONS,
  EXAM_TOTAL_MINUTES,
  EXAM_TOTAL_QUESTIONS,
  EXPERIMENTAL_TYPES,
  TYPE_BLURBS,
  TYPE_LABELS,
  type QuestionBank,
  type QuestionType,
} from '../types';

/** A glyph per type — cheaper than an icon set and legible at this size. */
const TYPE_GLYPHS: Record<QuestionType, string> = {
  sentence_completion: '__',
  restatement: '⇄',
  reading: '≡',
  listening: '♪',
  word_formation: 'Aa',
  writing: '✎',
};

interface Props {
  bank: QuestionBank;
  /** How many questions the user has answered, per type. */
  progress: Record<string, number>;
  examDate: Date;
  isMember: boolean;
  signedIn: boolean;
  onPractice: (type: QuestionType) => void;
  onSimulation: () => void;
  onAccount: () => void;
}

function daysUntil(date: Date): number {
  const day = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((target.getTime() - today.getTime()) / day));
}

/**
 * Home.
 *
 * The anchor is the countdown to the user's exam date — deliberately NOT a
 * predicted score. A numeric score anchor was considered and rejected; don't
 * reintroduce one here.
 *
 * Below it, every question type with the ones not yet met highlighted. That
 * list is the app's real answer to "what should I do now" — it's information,
 * and it leads straight to an action.
 */
export function HomeScreen({
  bank,
  progress,
  examDate,
  isMember,
  signedIn,
  onPractice,
  onSimulation,
  onAccount,
}: Props) {
  const days = daysUntil(examDate);

  const countFor = (t: QuestionType) =>
    bank.questions.filter((q) => q.type === t).length;

  // The type to push today: the first one with content that hasn't been met.
  const nextUnmet =
    ALL_TYPES.find((t) => countFor(t) > 0 && !progress[t]) ??
    ALL_TYPES.find((t) => countFor(t) > 0);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.accountRow}>
        <Pressable onPress={onAccount} hitSlop={8}>
          <Text style={styles.accountLink}>
            {signedIn ? 'התנתקות' : 'התחברות'}
          </Text>
        </Pressable>
        {isMember && <Text style={styles.memberTag}>מנוי</Text>}
      </View>

      <View style={styles.countdown}>
        <Text style={styles.countdownNumber}>{days}</Text>
        <Text style={styles.countdownLabel}>
          {days === 1 ? 'יום לבחינה' : 'ימים לבחינה'}
        </Text>
      </View>

      {!isMember && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoTitle}>אתה מתרגל על מאגר ההתנסות</Text>
          <Text style={styles.demoBody}>
            ההתנסות פתוחה לכולם וכוללת דוגמאות מכל סוגי השאלות. המאגר המלא
            נפתח למנויים.
          </Text>
        </View>
      )}

      {nextUnmet && (
        <Pressable style={styles.primaryButton} onPress={() => onPractice(nextUnmet)}>
          <Text style={styles.primaryButtonText}>התרגול של היום</Text>
        </Pressable>
      )}

      <Text style={styles.sectionHeading}>סוגי שאלות</Text>
      <View style={styles.list}>
        {ALL_TYPES.map((t) => {
          const available = countFor(t);
          const done = progress[t] ?? 0;
          const met = done > 0;

          return (
            <Pressable
              key={t}
              disabled={available === 0}
              onPress={() => onPractice(t)}
              style={({ pressed }) => [
                styles.card,
                available === 0 && styles.cardDisabled,
                pressed && available > 0 && styles.cardPressed,
              ]}
            >
              <View style={[styles.glyphBox, met ? styles.glyphMet : styles.glyphUnmet]}>
                <Text style={[styles.glyph, met ? styles.glyphTextMet : styles.glyphTextUnmet]}>
                  {TYPE_GLYPHS[t]}
                </Text>
              </View>

              <View style={styles.cardBody}>
                <View style={styles.cardTitleRow}>
                  <Text style={styles.cardTitle}>{TYPE_LABELS[t]}</Text>
                  {EXPERIMENTAL_TYPES.includes(t) && (
                    <Text style={styles.experimentalTag}>ניסיוני</Text>
                  )}
                </View>
                <Text style={styles.cardBlurb}>{TYPE_BLURBS[t]}</Text>
              </View>

              <Text style={styles.cardMeta}>
                {!available ? 'בקרוב' : met ? `${done} נענו` : 'טרם תרגלת'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.sectionHeading}>סימולציה</Text>
      <Pressable
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        onPress={onSimulation}
      >
        <View style={[styles.glyphBox, styles.glyphUnmet]}>
          <Text style={[styles.glyph, styles.glyphTextUnmet]}>⏱</Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardTitle}>סימולציה מלאה</Text>
          <Text style={styles.cardBlurb}>
            {EXAM_SECTIONS.length} פרקים · {EXAM_TOTAL_QUESTIONS} שאלות ·{' '}
            {EXAM_TOTAL_MINUTES} דקות
          </Text>
        </View>
      </Pressable>

      <Text style={styles.footnote}>
        זמן שלא נוצל בפרק אינו עובר לפרק הבא — כמו בבחינה האמיתית.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },

  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountLink: { ...type.label, ...hebrew, color: colors.brand },
  memberTag: {
    ...type.caption,
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },

  demoBanner: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  demoTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    ...hebrew,
  },
  demoBody: { ...type.caption, ...hebrew, color: colors.textBody },

  countdown: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  countdownNumber: {
    fontSize: 64,
    lineHeight: 72,
    fontWeight: '700',
    color: colors.brand,
  },
  countdownLabel: {
    ...type.body,
    ...hebrew,
    textAlign: 'center',
    color: colors.textSecondary,
  },

  primaryButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.button,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '600',
    ...hebrew,
    textAlign: 'center',
  },

  sectionHeading: {
    ...type.label,
    ...hebrew,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },

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
  cardDisabled: { opacity: 0.55 },
  cardPressed: { opacity: 0.85 },

  glyphBox: {
    width: 40,
    height: 40,
    borderRadius: radii.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Violet marks a type already practised — accent only, never an action. */
  glyphMet: { backgroundColor: colors.accentSoft },
  glyphUnmet: { backgroundColor: colors.brandSoft },
  glyph: { fontSize: 17, fontWeight: '600' },
  glyphTextMet: { color: colors.accent },
  glyphTextUnmet: { color: colors.brand },

  cardBody: { flex: 1, gap: 2 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    ...hebrew,
  },
  experimentalTag: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.accent,
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  cardBlurb: {
    ...type.caption,
    ...hebrew,
  },
  cardMeta: {
    ...type.caption,
    ...hebrew,
    color: colors.textSecondary,
  },

  footnote: {
    ...type.caption,
    ...hebrew,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
