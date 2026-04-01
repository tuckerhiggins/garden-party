// claude.js — client-side Claude helper with localStorage caching
// Calls /api/claude (Vercel serverless function) — never exposes API key in browser
// Exports: fetchMorningBrief, fetchDailyBrief, fetchBriefingAnswer, fetchOracleStarters, fetchJournalEntry, and more

import { getPhenologicalStage } from './utils/phenology';
import { localDate } from './utils/dates';

const LS_PREFIX = 'gp_claude_';

function lsGet(key) {
  try { return JSON.parse(localStorage.getItem(LS_PREFIX + key) || 'null'); } catch { return null; }
}
function lsSet(key, val) {
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(val));
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
      console.warn('[claude] localStorage quota exceeded — AI briefing cache skipped for key:', key);
    }
    // Cache miss is safe — next call will just re-fetch from the API
  }
}

// Low-level call — throws on network/API error
// Pass imageBase64 (data URL base64) OR imageUrl (public HTTPS URL) for vision calls
async function callClaude(systemPrompt, userPrompt, maxTokens = 200, imageBase64 = null, imageMimeType = 'image/jpeg', imageUrl = null) {
  const body = { systemPrompt, userPrompt, maxTokens };
  if (imageBase64) { body.imageBase64 = imageBase64; body.imageMimeType = imageMimeType; }
  else if (imageUrl) { body.imageUrl = imageUrl; }
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Claude API ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.text;
}

// Cached call — returns cached value if fresh, otherwise fetches and caches
// ttlMs: how long the cache is valid. Default: end of current calendar day
export async function cachedClaude(cacheKey, systemPrompt, userPrompt, maxTokens = 200, ttlMs = null, imageBase64 = null, imageUrl = null) {
  const now = Date.now();
  // Default TTL = until midnight tonight
  if (ttlMs === null) {
    const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
    ttlMs = midnight.getTime() - now;
  }

  const cached = lsGet(cacheKey);
  if (cached && cached.expiresAt > now) return cached.text;

  const text = await callClaude(systemPrompt, userPrompt, maxTokens, imageBase64, 'image/jpeg', imageUrl);
  lsSet(cacheKey, { text, expiresAt: now + ttlMs });
  return text;
}

