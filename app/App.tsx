import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import bundledBank from './src/data/questions.json';
import { AuthProvider, useAuth } from './src/lib/auth';
import { fetchBank, recordAttempt } from './src/lib/bank';
import { isConfigured } from './src/lib/supabase';
import { HomeScreen } from './src/screens/HomeScreen';
import { PracticeScreen } from './src/screens/PracticeScreen';
import { SignInScreen } from './src/screens/SignInScreen';
import { SimulationScreen } from './src/screens/SimulationScreen';
import { colors, hebrew, radii, spacing, type } from './src/theme';
import type { QuestionBank, QuestionType } from './src/types';

/**
 * Fallback content, used only when Supabase isn't configured yet, so the app
 * still runs during development. Once EXPO_PUBLIC_SUPABASE_URL is set this is
 * never read — content comes from the API, gated by row-level security.
 */
const BUNDLED = bundledBank as QuestionBank;

const DEFAULT_EXAM_DAYS = 90;

type Screen =
  | { name: 'signin' }
  | { name: 'home' }
  | { name: 'practice'; type: QuestionType }
  | { name: 'simulation' };

function AppContent() {
  const { session, profile, loading: authLoading, isMember, signOut } = useAuth();

  const [screen, setScreen] = useState<Screen>(
    isConfigured ? { name: 'signin' } : { name: 'home' },
  );
  const [bank, setBank] = useState<QuestionBank | null>(
    isConfigured ? null : BUNDLED,
  );
  const [bankError, setBankError] = useState<string | null>(null);

  /**
   * Questions answered per type, for the home screen's coverage list.
   *
   * Still in memory. Signed-in users' attempts do reach the `attempts` table,
   * so the durable record exists — but this counter isn't read back from it
   * yet, so the list still resets on relaunch.
   */
  const [progress, setProgress] = useState<Record<string, number>>({});

  // Reload content whenever the viewer changes: signing in as a member must
  // bring the rest of the bank into view without a restart.
  useEffect(() => {
    if (!isConfigured) return;
    let cancelled = false;
    setBank(null);
    setBankError(null);
    fetchBank()
      .then((b) => !cancelled && setBank(b))
      .catch((e) => !cancelled && setBankError(e.message ?? 'שגיאה בטעינת התוכן'));
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, isMember]);

  const examDate = profile?.examDate
    ? new Date(profile.examDate)
    : new Date(Date.now() + DEFAULT_EXAM_DAYS * 24 * 60 * 60 * 1000);

  if (isConfigured && authLoading) {
    return <Centered><ActivityIndicator color={colors.brand} /></Centered>;
  }

  if (screen.name === 'signin') {
    return <SignInScreen onSkip={() => setScreen({ name: 'home' })} />;
  }

  if (bankError) {
    return (
      <Centered>
        <Text style={styles.errorTitle}>לא הצלחנו לטעון את התוכן</Text>
        <Text style={styles.errorBody}>{bankError}</Text>
        <Pressable
          style={styles.primaryButton}
          onPress={() => {
            setBankError(null);
            fetchBank().then(setBank).catch((e) => setBankError(e.message));
          }}
        >
          <Text style={styles.primaryButtonText}>לנסות שוב</Text>
        </Pressable>
      </Centered>
    );
  }

  if (!bank) {
    return <Centered><ActivityIndicator color={colors.brand} /></Centered>;
  }

  const goHome = () => setScreen({ name: 'home' });

  return (
    <>
      {screen.name === 'home' && (
        <HomeScreen
          bank={bank}
          progress={progress}
          examDate={examDate}
          isMember={isMember}
          signedIn={Boolean(session)}
          onPractice={(t) => setScreen({ name: 'practice', type: t })}
          onSimulation={() => setScreen({ name: 'simulation' })}
          onAccount={() =>
            session ? signOut() : setScreen({ name: 'signin' })
          }
        />
      )}

      {screen.name === 'practice' && (
        <PracticeScreen
          questions={bank.questions.filter((q) => q.type === screen.type)}
          passages={bank.passages}
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
        <SimulationScreen bank={bank} onExit={goHome} />
      )}
    </>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
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
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorTitle: { ...type.heading, ...hebrew, textAlign: 'center' },
  errorBody: { ...type.caption, ...hebrew, textAlign: 'center' },
  primaryButton: {
    backgroundColor: colors.brand,
    borderRadius: radii.button,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '600',
    ...hebrew,
  },
});
