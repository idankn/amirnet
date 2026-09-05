import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import bundledBank from './src/data/questions.json';
import { Paywall, type PaywallReason } from './src/components/Paywall';
import { AuthProvider, useAuth } from './src/lib/auth';
import {
  AuthRequiredError,
  DailyLimitError,
  MembersOnlyError,
  fetchUsage,
  recordAttempt,
  requestPractice,
  requestSimulation,
  type Usage,
} from './src/lib/bank';
import { isConfigured } from './src/lib/supabase';
import { HomeScreen } from './src/screens/HomeScreen';
import { PracticeScreen } from './src/screens/PracticeScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { SimulationScreen } from './src/screens/SimulationScreen';
import { colors, hebrew, radii, spacing, type } from './src/theme';
import type { Passage, Question, QuestionBank, QuestionType } from './src/types';

/**
 * Fallback content, used only when Supabase isn't configured yet, so the app
 * still runs during development. With a server configured, questions are
 * served one request at a time and this is never read.
 */
const BUNDLED = bundledBank as QuestionBank;

const DEFAULT_EXAM_DAYS = 90;
const PRACTICE_BATCH = 10;

type Screen =
  | { name: 'signin'; mode?: 'signin' | 'signup' }
  | { name: 'home' }
  | { name: 'practice'; questions: Question[]; passages: Passage[] }
  | { name: 'simulation'; bank: QuestionBank };

function AppContent() {
  const { session, profile, loading: authLoading, signOut } = useAuth();

  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [usage, setUsage] = useState<Usage | null>(null);
  const [paywall, setPaywall] = useState<PaywallReason | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});

  const refreshUsage = useCallback(() => {
    if (!isConfigured) return;
    fetchUsage().then(setUsage).catch(() => setUsage(null));
  }, []);

  useEffect(refreshUsage, [refreshUsage, session?.user?.id, profile?.tier]);

  // Signing in or up is never the destination — leave the form as soon as a
  // session exists, however it arrived (fresh signup with confirmation off, a
  // restored session, or a confirmation link).
  useEffect(() => {
    if (session) {
      setScreen((s) => (s.name === 'signin' ? { name: 'home' } : s));
    }
  }, [session]);

  /** Map a thrown server error onto the right prompt. */
  function handle(e: unknown): void {
    if (e instanceof DailyLimitError) return setPaywall('daily_limit');
    if (e instanceof MembersOnlyError) return setPaywall('members_only');
    if (e instanceof AuthRequiredError) return setPaywall('auth_required');
    setError(e instanceof Error ? e.message : 'שגיאה לא צפויה');
  }

  async function startPractice(t: QuestionType) {
    // Dev fallback: no server, no limits.
    if (!isConfigured) {
      setScreen({
        name: 'practice',
        questions: BUNDLED.questions.filter((q) => q.type === t),
        passages: BUNDLED.passages,
      });
      return;
    }
    setBusy(true);
    try {
      const batch = await requestPractice(t, PRACTICE_BATCH);
      setUsage(batch.usage);
      setScreen({
        name: 'practice',
        questions: batch.questions,
        passages: batch.passages,
      });
    } catch (e) {
      handle(e);
    } finally {
      setBusy(false);
    }
  }

  async function startSimulation() {
    if (!isConfigured) {
      setScreen({ name: 'simulation', bank: BUNDLED });
      return;
    }
    setBusy(true);
    try {
      const bank = await requestSimulation();
      setScreen({ name: 'simulation', bank });
    } catch (e) {
      handle(e);
    } finally {
      setBusy(false);
    }
  }

  const examDate = profile?.examDate
    ? new Date(profile.examDate)
    : new Date(Date.now() + DEFAULT_EXAM_DAYS * 24 * 60 * 60 * 1000);

  if (isConfigured && authLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  if (screen.name === 'signin') {
    return (
      <SignInScreen
        initialMode={screen.mode}
        onSkip={() => setScreen({ name: 'home' })}
      />
    );
  }

  const goHome = () => {
    setScreen({ name: 'home' });
    refreshUsage();
  };

  return (
    <>
      {screen.name === 'home' && (
        <HomeScreen
          progress={progress}
          examDate={examDate}
          usage={usage}
          signedIn={Boolean(session)}
          onPractice={startPractice}
          onSimulation={startSimulation}
          onAccount={() =>
            session ? signOut() : setScreen({ name: 'signin' })
          }
        />
      )}

      {screen.name === 'practice' && (
        <PracticeScreen
          questions={screen.questions}
          passages={screen.passages}
          onExit={goHome}
          onAnswered={(question, correct) => {
            setProgress((p) => ({
              ...p,
              [question.type]: (p[question.type] ?? 0) + 1,
            }));
            if (session?.user) {
              void recordAttempt({
                userId: session.user.id,
                questionId: question.id,
                chosenIndex: question.correctIndex,
                isCorrect: correct,
              });
            }
          }}
        />
      )}

      {screen.name === 'simulation' && (
        <SimulationScreen bank={screen.bank} onExit={goHome} />
      )}

      {busy && (
        <View style={styles.overlay}>
          <ActivityIndicator color={colors.brand} size="large" />
        </View>
      )}

      <Paywall
        reason={paywall}
        dailyLimit={usage?.limit ?? undefined}
        onDismiss={() => setPaywall(null)}
        onAuth={() => {
          setPaywall(null);
          // The prompt's CTA says 'sign up', so open that form, not login.
          setScreen({ name: 'signin', mode: 'signup' });
        }}
        onUpgrade={() => {
          setPaywall(null);
          // TODO: In-App Purchase. Apple requires IAP for digital content, so
          // this cannot be a web checkout or Stripe link inside the app. On a
          // successful purchase, a server-side receipt check sets
          // profiles.tier — which the app deliberately cannot write.
          setError('הרכישה עוד לא זמינה. נוסיף אותה בקרוב.');
        }}
      />

      {error && (
        <View style={styles.overlay}>
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.errorButton} onPress={() => setError(null)}>
              <Text style={styles.errorButtonText}>סגירה</Text>
            </Pressable>
          </View>
        </View>
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <SafeAreaProvider>
        <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
          <StatusBar style="dark" />
          <AppContent />
        </SafeAreaView>
      </SafeAreaProvider>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.page },
  centered: {
    flex: 1,
    backgroundColor: colors.page,
    alignItems: 'center',
    justifyContent: 'center',
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
  errorCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.xl,
    gap: spacing.md,
    maxWidth: 340,
    width: '100%',
  },
  errorText: { ...type.body, ...hebrew, textAlign: 'center' },
  errorButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.button,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  errorButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
    ...hebrew,
  },
});
