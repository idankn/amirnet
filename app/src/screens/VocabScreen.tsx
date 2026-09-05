import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, english, hebrew, radii, spacing, type } from '../theme';
import type { VocabEntry } from '../types';

interface Props {
  words: VocabEntry[];
  onExit: () => void;
  /** Words the user has marked as learned, by word. Persisted by the caller. */
  learned: Record<string, boolean>;
  onMark: (word: string, isLearned: boolean) => void;
}

type Mode = 'levels' | 'cards' | 'quiz';

const LEVELS = ['A2', 'B1', 'B2', 'C1'] as const;
const LEVEL_BLURBS: Record<string, string> = {
  A2: 'בסיסי · אמירנט 85–99',
  B1: 'מתקדמים א׳ · אמירנט 100–119',
  B2: 'מתקדמים ב׳ · אמירנט 120–133',
  C1: 'פטור · אמירנט 134+',
};

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Vocabulary.
 *
 * Two halves, in order: flashcards to meet a word, then a quiz over the words
 * you said you knew. The quiz only draws on words marked learned, because its
 * job is to catch the ones you *think* you know — testing you on words you
 * have never seen would just be the question engine with a different label.
 *
 * Definitions are in English with a short Hebrew gloss. The English carries the
 * meaning (the exam is in English); the Hebrew is there because a learner at
 * A2 can otherwise find the definition harder than the word.
 */
