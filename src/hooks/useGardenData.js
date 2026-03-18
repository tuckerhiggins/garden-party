import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../supabase';
import { ACTION_DEFS } from '../data/plants';

// ── localStorage fallbacks (identical to old App.js behavior) ─────────────
const LS = {
  care: 'gp_care_v4', warmth: 'gp_warmth_v4',
  expenses: 'gp_expenses_v4', positions: 'gp_pos_v4', growth: 'gp_growth_v4',
};
const lsLoad = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const lsSave = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export function useGardenData({ user }) {
  const [warmth, setWarmthState] = useState(() => lsLoad(LS.warmth, 0));
  const [careLog, setCareLogState] = useState(() => lsLoad(LS.care, {}));
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
        { data: gardenRow },
        { data: expenseRows },
      ] = await Promise.all([
        supabase.from('care_log').select('*').order('created_at'),
        supabase.from('plant_state').select('*'),
        supabase.from('garden_state').select('*').single(),
        supabase.from('expenses').select('*').order('created_at'),
      ]);

      if (careRows) {
        const log = {};
        careRows.forEach(row => {
          if (!log[row.plant_id]) log[row.plant_id] = [];
          log[row.plant_id].push({
            action: row.action, label: row.label, emoji: row.emoji,
            earned: row.earned, withEmma: row.with_emma,
            date: row.created_at, plantName: row.plant_name,
          });
        });
        setCareLogState(log);
      }

      if (stateRows) {
        const pos = {}, gr = {};
        stateRows.forEach(row => {
          if (row.pos_x != null) pos[row.plant_id] = { x: row.pos_x, y: row.pos_y };
          if (row.growth != null) gr[row.plant_id] = row.growth;
        });
        if (Object.keys(pos).length) setPositionsState(pos);
        if (Object.keys(gr).length) setGrowthState(gr);
      }

      if (gardenRow) setWarmthState(gardenRow.warmth);
      if (expenseRows) setExpensesState(expenseRows.map(r => ({
        id: r.id, desc: r.description, cents: r.cents,
        plantId: r.plant_id, date: r.created_at,
      })));

      setDbLoading(false);
    }

    loadFromSupabase().catch(() => setDbLoading(false));
  }, [user]);

  // Realtime: care log + warmth
  useEffect(() => {
    if (!supabase) return;

    const channel = supabase.channel('garden-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'care_log' }, payload => {
        const row = payload.new;
        setCareLogState(prev => ({
          ...prev,
          [row.plant_id]: [...(prev[row.plant_id] || []), {
            action: row.action, label: row.label, emoji: row.emoji,
            earned: row.earned, withEmma: row.with_emma,
            date: row.created_at, plantName: row.plant_name,
          }],
        }));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'garden_state' }, payload => {
        setWarmthState(payload.new.warmth);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // ── WRITE OPERATIONS ──────────────────────────────────────────────────────
  const logAction = useCallback(async (key, plant, withEmma) => {
    const def = ACTION_DEFS[key]; if (!def) return 0;
    const mult = withEmma ? 2 : 1;
    const earned = def.warmth * mult;

    if (supabase && user) {
      const newWarmth = Math.min(1000, warmth + earned);
      await Promise.all([
        supabase.from('care_log').insert({
          plant_id: plant.id, action: key, label: def.label, emoji: def.emoji,
          earned, with_emma: withEmma, plant_name: plant.name, logged_by: user.id,
        }),
        supabase.from('garden_state').update({ warmth: newWarmth }).eq('id', 1),
      ]);
      // State updates come via realtime subscription
    } else {
      // localStorage fallback
      const entry = {
        action: key, label: def.label, emoji: def.emoji,
        date: new Date().toISOString(), withEmma, earned, plantName: plant.name,
      };
      setCareLogState(prev => {
        const u = { ...prev, [plant.id]: [...(prev[plant.id] || []), entry] };
        lsSave(LS.care, u); return u;
      });
      setWarmthState(w => { const nw = Math.min(1000, w + earned); lsSave(LS.warmth, nw); return nw; });
    }
    return earned;
  }, [user, warmth]);

  const updateGrowth = useCallback(async (plantId, val) => {
    setGrowthState(prev => { const u = { ...prev, [plantId]: val }; lsSave(LS.growth, u); return u; });
    if (supabase && user) {
      await supabase.from('plant_state').upsert({ plant_id: plantId, growth: val });
    }
  }, [user]);

  const movePosition = useCallback(async (plantId, pos) => {
    setPositionsState(prev => { const u = { ...prev, [plantId]: pos }; lsSave(LS.positions, u); return u; });
    if (supabase && user) {
      await supabase.from('plant_state').upsert({ plant_id: plantId, pos_x: pos.x, pos_y: pos.y });
    }
  }, [user]);

  const addExpense = useCallback(async (desc, cents, plantId) => {
    const exp = { id: Date.now(), desc, cents, plantId: plantId || null, date: new Date().toISOString() };
    setExpensesState(prev => { const u = [...prev, exp]; lsSave(LS.expenses, u); return u; });
    if (supabase && user) {
      await supabase.from('expenses').insert({
        description: desc, cents, plant_id: plantId || null, logged_by: user.id,
      });
    }
  }, [user]);

  return {
    warmth, careLog, expenses, positions, growth, dbLoading,
    logAction, updateGrowth, movePosition, addExpense,
  };
}
