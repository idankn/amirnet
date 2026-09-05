import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

/**
 * The anon key is meant to be public — it ships in the app bundle and anyone
 * can read it out. It is not a secret and does not need protecting.
 *
 * What protects the question bank is row-level security in Postgres (see
 * supabase/migrations/0001_init.sql). Never move a content check into this
 * app: someone holding this key can call the API directly, so a client-side
 * filter is decoration, not protection.
 */
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'missing', {
  auth: {
    // Sessions live in AsyncStorage so a user stays signed in across launches.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL to read a session back from in a native app.
    detectSessionInUrl: false,
  },
});
