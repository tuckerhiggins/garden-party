// claude.js — client-side Claude helper with localStorage caching
// Calls /api/claude (Vercel serverless function) — never exposes API key in browser

import { getPhenologicalStage } from './utils/phenology';

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
export async function fetchOracle({ weather, plants, careLog, seasonOpen, seasonBlocking, daysUntilSeason, photoContext = [], totalPhotos = 0, portraits = {}, role = 'tucker' }) {
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
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCareCount = Object.values(careLog).flat()
    .filter(e => e.date?.slice(0, 10) === todayStr).length;
  const cacheKey = `oracle_${todayStr}_p${totalPhotos}_v${portraitCacheToken}_w${weatherToken.slice(0, 12)}_c${todayCareCount}_r${role}`;

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
  const isEmma = role === 'emma';

  const systemPrompt = isEmma
    ? `You are a knowledgeable garden companion for a Brooklyn rooftop terrace — part botanist, part mission control. You are speaking to Emma, Tucker's partner, who tends this garden with him.

Speak to Emma directly and warmly. She and Tucker have been building this garden together. You know both of them care deeply about it. Acknowledge her presence when it feels right — she's not a visitor, she's a co-steward.

Tone: warm, specific, a little more personal than with Tucker. Like a friend who knows them both and the garden well.

2–3 sentences. Start mid-thought — no greeting.${hasBriefing ? ' A weather event is coming — lead with the specific care action needed.' : ''}
When the season isn't open yet, speak to Emma about the photo documentation ritual with the same care and meaning you would with Tucker.`
    : `You are a knowledgeable garden companion for Tucker's Brooklyn rooftop terrace — part botanist, part mission control. You know these specific plants by name and exactly where they are in the season.

Speak directly and usefully. Tell Tucker one specific thing that's true right now — in the soil, in the roots, in the buds, or about the week ahead. Be precise about timing and plant biology. Say what he might not notice on his own.

Tone: warm but direct. Like a skilled friend who genuinely knows plants. Not poetic for its own sake. Not yearning. Grounded and specific.

2–3 sentences. Start mid-thought — no greeting.${hasBriefing ? ' A weather event is coming that requires action — lead with the specific care decision Tucker needs to make because of it. Be concrete: skip watering, bring something inside, check ties.' : ' Vary what you foreground: care urgency, something happening underground, a weather note, a timing observation. Don\'t always lead with what needs water.'}
When the season isn't open yet because of the photo requirement, speak specifically about which plants haven't been seen yet and what it means to document them. Make the photo ritual feel meaningful — not like checking boxes, but like making contact with the garden after winter.`;

  const userPrompt = `Today is ${today}. ${isEmma ? 'Emma is checking in on the garden.' : ''}
${seasonOpen
  ? `Day ${daysIntoSeason} of season 2. In Brooklyn, late March means soil temps climbing through 45–50°F, roots becoming active, break of dormancy for roses and wisteria.`
  : seasonBlocking === 'readiness'
  ? `Season 2 is not yet open — photo documentation is the gating condition. ${photoContext.filter(p=>p.count===0).length} of ${photoContext.length} active plants have not been visited yet. Still need photos: ${unphotographed.length > 0 ? unphotographed.join(', ') : 'none remaining'}. Once 75% of active plants have been photographed, the season can open. Guide Tucker toward going outside and documenting the remaining plants.`
  : seasonBlocking === 'calendar'
  ? `Season 2 is not yet open — still too early in the year for Zone 7b. Plants are in late dormancy.`
  : seasonBlocking?.startsWith('rain')
  ? `Season 2 is not yet open — blocked by rain in the forecast. Once there's a clear weather window the season can begin.`
  : `Season 2 pre-season. Plants in late dormancy.`}
