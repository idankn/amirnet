import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
  /** Called when the user flags a question as broken, with the reason they picked. */
  onReport: (question: Question, reason: string) => void;
}

/**
 * Fixed reasons rather than free text — this only has to get a question in
 * front of a human reviewer, not collect a written report. See CLAUDE.md §5
 * stage 6: low success rate plus reports is what flags a question as broken
 * rather than merely hard.
 */
const REPORT_REASONS = [
  'התשובה המסומנת שגויה',
  'יש יותר מתשובה נכונה אחת',
  'ההסבר לא ברור',
  'משהו אחר',
];

/**
 * The shared practice engine: question -> answers -> explanation.
 *
 * Every practice type runs through this. A reading or listening passage mounts
 * ABOVE the prompt rather than getting its own screen — that's the whole point
 * of one shared structure.
 */
export function PracticeScreen({
  questions,
  passages,
  onExit,
  onAnswered,
  onReport,
}: Props) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [reportOpen, setReportOpen] = useState(false);
  // Kept for the whole session rather than per-question, so "thanks, reported"
  // stays visible even though nothing else here tracks history across questions.
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
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

  function submitReport(reason: string) {
    onReport(question, reason);
    setReportedIds((ids) => new Set(ids).add(question.id));
    setReportOpen(false);
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

        {answered &&
          (reportedIds.has(question.id) ? (
            <Text style={styles.reportedText}>תודה, נבדוק את השאלה הזו.</Text>
          ) : (
            <Pressable onPress={() => setReportOpen(true)} hitSlop={8}>
              <Text style={styles.reportLink}>יש בעיה בשאלה הזו?</Text>
            </Pressable>
          ))}
      </ScrollView>

      <Modal
        visible={reportOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setReportOpen(false)}
      >
        <Pressable
          style={styles.reportBackdrop}
          onPress={() => setReportOpen(false)}
        >
          <Pressable style={styles.reportCard} onPress={() => {}}>
            <Text style={styles.reportTitle}>מה הבעיה?</Text>
            {REPORT_REASONS.map((reason) => (
              <Pressable
                key={reason}
                style={styles.reportOption}
                onPress={() => submitReport(reason)}
              >
                <Text style={styles.reportOptionText}>{reason}</Text>
              </Pressable>
            ))}
            <Pressable
              style={styles.reportCancel}
              onPress={() => setReportOpen(false)}
            >
              <Text style={styles.reportCancelText}>ביטול</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

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

  reportLink: {
    ...type.caption,
    ...hebrew,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  reportedText: {
    ...type.caption,
    ...hebrew,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  reportBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(46, 42, 61, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  reportCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radii.screen,
    padding: spacing.xl,
    gap: spacing.sm,
  },
  reportTitle: {
    ...type.heading,
    ...hebrew,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  reportOption: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  reportOptionText: { ...type.body, ...hebrew, color: colors.textPrimary },
  reportCancel: { paddingVertical: spacing.sm, alignItems: 'center' },
  reportCancelText: { ...type.label, ...hebrew, color: colors.textSecondary },

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
