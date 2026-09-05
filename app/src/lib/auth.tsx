import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { isConfigured, supabase } from './supabase';

export type Tier = 'free' | 'member';

export interface Profile {
  id: string;
  tier: Tier;
  examDate: string | null;
}

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** True for signed-out visitors too — the demo is open to everyone. */
  isMember: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  /**
   * Returns the error message, or null on success.
   *
   * `needsConfirmation` reflects the project's own setting: with email
   * confirmation on, Supabase creates no session and the user must click a
   * link; with it off, they are signed in immediately. The caller must branch
   * on this rather than assume — showing "check your email" to someone who is
   * already signed in strands them on a dead end.
   */
  signUp: (
    email: string,
    password: string,
  ) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  setExamDate: (date: Date) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Turns a Supabase error into something a user can act on.
 *
 * Supabase's messages are English and written for developers; this audience
 * reads Hebrew and does not care what a "credential" is.
 */
function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) {
    return 'האימייל או הסיסמה אינם נכונים';
  }
  if (m.includes('already registered') || m.includes('already been registered')) {
    return 'כתובת האימייל הזו כבר רשומה. אפשר להתחבר איתה';
  }
  if (m.includes('password') && m.includes('6')) {
    return 'הסיסמה צריכה להכיל לפחות 6 תווים';
  }
  if (m.includes('email') && m.includes('invalid')) {
    return 'כתובת האימייל אינה תקינה';
  }
  if (m.includes('rate limit')) {
    return 'נשלחו יותר מדי הודעות אימות. צריך להמתין כשעה ולנסות שוב';
  }
  if (m.includes('network') || m.includes('fetch')) {
    // Don't claim the user has no internet — a misconfigured or unreachable
    // server produces exactly the same failure, and telling someone to check
    // their wifi when the server URL is missing sends them hunting in the
    // wrong place entirely.
    return isConfigured
      ? 'לא הצלחנו להגיע לשרת. כדאי לבדוק את החיבור ולנסות שוב'
      : 'האפליקציה לא מוגדרת מול השרת (חסר EXPO_PUBLIC_SUPABASE_URL)';
  }
  return message;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // The profile carries the tier, which decides what content the API will
  // return. It is read-only here as far as tier is concerned — the database
  // refuses writes to that column.
  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    supabase
      .from('profiles')
      .select('id, tier, exam_date')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setProfile({ id: data.id, tier: data.tier, examDate: data.exam_date });
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const value = useMemo<AuthState>(
    () => ({
      session,
      profile,
      loading,
      isMember: profile?.tier === 'member',

      async signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        return error ? friendlyError(error.message) : null;
      },

      async signUp(email, password) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) {
          return { error: friendlyError(error.message), needsConfirmation: false };
        }
        // No session means the project requires email confirmation.
        return { error: null, needsConfirmation: data.session === null };
      },

      async signOut() {
        await supabase.auth.signOut();
      },

      async setExamDate(date) {
        if (!session?.user) return;
        const iso = date.toISOString().slice(0, 10);
        await supabase
          .from('profiles')
          .update({ exam_date: iso })
          .eq('id', session.user.id);
        setProfile((p) => (p ? { ...p, examDate: iso } : p));
      },
    }),
    [session, profile, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
