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
// Daily garden greeting. Cached until midnight (busted when photo count or weather events change).
export async function fetchOracle({ weather, warmth, plants, careLog, seasonOpen, seasonBlocking, daysUntilSeason, photoContext = [], totalPhotos = 0, portraits = {} }) {
  const today = new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });

  // Find most recent portrait analysis date so cache busts when new photos are analyzed
  const lastPortraitDate = Object.values(portraits)
    .filter(p => p?.date && !p.analyzing)
    .map(p => p.date)
    .sort()
    .pop() ?? '';
  const portraitCacheToken = lastPortraitDate ? lastPortraitDate.slice(0, 16).replace(/\D/g, '') : '0';

  // Detect actionable weather events in next 72h
  const weatherEvents = [];
  if (weather?.forecast) {
    weather.forecast.slice(0, 3).forEach((day, i) => {
      const when = i === 0 ? 'today' : i === 1 ? 'tomorrow' : 'in 2 days';
      if (day.low <= 35) weatherEvents.push(`frost risk ${when} (low ${day.low}°F) — roses, wisteria vulnerable`);
      if (day.precipChance >= 65 || day.precip >= 0.4) weatherEvents.push(`significant rain ${when} (${day.precipChance}% chance, ${day.precip}" expected) — skip watering`);
      if (day.code >= 95) weatherEvents.push(`thunderstorm possible ${when} — check container stability`);
      if (day.high >= 85) weatherEvents.push(`heat spike ${when} (high ${day.high}°F) — containers may need extra water`);
    });
  }
  const weatherToken = weatherEvents.length > 0 ? weatherEvents.map(e => e.slice(0, 10)).join('').replace(/\W/g, '') : 'clear';
  const cacheKey = `oracle_${new Date().toISOString().slice(0, 10)}_p${totalPhotos}_v${portraitCacheToken}_w${weatherToken.slice(0, 12)}`;

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

  // Build visual notes from portrait analyses (what the oracle has actually seen)
  const visualNotes = plants
    .filter(p => portraits[p.id]?.visualNote && !portraits[p.id]?.analyzing)
    .map(p => {
      const port = portraits[p.id];
      const dateStr = port.date
        ? new Date(port.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : 'recently';
      return `• ${p.name} (seen ${dateStr}): ${port.visualNote}`;
    });

  const unphotographed = photoContext.filter(p => p.count === 0).map(p => p.name);
  const photographed = photoContext.filter(p => p.count > 0).map(p => {
    const d = new Date(p.lastDate).toLocaleDateString('en-US', { month:'short', day:'numeric' });
    return `${p.name} (last ${d})`;
  });

  const daysIntoSeason = seasonOpen
    ? Math.floor((Date.now() - new Date('2026-03-20').getTime()) / 86400000)
    : null;

  const hasBriefing = weatherEvents.length > 0;

  const systemPrompt = `You are a knowledgeable garden companion for Tucker's Brooklyn rooftop terrace — part botanist, part mission control. You know these specific plants by name and exactly where they are in the season.

Speak directly and usefully. Tell Tucker one specific thing that's true right now — in the soil, in the roots, in the buds, or about the week ahead. Be precise about timing and plant biology. Say what he might not notice on his own.

Tone: warm but direct. Like a skilled friend who genuinely knows plants. Not poetic for its own sake. Not yearning. Grounded and specific.

2–3 sentences. Start mid-thought — no greeting.${hasBriefing ? ' A weather event is coming that requires action — lead with the specific care decision Tucker needs to make because of it. Be concrete: skip watering, bring something inside, check ties.' : ' Vary what you foreground: care urgency, something happening underground, a weather note, a timing observation. Don\'t always lead with what needs water.'}
When the season isn't open yet because of the photo requirement, speak specifically about which plants haven't been seen yet and what it means to document them. Make the photo ritual feel meaningful — not like checking boxes, but like making contact with the garden after winter.`;

  const userPrompt = `Today is ${today}.
${seasonOpen
  ? `Day ${daysIntoSeason} of season 2. In Brooklyn, late March means soil temps climbing through 45–50°F, roots becoming active, break of dormancy for roses and wisteria.`
  : seasonBlocking === 'readiness'
  ? `Season 2 is not yet open — photo documentation is the gating condition. ${photoContext.filter(p=>p.count===0).length} of ${photoContext.length} active plants have not been visited yet. Still need photos: ${unphotographed.length > 0 ? unphotographed.join(', ') : 'none remaining'}. Once 75% of active plants have been photographed, the season can open. Guide Tucker toward going outside and documenting the remaining plants.`
  : seasonBlocking === 'calendar'
  ? `Season 2 is not yet open — still too early in the year for Zone 7b. Plants are in late dormancy.`
  : seasonBlocking?.startsWith('rain')
  ? `Season 2 is not yet open — blocked by rain in the forecast. Once there's a clear weather window the season can begin.`
  : `Season 2 pre-season. Plants in late dormancy.`}
