import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnswerOption } from '../components/AnswerOption';
import { colors, english, hebrew, radii, spacing, type } from '../theme';
import { TYPE_LABELS, type Question } from '../types';

interface Props {
  questions: Question[];
}

/**
 * The shared practice engine: question -> answers -> explanation.
 *
 * Every practice type in the app runs through this structure, so keep it
 * type-agnostic — a reading passage or a listening clip mounts above the
 * prompt, it doesn't get its own screen.
 */
export function PracticeScreen({ questions }: Props) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  const question = questions[index];
  const finished = index >= questions.length;

  // Shuffle per session so a repeat run isn't the same answer positions.
  const order = useMemo(
    () => question?.options.map((_, i) => i) ?? [],
    [question?.id],
  );

  if (finished) {
    return (
      <View style={styles.centered}>
        <Text style={styles.doneTitle}>סיימת את התרגול</Text>
        {/* Descriptive, not a grade — the app deliberately shows no score. */}
        <Text style={styles.doneBody}>
          ענית על {questions.length} שאלות, {correctCount} מהן נכונות.
        </Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            setIndex(0);
            setSelected(null);
            setAnswered(false);
            setCorrectCount(0);
          }}
        >
          <Text style={styles.primaryButtonText}>להתחיל מחדש</Text>
        </Pressable>
      </View>
    );
  }

  const isRight = selected === question.correctIndex;

  function check() {
    if (selected === null) return;
    setAnswered(true);
    if (selected === question.correctIndex) setCorrectCount((n) => n + 1);
  }

  function next() {
    setIndex((i) => i + 1);
    setSelected(null);
    setAnswered(false);
  }

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Text style={styles.typeLabel}>{TYPE_LABELS[question.type]}</Text>
          <Text style={styles.progress}>
            שאלה {index + 1} מתוך {questions.length}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.prompt}>{question.prompt}</Text>
        </View>

        <View style={styles.options}>
          {order.map((optionIndex) => (
            <AnswerOption
              key={optionIndex}
              text={question.options[optionIndex]}
              selected={selected === optionIndex}
              answered={answered}
              isCorrect={optionIndex === question.correctIndex}
              // Reversible: tapping the selected option clears it.
              onPress={() =>
                setSelected((current) =>
                  current === optionIndex ? null : optionIndex,
                )
              }
            />
          ))}
        </View>

        {answered && (
          <View style={styles.explanationCard}>
            <Text style={styles.verdict}>{isRight ? 'נכון' : 'לא נכון'}</Text>
            <Text style={styles.explanation}>{question.explanation}</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        {answered ? (
          <Pressable style={styles.primaryButton} onPress={next}>
            <Text style={styles.primaryButtonText}>
              {index === questions.length - 1 ? 'לסיום' : 'לשאלה הבאה'}
            </Text>
          </Pressable>
        ) : (
          <Pressable
            style={[styles.primaryButton, selected === null && styles.buttonDisabled]}
            onPress={check}
            disabled={selected === null}
          >
            <Text style={styles.primaryButtonText}>לבדיקה</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.page,
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  typeLabel: {
    ...type.heading,
    ...hebrew,
  },
  progress: {
    ...type.caption,
    ...hebrew,
  },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  prompt: {
    fontSize: 18,
    lineHeight: 28,
    color: colors.textPrimary,
    ...english,
  },

  options: {
    gap: spacing.md,
  },

  explanationCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  verdict: {
    ...type.label,
    color: colors.textPrimary,
    ...hebrew,
  },
  explanation: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textBody,
    ...english,
  },

  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.page,
  },
  primaryButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.button,
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '600',
    ...hebrew,
    textAlign: 'center',
  },

  doneTitle: {
    ...type.title,
    ...hebrew,
    textAlign: 'center',
  },
  doneBody: {
    ...type.body,
    ...hebrew,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});
