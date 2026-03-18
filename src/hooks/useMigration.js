import { useEffect } from 'react';
import { supabase } from '../supabase';

const LS = {
  care: 'gp_care_v4', warmth: 'gp_warmth_v4',
  expenses: 'gp_expenses_v4', positions: 'gp_pos_v4', growth: 'gp_growth_v4',
};
const lsLoad = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };

export function useMigration({ user }) {
  useEffect(() => {
    if (!supabase || !user) return;
    if (localStorage.getItem('gp_migrated_v4')) return;

    async function migrate() {
      try {
        // Migrate care log
        const careLog = lsLoad(LS.care, {});
        const careRows = [];
        Object.entries(careLog).forEach(([plantId, entries]) => {
          entries.forEach(e => {
            careRows.push({
              plant_id: plantId, action: e.action, label: e.label,
              emoji: e.emoji, earned: e.earned || 0, with_emma: e.withEmma || false,
              plant_name: e.plantName || '', logged_by: user.id,
              created_at: e.date,
            });
          });
        });
        if (careRows.length > 0) {
          await supabase.from('care_log').insert(careRows);
        }

        // Migrate warmth
        const warmth = lsLoad(LS.warmth, 0);
        await supabase.from('garden_state').update({ warmth }).eq('id', 1);

        // Migrate positions + growth
        const positions = lsLoad(LS.positions, {});
        const growth = lsLoad(LS.growth, {});
        const allIds = new Set([...Object.keys(positions), ...Object.keys(growth)]);
        const stateRows = Array.from(allIds).map(plantId => ({
          plant_id: plantId,
          pos_x: positions[plantId]?.x ?? null,
          pos_y: positions[plantId]?.y ?? null,
          growth: growth[plantId] ?? null,
        }));
        if (stateRows.length > 0) {
          await supabase.from('plant_state').upsert(stateRows);
        }

        localStorage.setItem('gp_migrated_v4', '1');
      } catch (err) {
        console.error('Migration failed, will retry next login:', err);
      }
    }

    migrate();
  }, [user]);
}
