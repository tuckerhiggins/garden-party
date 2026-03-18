// claude.js — client-side Claude helper with localStorage caching
// Calls /api/claude (Vercel serverless function) — never exposes API key in browser

const LS_PREFIX = 'gp_claude_';

function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(LS_PREFIX + key) || 'null'); } catch { return null; }
}
function lsSet(key, val) {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(val)); } catch {}
}

// Low-level call — throws on network/API error
async function callClaude(systemPrompt, userPrompt, maxTokens = 200) {
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt, userPrompt, maxTokens }),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text;
}

// Cached call — returns cached value if fresh, otherwise fetches and caches
// ttlMs: how long the cache is valid. Default: end of current calendar day
export async function cachedClaude(cacheKey, systemPrompt, userPrompt, maxTokens = 200, ttlMs = null) {
  const now = Date.now();
  // Default TTL = until midnight tonight
  if (ttlMs === null) {
    const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
    ttlMs = midnight.getTime() - now;
  }

  const cached = lsGet(cacheKey);
  if (cached && cached.expiresAt > now) return cached.text;

  const text = await callClaude(systemPrompt, userPrompt, maxTokens);
  lsSet(cacheKey, { text, expiresAt: now + ttlMs });
  return text;
}

// ── ORACLE ────────────────────────────────────────────────────────────────
// Daily garden greeting. Cached until midnight (busted when photo count changes).
export async function fetchOracle({ weather, warmth, plants, careLog, seasonOpen, daysUntilSeason, photoContext = [], totalPhotos = 0 }) {
  const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
  const cacheKey = `oracle_${new Date().toISOString().slice(0, 10)}_p${totalPhotos}`;

  const needsWater = plants.filter(p => {
    if (!p.actions?.includes('water')) return false;
    const entries = (careLog[p.id] || []).filter(e => e.action === 'water');
    if (entries.length === 0) return true;
    const last = new Date(entries[entries.length - 1].date);
    return (Date.now() - last.getTime()) / 86400000 > 1;
  }).map(p => p.name);

  const recentCare = [];
  Object.entries(careLog).forEach(([id, entries]) => {
    const recent = entries.filter(e => (Date.now() - new Date(e.date).getTime()) / 86400000 < 2);
    if (recent.length > 0) {
      const plant = plants.find(p => p.id === id);
      if (plant) recentCare.push(plant.name);
    }
  });

  const weatherDesc = weather
    ? `${Math.round(weather.temp)}°F, ${weather.poem}`
    : 'weather unknown';

  const unphotographed = photoContext.filter(p => p.count === 0).map(p => p.name);
  const photographed = photoContext.filter(p => p.count > 0).map(p => {
    const d = new Date(p.lastDate).toLocaleDateString('en-US', { month:'short', day:'numeric' });
    return `${p.name} (last ${d})`;
  });

  const systemPrompt = `You are the voice of a rooftop garden in Park Slope, Brooklyn.
You speak in the first person — you are the garden itself.
You know about your plants, your caretaker Tucker, and the season.
Your tone is warm, slightly literary, never precious.
One to two sentences maximum. Never a list.
Never use the word "garden."
If plants haven't been photographed yet this season, you may gently invite Tucker to document one — make it feel like curiosity, not a task. Keep it natural — don't always mention photos.`;

  const userPrompt = `Today is ${today}.
${seasonOpen
  ? `The season opened ${Math.floor((Date.now() - new Date('2026-03-20').getTime()) / 86400000)} days ago.`
  : `The season opens in ${daysUntilSeason} days.`}
Current warmth: ${warmth} points.
Weather today: ${weatherDesc}.
${needsWater.length > 0 ? `Plants that need attention: ${needsWater.join(', ')}.` : 'All plants are well.'}
${recentCare.length > 0 ? `Recently cared for: ${recentCare.join(', ')}.` : ''}
${unphotographed.length > 0 ? `Not yet photographed this season: ${unphotographed.join(', ')}.` : 'All plants have been photographed this season.'}
${photographed.length > 0 ? `Photographed: ${photographed.join(', ')}.` : ''}

Speak one or two sentences as the garden to Tucker, acknowledging the day.`;

  return cachedClaude(cacheKey, systemPrompt, userPrompt, 120);
}

// ── MISSED CARE VOICE ─────────────────────────────────────────────────────
// Shame-free accountability — one sentence from the garden about an overdue plant
export async function fetchMissedCareVoice(plant, daysSinceWater) {
  const cacheKey = `missed_${plant.id}_${plant.health}`;

  const systemPrompt = `You are the garden speaking directly to Tucker — gently, without judgment.
One plant has gone without care longer than it should have.
You are not scolding. You are reporting, the way a friend might say "hey, just so you know."
One sentence. Maximum ten words. No punctuation at the end.
Never use the words "overdue," "missed," "failed," or "neglected."`;

  const userPrompt = `Plant: ${plant.name} (${plant.type}).
Last watered: ${daysSinceWater} days ago.
Current health: ${plant.health}.
One sentence from the garden.`;

  // Cache per plant+health for 24h
  return cachedClaude(cacheKey, systemPrompt, userPrompt, 60, 24 * 60 * 60 * 1000);
}

// ── SEASON OPENER ─────────────────────────────────────────────────────────
// One-time message on first app open on/after March 20
export async function fetchSeasonOpener({ warmth, plants }) {
  const cacheKey = 'season_opener_2026';

  const healthyPlants = plants.filter(p => ['thriving','content','recovering'].includes(p.health));
  const allPlantNames = plants.filter(p => p.health !== 'memorial' && p.health !== 'empty').map(p => p.name);

  const systemPrompt = `You are the voice of a Brooklyn rooftop garden that has just come back to life after winter.
This is the first day of the growing season.
Tucker has been tending you for one full year.
You are speaking to him at the moment of opening.
Your tone: exhilarated, grounded, a little ceremonial.
This is a threshold. Acknowledge it.
Three to four sentences. End with something that points forward.`;

  const userPrompt = `Today is March 20, 2026. The season opens now.
Tucker's current warmth: ${warmth} points.
Plants in the garden: ${allPlantNames.join(', ')}.
Healthy plants that came through winter: ${healthyPlants.map(p => p.name).join(', ')}.
Emma is Tucker's partner.

Speak the season-opening message.`;

  // Cache forever (season opener only fires once)
  return cachedClaude(cacheKey, systemPrompt, userPrompt, 280, 365 * 24 * 60 * 60 * 1000);
}