// ── ORACLE ────────────────────────────────────────────────────────────────
// Daily garden greeting. Cached until midnight (busted when photo count or weather events change).
export async function fetchOracle({ weather, plants, careLog, seasonOpen, seasonBlocking, daysUntilSeason, photoContext = [], totalPhotos = 0, portraits = {}, role = 'tucker', agendaItems = [] }) {
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
  const todayStr = localDate();
  const todayCareCount = Object.values(careLog).flat()
    .filter(e => e.date && localDate(e.date) === todayStr).length;
  const agendaToken = agendaItems.slice(0, 6).map(i => `${i.plantId}:${i.actionKey}`).join('|').replace(/\W/g, '').slice(0, 20);
  // Separate token for all water tasks — agendaToken only covers top 6 items so water tasks
  // for lower-priority plants (like in-ground roses) must be tracked independently
  const waterToken = agendaItems.filter(i => i.actionKey === 'water').map(i => i.plantId).sort().join('').replace(/\W/g, '').slice(0, 15);
  const cacheKey = `oracle2_${todayStr}_p${totalPhotos}_v${portraitCacheToken}_w${weatherToken.slice(0, 12)}_c${todayCareCount}_r${role}_a${agendaToken}_nw${waterToken}`;

  // Derive from the agenda only — if it's not a task, don't mention it
  const needsWater = agendaItems.filter(i => i.actionKey === 'water').map(i => i.plantName);

  const recentCare = [];
  Object.entries(careLog).forEach(([id, entries]) => {
    const recent = entries.filter(e => (Date.now() - new Date(e.date).getTime()) / 86400000 < 2);
    if (recent.length > 0) {
      const plant = plants.find(p => p.id === id);
      if (plant) recentCare.push(plant.name);
    }
  });

  const weatherDesc = weather
    ? `${Math.round(weather.temp)}°F${weather.poem ? `, ${weather.poem}` : ''}`
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

2–3 sentences. Start mid-thought — no greeting.${hasBriefing ? ' A weather event is coming — lead with how it affects the tasks already on the list, or what it means Tucker can skip. Never suggest a care action unless it appears in TODAY\'S TASK QUEUE.' : ' Vary what you foreground: care urgency, something happening underground, a weather note, a timing observation. Don\'t always lead with what needs water.'}
When the season isn't open yet because of the photo requirement, speak specifically about which plants haven't been seen yet and what it means to document them. Make the photo ritual feel meaningful — not like checking boxes, but like making contact with the garden after winter.

CRITICAL: Only mention care actions (water, neem, prune, fertilize, etc.) that appear in TODAY'S TASK QUEUE. If something isn't listed there, do not suggest it — even if it seems botanically reasonable.`;

  const agendaSummary = agendaItems.length > 0
    ? agendaItems.slice(0, 10).map(i => `• ${i.task?.label || i.actionKey} — ${i.plantName}`).join('\n')
    : null;

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
${agendaSummary ? `\nTODAY'S TASK QUEUE — only mention actions from this list:\n${agendaSummary}` : '\nNo tasks assigned today — speak about observation, biology, or timing only. Do not suggest any care actions.'}
${hasBriefing ? 'Lead with the specific action Tucker needs to take because of the weather event.' : 'Give Tucker one specific, useful observation about what\'s happening right now.'}`;

  return cachedClaude(cacheKey, systemPrompt, userPrompt, 280);
}

// ── ORACLE STARTERS ───────────────────────────────────────────────────────
// AI-generated suggested questions for the Ask tab — "practical scientist mode".
// 4 specific, curious, educational questions about what's actually happening
// in the garden right now. Cached once per day per garden state.
export async function fetchOracleStarters({ plants = [], careLog = {}, weather = null, portraits = {}, seasonOpen = true }) {
  const today = localDate();

  // Build a fingerprint for cache busting when garden state changes meaningfully
  const plantNames = plants.filter(p => p.health !== 'memorial').map(p => p.name).join(',');
  const weatherToken = weather ? `${Math.round(weather.temp)}` : 'x';
  const visualNoteCount = plants.filter(p => portraits[p.id]?.visualNote && !portraits[p.id]?.analyzing).length;
  const cacheKey = `oracle_starters_v1_${today}_${weatherToken}_vn${visualNoteCount}_${plantNames.slice(0, 30).replace(/\W/g, '')}`;

  // Summarize garden for prompt
  const activePlants = plants.filter(p => p.health !== 'memorial' && p.health !== 'empty');
  const plantSummaries = activePlants.map(p => {
    const entries = careLog[p.id] || [];
    const lastCare = entries.length
      ? new Date(entries[entries.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'no recent care';
    const visualNote = portraits[p.id]?.visualNote && !portraits[p.id]?.analyzing
      ? ` — visual note: "${portraits[p.id].visualNote}"` : '';
    const section = p.gardenSection ? ` [${p.gardenSection}]` : '';
    return `${p.name}${section} (${p.type || 'plant'}, ${p.container || 'container'}, ${p.health || 'unknown'} health, last care ${lastCare})${visualNote}`;
  });

  const weatherDesc = weather ? `${Math.round(weather.temp)}°F, ${weather.poem || ''}` : 'unknown';
  const forecast = weather?.forecast?.slice(0, 3).map((d, i) => {
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : 'Day 3';
    return `${label}: ${d.high}°/${d.low}°F, ${d.label}, ${d.precipChance}% rain`;
  }).join('; ') ?? '';

  const systemPrompt = `You are a botanist and garden scientist helping Tucker — an enthusiastic beginner gardener — learn deeply about his Brooklyn rooftop garden (Zone 7b, Park Slope, late March, season just opened).

Generate exactly 4 suggested questions for him to ask his garden oracle. These should be "practical scientist mode" questions — specific, curious, educational, and grounded in what is actually happening in this garden right now.

Good questions explain fascinating biological processes, illuminate plant behavior he can observe, reveal something counterintuitive or surprising, or connect what he's doing to underlying science. They should NOT be generic care questions ("what should I water?") — the app already handles that. Instead, make him go "oh wow, I never thought about that" — and then he'll go look at his plants differently.

Examples of the RIGHT kind of question:
- "What is happening in the wisteria's root system right now that explains its explosive spring push?"
- "Why does lavender produce that particular grey-green color in late March, and what triggers it?"
- "What's the biochemical reason neem oil works specifically against soft-bodied insects?"
- "What are my roses doing underground right now while their canes still look dormant?"

Respond as a JSON array of exactly 4 strings — question text only, no numbering or punctuation at the start. No other text.
["question 1", "question 2", "question 3", "question 4"]`;

  const userPrompt = `Today: ${today}. Season open: ${seasonOpen}. Weather: ${weatherDesc}.
${forecast ? `Forecast: ${forecast}` : ''}

Plants in this garden:
${plantSummaries.join('\n')}

Generate 4 specific, fascinating questions for Tucker to ask the oracle — grounded in what's actually happening in this garden right now. Make them the kind of question a curious plant scientist would ask.`;

  try {
    const raw = await cachedClaude(cacheKey, systemPrompt, userPrompt, 320);
    // Parse JSON array
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('no array');
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr) || arr.length === 0) throw new Error('empty');
    return arr.slice(0, 4).map(q => String(q).trim()).filter(Boolean);
  } catch {
    return [
      "What's happening in the roots right now that we can't see?",
      "What does this week's weather mean for what's happening underground?",
      "What should I know about this time of year that most gardeners miss?",
      "What's the most surprising thing happening in the garden right now?",
    ];
  }
}

