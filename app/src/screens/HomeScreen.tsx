import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Usage } from '../lib/bank';
import { colors, hebrew, radii, spacing, type } from '../theme';
import {
  ALL_TYPES,
  EXAM_SECTIONS,
  EXAM_TOTAL_MINUTES,
  EXAM_TOTAL_QUESTIONS,
  EXPERIMENTAL_TYPES,
  IMPLEMENTED_TYPES,
  TYPE_BLURBS,
  TYPE_LABELS,
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
  /** How many questions the user has answered, per type. */
  progress: Record<string, number>;
  examDate: Date;
  usage: Usage | null;
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
 * Nothing on this screen is locked, badged, or greyed out by tier. A free user
 * and a member see exactly the same list, and the simulation card looks the
 * same to both. The boundary is only met by walking into it — see Paywall.
 */
export function HomeScreen({
  progress,
  examDate,
  usage,
  signedIn,
  onPractice,
  onSimulation,
  onAccount,
}: Props) {
  const days = daysUntil(examDate);
  const isMember = usage?.member === true;
  const remaining =
    usage && !isMember && usage.limit != null
      ? Math.max(0, usage.limit - (usage.used ?? 0))
      : null;

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

      {/* Quiet, factual, and only for free accounts. Not a lock — just a count. */}
      {remaining !== null && (
        <Text style={styles.remaining}>
          {remaining > 0
            ? `נותרו ${remaining} שאלות בתרגול של היום`
            : 'סיימת את התרגול של היום'}
        </Text>
      )}

      <Pressable
        style={styles.primaryButton}
        onPress={() => onPractice(IMPLEMENTED_TYPES[0])}
      >
        <Text style={styles.primaryButtonText}>התרגול של היום</Text>
      </Pressable>

      <Text style={styles.sectionHeading}>סוגי שאלות</Text>
      <View style={styles.list}>
        {ALL_TYPES.map((t) => {
          const live = IMPLEMENTED_TYPES.includes(t);
          const done = progress[t] ?? 0;
          const met = done > 0;

          return (
            <Pressable
              key={t}
              disabled={!live}
              onPress={() => onPractice(t)}
              style={({ pressed }) => [
                styles.card,
                !live && styles.cardDisabled,
                pressed && live && styles.cardPressed,
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
                {!live ? 'בקרוב' : met ? `${done} נענו` : 'טרם תרגלת'}
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

  countdown: { alignItems: 'center', paddingVertical: spacing.xl },
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

  remaining: {
    ...type.caption,
    ...hebrew,
    textAlign: 'center',
    marginTop: -spacing.md,
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
  cardBlurb: { ...type.caption, ...hebrew },
  cardMeta: { ...type.caption, ...hebrew, color: colors.textSecondary },

  footnote: { ...type.caption, ...hebrew, textAlign: 'center', marginTop: spacing.sm },
});