export function VocabScreen({ words, onExit, learned, onMark }: Props) {
  const [mode, setMode] = useState<Mode>('levels');
  const [level, setLevel] = useState<string>('B1');
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const pool = useMemo(
    () => words.filter((w) => w.cefr === level),
    [words, level],
  );

  // ---------------------------------------------------------------- levels
  if (mode === 'levels') {
    return (
      <View style={styles.screen}>
        <View style={styles.topBar}>
          <Pressable onPress={onExit} hitSlop={12}>
            <Text style={styles.backText}>← יציאה</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>אוצר מילים</Text>
          <Text style={styles.body}>
            בחר רמה. הרמות נקבעות לפי CEFR, אותו סולם שלפיו נקבעת רמת האנגלית
            שלך בבחינה.
          </Text>

          {LEVELS.map((lvl) => {
            const all = words.filter((w) => w.cefr === lvl);
            const done = all.filter((w) => learned[w.word]).length;
            return (
              <Pressable
                key={lvl}
                disabled={all.length === 0}
                style={({ pressed }) => [
                  styles.card,
                  all.length === 0 && styles.cardDisabled,
                  pressed && all.length > 0 && styles.cardPressed,
                ]}
                onPress={() => {
                  setLevel(lvl);
                  setIndex(0);
                  setFlipped(false);
                  setMode('cards');
                }}
              >
                <View style={styles.levelBadge}>
                  <Text style={styles.levelBadgeText}>{lvl}</Text>
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{LEVEL_BLURBS[lvl]}</Text>
                  <Text style={styles.cardBlurb}>
                    {all.length === 0
                      ? 'עדיין אין מילים ברמה הזו'
                      : `${done} מתוך ${all.length} מילים`}
                  </Text>
                </View>
              </Pressable>
            );
          })}

          <Text style={styles.footnote}>
            רמות אוצר המילים מבוססות על CEFR-J Wordlist v1.5 ועל Octanove
            Vocabulary Profile C1/C2.
          </Text>
        </ScrollView>
      </View>
    );
  }

  // ---------------------------------------------------------------- quiz
  if (mode === 'quiz') {
    const learnedHere = pool.filter((w) => learned[w.word]);
    return (
      <VocabQuiz
        words={learnedHere}
        distractorPool={pool}
        onExit={() => {
          setMode('levels');
          setIndex(0);
          setFlipped(false);
        }}
      />
    );
  }

  // ---------------------------------------------------------------- cards
  const word = pool[index];
  const finished = index >= pool.length;
  const learnedCount = pool.filter((w) => learned[w.word]).length;

  if (finished || !word) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>סיימת את הרמה</Text>
        <Text style={styles.body}>
          סימנת {learnedCount} מתוך {pool.length} מילים כידועות.
        </Text>
        {learnedCount > 0 && (
          <Pressable style={styles.primaryButton} onPress={() => setMode('quiz')}>
            <Text style={styles.primaryButtonText}>
              לתרגול על {learnedCount} המילים
            </Text>
          </Pressable>
        )}
        <Pressable style={styles.secondaryButton} onPress={() => setMode('levels')}>
          <Text style={styles.secondaryButtonText}>חזרה לרמות</Text>
        </Pressable>
      </View>
    );
  }

  const isLearned = Boolean(learned[word.word]);

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={() => setMode('levels')} hitSlop={12}>
          <Text style={styles.backText}>← לרמות</Text>
        </Pressable>
        <Text style={styles.progress}>
          {index + 1} מתוך {pool.length} · {level}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Pressable style={styles.flashcard} onPress={() => setFlipped((f) => !f)}>
          <Text style={styles.word}>{word.word}</Text>
          <Text style={styles.pos}>{word.pos}</Text>

          {flipped ? (
            <View style={styles.reveal}>
              <Text style={styles.definition}>{word.definition}</Text>
              {Boolean(word.translation) && (
                <Text style={styles.translation}>{word.translation}</Text>
              )}
              {Boolean(word.example) && (
                <Text style={styles.example}>{word.example}</Text>
              )}
            </View>
          ) : (
            <Text style={styles.tapHint}>להצגת המשמעות — לחיצה</Text>
          )}
        </Pressable>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.markButton, isLearned && styles.markButtonOn]}
          onPress={() => onMark(word.word, !isLearned)}
        >
          <Text style={[styles.markText, isLearned && styles.markTextOn]}>
            {isLearned ? '✓ סימנת שאתה יודע' : 'אני יודע את המילה'}
          </Text>
        </Pressable>

        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            setIndex((i) => i + 1);
            setFlipped(false);
          }}
        >
          <Text style={styles.primaryButtonText}>
            {index === pool.length - 1 ? 'לסיום' : 'למילה הבאה'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Quiz over words the user claimed to know.
 *
 * Distractors are other definitions from the same CEFR level, so the choice
 * turns on meaning rather than on one option obviously being harder English
 * than the rest.
 */
function VocabQuiz({
  words,
  distractorPool,
  onExit,
}: {
  words: VocabEntry[];
  distractorPool: VocabEntry[];
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const questions = useMemo(() => shuffle(words), [words]);
  const word = questions[index];

  const options = useMemo(() => {
    if (!word) return [];
    const others = shuffle(
      distractorPool.filter((w) => w.word !== word.word),
    ).slice(0, 3);
    return shuffle([word, ...others]);
  }, [word?.word, distractorPool]);

  if (!word) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>סיימת את התרגול</Text>
        <Text style={styles.body}>
          {correctCount} מתוך {questions.length} נכונות.
        </Text>
        <Pressable style={styles.primaryButton} onPress={onExit}>
          <Text style={styles.primaryButtonText}>חזרה לרמות</Text>
        </Pressable>
      </View>
    );
  }

  const answered = picked !== null;

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Pressable onPress={onExit} hitSlop={12}>
          <Text style={styles.backText}>← יציאה</Text>
        </Pressable>
        <Text style={styles.progress}>
          {index + 1} מתוך {questions.length}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.quizPrompt}>מה המשמעות של</Text>
        <Text style={styles.quizWord}>{word.word}</Text>

        <View style={styles.options}>
          {options.map((opt, i) => {
            const isRight = opt.word === word.word;
            const showRight = answered && isRight;
            const showWrongPick = answered && picked === i && !isRight;
            return (
              <Pressable
                key={opt.word}
                disabled={answered}
                onPress={() => {
                  setPicked(i);
                  if (isRight) setCorrectCount((n) => n + 1);
                }}
                style={[
                  styles.option,
                  showRight && styles.optionCorrect,
                  showWrongPick && styles.optionWrong,
                  answered && !showRight && !showWrongPick && styles.optionFaded,
                ]}
              >
                <Text
                  style={[styles.optionText, showRight && styles.optionTextCorrect]}
                >
                  {opt.definition}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {answered && (
        <View style={styles.footer}>
          <Pressable
            style={styles.primaryButton}
            onPress={() => {
              setIndex((i) => i + 1);
              setPicked(null);
            }}
          >
            <Text style={styles.primaryButtonText}>
              {index === questions.length - 1 ? 'לסיום' : 'לשאלה הבאה'}
            </Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  scroll: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl },
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
  backText: { ...type.label, ...hebrew, color: colors.brand },
  progress: { ...type.caption, ...hebrew },

  title: { ...type.title, ...hebrew, textAlign: 'center' },
  body: { ...type.body, ...hebrew, textAlign: 'center' },

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
  cardDisabled: { opacity: 0.5 },
  cardPressed: { opacity: 0.85 },
  cardBody: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, ...hebrew },
  cardBlurb: { ...type.caption, ...hebrew },

  levelBadge: {
    width: 44,
    height: 44,
    borderRadius: radii.icon,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelBadgeText: { fontSize: 15, fontWeight: '700', color: colors.brand },

  flashcard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  word: {
    fontSize: 34,
    lineHeight: 44,
    fontWeight: '600',
    color: colors.textPrimary,
    ...english,
    textAlign: 'center',
  },
  pos: { ...type.caption, ...english, textAlign: 'center' },
  tapHint: { ...type.caption, ...hebrew, marginTop: spacing.lg },

  reveal: { gap: spacing.md, marginTop: spacing.md, alignSelf: 'stretch' },
  definition: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
    ...english,
  },
  translation: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.accent,
    ...hebrew,
    fontWeight: '500',
  },
  example: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.textBody,
    ...english,
    fontStyle: 'italic',
  },

  quizPrompt: { ...type.label, ...hebrew, textAlign: 'center' },
  quizWord: {
    fontSize: 30,
    lineHeight: 40,
    fontWeight: '600',
    color: colors.textPrimary,
    ...english,
    textAlign: 'center',
    marginBottom: spacing.md,
  },

  options: { gap: spacing.md },
  option: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    padding: spacing.lg,
  },
  optionCorrect: {
    backgroundColor: colors.correctSoft,
    borderColor: colors.correct,
  },
  optionWrong: { borderColor: colors.textSecondary },
  optionFaded: { opacity: 0.5 },
  optionText: { fontSize: 15, lineHeight: 22, color: colors.textPrimary, ...english },
  optionTextCorrect: { color: colors.correct, fontWeight: '500' },

  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.page,
    gap: spacing.md,
  },
  markButton: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  markButtonOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  markText: { ...type.label, ...hebrew },
  markTextOn: { color: colors.accent },

  primaryButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.button,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '600',
    ...hebrew,
    textAlign: 'center',
  },
  secondaryButton: { paddingVertical: spacing.md, alignItems: 'center' },
  secondaryButtonText: { ...type.label, ...hebrew, color: colors.brand },

  footnote: {
    ...type.caption,
    ...hebrew,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