// ── PLANT BRIEFING ────────────────────────────────────────────────────────
// Full plant assessment: observation + open-ended task recommendations.
// Claude is NOT constrained to a fixed action menu — it can recommend anything
// it thinks the plant needs, including novel tasks Tucker may never have done.
// Each task comes with a reason (why now) and instructions (how to do it).

// Standard action keys — used for backward compat with existing UI components
const STANDARD_KEYS = new Set(['water','fertilize','neem','prune','train','repot','worms','photo','visit']);

export async function fetchPlantBriefing(plant, careLog, weather, portraits, allPhotos = {}) {
  const today = localDate();
  const entries = careLog[plant.id] || [];
  const lastActionDate = entries.length ? localDate(entries[entries.length - 1].date) : 'none';
  const portrait = portraits?.[plant.id] || {};
  const currentStage = portrait.currentStage || null;
  const rainToken = weather?.forecast?.slice(0, 2).map(d => d.precipChance >= 60 ? '1' : '0').join('') ?? 'xx';

  // Find most recent photo for vision analysis (within last 14 days)
  const plantPhotos = (allPhotos[plant.id] || []).filter(ph => ph.dataUrl || ph.url);
  plantPhotos.sort((a, b) => new Date(b.date) - new Date(a.date));
  const recentPhoto = plantPhotos.length > 0 &&
    (Date.now() - new Date(plantPhotos[0].date).getTime()) < 14 * 86400000
    ? plantPhotos[0]
    : null;
  // Extract base64 from dataUrl, or fall back to public URL (after Supabase upload swaps dataUrl→url)
  const photoBase64 = recentPhoto?.dataUrl?.startsWith('data:')
    ? recentPhoto.dataUrl.split(',')[1]
    : null;
  const photoUrl = !photoBase64 && recentPhoto?.url ? recentPhoto.url : null;
  const photoToken = recentPhoto ? new Date(recentPhoto.date).getTime().toString().slice(-8) : 'nophoto';

  // v14: cache key includes photo token so briefing refreshes when a new photo arrives
  const cacheKey = `plantbrief14_${plant.id}_${plant.health}_${today}_${currentStage || 'ns'}_${rainToken}_${photoToken}`;

  const lastWater = [...entries].reverse().find(e => e.action === 'water' || e.action === 'rain');
  const daysSinceWater = lastWater ? Math.floor((Date.now() - new Date(lastWater.date).getTime()) / 86400000) : null;
  const lastWaterWasRain = lastWater?.action === 'rain';
  const recentActions = entries.slice(-8).map(e =>
    `${e.label || e.action} on ${new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
  ).join(', ');
  const visualNote = portrait.visualNote;
  const next3 = weather?.forecast?.slice(0, 3).map(d =>
    `${d.date}: ${d.label} ${d.high}°/${d.low}°F, ${d.precipChance}% rain`
  ).join('; ') ?? '';

  const systemPrompt = `You are a knowledgeable plant care advisor and teacher for Tucker and Emma's Brooklyn rooftop garden (Zone 7b, Park Slope). Tucker is actively learning to garden — he appreciates being taught things he hasn't done before.

For each plant, give a brief observation AND recommend 0–2 care tasks maximum that genuinely make sense RIGHT NOW. Usually 1 is enough. Only recommend 2 if both are truly time-sensitive.

You are NOT limited to a fixed menu. Recommend anything botanically appropriate:
- Standard care: water, fertilize, prune, neem oil, train/tie, repot, add worms
- Novel/educational tasks: deadhead spent flowers, remove a sucker, stake a leaning cane, thin crowded shoots at the base, check drainage holes, apply copper fungicide, layer a cane for propagation, pinch growing tips, remove winter dieback, cut back to an outward-facing bud, scratch-test a cane for life, mulch the container surface, etc.

At least occasionally include one task Tucker is unlikely to have done before — something specific to this species' care calendar. This is how he'll learn.

Rain rules (non-negotiable):
- Rain ≥60% chance today or tomorrow: do NOT recommend water or neem oil

Respond as JSON only — no other text:
{
  "note": "one specific observation about this plant right now, max 20 words",
  "health": "content",
  "waterDays": 2.5,
  "tasks": [
    {
      "key": "water",
      "label": "Water deeply at the base",
      "reason": "5 days since last water, new growth is active",
      "instructions": "Water slowly at the base for about 60 seconds until you see drainage. Spring root growth responds better to a deep soak than a quick splash — the roots are pushing down right now and you want to wet the full root zone.",
      "optional": false
    }
  ]
}

health: current health state — one of: thriving / content / recovering / thirsty / overlooked / struggling. Base this PRIMARY on the photo if one is provided — what the plant actually looks like is the most important signal. Use care history and watering data as context (e.g., browning + no water → thirsty; browning + over-watered → struggling). If no photo, base on care history and days since water.
waterDays: how many days this specific plant can realistically go between waterings right now, given its species, container size, current weather, and season. A succulent in a large terracotta pot on a cool day might be 7+. A small-potted climbing rose in 80°F heat might be 1. An in-ground rose in spring might be 4–5. Be specific to this plant's actual situation.

For standard actions use key: water / fertilize / neem / prune / train / repot / worms
For any novel or custom task use key: tend
The label should be specific, not generic ("Remove the crossing cane at the base" not just "Prune").
Instructions: 2–4 sentences, specific to this plant and moment. Include the why, not just the how.
Add "optional": true to any task that is educational or optional — something Tucker can skip this visit without harm. Add "optional": false (or omit) for tasks that genuinely need doing soon.`;

  const userPrompt = `Plant: ${plant.name}${plant.species ? ` (${plant.species})` : ''}, ${plant.type}.
Health: ${plant.health}. Today: ${today}. Zone 7b, early spring — day ${Math.max(0, Math.floor((Date.now() - new Date('2026-03-20').getTime()) / 86400000))} of season 2.
${plant.container ? `Growing situation: ${plant.container}.` : ''}
Current stage: ${currentStage || getPhenologicalStage(plant.type)}.
${daysSinceWater !== null ? `Last watered ${daysSinceWater} day${daysSinceWater !== 1 ? 's' : ''} ago${lastWaterWasRain ? ' (by rain)' : ''}.` : 'Never watered this season.'}
${recentActions ? `Recent care: ${recentActions}.` : 'No care logged this season.'}
${recentPhoto ? `Photo taken ${Math.floor((Date.now() - new Date(recentPhoto.date).getTime()) / 86400000)} day(s) ago — examine it carefully for leaf color, wilting, new growth, stress signs.` : (visualNote ? `Last photo observation: "${visualNote}"` : '')}
${next3 ? `3-day forecast: ${next3}` : ''}

What does this plant need right now?`;

  const raw = await cachedClaude(cacheKey, systemPrompt, userPrompt, 600, 24 * 60 * 60 * 1000, photoBase64, photoUrl);
  try {
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('no JSON');
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    const tasks = Array.isArray(parsed.tasks)
      ? parsed.tasks.filter(t => t && typeof t.label === 'string').slice(0, 2)
      : [];
    const VALID_HEALTH = new Set(['thriving','content','recovering','thirsty','overlooked','struggling']);
    return {
      note: typeof parsed.note === 'string' ? parsed.note : '',
      health: VALID_HEALTH.has(parsed.health) ? parsed.health : null,
      waterDays: typeof parsed.waterDays === 'number' && parsed.waterDays > 0 ? parsed.waterDays : null,
      tasks,
      // backward compat — existing components that use briefing.actions still work
      actions: tasks.map(t => t.key).filter(k => STANDARD_KEYS.has(k)),
    };
  } catch {
    return { note: '', health: null, waterDays: null, tasks: [], actions: [] };
  }
}

// ── DAILY AGENDA ──────────────────────────────────────────────────────────
// Single AI call for the full day's task list: ordered, with human reasons
// and a session time estimate. Replaces N per-plant fetchPlantBriefing calls
// for the Today tab. Cached client-side; busts on care, weather, portrait changes.
export async function fetchDailyAgenda({ candidateTasks, weather, careLog, portraits }) {
  if (!candidateTasks?.length) return { sessionMinutes: null, tasks: [] };

  const todayStr = localDate();
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
      `${e.label || e.action} ${new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
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
export async function fetchMorningBrief({ plants, careLog, weather, portraits, agendaTasks = [] }) {
  const today = localDate();
  const rainToken = weather?.forecast?.slice(0, 2).map(d => d.precipChance >= 60 ? '1' : '0').join('') ?? 'xx';
  // Invalidate when today's care changes — count of actions logged today
  const todayCareToken = Object.values(careLog).flat()
    .filter(e => e.date?.startsWith(today)).length;
  const taskToken = agendaTasks.filter(t => !t.optional).map(t => t.actionKey).join(',').slice(0, 60);
  // v7: removed todayCareToken — morning brief is frozen daily
  const cacheKey = `morningbrief7_${today}_${rainToken}_${taskToken}`;

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

  const requiredTasks = agendaTasks.filter(t => !t.optional);
  const taskSummary = requiredTasks.length
    ? requiredTasks.map(t => `${t.plantName}: ${t.label || t.actionKey}`).join('; ')
    : null;

  const systemPrompt = `You are the garden speaking to Tucker and Emma at the start of their day on the Brooklyn terrace. One sentence. Present tense. Weave in today's most important care task naturally if there is one — the sentence should read like a garden speaking, not a to-do list. When you reference a care action from today's task list, mark it inline like this: the lemon needs a [water] before the afternoon heat, or the rose has a cane to [prune] at the base. Use only these keys in brackets: water, fertilize, prune, neem, train, worms, repot, tend. Do not use brackets for general observations. Never generic, never a greeting. Do not mention plants already cared for today.`;

  const userPrompt = `Today: ${today}. Brooklyn Zone 7b, early spring.
${taskSummary ? `Today's care tasks: ${taskSummary}.` : needsWater.length ? `Needs water: ${needsWater.join(', ')}.` : 'Watering up to date.'}
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
  const today = localDate();
  const todayFull = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const rainToken = weather?.forecast?.slice(0, 2).map(d => d.precipChance >= 60 ? '1' : '0').join('') ?? 'xx';
  // Invalidate when today's care changes (same pattern as fetchMorningBrief)
  const todayCareToken = Object.values(careLog).flat().filter(e => e.date?.startsWith(today)).length;
  const taskToken = agendaTasks.map(t => t.label || t.actionKey).join(',').slice(0, 80);
  // v6: removed todayCareToken — daily brief is frozen daily
  const cacheKey = `dailybrief7_${today}_${rainToken}_${taskToken}`;

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

  // Today's tasks — use specific AI-generated labels and reasons when available
  const taskList = agendaTasks.length
    ? agendaTasks.map(t => {
        const label = t.label || t.actionKey;
        const parts = [`${t.plantName} — ${label}`];
        if (t.reason) parts.push(`(${t.reason})`);
        if (t.optional) parts.push('[optional]');
        return parts.join(' ');
      }).join('\n')
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
  "today": "1-3 sentences covering every required task from TODAY'S TASKS (skip completed ones and optional ones). For each care action you mention, embed its key in brackets inline: e.g. 'Give the lemon a [water] — soil is dry after five days' or 'The rose needs a [prune] to remove the crossing cane'. Use only these keys: water, fertilize, prune, neem, train, worms, repot, tend. Then in a final sentence mention any optional tasks lightly ('if you have time...'). If rain is coming adjust accordingly.",
  "watch": "1-2 sentences: one specific thing to monitor or anticipate in the next 7 days — pest emergence, weather window, phenological milestone, or timing decision.",
  "week": "2-3 sentences: what's coming biologically in the next 5-7 days — growth stages approaching transition, seasonal milestones, what the weather will do to the garden. No care actions — just what the plants and season will do on their own."
}`;

  const userPrompt = `Date: ${todayFull}. Brooklyn Zone 7b.
Current conditions: ${weather ? `${Math.round(weather.temp)}°F${weather.poem ? `, ${weather.poem}` : ''}` : 'unknown'}.
5-day forecast: ${forecast}
${rainSoon ? 'RAIN COMING: Do not recommend neem oil or watering.' : ''}
${todayCare.length ? `ALREADY DONE TODAY: ${todayCare.join(', ')}.` : 'Nothing logged yet today.'}

PLANT STATES:
${plantStates}

TODAY'S TASKS: ${taskList}

Write the daily briefing.`;

  try {
    const raw = await callClaude(systemPrompt, userPrompt, 500);
    // Extract the first {...} block regardless of any surrounding prose or code fences
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object in response');
    const parsed = JSON.parse(jsonMatch[0]);
    const data = {
      weather: parsed.weather || null,
      garden: parsed.garden || null,
      today: parsed.today || null,
      watch: parsed.watch || null,
      week: parsed.week || null,
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
  careEntries,          // [{ plantId, plantName, label, action, withEmma, loggedBy }]
  portraitObservations, // [{ plantId, plantName, visualNote, bloomState, foliageState, stage }]
  photoCount,           // total photos taken this day across all plants
  plantHistories,       // [{ plantName, recentCare: [{ label, date }] }] — care before this date
  brief = false,        // if true, 1–2 sentences (for map panel garden log)
}) {
  if (!careEntries.length && !portraitObservations.length) return null;

  const isToday = dateStr === localDate();
  const careCacheToken = careEntries.length;
  const portraitToken = portraitObservations
    .map(p => (p.visualNote || '').slice(0, 8))
    .join('').replace(/\W/g, '').slice(0, 16);
  const cacheKey = `journal${brief ? '_brief' : '3'}_${dateStr}_c${careCacheToken}_o${portraitToken}`;
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
- CRITICAL: Only describe actions that appear explicitly in the CARE ACTIONS list. Do not invent, infer, or embellish any action, treatment, spray, fertilizer application, or visit that is not listed there. This is a factual record.
- Only mention Emma if a care action is explicitly marked "(with Emma)". Do not assume Emma was present for anything that isn't marked that way.
- Do not infer time of day. Do not describe who took photos unless care entries specify it.
- Lead with the most interesting botanical thing: a phenological milestone (first buds, first blooms, new flush), a visible change, something worth noticing — not just listing what was done
- Weave care actions into the narrative naturally: "after fertilizing three weeks ago, the wisteria is now showing…"
- When care history shows a relevant action weeks before a current observation, connect them explicitly: "the first blooms appeared three weeks after the February fertilizing"
- If photoCount > 0, you may briefly note that photos were taken — but only say by whom if it's in the care log
- ${brief ? '1–2 sentences' : '2–4 sentences'}. Past tense. Warm and specific. No generic garden advice.
- Start mid-action or mid-observation — not with "Today" or the date
- Never use the words "journal," "entry," "log," or "overall"`;

  const userPrompt = `Date: ${dateLabel}.${isToday ? ' (mid-day — not yet over)' : ''}

CARE ACTIONS (journal is written for Tucker — use "you" for Tucker, "Emma" for Emma):
${careEntries.length
  ? careEntries.map(e => {
      // loggedBy is only present for in-session entries (Supabase-loaded entries lose it on reload).
      // Only say "Emma" or "you and Emma" when loggedBy is explicitly set — never guess from withEmma alone.
      const actor = e.loggedBy === 'emma' ? 'Emma'
        : (e.withEmma && e.loggedBy === 'tucker') ? 'you and Emma'
        : null; // null = journal defaults to "you"
      return `• ${e.plantName}: ${e.label}${actor ? ` [done by: ${actor}]` : ''}`;
    }).join('\n')
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
  // Include daysSinceWater in key so the voice updates as the plant gets more overdue
  const daysToken = daysSinceWater != null ? Math.floor(daysSinceWater) : 'unknown';
  const cacheKey = `missed_${plant.id}_${plant.health}_${daysToken}`;

  const systemPrompt = `You are the garden speaking directly to Tucker — gently, without judgment.
One plant has gone without care longer than it should have.
You are not scolding. You are reporting, the way a friend might say "hey, just so you know."
One sentence. Maximum ten words. No punctuation at the end.
Never use the words "overdue," "missed," "failed," or "neglected."`;

  const userPrompt = `Plant: ${plant.name}${plant.type ? ` (${plant.type})` : ''}.
Last watered: ${daysSinceWater != null ? `${daysSinceWater} days ago` : 'unknown'}.
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

// ── NOTE ACTION PARSER ────────────────────────────────────────────────────
// Detects explicit care actions in a free-text note.
// Returns [{ key, label }] — only actions the user says they actually completed.
export async function parseNoteActions(noteText, plantName) {
  const systemPrompt = `Parse a garden care note to find explicit completed actions. Return a JSON array. Each item: {"key": one of water/fertilize/neem/prune/train/repot/worms/tend, "label": short specific description of what was done}. Return [] for pure observations, questions, or future plans — only include things the user says they did.`;
  const userPrompt = `Plant: ${plantName || 'unknown'}\nNote: "${noteText || ''}"`;
  try {
    const raw = await callClaude(systemPrompt, userPrompt, 150);
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start === -1 || end === -1) return [];
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed.filter(a => a.key && a.label) : [];
  } catch {
    return [];
  }
}

// ── MAP CONDITION SYNTHESIS ───────────────────────────────────────────────
// Synthesizes a plant's general visual condition from 3-5 recent photos.
// Cached by plant ID + photo count so it only re-runs when new photos accumulate.
// Threshold: only synthesizes when photos.length >= 3 AND
//            photos.length >= (lastSynthCount + 2), to avoid jarring map updates.
export async function fetchMapCondition(plant, photoDataUrls) {
  const count = photoDataUrls.length;
  if (count < 3) return null;

  const cacheKey = `mapCond_${plant.id}_${count}`;
  const cached = lsGet(cacheKey);
  // Return cached result; null sentinel means a previous attempt failed — don't retry
  if (cached !== null) return cached.failed ? null : cached;

  try {
    const res = await fetch('/api/map-condition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plantName: plant.name,
        plantType: plant.type,
        imagesBase64: photoDataUrls.slice(-5), // most recent 5 (URLs or base64)
      }),
    });
    if (!res.ok) {
      lsSet(cacheKey, { failed: true }); // don't retry until photo count changes
      return null;
    }
    const condition = await res.json();
    if (condition && !condition.error) {
      lsSet(cacheKey, condition);
      return condition;
    }
    lsSet(cacheKey, { failed: true });
    return null;
  } catch {
    lsSet(cacheKey, { failed: true });
    return null;
  }
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

