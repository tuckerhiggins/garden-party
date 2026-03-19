// Supabase email+password auth.
// Two accounts live in Supabase: tucker@gardenparty.app and emma@gardenparty.app
// Create them once in Supabase dashboard → Authentication → Users → Add user
// (disable "Send invite email" so no confirmation email is needed)
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

const EMAILS = {
  tucker: 'tucker@gardenparty.app',
  emma:   'emma@gardenparty.app',
};

function roleFromUser(user) {
  if (!user) return 'guest';
  if (user.email === EMAILS.tucker) return 'tucker';
  if (user.email === EMAILS.emma)   return 'emma';
  return 'guest';
}

export function useAuth() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
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
  const role = roleFromUser(user);

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
