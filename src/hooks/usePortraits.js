// usePortraits — portrait state synced to Supabase
// Initializes from localStorage for instant display, then merges Supabase data.
// updatePortrait writes to both localStorage and Supabase so all devices stay in sync.
//
// Stage data model per plant:
//   stages: string[]         — phenological vocabulary, AI-bootstrapped on first photo
//   currentStage: string     — current stage name (must match an entry in stages)
//   stageHistory: [{stage, date}]  — automatic log of stage transitions

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../supabase';

function sanitizeSvg(svg) {
  if (!svg) return null;
  const cleaned = svg
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<text[\s\S]*?<\/text>/gi, '')
    .replace(/\son\w+\s*=["'][^"']*["']/gi, '')
    .replace(/\son\w+\s*=[^\s>]*/gi, '');
  // Reject truncated SVGs — unclosed d=" attributes contain < before closing quote
  if (/\bd="[^"]*</.test(cleaned)) return null;
  if (!cleaned.trimEnd().endsWith('</svg>')) return null;
  return cleaned;
}

export function usePortraits({ user }) {
  const [portraits, setPortraits] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem('gp_portraits_v1') || '{}');
      // Sanitize SVGs on load — rejects truncated portraits cached before validation was added
      Object.keys(raw).forEach(id => {
        if (raw[id]?.svg) raw[id] = { ...raw[id], svg: sanitizeSvg(raw[id].svg) };
      });
      return raw;
    } catch { return {}; }
  });
  const setPortraitsRef = useRef(setPortraits);
  setPortraitsRef.current = setPortraits;

  function mergeSupabaseRows(data, prev) {
    const merged = { ...prev };
    data.forEach(row => {
      const existing = prev[row.plant_id] || {};
      const stagesData = row.stages_data || {};
      // Supabase always wins on load — it is the source of truth
      merged[row.plant_id] = {
        svg: sanitizeSvg(row.svg) || existing.svg || null,
        visualNote: row.visual_note || existing.visualNote || null,
        growth: row.growth ?? existing.growth ?? null,
        bloomState: row.bloom_state || existing.bloomState || null,
        foliageState: row.foliage_state || existing.foliageState || null,
        history: row.history || existing.history || [],
        stages: stagesData.stages || existing.stages || [],
        currentStage: stagesData.currentStage || existing.currentStage || null,
        stageHistory: stagesData.stageHistory || existing.stageHistory || [],
        analyzing: false,
        date: row.updated_at || existing.date,
      };
    });
    return merged;
  }

  // Load from Supabase whenever user changes (login/logout)
  useEffect(() => {
    if (!supabase) return;
    supabase.from('plant_portraits').select('*')
      .then(({ data, error }) => {
        const withSvg = data?.filter(r => r.svg).length ?? 0;
        const withNote = data?.filter(r => r.visual_note).length ?? 0;
        console.log('[portraits] initial load:', data?.length ?? 0, 'rows ok —', withSvg, 'have svg,', withNote, 'have visual_note');
        if (data?.length) console.log('[portraits] sample row keys:', Object.keys(data[0]));
        if (error || !data || data.length === 0) return;
        setPortraitsRef.current(prev => {
          const merged = mergeSupabaseRows(data, prev);
          try { localStorage.setItem('gp_portraits_v1', JSON.stringify(merged)); } catch {}
          return merged;
        });
      })
      .catch(() => {});
  }, [user]);

  // Re-fetch portraits when page becomes visible (handles cross-device sync
  // when realtime isn't enabled for plant_portraits table in Supabase)
  useEffect(() => {
    if (!supabase) return;
    function onVisible() {
      if (document.visibilityState !== 'visible') return;
      supabase.from('plant_portraits').select('*')
        .then(({ data, error }) => {
          if (error || !data || data.length === 0) return;
          setPortraitsRef.current(prev => {
            const merged = mergeSupabaseRows(data, prev);
            try { localStorage.setItem('gp_portraits_v1', JSON.stringify(merged)); } catch {}
            return merged;
          });
        })
        .catch(() => {});
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // Realtime: push portrait updates from the other device
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel('portrait-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plant_portraits' }, payload => {
        const row = payload.new;
        if (!row?.plant_id) return;
        setPortraits(prev => {
          const existing = prev[row.plant_id] || {};
          const sbDate = row.updated_at ? new Date(row.updated_at).getTime() : 0;
          const localDate = existing.date ? new Date(existing.date).getTime() : 0;
          if (sbDate <= localDate && existing.svg) return prev;
          const stagesData = row.stages_data || {};
          const merged = {
            ...prev,
            [row.plant_id]: {
              svg: sanitizeSvg(row.svg) || existing.svg || null,
              visualNote: row.visual_note || existing.visualNote || null,
              growth: row.growth ?? existing.growth ?? null,
              bloomState: row.bloom_state || existing.bloomState || null,
              foliageState: row.foliage_state || existing.foliageState || null,
              history: row.history || existing.history || [],
              stages: stagesData.stages || existing.stages || [],
              currentStage: stagesData.currentStage || existing.currentStage || null,
              stageHistory: stagesData.stageHistory || existing.stageHistory || [],
              analyzing: false,
              date: row.updated_at || existing.date,
            },
          };
          try { localStorage.setItem('gp_portraits_v1', JSON.stringify(merged)); } catch {}
          return merged;
        });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const updatePortrait = useCallback((id, data) => {
    setPortraits(prev => {
      const existing = prev[id] || {};

      // Build visual history (observation log + SVG snapshot for season montage)
      let history = existing.history || [];
      if (!data.analyzing && data.visualNote && data.date) {
        const newEntry = { visualNote: data.visualNote, growth: data.growth, date: data.date, svg: data.svg || existing.svg || null };
        history = [...history, newEntry];
      }

      // Build stage vocabulary — keep existing unless bootstrap provides new ones
      const stages = (data.stages && data.stages.length > 0) ? data.stages : (existing.stages || []);

      // Detect stage transitions and log them
      let stageHistory = existing.stageHistory || [];
      const incomingStage = data.currentStage || null;
      if (incomingStage && incomingStage !== existing.currentStage) {
        stageHistory = [...stageHistory, {
          stage: incomingStage,
          date: data.date || new Date().toISOString(),
        }].slice(-30);
      }

      if (data.svg) data = { ...data, svg: sanitizeSvg(data.svg) };

      const next = {
        ...prev,
        [id]: {
          ...existing,
          ...data,
          history,
          stages,
          currentStage: incomingStage ?? existing.currentStage ?? null,
          stageHistory,
        },
      };
      try { localStorage.setItem('gp_portraits_v1', JSON.stringify(next)); } catch {}

      // Sync to Supabase (skip mid-analysis states)
      if (supabase && !data.analyzing && (data.svg || data.visualNote)) {
        const entry = next[id];
        const basePayload = {
          plant_id: id,
          svg: entry.svg || null,
          visual_note: entry.visualNote || null,
          growth: entry.growth ?? null,
          bloom_state: entry.bloomState || null,
          foliage_state: entry.foliageState || null,
          history: entry.history || [],
          updated_at: new Date().toISOString(),
        };
        const withStages = {
          ...basePayload,
          stages_data: {
            stages: entry.stages || [],
            currentStage: entry.currentStage || null,
            stageHistory: entry.stageHistory || [],
          },
        };
        // Try with stages_data first; if column doesn't exist yet, fall back to base payload
        supabase.from('plant_portraits').upsert(withStages, { onConflict: 'plant_id' })
          .then(({ error }) => {
            if (error) {
              console.warn('[portraits] upsert w/stages failed:', error.message, error.code);
              supabase.from('plant_portraits').upsert(basePayload, { onConflict: 'plant_id' })
                .then(({ error: e2 }) => { if (e2) console.error('[portraits] base upsert also failed:', e2.message, e2.code); })
                .catch(e2 => console.error('[portraits] base upsert threw:', e2));
            } else {
              console.log('[portraits] upsert ok for', id);
            }
          })
          .catch(e => {
            console.error('[portraits] upsert threw:', e);
            supabase.from('plant_portraits').upsert(basePayload, { onConflict: 'plant_id' }).catch(() => {});
          });
      }

      return next;
    });
  }, []);

  return { portraits, updatePortrait };
}