// ── ONE THING TO NOTICE ───────────────────────────────────────────────────
// A two-part structured observation: a short subject (the thing itself) +
// a pointed 1–2 sentence description. Cached daily.
// Returns: { subject: string, observation: string } or null on failure.
export async function fetchNoticeToday({ plants = [], portraits = {}, weather = null }) {
  const today = localDate();
  const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const lastPortrait = Object.values(portraits)
    .filter(p => p?.date && !p.analyzing)
    .map(p => p.date).sort().pop() ?? '';
  const portraitToken = lastPortrait ? lastPortrait.slice(0, 10).replace(/-/g, '') : '0';
  const weatherToken = weather
    ? `${Math.round(weather.temp ?? 0)}_${weather.forecast?.[0]?.precipChance ?? 0}_${weather.forecast?.[0]?.low ?? 0}`
    : 'noweather';
  const cacheKey = `noticetoday2_${today}_${weatherToken}_${portraitToken}`;

  const observations = Object.entries(portraits)
    .filter(([, p]) => p?.visualNote && p.date && !p.analyzing)
    .sort((a, b) => new Date(b[1].date) - new Date(a[1].date))
    .slice(0, 6)
    .map(([id, p]) => {
      const plant = plants.find(pl => pl.id === id);
      return plant ? `${plant.name}: ${p.visualNote}` : null;
    })
    .filter(Boolean);

  const frost = weather?.forecast?.[0]?.low <= 36;
  const frostTemp = weather?.forecast?.[0]?.low;
  const weatherLine = weather
    ? `${Math.round(weather.temp ?? 0)}°F now${weather.poem ? `, ${weather.poem}` : ''}.${frost ? ` Tonight's low: ${frostTemp}°F.` : ''}`
    : '';

  const systemPrompt = `You are observing a specific Brooklyn brownstone garden — a rooftop terrace with potted plants plus a small front garden with climbing roses and a magnolia. Zone 7b, early spring.

Respond with exactly two lines:
Line 1: The subject — 2 to 5 words, naming the specific thing to notice. No verb. Start with "The." Example: "The wisteria nodes." or "The magnolia bark."
Line 2: One or two sentences of exact, plain observation. Name specific sizes, colors, textures, or comparisons. No metaphors unless they're surprising and true. No words: beautiful, wonder, magic, delight, dance, whisper, breathe. If frost is coming tonight, mention what it will do to what you're describing — the plant mid-process, interrupted.

Do not explain. Do not advise. Just describe what is there.`;

  const userPrompt = `${dateLabel}. ${weatherLine}
${observations.length > 0 ? `Recent portrait observations:\n${observations.join('\n')}` : 'No recent photo observations — use seasonal knowledge of early spring in Brooklyn.'}

Two lines:`;

  const raw = await cachedClaude(cacheKey, systemPrompt, userPrompt, 120);
  if (!raw) return null;
  const lines = raw.trim().split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    return { subject: lines[0].replace(/\.$/, ''), observation: lines.slice(1).join(' ') };
  }
  // Fallback: treat whole response as observation with no subject
  return { subject: null, observation: raw.trim() };
}