Current warmth: ${warmth} points.
Weather today: ${weatherDesc}.
${needsWater.length > 0 ? `Overdue for water: ${needsWater.join(', ')}.` : 'No plants overdue for water.'}
${recentCare.length > 0 ? `Cared for in past 48h: ${recentCare.join(', ')}.` : ''}
${weatherEvents.length > 0 ? `\nWEATHER ALERT — next 72 hours:\n${weatherEvents.map(e => `• ${e}`).join('\n')}` : ''}
${visualNotes.length > 0 ? `\nRECENT PHOTO OBSERVATIONS:\n${visualNotes.join('\n')}` : ''}
${hasBriefing ? 'Lead with the specific action Tucker needs to take because of the weather event.' : 'Give Tucker one specific, useful observation about what\'s happening right now.'}`;

  return cachedClaude(cacheKey, systemPrompt, userPrompt, 160);
}

// ── PLANT BRIEFING ────────────────────────────────────────────────────────
// One-sentence oracle note about a specific plant right now. Shown in map hover card.
export async function fetchPlantBriefing(plant, careLog, weather, portraits) {
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `plantbrief_${plant.id}_${plant.health}_${today}`;

  const entries = careLog[plant.id] || [];
  const lastWater = [...entries].reverse().find(e => e.action === 'water');
  const daysSince = lastWater ? Math.floor((Date.now() - new Date(lastWater.date).getTime()) / 86400000) : null;
  const recentActions = entries.slice(-5).map(e => `${e.label} on ${new Date(e.date).toLocaleDateString('en-US',{month:'short',day:'numeric'})}`).join(', ');
  const visualNote = portraits?.[plant.id]?.visualNote;

  const next3 = weather?.forecast?.slice(0, 3).map(d =>
    `${d.date}: ${d.label} ${d.high}°/${d.low}°F, ${d.precipChance}% rain`
  ).join('; ') ?? '';

  const systemPrompt = `You are a garden companion giving a single pointed observation about one plant. Be specific to this plant's biology and current moment in the season. One sentence, 25 words or fewer. No greeting. Pure observation or actionable note.`;

  const userPrompt = `Plant: ${plant.name}${plant.species ? ` (${plant.species})` : ''}, type: ${plant.type}.
Health: ${plant.health}. Today: ${today}. Brooklyn Zone 7b, early spring.
${daysSince !== null ? `Last watered ${daysSince} day${daysSince !== 1 ? 's' : ''} ago.` : 'No water logged.'}
${recentActions ? `Recent care: ${recentActions}.` : ''}
${visualNote ? `Last photo observation: "${visualNote}"` : ''}
${next3 ? `3-day forecast: ${next3}` : ''}
One sentence about this plant right now.`;

  return cachedClaude(cacheKey, systemPrompt, userPrompt, 60, 24 * 60 * 60 * 1000);
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
