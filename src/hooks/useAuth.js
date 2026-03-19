import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('guest');
  const [loading, setLoading] = useState(!!supabase);
  const [needsPasswordSet, setNeedsPasswordSet] = useState(false);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    // ── 1. Check URL hash for Supabase implicit-flow tokens ──────────────
    // Recovery links arrive as: #access_token=...&type=recovery
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.slice(1)); // strip leading #
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');

      if (accessToken) {
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken || '' })
          .then(({ data: { session } }) => {
            if (session) {
              setUser(session.user);
              setRole(session.user?.user_metadata?.role ?? 'guest');
              if (type === 'recovery') setNeedsPasswordSet(true);
              // Clean URL — remove the tokens from the address bar
              window.history.replaceState({}, document.title, window.location.pathname);
            }
          })
          .catch(() => {});
      }
    }

    // ── 2. Load existing session ──────────────────────────────────────────
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      setRole(u?.user_metadata?.role ?? 'guest');
      setLoading(false);
    });

    // ── 3. Listen for future auth changes ────────────────────────────────
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setRole(u?.user_metadata?.role ?? 'guest');
      if (event === 'PASSWORD_RECOVERY') setNeedsPasswordSet(true);
      if (event === 'SIGNED_IN') setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email, password) => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const updatePassword = async (newPassword) => {
    if (!supabase) return;
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    setNeedsPasswordSet(false);
  };

  return { user, role, loading, needsPasswordSet, signIn, signOut, updatePassword };
}
