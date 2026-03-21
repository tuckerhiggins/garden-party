// api/daily-agenda.js — Single-call daily garden dispatch
// Accepts a pre-filtered candidate task list from the client,
// returns AI-ordered tasks with human reasons + session time estimate.
// Client caches the result; cache busts on care events, weather changes, portrait updates.
const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'No API key' });

  const {
    candidateTasks = [],   // [{ plantId, plantName, type, health, actionKey, rulePriority, daysSinceWater, daysSinceAction, recentCare, visualNote, currentStage }]
    weather = {},
    today = '',
    isWeekend = false,
  } = req.body || {};

  if (!candidateTasks.length) return res.json({ sessionMinutes: null, tasks: [] });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const forecastStr = weather?.forecast?.slice(0, 3).map(d =>
    `${d.date}: ${d.label} ${d.high}°/${d.low}°F, ${d.precipChance}% rain`
  ).join('; ') || 'forecast unavailable';

  const taskLines = candidateTasks.map((t, i) => {
    const lines = [
      `${i + 1}. ${t.plantName.toUpperCase()}${t.species ? ` (${t.species})` : ''} — ${t.actionKey}`,
      `   Health: ${t.health}. Rule priority: ${t.rulePriority}.`,
    ];
    if (t.daysSinceWater != null) lines.push(`   Last watered: ${t.daysSinceWater} day${t.daysSinceWater !== 1 ? 's' : ''} ago.`);
    if (t.daysSinceAction != null && t.actionKey !== 'water') lines.push(`   Last ${t.actionKey}: ${t.daysSinceAction} days ago.`);
    if (t.recentCare) lines.push(`   Recent care: ${t.recentCare}.`);
    if (t.visualNote) lines.push(`   Last observed: "${t.visualNote}"`);
    if (t.currentStage) lines.push(`   Stage: ${t.currentStage}.`);
    return lines.join('\n');
  }).join('\n\n');

  const system = `You are the intelligence behind a daily garden dispatch for Tucker and Emma's Brooklyn rooftop terrace (Zone 7b). Deterministic rules have already filtered this list to plants that genuinely need attention today. Your job:

1. Write a plain-English reason for each task (1 sentence, 10–18 words, specific to this plant right now)
2. Confirm or adjust the priority tier if the rules got it wrong
3. Order tasks as Tucker should do them — urgent first, then most time-sensitive
4. Estimate total session time in minutes

Rules for reasons:
- "The rosemary has been dry five days and the morning window closes before midday heat" ✓
- "Overdue by cooldown threshold" ✗ (that's a rule string, not a reason)
- Factor rain: if ≥60% chance today/tomorrow, mention why that changes advice
- Reference visual observations when they change the recommendation
- Be specific, direct, zero fluff

Time estimates per action: water 2–3 min/plant, prune 8–12 min, train 5–8 min, fertilize 3–4 min, neem 5–7 min, repot 15–20 min, worms 3 min.

Respond as JSON only — no other text:
{"sessionMinutes": <number>, "tasks": [{"plantId": "...", "actionKey": "...", "priority": "urgent|recommended|routine", "reason": "..."}]}

Tasks must appear in the order Tucker should do them. Omit any task you're genuinely unsure about.`;

  const userPrompt = `Today: ${today}${isWeekend ? ' (weekend — routine tasks included)' : ' (weekday — urgent + recommended only)'}.
3-day forecast: ${forecastStr}

Tasks to review:

${taskLines}

Write the dispatch.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = message.content[0].text.trim();
    const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(clean);

    res.json({
      sessionMinutes: typeof parsed.sessionMinutes === 'number' ? parsed.sessionMinutes : null,
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks.filter(t => t.plantId && t.actionKey) : [],
    });
  } catch (err) {
    console.error('daily-agenda error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
