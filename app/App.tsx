import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import bank from './src/data/questions.json';
import { HomeScreen } from './src/screens/HomeScreen';
import { PracticeScreen } from './src/screens/PracticeScreen';
import { SimulationScreen } from './src/screens/SimulationScreen';
import { colors } from './src/theme';
import type { QuestionBank, QuestionType } from './src/types';

/**
 * Content is bundled from the gold set for now. Once generation has run, swap
 * in the bank export:
 *
 *     python -m pipeline.export_app --from-db
 */
const BANK = bank as QuestionBank;

/**
 * TODO: the user picks this in settings — it's the home screen's anchor, so it
 * can't stay a constant. Defaulting ~90 days out until that screen exists.
 */
const EXAM_DATE = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

type Screen =
  | { name: 'home' }
  | { name: 'practice'; type: QuestionType }
  | { name: 'simulation' };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });

  /**
   * Questions answered per type — what drives "types you haven't met yet".
   *
   * TODO: this lives in memory, so it resets when the app restarts. The home
   * screen's central claim is about what you have and haven't met, which means
   * it needs real persistence (AsyncStorage, then the attempts table) before
   * it tells the truth across sessions.
   */
  const [progress, setProgress] = useState<Record<string, number>>({});

  const goHome = () => setScreen({ name: 'home' });

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="dark" />

        {screen.name === 'home' && (
          <HomeScreen
            bank={BANK}
            progress={progress}
            examDate={EXAM_DATE}
            onPractice={(type) => setScreen({ name: 'practice', type })}
            onSimulation={() => setScreen({ name: 'simulation' })}
          />
        )}

        {screen.name === 'practice' && (
          <PracticeScreen
            questions={BANK.questions.filter((q) => q.type === screen.type)}
            passages={BANK.passages}
            onExit={goHome}
            onAnswered={(question) =>
              setProgress((p) => ({
                ...p,
                [question.type]: (p[question.type] ?? 0) + 1,
              }))
            }
          />
        )}

        {screen.name === 'simulation' && (
          <SimulationScreen bank={BANK} onExit={goHome} />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.page,
  },
});