// ── BRIEFING Q&A ───────────────────────────────────────────────────────────
// Live answer to a question Tucker asks via the briefing modal.
// Cached per question per day so the same question always returns the same answer.
export async function fetchBriefingAnswer({ question, plants = [], careLog = {}, weather = null, portraits = {}, briefings = {}, fullBrief = null }) {
  const today = localDate();
  const activePlants = plants.filter(p => p.health !== 'memorial' && p.type !== 'empty-pot' && !p.noTasks);

  const plantContext = activePlants.map(p => {
    const b = briefings?.[p.id];
    const note = (b && b !== 'loading' && b?.note) ? ` — "${b.note}"` : '';
    const entries = careLog[p.id] || [];
    const lastCare = entries.length
      ? new Date(entries[entries.length - 1].date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : 'no recent care';
    return `${p.name} (${p.type || 'plant'}, ${p.health || 'unknown'} health, last care ${lastCare})${note}`;
  }).join('\n');

  const briefContext = fullBrief ? [
    fullBrief.weather && `Weather context: ${fullBrief.weather}`,
    fullBrief.garden  && `Garden state: ${fullBrief.garden}`,
    fullBrief.today   && `Today's focus: ${fullBrief.today}`,
    fullBrief.watch   && `Watch: ${fullBrief.watch}`,
  ].filter(Boolean).join('\n') : '';

  const weatherDesc = weather ? `${Math.round(weather.temp)}°F — ${weather.poem || ''}` : '';
  const forecastStr = weather?.forecast?.slice(0, 4).map((d, i) => {
    const lbl = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : `Day ${i + 1}`;
    return `${lbl}: ${d.high}°/${d.low}°, ${d.label}, ${d.precipChance}% rain`;
  }).join('; ') ?? '';

  const cacheKey = `briefing_qa_v1_${today}_${question.trim().replace(/\W+/g, '_').slice(0, 50)}`;

  const systemPrompt = `You are the garden oracle for Tucker's Brooklyn rooftop garden (Zone 7b, Park Slope). Tucker is an enthusiastic beginner gardener learning deeply about plants. Answer his question in 2-4 engaging, scientifically-grounded sentences. Reference his actual plants by name when relevant. Be specific and fascinating — help him understand the biology, not just the action. Do NOT give generic advice. Write in second person ("your wisteria is...").`;

  const userPrompt = `Today: ${today}. ${weatherDesc}
${forecastStr ? `Forecast: ${forecastStr}` : ''}

Plants in Tucker's garden:
${plantContext}

${briefContext ? `Today's brief:\n${briefContext}` : ''}

Tucker asks: ${question.trim()}`;

  return cachedClaude(cacheKey, systemPrompt, userPrompt, 280, 24 * 60 * 60 * 1000);
}
