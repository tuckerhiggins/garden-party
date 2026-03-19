// usePortraits — portrait state synced to Supabase
// Initializes from localStorage for instant display, then merges Supabase data.
// updatePortrait writes to both localStorage and Supabase so all devices stay in sync.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';

export function usePortraits({ user }) {
  const [portraits, setPortraits] = useState(() => {
    try { return JSON.parse(localStorage.getItem('gp_portraits_v1') || '{}'); } catch { return {}; }
  });

  // Load from Supabase whenever user changes (login/logout)
  useEffect(() => {
    if (!supabase) return;
    supabase.from('plant_portraits').select('*')
      .then(({ data, error }) => {
        if (error || !data || data.length === 0) return;
        setPortraits(prev => {
          const merged = { ...prev };
          data.forEach(row => {
            const existing = prev[row.plant_id] || {};
            // Only overwrite if Supabase data is newer or local has no svg
            const sbDate = row.updated_at ? new Date(row.updated_at).getTime() : 0;
            const localDate = existing.date ? new Date(existing.date).getTime() : 0;
            if (sbDate >= localDate || !existing.svg) {
              merged[row.plant_id] = {
                svg: row.svg || existing.svg || null,
                visualNote: row.visual_note || existing.visualNote || null,
                growth: row.growth ?? existing.growth ?? null,
                bloomState: row.bloom_state || existing.bloomState || null,
                foliageState: row.foliage_state || existing.foliageState || null,
                history: row.history || existing.history || [],
                analyzing: false,
                date: row.updated_at || existing.date,
              };
            }
          });
          try { localStorage.setItem('gp_portraits_v1', JSON.stringify(merged)); } catch {}
          return merged;
        });
      })
      .catch(() => {});
  }, [user]);

  const updatePortrait = useCallback((id, data) => {
    setPortraits(prev => {
      const existing = prev[id] || {};
      let history = existing.history || [];
      if (!data.analyzing && data.visualNote && data.date) {
        const newEntry = { visualNote: data.visualNote, growth: data.growth, date: data.date };
        history = [...history, newEntry].slice(-10);
      }
      const next = { ...prev, [id]: { ...existing, ...data, history } };
      try { localStorage.setItem('gp_portraits_v1', JSON.stringify(next)); } catch {}

      // Sync completed analyses to Supabase (skip mid-analysis "analyzing: true" states)
      if (supabase && !data.analyzing && (data.svg || data.visualNote)) {
        const entry = next[id];
        supabase.from('plant_portraits').upsert({
          plant_id: id,
          svg: entry.svg || null,
          visual_note: entry.visualNote || null,
          growth: entry.growth ?? null,
          bloom_state: entry.bloomState || null,
          foliage_state: entry.foliageState || null,
          history: entry.history || [],
          updated_at: new Date().toISOString(),
        }).catch(() => {});
      }

      return next;
    });
  }, []);

  return { portraits, updatePortrait };
}
