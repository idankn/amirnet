import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnswerOption } from '../components/AnswerOption';
import { assembleExam, formatClock } from '../exam';
import { colors, english, hebrew, radii, spacing, type } from '../theme';
import { TYPE_LABELS, type QuestionBank } from '../types';

interface Props {
  bank: QuestionBank;
  onExit: () => void;
}

/**
 * A full timed sitting, following the real six-section structure.
 *
 * The rules below are the exam's, not ours, and they are the point of the
 * screen — they change how people manage exam-day time:
 *
 *  - The timer is PER SECTION. Unused time does not carry to the next one.
 *  - Inside a section you may move freely, mark a question for review, and
 *    change answers.
 *  - You may leave a section early only when every question has an answer.
 *  - You can never return to a section once it ends.
 *  - When the clock runs out the section ends on its own.
 */
export function SimulationScreen({ bank, onExit }: Props) {
  const exam = useMemo(() => assembleExam(bank), [bank]);

  const [sectionIndex, setSectionIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [finished, setFinished] = useState(false);

  const section = exam.sections[sectionIndex];
  const [secondsLeft, setSecondsLeft] = useState(section?.spec.seconds ?? 0);

  // Kept in a ref so the interval can end the section without being torn down
  // and rebuilt on every tick.
  const endSectionRef = useRef<() => void>(() => {});

  endSectionRef.current = () => {
    if (sectionIndex + 1 >= exam.sections.length) {
      setFinished(true);
      return;
    }
    const next = sectionIndex + 1;
    setSectionIndex(next);
    setQuestionIndex(0);
    setSecondsLeft(exam.sections[next].spec.seconds);
  };

  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          // Out of time — the section ends whether or not it's complete.
          endSectionRef.current();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [finished, sectionIndex]);

  if (finished) {
    const answered = Object.keys(answers).length;
    const correct = exam.sections
      .flatMap((s) => s.questions)
      .filter((q) => answers[q.id] === q.correctIndex).length;
    const total = exam.sections.reduce((n, s) => n + s.questions.length, 0);

    return (
      <ScrollView contentContainerStyle={styles.centered}>
        <Text style={styles.doneTitle}>הסימולציה הסתיימה</Text>
        {/* Descriptive stats, deliberately not a predicted score. */}
        <Text style={styles.doneBody}>
          ענית על {answered} מתוך {total} שאלות, {correct} מהן נכונות.
        </Text>

        <View style={styles.breakdown}>
          {exam.sections.map((s, i) => {
            const sectionCorrect = s.questions.filter(
              (q) => answers[q.id] === q.correctIndex,
            ).length;
            return (
              <View key={i} style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>
                  {i + 1}. {TYPE_LABELS[s.spec.type]}
                </Text>
                <Text style={styles.breakdownValue}>
                  {sectionCorrect}/{s.questions.length}
                </Text>
              </View>
            );
          })}
        </View>

        <Pressable style={styles.primaryButton} onPress={onExit}>
          <Text style={styles.primaryButtonText}>חזרה למסך הראשי</Text>
        </Pressable>
      </ScrollView>
    );
  }

  if (!section || section.questions.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.doneTitle}>אין מספיק שאלות</Text>
        <Text style={styles.doneBody}>
          המאגר עדיין לא מכיל מספיק שאלות לסימולציה מלאה.
        </Text>
        <Pressable style={styles.primaryButton} onPress={onExit}>
          <Text style={styles.primaryButtonText}>חזרה למסך הראשי</Text>
        </Pressable>
      </View>
    );
  }

  const question = section.questions[questionIndex];
  const passage = question.passageId
    ? bank.passages.find((p) => p.id === question.passageId)
    : undefined;

  const allAnswered = section.questions.every((q) => answers[q.id] !== undefined);
  const lowTime = secondsLeft <= 30;
  const elapsed = 1 - secondsLeft / section.spec.seconds;

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Text style={styles.sectionLabel}>
          פרק {sectionIndex + 1} מתוך {exam.sections.length} ·{' '}
          {TYPE_LABELS[section.spec.type]}
        </Text>
        <Text style={[styles.clock, lowTime && styles.clockLow]}>
          {formatClock(secondsLeft)}
        </Text>
      </View>

      {/* Violet timer bar — accent, never an action colour. */}
      <View style={styles.timerTrack}>
        <View
          style={[
            styles.timerFill,
            { width: `${Math.min(100, elapsed * 100)}%` },
            lowTime && styles.timerFillLow,
          ]}
        />
      </View>

      <View style={styles.pager}>
        {section.questions.map((q, i) => {
          const isCurrent = i === questionIndex;
          const isAnswered = answers[q.id] !== undefined;
          return (
            <Pressable
              key={q.id}
              onPress={() => setQuestionIndex(i)}
              style={[
                styles.pagerDot,
                isAnswered && styles.pagerDotAnswered,
                marked[q.id] && styles.pagerDotMarked,
                isCurrent && styles.pagerDotCurrent,
              ]}
            >
              <Text
                style={[
                  styles.pagerDotText,
                  (isAnswered || isCurrent) && styles.pagerDotTextOn,
                ]}
              >
                {i + 1}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {passage && (
          <View style={styles.passageCard}>
            <Text style={styles.passageText}>{passage.body}</Text>
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.prompt}>{question.prompt}</Text>
        </View>

        <View style={styles.options}>
          {question.options.map((text, optionIndex) => (
            <AnswerOption
              key={optionIndex}
              text={text}
              selected={answers[question.id] === optionIndex}
              // Nothing is revealed during a sitting — you find out at the end.
              answered={false}
              isCorrect={false}
              onPress={() =>
                setAnswers((prev) => {
                  const next = { ...prev };
                  if (next[question.id] === optionIndex) {
                    delete next[question.id];
                  } else {
                    next[question.id] = optionIndex;
                  }
                  return next;
                })
              }
            />
          ))}
        </View>

        <Pressable
          onPress={() =>
            setMarked((m) => ({ ...m, [question.id]: !m[question.id] }))
          }
          style={[styles.markButton, marked[question.id] && styles.markButtonOn]}
        >
          <Text
            style={[
              styles.markButtonText,
              marked[question.id] && styles.markButtonTextOn,
            ]}
          >
            {marked[question.id] ? '✓ סומנה לבדיקה חוזרת' : 'סמן לבדיקה חוזרת'}
          </Text>
        </Pressable>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.navRow}>
          <Pressable
            style={[styles.navButton, questionIndex === 0 && styles.navDisabled]}
            disabled={questionIndex === 0}
            onPress={() => setQuestionIndex((i) => i - 1)}
          >
            <Text style={styles.navButtonText}>הקודמת</Text>
          </Pressable>
          <Pressable
            style={[
              styles.navButton,
              questionIndex === section.questions.length - 1 && styles.navDisabled,
            ]}
            disabled={questionIndex === section.questions.length - 1}
            onPress={() => setQuestionIndex((i) => i + 1)}
          >
            <Text style={styles.navButtonText}>הבאה</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.primaryButton, !allAnswered && styles.buttonDisabled]}
          disabled={!allAnswered}
          onPress={() => endSectionRef.current()}
        >
          <Text style={styles.primaryButtonText}>
            {allAnswered
              ? sectionIndex + 1 >= exam.sections.length
                ? 'סיום הסימולציה'
                : 'לפרק הבא'
              : 'יש לענות על כל השאלות בפרק'}
          </Text>
        </Pressable>
        <Text style={styles.footnote}>
          זמן שלא נוצל אינו עובר לפרק הבא
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  scroll: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  centered: {
    flexGrow: 1,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  sectionLabel: { ...type.label, ...hebrew, color: colors.textPrimary },
  clock: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  clockLow: { color: colors.brand },

  timerTrack: {
    height: 4,
    backgroundColor: colors.accentSoft,
    marginHorizontal: spacing.lg,
    borderRadius: 2,
    overflow: 'hidden',
  },
  timerFill: { height: '100%', backgroundColor: colors.accent },
  timerFillLow: { backgroundColor: colors.brand },

  pager: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  pagerDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagerDotAnswered: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brandSoft,
  },
  pagerDotMarked: { borderColor: colors.accent, borderWidth: 2 },
  pagerDotCurrent: { backgroundColor: colors.brand, borderColor: colors.brand },
  pagerDotText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  pagerDotTextOn: { color: colors.textPrimary },

  passageCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  passageText: {
    fontSize: 16,
    lineHeight: 26,
    color: colors.textPrimary,
    ...english,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  prompt: { fontSize: 18, lineHeight: 28, color: colors.textPrimary, ...english },

  options: { gap: spacing.md },

  markButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  markButtonOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  markButtonText: { ...type.label, ...hebrew, textAlign: 'center' },
  markButtonTextOn: { color: colors.accent },

  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.page,
    gap: spacing.md,
  },
  navRow: { flexDirection: 'row', gap: spacing.md },
  navButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  navDisabled: { opacity: 0.4 },
  navButtonText: { ...type.label, ...hebrew, color: colors.textPrimary },

  primaryButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.button,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.4 },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '600',
    ...hebrew,
    textAlign: 'center',
  },
  footnote: { ...type.caption, ...hebrew, textAlign: 'center' },

  doneTitle: { ...type.title, ...hebrew, textAlign: 'center' },
  doneBody: { ...type.body, ...hebrew, textAlign: 'center' },

  breakdown: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    marginVertical: spacing.lg,
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between' },
  breakdownLabel: { ...type.caption, ...hebrew, color: colors.textPrimary },
  breakdownValue: {
    ...type.caption,
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
});
