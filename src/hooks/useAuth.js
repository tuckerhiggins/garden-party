// Supabase email+password auth.
// Two accounts live in Supabase: tucker@gardenparty.app and emma@gardenparty.app
// Create them once in Supabase dashboard → Authentication → Users → Add user
// (disable "Send invite email" so no confirmation email is needed)
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

const EMAILS = {
  tucker: 'tuckerhiggins5@gmail.com',
  emma:   'emma.newburger@gmail.com',
};

function roleFromUser(user) {
  if (!user) return 'guest';
  if (user.email === EMAILS.tucker) return 'tucker';
  if (user.email === EMAILS.emma)   return 'emma';
  return 'guest';
}

const LS_ROLE = 'gp_role';

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [authError, setAuthError] = useState('');

  // Optimistic role: read from localStorage so we never flash "guest" while session restores
  const [optimisticRole, setOptimisticRole] = useState(() => {
    try { return localStorage.getItem(LS_ROLE) || 'guest'; } catch { return 'guest'; }
  });

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
      const r = roleFromUser(session?.user || null);
      setOptimisticRole(r);
      try { localStorage.setItem(LS_ROLE, r); } catch {}
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      const r = roleFromUser(session?.user || null);
      setOptimisticRole(r);
      try { localStorage.setItem(LS_ROLE, r); } catch {}
    });

    return () => subscription.unsubscribe();
  }, []);

  // name: 'tucker' | 'emma'
  const signIn = async (name, password) => {
    if (!supabase) return;
    const email = EMAILS[name];
    if (!email) throw new Error('Unknown user');
    setChecking(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } catch (e) {
      setAuthError(e.message);
      throw e;
    } finally {
      setChecking(false);
    }
  };

  const signOut = async () => {
    if (supabase) await supabase.auth.signOut();
  };

  const user = session?.user || null;
  // While loading: use optimistic role from localStorage so UI doesn't flash "guest"
  // After load: use the confirmed role from session (clears optimistic if session gone)
  const role = loading ? optimisticRole : roleFromUser(user);

  return {
    user,
    role,
    loading,
    checking,
    authError,
    signIn,
    signOut,
    // Unused legacy stubs
    needsPasswordSet: false,
    updatePassword: () => {},
    setRole: () => {},
  };
}