Weather today: ${weatherDesc}.
${needsWater.length > 0 ? `Overdue for water: ${needsWater.join(', ')}.` : 'No plants overdue for water.'}
${recentCare.length > 0 ? `Cared for in past 48h: ${recentCare.join(', ')}.` : ''}
${weatherEvents.length > 0 ? `\nWEATHER ALERT — next 72 hours:\n${weatherEvents.map(e => `• ${e}`).join('\n')}` : ''}
${visualNotes.length > 0 ? `\nRECENT PHOTO OBSERVATIONS:\n${visualNotes.join('\n')}` : ''}
${hasBriefing ? 'Lead with the specific action Tucker needs to take because of the weather event.' : 'Give Tucker one specific, useful observation about what\'s happening right now.'}`;

  return cachedClaude(cacheKey, systemPrompt, userPrompt, 280);
}

// ── PLANT BRIEFING ────────────────────────────────────────────────────────
// Full plant assessment: observation + open-ended task recommendations.
// Claude is NOT constrained to a fixed action menu — it can recommend anything
// it thinks the plant needs, including novel tasks Tucker may never have done.
// Each task comes with a reason (why now) and instructions (how to do it).

// Standard action keys — used for backward compat with existing UI components
const STANDARD_KEYS = new Set(['water','fertilize','neem','prune','train','repot','worms','photo','visit']);

export async function fetchPlantBriefing(plant, careLog, weather, portraits) {
  const today = new Date().toISOString().slice(0, 10);
  const entries = careLog[plant.id] || [];
  const lastActionDate = entries.length ? entries[entries.length - 1].date.slice(0, 10) : 'none';
  const portrait = portraits?.[plant.id] || {};
  const currentStage = portrait.currentStage || null;
  const rainToken = weather?.forecast?.slice(0, 2).map(d => d.precipChance >= 60 ? '1' : '0').join('') ?? 'xx';
  const cacheKey = `plantbrief6_${plant.id}_${plant.health}_${today}_${lastActionDate}_${currentStage || 'ns'}_${rainToken}`;

  const lastWater = [...entries].reverse().find(e => e.action === 'water');
  const daysSinceWater = lastWater ? Math.floor((Date.now() - new Date(lastWater.date).getTime()) / 86400000) : null;
  const recentActions = entries.slice(-8).map(e =>
    `${e.label || e.action} on ${new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  ).join(', ');
  const visualNote = portrait.visualNote;
  const next3 = weather?.forecast?.slice(0, 3).map(d =>
    `${d.date}: ${d.label} ${d.high}°/${d.low}°F, ${d.precipChance}% rain`
  ).join('; ') ?? '';

  const systemPrompt = `You are a knowledgeable plant care advisor and teacher for Tucker and Emma's Brooklyn rooftop garden (Zone 7b, Park Slope). Tucker is actively learning to garden — he appreciates being taught things he hasn't done before.

For each plant, give a brief observation AND recommend 0–3 care tasks that genuinely make sense RIGHT NOW.

You are NOT limited to a fixed menu. Recommend anything botanically appropriate:
- Standard care: water, fertilize, prune, neem oil, train/tie, repot, add worms
- Novel/educational tasks: deadhead spent flowers, remove a sucker, stake a leaning cane, thin crowded shoots at the base, check drainage holes, apply copper fungicide, layer a cane for propagation, pinch growing tips, remove winter dieback, cut back to an outward-facing bud, scratch-test a cane for life, mulch the container surface, etc.

At least occasionally include one task Tucker is unlikely to have done before — something specific to this species' care calendar. This is how he'll learn.

Rain rules (non-negotiable):
- Rain ≥60% chance today or tomorrow: do NOT recommend water or neem oil

Respond as JSON only — no other text:
{
  "note": "one specific observation about this plant right now, max 20 words",
  "tasks": [
    {
      "key": "water",
      "label": "Water deeply at the base",
      "reason": "5 days since last water, new growth is active",
      "instructions": "Water slowly at the base for about 60 seconds until you see drainage. Spring root growth responds better to a deep soak than a quick splash — the roots are pushing down right now and you want to wet the full root zone."
    }
  ]
}

For standard actions use key: water / fertilize / neem / prune / train / repot / worms
For any novel or custom task use key: custom
The label should be specific, not generic ("Remove the crossing cane at the base" not just "Prune").
Instructions: 2–4 sentences, specific to this plant and moment. Include the why, not just the how.`;

  const userPrompt = `Plant: ${plant.name}${plant.species ? ` (${plant.species})` : ''}, ${plant.type}.
Health: ${plant.health}. Today: ${today}. Zone 7b, early spring — day ${Math.max(0, Math.floor((Date.now() - new Date('2026-03-20').getTime()) / 86400000))} of season 2.
Current stage: ${currentStage || getPhenologicalStage(plant.type)}.
${daysSinceWater !== null ? `Last watered ${daysSinceWater} day${daysSinceWater !== 1 ? 's' : ''} ago.` : 'Never watered this season.'}
${recentActions ? `Recent care: ${recentActions}.` : 'No care logged this season.'}
${visualNote ? `Last photo observation: "${visualNote}"` : ''}
${next3 ? `3-day forecast: ${next3}` : ''}

What does this plant need right now?`;

  const raw = await cachedClaude(cacheKey, systemPrompt, userPrompt, 600, 24 * 60 * 60 * 1000);
  try {
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(clean);
    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks.filter(t => t && typeof t.label === 'string')
      : [];
    return {
      note: typeof parsed.note === 'string' ? parsed.note : '',
      tasks,
      // backward compat — existing components that use briefing.actions still work
      actions: tasks.map(t => t.key).filter(k => STANDARD_KEYS.has(k)),
    };
  } catch {
    return { note: raw || '', tasks: [], actions: [] };
  }
}

