import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '../lib/auth';
import { colors, english, hebrew, radii, spacing, type } from '../theme';

interface Props {
  /** Continue without an account. */
  onSkip: () => void;
  /**
   * Which form to open on. The paywall's "להרשמה" must land on the sign-up
   * form — a CTA that promises registration and delivers a login box costs the
   * user an extra tap at exactly the moment they agreed to sign up.
   */
  initialMode?: 'signin' | 'signup';
}

export function SignInScreen({ onSkip, initialMode = 'signin' }: Props) {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentConfirmation, setSentConfirmation] = useState(false);

  const canSubmit = email.includes('@') && password.length >= 6 && !busy;

  async function submit() {
    setBusy(true);
    setError(null);

    if (mode === 'signin') {
      const message = await signIn(email, password);
      setBusy(false);
      if (message) setError(message);
      return;
    }

    const { error: message, needsConfirmation } = await signUp(email, password);
    setBusy(false);

    if (message) {
      setError(message);
      return;
    }
    // Only show the "check your inbox" screen when there is genuinely nothing
    // else to do. If the project has confirmation off, the user is already
    // signed in and the auth listener will move them on by itself.
    if (needsConfirmation) setSentConfirmation(true);
  }

  if (sentConfirmation) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>כמעט סיימנו</Text>
        <Text style={styles.body}>
          שלחנו הודעת אימות לכתובת שהזנת. צריך לאשר אותה כדי להיכנס.
        </Text>
        <Pressable style={styles.primaryButton} onPress={() => {
          setSentConfirmation(false);
          setMode('signin');
        }}>
          <Text style={styles.primaryButtonText}>חזרה להתחברות</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>
          {mode === 'signin' ? 'התחברות' : 'הרשמה'}
        </Text>
        <Text style={styles.body}>
          {mode === 'signin'
            ? 'כדי לשמור את ההתקדמות ולגשת למאגר המלא'
            : 'חשבון חדש שומר את ההתקדמות שלך בין מכשירים'}
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>אימייל</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>סיסמה</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            placeholder="לפחות 6 תווים"
            placeholderTextColor={colors.textSecondary}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={[styles.primaryButton, !canSubmit && styles.buttonDisabled]}
          disabled={!canSubmit}
          onPress={submit}
        >
          {busy ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {mode === 'signin' ? 'התחברות' : 'יצירת חשבון'}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => {
            setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
            setError(null);
          }}
          style={styles.linkButton}
        >
          <Text style={styles.linkText}>
            {mode === 'signin'
              ? 'אין לך חשבון? להרשמה'
              : 'כבר יש לך חשבון? להתחברות'}
          </Text>
        </Pressable>

        <View style={styles.divider} />

        <Pressable onPress={onSkip} style={styles.linkButton}>
          <Text style={styles.linkText}>להתנסות בלי חשבון</Text>
        </Pressable>
        <Text style={styles.caption}>
          ההתנסות פתוחה לכולם. בלי חשבון ההתקדמות לא נשמרת.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.page },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
    flexGrow: 1,
    justifyContent: 'center',
  },
  centered: {
    flex: 1,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },

  title: { ...type.title, ...hebrew },
  body: { ...type.body, ...hebrew, marginBottom: spacing.sm },

  field: { gap: spacing.xs },
  label: { ...type.label, ...hebrew },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.card,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    color: colors.textPrimary,
    // Email and password are LTR content inside an RTL screen.
    ...english,
  },

  error: {
    ...type.caption,
    ...hebrew,
    color: colors.brand,
  },

  primaryButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.button,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.4 },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '600',
    ...hebrew,
    textAlign: 'center',
  },

  linkButton: { paddingVertical: spacing.sm, alignItems: 'center' },
  linkText: {
    ...type.label,
    color: colors.brand,
    ...hebrew,
    textAlign: 'center',
  },

  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  caption: { ...type.caption, ...hebrew, textAlign: 'center' },
});
