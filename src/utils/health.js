// src/utils/health.js
// Derives plant health and water level from care log + AI briefing data.
//
// The AI briefing provides `waterDays` — how long this specific plant
// (given its species, pot size, weather, and season) can go between
// waterings before becoming thirsty. This replaces all hardcoded thresholds.
// Falls back to conservative estimates until the briefing loads.

const WATER_ACTIONS = new Set(['water', 'rain']);
const CARE_ACTIONS  = new Set(['water', 'rain', 'fertilize', 'prune', 'neem', 'train', 'repot', 'worms', 'photo', 'visit']);
const STRUCTURAL    = new Set(['empty', 'memorial']);
const SEASON_START_MS = new Date('2026-03-20').getTime();

// Conservative fallback drain rate when no briefing is available yet.
// Errs toward not penalizing plants falsely — briefing will refine once loaded.
function defaultWaterDays(plant) {
  const inGround = plant.container?.toLowerCase().includes('in ground') ?? false;
  if (inGround) return 5;
  const container = (plant.container || '').toLowerCase();
  if (container.includes('6') || container.includes('small') || container.includes('quart')) return 1.5;
  if (container.includes('large') || container.includes('15') || container.includes('barrel')) return 4;
  return 3; // sensible default for a typical 5–10 gal container
}

export function computeHealth(plant, careLog, briefing = null) {
  if (STRUCTURAL.has(plant.health)) return plant.health;

  const entries = careLog[plant.id] || [];
  const now = Date.now();
  const seasonDaysOpen = Math.max(0, (now - SEASON_START_MS) / 86400000);

  if (seasonDaysOpen < 2) return plant.health;

  const waterEntries = entries.filter(e => WATER_ACTIONS.has(e.action));
  const careEntries  = entries.filter(e => CARE_ACTIONS.has(e.action));
  const needsWater   = plant.actions?.includes('water');

  // AI-provided waterDays is the key threshold — reflects species, pot, weather, season.
  const drainDays = (briefing && typeof briefing.waterDays === 'number' && briefing.waterDays > 0)
    ? briefing.waterDays
    : defaultWaterDays(plant);

  const daysSinceWater = waterEntries.length
    ? (now - new Date(waterEntries[waterEntries.length - 1].date).getTime()) / 86400000
    : seasonDaysOpen;

  const daysSinceCare = careEntries.length
    ? (now - new Date(careEntries[careEntries.length - 1].date).getTime()) / 86400000
    : seasonDaysOpen;

  if (needsWater) {
    if (daysSinceWater > drainDays * 2)  return 'struggling';
    if (daysSinceWater > drainDays)      return 'thirsty';
  }

  if (daysSinceCare > 14) return 'overlooked';

  // Recovering: recently watered after being dry for at least one drain cycle
  if (needsWater && waterEntries.length >= 2) {
    const lastTime      = new Date(waterEntries[waterEntries.length - 1].date).getTime();
    const prevTime      = new Date(waterEntries[waterEntries.length - 2].date).getTime();
    const prevGap       = (lastTime - prevTime) / 86400000;
    const daysSinceLast = (now - lastTime) / 86400000;
    if (prevGap > drainDays && daysSinceLast < 3) return 'recovering';
  }

  const recentCare = careEntries.filter(
    e => (now - new Date(e.date).getTime()) / 86400000 < 14
  ).length;
  if (recentCare >= 3) return 'thriving';
  if (daysSinceCare < 7) return 'content';

  return plant.health;
}

// 0–1: 1.0 = just watered, 0 = critically dry.
// Uses AI waterDays when available — reflects actual species/pot/weather.
export function computeWaterLevel(plant, careLog, briefing = null) {
  if (!plant.actions?.includes('water')) return 1;
  const now = Date.now();
  const entries = careLog[plant.id] || [];
  const waterEntries = entries.filter(e => WATER_ACTIONS.has(e.action));
  const drainDays = (briefing && typeof briefing.waterDays === 'number' && briefing.waterDays > 0)
    ? briefing.waterDays
    : defaultWaterDays(plant);

  if (!waterEntries.length) {
    const seasonDays = Math.max(0, (now - SEASON_START_MS) / 86400000);
    return Math.max(0, 1 - seasonDays / drainDays);
  }
  const last = new Date(waterEntries[waterEntries.length - 1].date).getTime();
  const days = (now - last) / 86400000;
  return Math.max(0, 1 - days / drainDays);
}

// 0–1 score for bar rendering from health string
export const HEALTH_LEVEL = {
  thriving:  1.00,
  content:   0.78,
  recovering:0.55,
  resting:   0.85,
  overlooked:0.38,
  thirsty:   0.22,
  struggling:0.08,
  empty:     0,
  memorial:  0,
};
