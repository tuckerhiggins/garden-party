import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { ACTION_DEFS } from '../data/plants';

// ── localStorage fallbacks (identical to old App.js behavior) ─────────────
const LS = {
  care: 'gp_care_v4',
  expenses: 'gp_expenses_v4', positions: 'gp_pos_v4', growth: 'gp_growth_v4',
};
const lsLoad = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSave = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      console.warn('[useGardenData] localStorage quota exceeded — local save skipped for key:', k);
    }
    // Supabase is the real source of truth; local save failing is non-fatal
  }
};

// Normalize legacy 'custom' key → 'tend' on load
function normalizeLegacyKeys(log) {
  const result = {};
  for (const [plantId, entries] of Object.entries(log)) {
    result[plantId] = entries.map(e => e.action === 'custom' ? { ...e, action: 'tend' } : e);
  }
  return result;
}

// Actions where only one log per day is meaningful — keep the last entry per (plant, action, day)
const DEDUP_KEYS = new Set(['water','rain','fertilize','prune','neem','train','repot','worms']);

function dedupeLog(log) {
  const result = {};
  for (const [plantId, entries] of Object.entries(log)) {
    const seen = new Set(); // "action:YYYY-MM-DD"
    // Walk newest-first so we keep the last (most recent) entry
    const deduped = [...entries].reverse().filter(e => {
      if (!DEDUP_KEYS.has(e.action)) return true;
      const key = `${e.action}:${e.date?.slice(0, 10)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).reverse();
    result[plantId] = deduped;
  }
  return result;
}

export function useGardenData({ user }) {
  const [careLog, setCareLogState] = useState(() => dedupeLog(normalizeLegacyKeys(lsLoad(LS.care, {}))));
  const [expenses, setExpensesState] = useState(() => lsLoad(LS.expenses, []));
  const [positions, setPositionsState] = useState(() => lsLoad(LS.positions, {}));
  const [growth, setGrowthState] = useState(() => lsLoad(LS.growth, {}));
  const [dbLoading, setDbLoading] = useState(!!supabase);

  // Load from Supabase when user is available
  useEffect(() => {
    if (!supabase) return;

    async function loadFromSupabase() {
      const [
        { data: careRows },
        { data: stateRows },
        { data: expenseRows },
      ] = await Promise.all([
        supabase.from('care_log').select('*').order('created_at'),
        supabase.from('plant_state').select('*'),
        supabase.from('expenses').select('*').order('created_at'),
      ]);

      if (careRows?.length) {
        const log = {};
        careRows.forEach(row => {
          if (!log[row.plant_id]) log[row.plant_id] = [];
          log[row.plant_id].push({
            action: row.action, label: row.label, emoji: row.emoji,
            withEmma: row.with_emma,
            date: row.created_at, plantName: row.plant_name,
          });
        });
        // Merge: keep any local entries newer than the latest Supabase entry for
        // each plant — these were logged optimistically while the load was in flight
        setCareLogState(prev => {
          const merged = { ...log };
          Object.entries(prev).forEach(([plantId, localEntries]) => {
            const sbEntries = merged[plantId] || [];
            const latestSb = sbEntries.length
              ? Math.max(...sbEntries.map(e => new Date(e.date).getTime()))
              : 0;
            const pending = localEntries.filter(e => new Date(e.date).getTime() > latestSb + 5000);
            if (pending.length) merged[plantId] = [...sbEntries, ...pending];
          });
          const deduped = dedupeLog(normalizeLegacyKeys(merged));
          lsSave(LS.care, deduped);
          return deduped;
        });
      }

      if (stateRows) {
        const pos = {}, gr = {};
        stateRows.forEach(row => {
          if (row.pos_x != null) pos[row.plant_id] = { x: row.pos_x, y: row.pos_y };
          if (row.growth != null) gr[row.plant_id] = row.growth;
        });
        if (Object.keys(pos).length) { setPositionsState(pos); lsSave(LS.positions, pos); }
        if (Object.keys(gr).length) { setGrowthState(gr); lsSave(LS.growth, gr); }
      }

      if (expenseRows) {
        const exps = expenseRows.map(r => ({
          id: r.id, desc: r.description, cents: r.cents,
          plantId: r.plant_id, date: r.created_at,
        }));
        setExpensesState(exps);
        lsSave(LS.expenses, exps);
      }

      setDbLoading(false);
    }

    loadFromSupabase().catch(() => setDbLoading(false));
  }, [user?.id]);

  // Realtime: care log + plant state
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase.channel('garden-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'care_log' }, payload => {
        const row = payload.new;
        setCareLogState(prev => {
          const existing = prev[row.plant_id] || [];
          // Skip if we already have a matching entry from the optimistic update
          // (same action on same plant within 10s = the one we just logged locally)
          const rowTime = new Date(row.created_at).getTime();
          const isDupe = existing.some(e =>
            e.action === row.action &&
            Math.abs(new Date(e.date).getTime() - rowTime) < 10000
          );
          if (isDupe) return prev;
          const u = {
            ...prev,
            [row.plant_id]: [...existing, {
              action: row.action, label: row.label, emoji: row.emoji,
              withEmma: row.with_emma,
              date: row.created_at, plantName: row.plant_name,
            }],
          };
          lsSave(LS.care, u);
          return u;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plant_state' }, payload => {
        const row = payload.new;
        if (row.growth != null) {
          setGrowthState(prev => { const u = { ...prev, [row.plant_id]: row.growth }; lsSave(LS.growth, u); return u; });
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // ── WRITE OPERATIONS ──────────────────────────────────────────────────────
  const logAction = useCallback(async (key, plant, withEmma, customLabel, customDate = null) => {
    const def = ACTION_DEFS[key];
    if (!def && key !== 'tend') return;
    const label = customLabel || def?.label || key;
    const emoji = def?.emoji || '✨';
    const entryDate = customDate || new Date().toISOString();

    // Silent guard: skip if identical entry (same plant + action + calendar day) already exists
    // Only applies when logging to today (not a past date)
    if (DEDUP_KEYS.has(key) && !customDate) {
      const todayStr = new Date().toISOString().slice(0, 10);
      const currentLog = lsLoad(LS.care, {});
      const alreadyLogged = (currentLog[plant.id] || []).some(
        e => e.action === key && e.date?.slice(0, 10) === todayStr
      );
      if (alreadyLogged) return 'duplicate';
    }

    const entry = {
      action: key, label, emoji,
      date: entryDate, withEmma, plantName: plant.name,
    };

    // Optimistic local update — visible immediately regardless of Supabase status
    setCareLogState(prev => {
      const u = { ...prev, [plant.id]: [...(prev[plant.id] || []), entry] };
      lsSave(LS.care, u); return u;
    });

    if (supabase && !user) return 'local only — not signed in';
    if (supabase && user) {
      const { error } = await supabase.from('care_log').insert({
        plant_id: plant.id, action: key, label, emoji,
        with_emma: withEmma, plant_name: plant.name, logged_by: user.id,
        ...(customDate ? { created_at: customDate } : {}),
      });
      if (error) return error.message;
    }
    return null;
  }, [user]);

  const deleteAction = useCallback(async (plantId, entryDate) => {
    setCareLogState(prev => {
      const u = { ...prev, [plantId]: (prev[plantId] || []).filter(e => e.date !== entryDate) };
      lsSave(LS.care, u);
      return u;
    });
    if (supabase && user) {
      await supabase.from('care_log').delete().eq('plant_id', plantId).eq('created_at', entryDate)
        .then(({ error }) => { if (error) console.warn('[useGardenData] deleteAction sync failed:', error.message); })
        .catch(e => console.warn('[useGardenData] deleteAction threw:', e));
    }
  }, [user]);

  const updateGrowth = useCallback(async (plantId, val) => {
    setGrowthState(prev => { const u = { ...prev, [plantId]: val }; lsSave(LS.growth, u); return u; });
    if (supabase && user) {
      await supabase.from('plant_state').upsert({ plant_id: plantId, growth: val })
        .then(({ error }) => { if (error) console.warn('[useGardenData] updateGrowth sync failed:', error.message); })
        .catch(e => console.warn('[useGardenData] updateGrowth threw:', e));
    }
  }, [user]);

  const movePosition = useCallback(async (plantId, pos) => {
    setPositionsState(prev => { const u = { ...prev, [plantId]: pos }; lsSave(LS.positions, u); return u; });
    if (supabase && user) {
      await supabase.from('plant_state').upsert({ plant_id: plantId, pos_x: pos.x, pos_y: pos.y })
        .then(({ error }) => { if (error) console.warn('[useGardenData] movePosition sync failed:', error.message); })
        .catch(e => console.warn('[useGardenData] movePosition threw:', e));
    }
  }, [user]);

  const addExpense = useCallback(async (desc, cents, plantId, group, category) => {
    const exp = { id: Date.now(), desc, cents, plantId: plantId || null, group: group || null, category: category || null, date: new Date().toISOString() };
    setExpensesState(prev => { const u = [...prev, exp]; lsSave(LS.expenses, u); return u; });
    if (supabase && user) {
      await supabase.from('expenses').insert({
        description: desc, cents, plant_id: plantId || null, logged_by: user.id,
      })
        .then(({ error }) => { if (error) console.warn('[useGardenData] addExpense sync failed:', error.message); })
        .catch(e => console.warn('[useGardenData] addExpense threw:', e));
    }
  }, [user]);

  return {
    careLog, expenses, positions, growth, dbLoading,
    logAction, deleteAction, updateGrowth, movePosition, addExpense,
  };
}
