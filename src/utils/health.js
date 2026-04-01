// src/utils/health.js
// Plant health and water level — event-driven, photo-grounded, drift-aware.
//
// HEALTH MODEL
//   Photo analysis sets a baseline health value, stored persistently in portraits.
//   Health drifts between photos based on water state and care history — it can
//   degrade (dry spell → thirsty, neglect → overlooked) but never auto-improves
//   without a new photo confirming it. Water urgency always overrides.
//
// WATER MODEL
//   Water level = 1 - (daysSinceWater / drainDays), clamped 0–1.
//   drainDays comes from portrait.waterDays (set by oracle/briefing, stored
//   persistently) or falls back to a smart default based on species + pot size
//   + current temperature.

const WATER_ACTIONS = new Set(['water', 'rain']);
const CARE_ACTIONS  = new Set(['water', 'rain', 'fertilize', 'prune', 'neem', 'train', 'repot', 'worms', 'photo', 'visit']);
const STRUCTURAL    = new Set(['empty', 'memorial']);
const SEASON_START_MS = new Date('2026-03-20').getTime();
const VALID_HEALTH = new Set(['thriving', 'content', 'recovering', 'thirsty', 'overlooked', 'struggling']);

// ── SMART DRAIN RATE ─────────────────────────────────────────────────────────
// Base days between waterings by plant type and pot size.
// Temperature adjusts the rate: heat speeds drying, cold slows it.

const TYPE_DRAIN_BASE = {
  'climbing-rose':  2.0,   // active growth, container, thirsty
  'rose':           2.5,   // container roses
  'wisteria':       3.0,   // vigorous climber
  'serviceberry':   3.0,
  'japanese-maple': 4.0,
  'lavender':       5.0,   // drought tolerant
  'evergreen':      3.0,
  'citrus':         2.0,   // needs consistent moisture
  'fern':           1.5,   // very thirsty
  'hydrangea':      2.0,
  'succulent':      7.0,
  'cactus':         10.0,
  'herb':           2.0,
};

function tempFactor(tempF) {
  if (!tempF || isNaN(tempF)) return 1.0;
  if (tempF >= 90) return 0.60;   // very hot — drains 40% faster
  if (tempF >= 80) return 0.75;
  if (tempF >= 70) return 0.88;
  if (tempF >= 55) return 1.00;   // baseline spring/fall
  if (tempF >= 45) return 1.20;   // cool
  return 1.40;                    // cold — drains much slower
}

function potSizeFactor(container) {
  if (!container) return 1.0;
  const c = container.toLowerCase();
  if (c.includes('in ground')) return 2.5;   // ground holds moisture much longer
  if (c.includes('large') || c.includes('15') || c.includes('barrel') || c.includes('25')) return 1.4;
  if (c.includes('6') || c.includes('small') || c.includes('quart')) return 0.65;
  return 1.0; // typical 5–10 gal container
}

// Smart drain days when no stored oracle value is available.
// Falls back generously — errs toward not penalizing plants.
export function smartWaterDays(plant, weather = null) {
  const inGround = plant.container?.toLowerCase().includes('in ground') ?? false;
  if (inGround) return 5;

  const base = TYPE_DRAIN_BASE[plant.type] ?? 3.0;
  const temp  = weather?.temp ?? null;
  const potF  = potSizeFactor(plant.container);
  const tmpF  = tempFactor(temp);

  return Math.max(1.0, base * potF * tmpF);
}

// ── COMPUTE WATER LEVEL ───────────────────────────────────────────────────────
// 0–1: 1.0 = just watered, 0 = critically dry.
// Uses portrait.waterDays (oracle-set, persisted) then smart default.
export function computeWaterLevel(plant, careLog, portrait = null, weather = null) {
  if (!plant.actions?.includes('water')) return 1;

  const drainDays = (portrait?.waterDays > 0)
    ? portrait.waterDays
    : smartWaterDays(plant, weather);

  const entries = careLog[plant.id] || [];
  const waterEntries = entries.filter(e => WATER_ACTIONS.has(e.action));

  const now = Date.now();
  if (!waterEntries.length) {
    const seasonDays = Math.max(0, (now - SEASON_START_MS) / 86400000);
    return Math.max(0, 1 - seasonDays / drainDays);
  }
  const last = new Date(waterEntries[waterEntries.length - 1].date).getTime();
  const days = (now - last) / 86400000;
  return Math.max(0, 1 - days / drainDays);
}

