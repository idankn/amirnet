import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AUDIO_ASSETS } from '../data/audioAssets';
import { colors, english, hebrew, radii, spacing, type } from '../theme';

// Lets playback happen with the iOS silent switch on — otherwise a listening
// question would just be silent for a chunk of users with no indication why.
void setAudioModeAsync({ playsInSilentMode: true });

interface Props {
  /** A key into AUDIO_ASSETS (bundled dev content), or a URI — Supabase-served
   * listening content carries a real path/URL here rather than a bundled key. */
  source: string;
}

function resolveSource(source: string): number | string {
  return AUDIO_ASSETS[source] ?? source;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Play/pause for one listening passage. No replay limit — MALO doesn't
 * publish one for AMIRNET's listening section, and inventing an exam rule
 * that isn't verified against nite.org.il would break this project's own
 * verified-facts discipline (see CLAUDE.md section 2).
 */
export function AudioPlayer({ source }: Props) {
  const player = useAudioPlayer(resolveSource(source));
  const status = useAudioPlayerStatus(player);

  function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    if (status.didJustFinish) player.seekTo(0);
    player.play();
  }

  return (
    <View style={styles.row}>
      <Pressable style={styles.button} onPress={toggle} hitSlop={8}>
        <Text style={styles.buttonGlyph}>{status.playing ? '⏸' : '▶'}</Text>
      </Pressable>
      <View style={styles.info}>
        <Text style={styles.label}>הקלטה</Text>
        <Text style={styles.time}>
          {formatTime(status.currentTime)} / {formatTime(status.duration)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  button: {
    width: 48,
    height: 48,
    borderRadius: radii.button,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGlyph: { color: colors.surface, fontSize: 18 },
  info: { gap: 2 },
  label: { ...type.label, ...hebrew },
  time: { ...type.caption, ...english },
});