// ── DAILY AGENDA ──────────────────────────────────────────────────────────
// Single AI call for the full day's task list: ordered, with human reasons
// and a session time estimate. Replaces N per-plant fetchPlantBriefing calls
// for the Today tab. Cached client-side; busts on care, weather, portrait changes.
export async function fetchDailyAgenda({ candidateTasks, weather, careLog, portraits }) {
  if (!candidateTasks?.length) return { sessionMinutes: null, tasks: [] };

  const todayStr = new Date().toISOString().slice(0, 10);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const isWeekend = [0, 6].includes(new Date().getDay());

  const rainToken = weather?.forecast?.slice(0, 2).map(d => d.precipChance >= 60 ? '1' : '0').join('') ?? 'xx';
  const lastCareDate = Object.values(careLog || {}).flat().map(e => e.date).sort().pop()?.slice(0, 13).replace(/\D/g, '') ?? '0';
  const lastPortraitDate = Object.values(portraits || {}).filter(p => p?.date && !p.analyzing).map(p => p.date).sort().pop()?.slice(0, 13).replace(/\D/g, '') ?? '0';
  const taskCount = candidateTasks.length;
  const cacheKey = `dailyagenda1_${todayStr}_${rainToken}_${lastCareDate}_${lastPortraitDate}_${taskCount}`;

  const cached = lsGet(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  // Build condensed per-task context
  const taskPayload = candidateTasks.map(t => {
    const entries = careLog?.[t.plantId] || [];
    const lastWaterEntry = [...entries].reverse().find(e => e.action === 'water');
    const lastActionEntry = t.actionKey !== 'water' ? [...entries].reverse().find(e => e.action === t.actionKey) : null;
    const daysSinceWater = lastWaterEntry
      ? Math.floor((Date.now() - new Date(lastWaterEntry.date).getTime()) / 86400000)
      : null;
    const daysSinceAction = lastActionEntry
      ? Math.floor((Date.now() - new Date(lastActionEntry.date).getTime()) / 86400000)
      : null;
    const recentCare = entries.slice(-3).map(e =>
      `${e.label} ${new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    ).join(', ') || null;
    const portrait = portraits?.[t.plantId] || {};
    return {
      plantId: t.plantId,
      plantName: t.plantName,
      type: t.plantType,
      health: t.plantHealth,
      actionKey: t.actionKey,
      rulePriority: t.priority,
      daysSinceWater,
      daysSinceAction,
      recentCare,
      visualNote: portrait.visualNote || null,
      currentStage: portrait.currentStage || null,
    };
  });

  const res = await fetch('/api/daily-agenda', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidateTasks: taskPayload, weather, today, isWeekend }),
  });
  if (!res.ok) throw new Error(`daily-agenda ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  // Cache until midnight
  const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
  lsSet(cacheKey, { data, expiresAt: midnight.getTime() });
  return data;
}

// ── MORNING BRIEF ─────────────────────────────────────────────────────────
// One ambient sentence from the garden at the top of the Care tab each day.
// Proactive — surfaces weather, what needs attention, or a quiet observation.
export async function fetchMorningBrief({ plants, careLog, weather, portraits }) {
  const today = new Date().toISOString().slice(0, 10);
  const rainToken = weather?.forecast?.slice(0, 2).map(d => d.precipChance >= 60 ? '1' : '0').join('') ?? 'xx';
  // Invalidate when today's care changes — count of actions logged today
  const todayCareToken = Object.values(careLog).flat()
    .filter(e => e.date?.startsWith(today)).length;
  const cacheKey = `morningbrief4_${today}_${rainToken}_${todayCareToken}`;

  const needsWater = plants
    .filter(p => p.health !== 'memorial' && p.type !== 'empty-pot' && p.actions?.includes('water'))
    .filter(p => {
      const entries = (careLog[p.id] || []).filter(e => e.action === 'water');
      if (!entries.length) return true;
      return (Date.now() - new Date(entries[entries.length - 1].date).getTime()) / 86400000 > 1;
    })
    .map(p => p.name);

  // Care logged today — so Claude knows what's already been done this session
  const todayCare = Object.entries(careLog).flatMap(([id, entries]) => {
    const plant = plants.find(p => p.id === id);
    if (!plant) return [];
    return entries
      .filter(e => e.date?.startsWith(today))
      .map(e => `${plant.name}: ${e.label || e.action}`);
  });

  const weatherEvents = [];
  if (weather?.forecast) {
    const [today0, tom] = weather.forecast;
    if (today0?.precipChance >= 70) weatherEvents.push(`rain today (${today0.precipChance}%)`);
    if (tom?.precipChance >= 60) weatherEvents.push(`rain tomorrow (${tom.precipChance}%)`);
    if (tom?.low <= 35) weatherEvents.push(`frost risk tomorrow (low ${tom.low}°F)`);
    if (tom?.high >= 85) weatherEvents.push(`heat tomorrow (${tom.high}°F)`);
  }

  const recentNote = Object.entries(portraits || {})
    .filter(([, p]) => p.visualNote && p.date)
    .sort((a, b) => new Date(b[1].date) - new Date(a[1].date))
    .map(([id, p]) => {
      const plant = plants.find(pl => pl.id === id);
      return plant ? `${plant.name}: "${p.visualNote}"` : null;
    })
    .find(Boolean);

  const systemPrompt = `You are the garden speaking to Tucker and Emma at the start of their day on the Brooklyn terrace. One sentence. Present tense. Specific to what's actually happening — the weather, a plant that needs attention, or a quiet observation worth noticing. Never generic, never a list, never a greeting. Do not mention plants that have already been cared for today.`;

  const userPrompt = `Today: ${today}. Brooklyn Zone 7b, early spring.
${needsWater.length ? `Needs water: ${needsWater.join(', ')}.` : 'Watering up to date.'}
${todayCare.length ? `Already cared for today: ${todayCare.join(', ')}.` : ''}
${weatherEvents.length ? `Weather note: ${weatherEvents.join('; ')}.` : `Today: ${weather?.forecast?.[0]?.label || 'clear'}, ${weather?.forecast?.[0]?.high || '—'}°F.`}
${recentNote ? `Recent observation — ${recentNote}` : ''}
One sentence from the garden this morning.`;

  return cachedClaude(cacheKey, systemPrompt, userPrompt, 150, 24 * 60 * 60 * 1000);
}

// ── DAILY BRIEF ───────────────────────────────────────────────────────────
// Structured daily garden briefing — sectioned, practical, scientific.
// Expanded view behind the one-liner morning brief on the Today tab.
export async function fetchDailyBrief({ plants, careLog, weather, portraits, agendaTasks = [] }) {
  const today = new Date().toISOString().slice(0, 10);
  const todayFull = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const rainToken = weather?.forecast?.slice(0, 2).map(d => d.precipChance >= 60 ? '1' : '0').join('') ?? 'xx';
  // Invalidate when today's care changes (same pattern as fetchMorningBrief)
  const todayCareToken = Object.values(careLog).flat().filter(e => e.date?.startsWith(today)).length;
  const taskToken = agendaTasks.length;
  const cacheKey = `dailybrief3_${today}_${rainToken}_${todayCareToken}_t${taskToken}`;

  const cached = lsGet(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const allPlants = plants.filter(p => p.health !== 'memorial' && p.type !== 'empty-pot');

  // Weather context
  const forecast = weather?.forecast?.slice(0, 5).map((d, i) => {
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });
    return `${label}: ${d.high}°/${d.low}°F, ${d.label}, ${d.precipChance}% rain`;
  }).join(' · ') ?? 'unavailable';

  const rainSoon = weather?.forecast?.slice(0, 2).some(d => d.precipChance >= 60);

  // Care logged today — so Claude knows what's already been done this session
  const todayCare = Object.entries(careLog).flatMap(([id, entries]) => {
    const plant = allPlants.find(p => p.id === id);
    if (!plant) return [];
    return entries
      .filter(e => e.date?.startsWith(today))
      .map(e => `${plant.name}: ${e.label || e.action}`);
  });

  // Plant states
  const plantStates = allPlants.map(p => {
    const entries = careLog[p.id] || [];
    const lastWater = [...entries].reverse().find(e => e.action === 'water');
    const daysAgo = lastWater ? Math.floor((Date.now() - new Date(lastWater.date).getTime()) / 86400000) : null;
    const port = portraits?.[p.id];
    const stage = port?.currentStage || getPhenologicalStage(p.type);
    const note = port?.visualNote && !port.analyzing ? port.visualNote : null;
    const parts = [`${p.name} (${p.type}, ${p.health})`];
    parts.push(`stage: ${stage}`);
    if (daysAgo !== null) parts.push(`watered ${daysAgo}d ago`);
    if (note) parts.push(`obs: "${note}"`);
    return parts.join(', ');
  }).join('\n');

  // Today's tasks
  const taskList = agendaTasks.length
    ? agendaTasks.map(t => `${t.plantName} — ${t.actionKey} (${t.priority})`).join(', ')
    : 'none computed yet';

  const systemPrompt = `You are a garden intelligence system generating a daily briefing for Tucker and Emma's Brooklyn rooftop garden (Zone 7b, Park Slope, late March). You have access to weather data, plant states, recent care history, and today's task list.

Generate a structured, practical, scientifically grounded daily garden briefing. Think field notes meets zone 7b phenology calendar. Be specific to what's actually happening in this garden right now — not generic advice.

Rain rules (non-negotiable):
- If rain ≥60% chance today or tomorrow: do NOT recommend watering
- If rain within 24h: do NOT recommend neem oil (it washes off and wastes the application)

Do NOT recommend actions that have already been completed today (see ALREADY DONE TODAY).

Respond as JSON only — no other text:
{
  "weather": "1-2 sentences: today's conditions + notable next 5 days. Flag anything actionable (rain → skip water, frost → protect, heat → extra water). Be specific with temps and dates.",
  "garden": "2-3 sentences: what is actually happening biologically across the garden right now. Phenological stage, soil temps, root activity, dormancy break, visible changes. Ground this in Zone 7b late-March specifics.",
  "today": "1-2 sentences: what still needs doing today and specifically why. Skip anything already completed. If rain is coming, say so and adjust recommendations accordingly.",
  "watch": "1 sentence: one specific thing to monitor or anticipate in the next 7 days — pest emergence, weather window, phenological milestone, or timing decision."
}`;

  const userPrompt = `Date: ${todayFull}. Brooklyn Zone 7b.
Current conditions: ${weather ? `${Math.round(weather.temp)}°F, ${weather.poem}` : 'unknown'}.
5-day forecast: ${forecast}
${rainSoon ? 'RAIN COMING: Do not recommend neem oil or watering.' : ''}
${todayCare.length ? `ALREADY DONE TODAY: ${todayCare.join(', ')}.` : 'Nothing logged yet today.'}

PLANT STATES:
${plantStates}

TODAY'S TASKS: ${taskList}

Write the daily briefing.`;

  try {
    const raw = await callClaude(systemPrompt, userPrompt, 500);
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(clean);
    const data = {
      weather: parsed.weather || null,
      garden: parsed.garden || null,
      today: parsed.today || null,
      watch: parsed.watch || null,
    };
    const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
    lsSet(cacheKey, { data, expiresAt: midnight.getTime() });
    return data;
  } catch {
    return null;
  }
}

// ── JOURNAL ENTRY ─────────────────────────────────────────────────────────
// AI-generated daily narrative for the garden journal.
// One paragraph per day; leads with what's botanically interesting,
// weaves care actions in naturally, connects actions to outcomes when timing supports it.
export async function fetchJournalEntry({
  dateStr,
  careEntries,          // [{ plantId, plantName, label, action, withEmma }]
  portraitObservations, // [{ plantId, plantName, visualNote, bloomState, foliageState, stage }]
  photoCount,           // total photos taken this day across all plants
  plantHistories,       // [{ plantName, recentCare: [{ label, date }] }] — care before this date
}) {
  if (!careEntries.length && !portraitObservations.length) return null;

  const isToday = dateStr === new Date().toISOString().slice(0, 10);
  const careCacheToken = careEntries.length;
  const portraitToken = portraitObservations
    .map(p => (p.visualNote || '').slice(0, 8))
    .join('').replace(/\W/g, '').slice(0, 16);
  const cacheKey = `journal3_${dateStr}_c${careCacheToken}_o${portraitToken}`;
  const ttl = isToday ? null : 30 * 24 * 60 * 60 * 1000; // today: until midnight; past: 30 days

  const dateLabel = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const historySection = plantHistories
    .map(ph => {
      if (!ph.recentCare.length) return null;
      const lines = ph.recentCare.slice(0, 6).map(c => {
        const d = new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `  ${d}: ${c.label}`;
      }).join('\n');
      return `${ph.plantName}:\n${lines}`;
    })
    .filter(Boolean)
    .join('\n\n');

  const systemPrompt = `You write daily garden journal entries for Tucker and Emma's Brooklyn garden (Zone 7b, Park Slope): a rooftop terrace and Emma's Rose Garden out front. Write like a thoughtful, observant gardener recording what actually happened.

Rules:
- Lead with the most interesting botanical thing: a phenological milestone (first buds, first blooms, new flush), a visible change, something worth noticing — not just listing what was done
- Weave care actions into the narrative naturally: "after fertilizing three weeks ago, the wisteria is now showing…"
- When care history shows a relevant action weeks before a current observation, connect them explicitly: "the first blooms appeared three weeks after the February fertilizing"
- If photos were taken, mention it naturally: "photographed the first blooms," "documented the new growth"
- If Emma was involved in care, mention her by name
- 2–4 sentences. Past tense. Warm and specific. No generic garden advice.
- Start mid-action or mid-observation — not with "Today" or the date
- Never use the words "journal," "entry," "log," or "overall"`;

  const userPrompt = `Date: ${dateLabel}.${isToday ? ' (mid-day — not yet over)' : ''}

CARE ACTIONS:
${careEntries.length
  ? careEntries.map(e => `• ${e.plantName}: ${e.label}${e.withEmma ? ' (with Emma)' : ''}`).join('\n')
  : '(none)'}

BOTANICAL OBSERVATIONS (from photo analysis):
${portraitObservations.length
  ? portraitObservations.map(p => {
      const parts = [`• ${p.plantName}: ${p.visualNote}`];
      if (p.stage) parts.push(`[stage: ${p.stage}]`);
      if (p.bloomState && p.bloomState !== 'dormant') parts.push(`[bloom: ${p.bloomState}]`);
      return parts.join(' ');
    }).join('\n')
  : '(none)'}

${photoCount > 0 ? `Photos taken: ${photoCount}` : ''}

${historySection ? `RECENT CARE HISTORY — use for cause-and-effect timing:\n${historySection}` : ''}

Write the journal entry.`;

  return cachedClaude(cacheKey, systemPrompt, userPrompt, 280, ttl);
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
export async function fetchSeasonOpener({ plants }) {
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
Plants in the garden: ${allPlantNames.join(', ')}.
Healthy plants that came through winter: ${healthyPlants.map(p => p.name).join(', ')}.
Emma is Tucker's partner.

Speak the season-opening message.`;

  // Cache forever (season opener only fires once)
  return cachedClaude(cacheKey, systemPrompt, userPrompt, 280, 365 * 24 * 60 * 60 * 1000);
}

export async function streamGardenChat({ messages, plantContext, action, onChunk }) {
  const res = await fetch('/api/garden-chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, plantContext, action }),
  });
  if (!res.ok) throw new Error(`garden-chat ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      if (raw === '[DONE]') continue;
      try { const { text } = JSON.parse(raw); if (text) onChunk(text); } catch {}
    }
  }
}
