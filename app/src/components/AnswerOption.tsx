import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, english, radii, spacing } from '../theme';

interface Props {
  text: string;
  selected: boolean;
  /** Once answered the options lock and the correct one is revealed. */
  answered: boolean;
  isCorrect: boolean;
  onPress: () => void;
}

/**
 * One answer choice.
 *
 * Behaves like a radio button and selection is reversible — the real exam lets
 * you change your answer, so nothing here commits until the user confirms.
 *
 * The chosen option FILLS with berry rather than taking a coloured outline.
 * That was a deliberate call: an outline reads as a text field, a fill reads as
 * a choice you've made.
 */
export function AnswerOption({ text, selected, answered, isCorrect, onPress }: Props) {
  const revealCorrect = answered && isCorrect;
  const revealWrongPick = answered && selected && !isCorrect;
  const faded = answered && !selected && !isCorrect;

  return (
    <Pressable
      onPress={onPress}
      disabled={answered}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled: answered }}
      style={({ pressed }) => [
        styles.option,
        selected && !answered && styles.selected,
        revealCorrect && styles.correct,
        revealWrongPick && styles.wrongPick,
        faded && styles.faded,
        pressed && !answered && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.text,
          selected && !answered && styles.textSelected,
          revealCorrect && styles.textCorrect,
          faded && styles.textFaded,
        ]}
      >
        {text}
      </Text>

      {/* A mark, not just colour — colour alone fails for colourblind users. */}
      {revealCorrect && <Text style={styles.markCorrect}>✓</Text>}
      {revealWrongPick && <Text style={styles.markWrong}>✕</Text>}
      {!answered && <View style={[styles.radio, selected && styles.radioSelected]} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  selected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  pressed: {
    opacity: 0.85,
  },
  correct: {
    backgroundColor: colors.correctSoft,
    borderColor: colors.correct,
  },
  wrongPick: {
    backgroundColor: colors.surface,
    borderColor: colors.textSecondary,
  },
  faded: {
    opacity: 0.5,
  },

  text: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    color: colors.textPrimary,
    ...english,
  },
  textSelected: {
    color: colors.surface,
    fontWeight: '500',
  },
  textCorrect: {
    color: colors.correct,
    fontWeight: '500',
  },
  textFaded: {
    color: colors.textSecondary,
  },

  markCorrect: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.correct,
  },
  markWrong: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textSecondary,
  },

  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
  },
  radioSelected: {
    borderColor: colors.surface,
    backgroundColor: colors.surface,
  },
});