// Drought-tolerant / established types that need less frequent attention
const DROUGHT_TOLERANT = new Set(['lavender', 'evergreen', 'wisteria', 'japanese-maple', 'serviceberry', 'maple']);

function overlookedDays(plant) {
  const inGround = plant.container?.toLowerCase().includes('in ground') ?? false;
  if (inGround || DROUGHT_TOLERANT.has(plant.type)) return 30;
  return 21; // containerized roses and climbers need more frequent attention
}

// ── COMPUTE HEALTH ────────────────────────────────────────────────────────────
// Uses portrait.health as the baseline (set by photo analysis, persisted).
// Drifts downward based on water and care — never auto-upgrades without a photo.
export function computeHealth(plant, careLog, portrait = null, weather = null) {
  if (STRUCTURAL.has(plant.health)) return plant.health;

  const entries = careLog[plant.id] || [];
  const now = Date.now();
  const seasonDaysOpen = Math.max(0, (now - SEASON_START_MS) / 86400000);
  if (seasonDaysOpen < 2) return plant.health;

  const needsWater   = plant.actions?.includes('water');
  const drainDays = (portrait?.waterDays > 0)
    ? portrait.waterDays
    : smartWaterDays(plant, weather);

  const waterEntries = entries.filter(e => WATER_ACTIONS.has(e.action));
  const careEntries  = entries.filter(e => CARE_ACTIONS.has(e.action));

  const daysSinceWater = waterEntries.length
    ? (now - new Date(waterEntries[waterEntries.length - 1].date).getTime()) / 86400000
    : seasonDaysOpen;
  const daysSinceCare = careEntries.length
    ? (now - new Date(careEntries[careEntries.length - 1].date).getTime()) / 86400000
    : seasonDaysOpen;

  // ── Water urgency: objective facts, always override ───────────────────────
  if (needsWater) {
    if (daysSinceWater > drainDays * 2) return 'struggling';
    if (daysSinceWater > drainDays)     return 'thirsty';
  }

  // ── Prolonged neglect: always overrides ──────────────────────────────────
  if (daysSinceCare > overlookedDays(plant)) return 'overlooked';

  // ── Recovering: recently watered after a dry spell ────────────────────────
  if (needsWater && waterEntries.length >= 2) {
    const lastTime = new Date(waterEntries[waterEntries.length - 1].date).getTime();
    const prevTime = new Date(waterEntries[waterEntries.length - 2].date).getTime();
    const prevGap  = (lastTime - prevTime) / 86400000;
    const daysSinceLast = (now - lastTime) / 86400000;
    if (prevGap > drainDays && daysSinceLast < 3) return 'recovering';
  }

  // ── Manual override: Tucker explicitly set a health state ─────────────────
  if (plant.manualHealth) return plant.health;

  // ── Photo-grounded baseline with drift ───────────────────────────────────
  // portrait.health was set by photo analysis — use it as baseline,
  // then apply downward drift rules. Never auto-upgrade without a new photo.
  const base = (portrait?.health && VALID_HEALTH.has(portrait.health))
    ? portrait.health
    : null;

  if (base) {
    const daysSincePhoto = portrait.healthDate
      ? (now - new Date(portrait.healthDate).getTime()) / 86400000
      : null;
    const waterLevel = computeWaterLevel(plant, careLog, portrait, weather);

    // 'thriving' drifts down if the plant is getting dry or unattended
    if (base === 'thriving') {
      if (waterLevel < 0.4 && needsWater) return 'content'; // getting dry
      if (daysSincePhoto > 14 && daysSinceCare > 7) return 'content'; // unattended for 2+ weeks
    }

    // 'recovering' can graduate to 'content' if consistently watered
    if (base === 'recovering') {
      const recentWater = waterEntries.filter(
        e => (now - new Date(e.date).getTime()) / 86400000 < 7
      ).length;
      if (recentWater >= 2) return 'content';
    }

    // Any positive state drifts to 'overlooked' based on plant type tolerance
    if (base !== 'overlooked' && daysSinceCare > overlookedDays(plant) * 0.5) return 'overlooked';

    return base;
  }

  // ── Algorithmic fallback (no photo analysis yet) ─────────────────────────
  if (daysSinceCare < 7) return 'content';
  return plant.health;
}

// 0–1 score for bar rendering from health string
export const HEALTH_LEVEL = {
  thriving:   1.00,
  content:    0.78,
  recovering: 0.55,
  resting:    0.85,
  overlooked: 0.38,
  thirsty:    0.22,
  struggling: 0.08,
  empty:      0,
  memorial:   0,
};
