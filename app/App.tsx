import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import questions from './src/data/questions.json';
import { PracticeScreen } from './src/screens/PracticeScreen';
import { colors } from './src/theme';
import type { Question } from './src/types';

/**
 * Content is bundled from the gold set for now. Once generation has run, swap
 * the import for the bank export:
 *
 *     python -m pipeline.export_app --from-db
 */
const QUESTIONS = questions as Question[];

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <PracticeScreen questions={QUESTIONS} />
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
