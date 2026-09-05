import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, hebrew, radii, spacing, type } from '../theme';

export type PaywallReason = 'daily_limit' | 'members_only' | 'auth_required';

interface Props {
  reason: PaywallReason | null;
  /** Free questions per day, for the limit message. */
  dailyLimit?: number;
  onDismiss: () => void;
  /** Sign up / sign in. */
  onAuth: () => void;
  /** Start the purchase. Not wired yet — see the note below. */
  onUpgrade: () => void;
}

/**
 * The upgrade prompt.
 *
 * This is deliberately the ONLY place a free user meets the boundary. Nothing
 * in the app is greyed out, badged, or hidden — every question type looks
 * identical whatever your tier. You find the wall by walking into it, not by
 * seeing it from across the room.
 *
 * No price is shown yet, on purpose: monetisation is still open in CLAUDE.md
 * section 8 (a one-time ₪60–90 was suggested, never decided). Putting a number
 * here would quietly settle that decision.
 */
export function Paywall({
  reason,
  dailyLimit,
  onDismiss,
  onAuth,
  onUpgrade,
}: Props) {
  if (!reason) return null;

  const copy = {
    daily_limit: {
      title: 'הגעת למכסה של היום',
      body: dailyLimit
        ? `תרגלת ${dailyLimit} שאלות היום. המכסה מתאפסת מחר, או שאפשר לפתוח עכשיו את המאגר המלא בלי הגבלה.`
        : 'המכסה היומית נוצלה. היא מתאפסת מחר, או שאפשר לפתוח עכשיו את המאגר המלא בלי הגבלה.',
      cta: 'לפתיחת המאגר המלא',
      dismiss: 'אמשיך מחר',
    },
    members_only: {
      title: 'הסימולציה פתוחה למנויים',
      body: 'סימולציה מלאה בתנאי הבחינה: שישה פרקים, 23 שאלות, 39 דקות, וטיימר נפרד לכל פרק שלא מעביר זמן הלאה.',
      cta: 'לפתיחת המאגר המלא',
      dismiss: 'לא עכשיו',
    },
    auth_required: {
      title: 'צריך חשבון כדי להמשיך',
      body: 'חשבון שומר את ההתקדמות שלך ופותח את התרגול היומי. ההרשמה חינם.',
      cta: 'להרשמה',
      dismiss: 'לא עכשיו',
    },
  }[reason];

  const primaryAction = reason === 'auth_required' ? onAuth : onUpgrade;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        {/* Stop a tap inside the card from dismissing it. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.body}</Text>

          <Pressable style={styles.primaryButton} onPress={primaryAction}>
            <Text style={styles.primaryButtonText}>{copy.cta}</Text>
          </Pressable>

          <Pressable style={styles.dismissButton} onPress={onDismiss}>
            <Text style={styles.dismissText}>{copy.dismiss}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(46, 42, 61, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radii.screen,
    padding: spacing.xl,
    gap: spacing.md,
  },
  title: { ...type.heading, ...hebrew },
  body: { ...type.body, ...hebrew, marginBottom: spacing.sm },

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

  dismissButton: { paddingVertical: spacing.sm, alignItems: 'center' },
  dismissText: {
    ...type.label,
    ...hebrew,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
