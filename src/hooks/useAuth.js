import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState('guest');
  const [loading, setLoading] = useState(!!supabase);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      setRole(u?.user_metadata?.role ?? 'guest');
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user ?? null;
      setUser(u);
      setRole(u?.user_metadata?.role ?? 'guest');
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email) => {
    if (!supabase) return;
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  return { user, role, loading, signIn, signOut };
}
