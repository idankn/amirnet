import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { AnswerOption } from '../components/AnswerOption';
import {
  OPENING_DIFFICULTY,
  assembleSection,
  examShortfalls,
  formatClock,
  nextDifficulty,
  type AssembledSection,
} from '../exam';
import { colors, english, hebrew, radii, spacing, type } from '../theme';
import {
  EXAM_SECTIONS,
  TYPE_LABELS,
  type Question,
  type QuestionBank,
} from '../types';

export interface SimulationAnswer {
  question: Question;
  /** null when the section closed before the user picked anything. */
  chosenIndex: number | null;
  correct: boolean;
}

interface Props {
  bank: QuestionBank;
  onExit: () => void;
  /** Called once, when the sitting ends, with every question in it. */
  onFinish?: (answers: SimulationAnswer[]) => void;
}

type Phase = 'brief' | 'running' | 'done';

/** Why the previous section closed — the brief for the next one says which. */
type EndReason = 'time' | 'submitted';

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
 *
 * Sections are assembled one at a time rather than all up front, because the
 * exam is adaptive between sections: each section's difficulty depends on how
 * the previous one was scored, which isn't known until it ends.
 */
export function SimulationScreen({ bank, onExit, onFinish }: Props) {
  const shortfalls = useMemo(() => examShortfalls(bank), [bank]);

  const [sections, setSections] = useState<AssembledSection[]>(() => [
    assembleSection(bank, EXAM_SECTIONS[0], new Set<string>(), OPENING_DIFFICULTY),
  ]);
  const [sectionIndex, setSectionIndex] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>('brief');
  const [endedBy, setEndedBy] = useState<EndReason | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [marked, setMarked] = useState<Record<string, boolean>>({});
  const [confirmExit, setConfirmExit] = useState(false);

  /**
   * The section's end as a wall-clock timestamp, NOT a countdown of ticks.
   *
   * This matters more than it looks: setInterval stops firing while the app is
   * backgrounded on iOS, so a tick-counted timer hands back every second the
   * user spent outside the app. Deriving the clock from Date.now() means
   * backgrounding costs exam time exactly as it would in the hall.
   */
  const [deadline, setDeadline] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(EXAM_SECTIONS[0].seconds);

  const section = sections[sectionIndex];
  const isLastSection = sectionIndex + 1 >= EXAM_SECTIONS.length;

  // Held in a ref so the ticker can close a section without being torn down and
  // rebuilt every time an answer changes.
  const endSectionRef = useRef<(reason: EndReason) => void>(() => {});

  endSectionRef.current = (reason: EndReason) => {
    if (phase !== 'running') return;

    const answered = section.questions.filter(
      (q) => answers[q.id] !== undefined,
    );
    const correct = answered.filter(
      (q) => answers[q.id] === q.correctIndex,
    ).length;

    setDeadline(null);

    if (isLastSection) {
      setPhase('done');
      return;
    }

    const spec = EXAM_SECTIONS[sectionIndex + 1];
    const used = new Set(sections.flatMap((s) => s.questions.map((q) => q.id)));
    const next = assembleSection(
      bank,
      spec,
      used,
      nextDifficulty(section.targetDifficulty, correct, answered.length),
    );

    setSections((prev) => [...prev, next]);
    setSectionIndex((i) => i + 1);
    setQuestionIndex(0);
    setSecondsLeft(spec.seconds);
    setEndedBy(reason);
    setPhase('brief');
  };

  useEffect(() => {
    if (phase !== 'running' || deadline === null) return;

    let stopped = false;
    const tick = () => {
      if (stopped) return;
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        // Close the ticker before ending, so a section can never be ended twice.
        stopped = true;
        clearInterval(id);
        endSectionRef.current('time');
      }
    };

    // A quarter-second beat keeps the clock honest without a visible stutter,
    // and re-reading it on foreground closes the gap where the interval was
    // suspended entirely.
    const id = setInterval(tick, 250);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });
    tick();

    return () => {
      stopped = true;
      clearInterval(id);
      sub.remove();
    };
  }, [phase, deadline]);

  const results = useMemo<SimulationAnswer[]>(
    () =>
      sections.flatMap((s) =>
        s.questions.map((q) => ({
          question: q,
          chosenIndex: answers[q.id] ?? null,
          correct: answers[q.id] === q.correctIndex,
        })),
      ),
    [sections, answers],
  );

  // Report the sitting once. Attempts are what turn difficulty_est into
  // difficulty_actual, so a sitting that records nothing is 23 questions of
  // calibration thrown away.
  const reported = useRef(false);
  useEffect(() => {
    if (phase !== 'done' || reported.current) return;
    reported.current = true;
    onFinish?.(results);
  }, [phase, results, onFinish]);

  function beginSection() {
    setEndedBy(null);
    setSecondsLeft(section.spec.seconds);
    setDeadline(Date.now() + section.spec.seconds * 1000);
    setPhase('running');
  }

  /* ------------------------------------------------------------------ done */

  if (phase === 'done') {
    const total = results.length;
    const answeredCount = results.filter((r) => r.chosenIndex !== null).length;
    const correctCount = results.filter((r) => r.correct).length;

    return (
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.doneScroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.doneTitle}>הסימולציה הסתיימה</Text>
        {/* Descriptive stats, deliberately not a predicted score. */}
        <Text style={styles.doneBody}>
          ענית על {answeredCount} מתוך {total} שאלות, {correctCount} מהן נכונות.
        </Text>

        <View style={styles.breakdown}>
          {sections.map((s, i) => {
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

        <Text style={styles.reviewHeading}>סקירת תשובות</Text>
        <Text style={styles.reviewIntro}>
          ההסבר הוא החלק שמלמד — עברו עליו גם בשאלות שעניתם נכון.
        </Text>

        {sections.map((s, i) => {
          const passage = s.questions[0]?.passageId
            ? bank.passages.find((p) => p.id === s.questions[0].passageId)
            : undefined;

          return (
            <View key={i} style={styles.reviewSection}>
              <Text style={styles.reviewSectionTitle}>
                פרק {i + 1} · {TYPE_LABELS[s.spec.type]}
              </Text>

              {passage && (
                <View style={styles.passageCard}>
                  <Text style={styles.passageText}>{passage.body}</Text>
                </View>
              )}

              {s.questions.map((q, qi) => {
                const chosen = answers[q.id];
                return (
                  <View key={q.id} style={styles.reviewCard}>
                    <View style={styles.reviewCardHead}>
                      <Text style={styles.reviewNumber}>שאלה {qi + 1}</Text>
                      <Text
                        style={[
                          styles.reviewVerdict,
                          chosen === q.correctIndex && styles.reviewVerdictGood,
                        ]}
                      >
                        {chosen === undefined
                          ? 'לא ענית'
                          : chosen === q.correctIndex
                            ? 'נכון'
                            : 'לא נכון'}
                      </Text>
                    </View>

                    <Text style={styles.prompt}>{q.prompt}</Text>

                    <View style={styles.options}>
                      {q.options.map((text, oi) => (
                        <AnswerOption
                          key={oi}
                          text={text}
                          selected={chosen === oi}
                          answered
                          isCorrect={oi === q.correctIndex}
                          onPress={() => {}}
                        />
                      ))}
                    </View>

                    {q.explanation.length > 0 && (
                      <View style={styles.explanation}>
                        <Text style={styles.explanationText}>
                          {q.explanation}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        <Pressable style={styles.primaryButton} onPress={onExit}>
          <Text style={styles.primaryButtonText}>חזרה למסך הראשי</Text>
        </Pressable>
      </ScrollView>
    );
  }

  /* -------------------------------------------------------- nothing to run */

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

  /* ----------------------------------------------------------------- brief */

  if (phase === 'brief') {
    const minutes = Math.round(section.spec.seconds / 60);

    return (
      <View style={styles.screen}>
        <ScrollView contentContainerStyle={styles.briefScroll}>
          {endedBy && (
            <View style={styles.noticeCard}>
              <Text style={styles.noticeText}>
                {endedBy === 'time'
                  ? 'הזמן בפרק הקודם נגמר.'
                  : 'הפרק הקודם נסגר.'}{' '}
                לא ניתן לחזור אליו.
              </Text>
            </View>
          )}

          <Text style={styles.briefStep}>
            פרק {sectionIndex + 1} מתוך {EXAM_SECTIONS.length}
          </Text>
          <Text style={styles.briefTitle}>{TYPE_LABELS[section.spec.type]}</Text>
          <Text style={styles.briefMeta}>
            {section.questions.length} שאלות · {minutes} דקות
          </Text>

          <View style={styles.rulesCard}>
            <Text style={styles.ruleLine}>
              • הזמן נמדד לפרק, לא לשאלה. זמן שלא נוצל אינו עובר לפרק הבא.
            </Text>
            <Text style={styles.ruleLine}>
              • בתוך הפרק אפשר לנוע בין השאלות, לשנות תשובה ולסמן שאלה לבדיקה
              חוזרת.
            </Text>
            <Text style={styles.ruleLine}>
              • אפשר לסיים מוקדם רק אחרי שכל השאלות בפרק נענו.
            </Text>
            <Text style={styles.ruleLine}>
              • אחרי סיום הפרק אי אפשר לחזור אליו.
            </Text>
          </View>

          {sectionIndex === 0 && shortfalls.length > 0 && (
            <View style={styles.warnCard}>
              <Text style={styles.warnText}>
                המאגר עדיין חסר תוכן לסימולציה מלאה, וחלק מהפרקים יהיו קצרים
                מהאורך האמיתי:
              </Text>
              {shortfalls.map((gap) => (
                <Text key={gap} style={styles.warnDetail}>
                  {gap}
                </Text>
              ))}
            </View>
          )}

          {section.shortfall && (
            <View style={styles.warnCard}>
              <Text style={styles.warnText}>
                בפרק הזה {section.shortfall.got} שאלות במקום{' '}
                {section.shortfall.wanted} — אין מספיק שאלות חדשות במאגר. הזמן
                נשאר כמו בבחינה.
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable style={styles.primaryButton} onPress={beginSection}>
            <Text style={styles.primaryButtonText}>
              {sectionIndex === 0 ? 'התחלת הסימולציה' : 'התחלת הפרק'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => (sectionIndex === 0 ? onExit() : setConfirmExit(true))}
            style={styles.quietButton}
          >
            <Text style={styles.quietButtonText}>יציאה</Text>
          </Pressable>
          <Text style={styles.footnote}>הטיימר מתחיל רק בלחיצה</Text>
        </View>

        {confirmExit && (
          <ExitConfirm
            onStay={() => setConfirmExit(false)}
            onLeave={onExit}
          />
        )}
      </View>
    );
  }

  /* --------------------------------------------------------------- running */

  const question = section.questions[questionIndex];
  const passage = question.passageId
    ? bank.passages.find((p) => p.id === question.passageId)
    : undefined;

  const allAnswered = section.questions.every(
    (q) => answers[q.id] !== undefined,
  );
  const lowTime = secondsLeft <= 30;
  const elapsed = 1 - secondsLeft / section.spec.seconds;

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable
          onPress={() => setConfirmExit(true)}
          hitSlop={12}
          style={styles.backButton}
        >
          <Text style={styles.backButtonText}>יציאה</Text>
        </Pressable>
        <Text style={styles.sectionLabel}>
          פרק {sectionIndex + 1} מתוך {EXAM_SECTIONS.length} ·{' '}
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
            { width: `${Math.min(100, Math.max(0, elapsed * 100))}%` },
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
              questionIndex === section.questions.length - 1 &&
                styles.navDisabled,
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
          onPress={() => endSectionRef.current('submitted')}
        >
          <Text style={styles.primaryButtonText}>
            {allAnswered
              ? isLastSection
                ? 'סיום הסימולציה'
                : 'לפרק הבא'
              : 'יש לענות על כל השאלות בפרק'}
          </Text>
        </Pressable>
        <Text style={styles.footnote}>זמן שלא נוצל אינו עובר לפרק הבא</Text>
      </View>

      {confirmExit && (
        <ExitConfirm onStay={() => setConfirmExit(false)} onLeave={onExit} />
      )}
    </View>
  );
}

/**
 * Leaving mid-sitting throws the whole thing away, so it asks first. The exam
 * has no pause and neither does this — there is nothing to come back to.
 */
function ExitConfirm({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <View style={styles.overlay}>
      <View style={styles.dialog}>
        <Text style={styles.dialogTitle}>לצאת מהסימולציה?</Text>
        <Text style={styles.dialogBody}>
          הסימולציה תיפסק וההתקדמות בה לא תישמר. אי אפשר להמשיך אותה אחר כך.
        </Text>
        <Pressable style={styles.primaryButton} onPress={onStay}>
          <Text style={styles.primaryButtonText}>חזרה לסימולציה</Text>
        </Pressable>
        <Pressable style={styles.quietButton} onPress={onLeave}>
          <Text style={styles.quietButtonText}>יציאה וביטול הסימולציה</Text>
        </Pressable>
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
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  backButton: { paddingVertical: spacing.xs },
  backButtonText: { ...type.label, ...hebrew, color: colors.textSecondary },
  sectionLabel: {
    ...type.label,
    ...hebrew,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'center',
  },
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
  prompt: {
    fontSize: 18,
    lineHeight: 28,
    color: colors.textPrimary,
    ...english,
  },

  options: { gap: spacing.md },

  markButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  markButtonOn: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
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
  quietButton: { paddingVertical: spacing.md, alignItems: 'center' },
  quietButtonText: { ...type.label, ...hebrew, color: colors.textSecondary },
  footnote: { ...type.caption, ...hebrew, textAlign: 'center' },

  /* brief */
  briefScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  briefStep: { ...type.label, ...hebrew, color: colors.accent },
  briefTitle: { ...type.title, ...hebrew },
  briefMeta: { ...type.body, ...hebrew },
  rulesCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  ruleLine: { ...type.caption, ...hebrew, color: colors.textBody },

  noticeCard: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.card,
    padding: spacing.lg,
  },
  noticeText: { ...type.caption, ...hebrew, color: colors.textPrimary },

  warnCard: {
    backgroundColor: colors.brandSoft,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  warnText: { ...type.caption, ...hebrew, color: colors.textPrimary },
  warnDetail: { ...type.caption, ...english, color: colors.textBody },

  /* done + review */
  doneScroll: { padding: spacing.xl, gap: spacing.md, paddingBottom: spacing.xxl },
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

  reviewHeading: { ...type.heading, ...hebrew, marginTop: spacing.lg },
  reviewIntro: { ...type.caption, ...hebrew, marginBottom: spacing.sm },
  reviewSection: { gap: spacing.md, marginBottom: spacing.xl },
  reviewSectionTitle: { ...type.label, ...hebrew, color: colors.accent },
  reviewCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  reviewCardHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewNumber: { ...type.caption, ...hebrew, color: colors.textSecondary },
  reviewVerdict: { ...type.caption, ...hebrew, color: colors.textSecondary },
  reviewVerdictGood: { color: colors.correct, fontWeight: '600' },
  explanation: {
    backgroundColor: colors.page,
    borderRadius: radii.icon,
    padding: spacing.md,
  },
  explanationText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textBody,
    ...english,
  },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(46, 42, 61, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dialog: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.md,
    maxWidth: 340,
    width: '100%',
  },
  dialogTitle: { ...type.heading, ...hebrew, textAlign: 'center' },
  dialogBody: { ...type.body, ...hebrew, textAlign: 'center' },
});
