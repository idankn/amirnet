import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AnswerOption } from '../components/AnswerOption';
import { colors, english, hebrew, radii, spacing, type } from '../theme';
import { TYPE_LABELS, type Passage, type Question } from '../types';

interface Props {
  questions: Question[];
  passages: Passage[];
  onExit: () => void;
  /**
   * Called once per answered question, so the home screen can track coverage
   * and the attempt can be recorded. The chosen index is passed because it is
   * the whole point of the row — an attempt that stores the correct answer
   * rather than what the user picked tells you nothing about the question.
   */
  onAnswered: (question: Question, correct: boolean, chosenIndex: number) => void;
}

/**
 * The shared practice engine: question -> answers -> explanation.
 *
 * Every practice type runs through this. A reading or listening passage mounts
 * ABOVE the prompt rather than getting its own screen — that's the whole point
 * of one shared structure.
 */
export function PracticeScreen({ questions, passages, onExit, onAnswered }: Props) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  /**
   * A passage is ~200 words and carries five questions. Left expanded it
   * pushes the options below the fold on every one of them, so you end up
   * scrolling past the whole thing five times. Collapsing is per-passage, not
   * per-question — read it once, fold it, answer the rest.
   */
  const [passageCollapsed, setPassageCollapsed] = useState(false);

  const question = questions[index];
  const finished = index >= questions.length;

  const passage = useMemo(
    () =>
      question?.passageId
        ? passages.find((p) => p.id === question.passageId)
        : undefined,
    [question?.passageId, passages],
  );

  // A passage carries several questions. Only show it fresh at the top of its
  // run — but keep it on screen throughout, since the exam lets you re-read.
  const passageQuestionNumber = useMemo(() => {
    if (!question?.passageId) return 0;
    return (
      questions
        .slice(0, index + 1)
        .filter((q) => q.passageId === question.passageId).length
    );
  }, [question?.passageId, index, questions]);

  if (finished) {
    return (
      <View style={styles.centered}>
        <Text style={styles.doneTitle}>סיימת את התרגול</Text>
        {/* Descriptive, not a grade — the app deliberately shows no score. */}
        <Text style={styles.doneBody}>
          ענית על {questions.length} שאלות, {correctCount} מהן נכונות.
        </Text>
        <Pressable style={styles.primaryButton} onPress={onExit}>
          <Text style={styles.primaryButtonText}>חזרה למסך הראשי</Text>
        </Pressable>
      </View>
    );
  }

  const isRight = selected === question.correctIndex;

  function check() {
    if (selected === null) return;
    setAnswered(true);
    const right = selected === question.correctIndex;
    if (right) setCorrectCount((n) => n + 1);
    onAnswered(question, right, selected);
  }

  function next() {
    setIndex((i) => i + 1);
    setSelected(null);
    setAnswered(false);
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={onExit} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backText}>← יציאה</Text>
        </Pressable>
        <Text style={styles.progress}>
          שאלה {index + 1} מתוך {questions.length}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.typeLabel}>{TYPE_LABELS[question.type]}</Text>

        {passage && (
          <View style={styles.passageCard}>
            <Pressable
              style={styles.passageHeader}
              onPress={() => setPassageCollapsed((c) => !c)}
              hitSlop={8}
            >
              <Text style={styles.passageMeta}>
                קטע · שאלה {passageQuestionNumber} מתוך 5
              </Text>
              <Text style={styles.passageToggle}>
                {passageCollapsed ? 'להצגת הקטע' : 'לצמצום הקטע'}
              </Text>
            </Pressable>
            <Text
              style={styles.passageText}
              numberOfLines={passageCollapsed ? 2 : undefined}
            >
              {passage.body}
            </Text>
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
  screen: { flex: 1, backgroundColor: colors.page },
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

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  backButton: { paddingVertical: spacing.xs },
  backText: {
    ...type.label,
    ...hebrew,
    color: colors.brand,
  },
  progress: { ...type.caption, ...hebrew },

  typeLabel: { ...type.heading, ...hebrew },

  passageCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  passageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  passageMeta: { ...type.caption, ...hebrew },
  passageToggle: { ...type.caption, ...hebrew, color: colors.brand },
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
  prompt: {
    fontSize: 18,
    lineHeight: 28,
    color: colors.textPrimary,
    ...english,
  },

  options: { gap: spacing.md },

  explanationCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  verdict: { ...type.label, color: colors.textPrimary, ...hebrew },
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

  doneTitle: { ...type.title, ...hebrew, textAlign: 'center' },
  doneBody: {
    ...type.body,
    ...hebrew,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
});
