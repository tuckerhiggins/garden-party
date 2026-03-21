// Supabase client — returns null if env vars not set (app falls back to localStorage)
import { createClient } from '@supabase/supabase-js';

const url = process.env.REACT_APP_SUPABASE_URL;
const key = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true },
}) : null;
