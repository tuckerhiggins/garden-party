// PIN-based identity — verified server-side, stored in localStorage.
// PINs live in Vercel env vars (TUCKER_PIN, EMMA_PIN) — never in client code.
import { useState } from 'react';

const STORAGE_KEY = 'gp_identity';

export function useAuth() {
  const [role, setRoleState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'guest');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  const signIn = async (pin) => {
    setChecking(true);
    setError('');
    try {
      const res = await fetch('/api/verify-identity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Wrong PIN');
      localStorage.setItem(STORAGE_KEY, data.role);
      setRoleState(data.role);
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setChecking(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem(STORAGE_KEY);
    setRoleState('guest');
  };

  return {
    user: role !== 'guest' ? { id: role } : null,
    role,
    loading: false,
    needsPasswordSet: false,
    checking,
    authError: error,
    signIn,
    signOut,
    setRole: setRoleState,
    updatePassword: () => {},
  };
}
