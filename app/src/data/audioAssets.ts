/**
 * Bundled listening audio, keyed by the `audioPath` filename pipeline.export_app
 * writes for gold-set items.
 *
 * Metro's require() needs a static string literal per asset, so this is a
 * fixed map rather than a dynamic path — fine while the catalog is this
 * small. Once listening content is served from Supabase instead of the
 * bundled fallback, `audioPath` there is expected to be a full CDN URL
 * instead, and AudioPlayer falls back to treating any path not in this map as
 * a URI directly — nothing about that path needs this map to change.
 *
 * These specific files are placeholder tones, not real speech — see
 * pipeline/generate_audio.py for why, and what replaces them.
 */
export const AUDIO_ASSETS: Record<string, number> = {
  'listening-1.wav': require('../../assets/audio/listening-1.wav'),
  'listening-2.wav': require('../../assets/audio/listening-2.wav'),
  'listening-3.wav': require('../../assets/audio/listening-3.wav'),
};
