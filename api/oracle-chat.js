// Oracle Chat — streaming Claude endpoint for the conversational garden oracle
const Anthropic = require('@anthropic-ai/sdk');

function buildSystem(ctx) {
  const today = ctx.today || new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const plantsDesc = (ctx.plants || []).map(p => {
    const parts = [`• ${p.name} (${p.type}) — health: ${p.health}`];
    if (p.container) parts.push(`container: ${p.container}`);
    if (p.lastWatered) parts.push(`last watered: ${p.lastWatered}`);
    if (p.growth != null) parts.push(`growth: ${Math.round(p.growth * 100)}%`);
    if (p.poem) parts.push(`spirit: "${p.poem.slice(0, 60).replace(/\n/g, ' ')}..."`);
    return parts.join(', ');
  }).join('\n');

  const seasonStatus = ctx.seasonOpen === false
    ? `SEASON NOT YET OPEN — blocking condition: ${ctx.seasonBlocking || 'unknown'}`
    : 'Season 2 is open.';

  const forecastSection = ctx.forecast
    ? `\n10-DAY FORECAST:\n${ctx.forecast}\nUpcoming rain days: ${ctx.rainDays}`
    : '';

  return `You are a knowledgeable garden companion for Tucker and Emma's Brooklyn rooftop terrace. Part botanist, part mission control. You know these specific plants by name and exactly where they are in the season.

Today: ${today}. Brooklyn Zone 7b — late March means soil temps climbing through 45–50°F, roses breaking dormancy, wisteria buds swelling, root activity picking up underground.
${seasonStatus}
Current conditions: ${ctx.weather || 'unknown'}.
${forecastSection}
Warmth meter: ${ctx.warmth || 0} points earned this season.
Emma is Tucker's partner. Cookie is the neighborhood cat who visits.

PLANTS ON THE TERRACE:
${plantsDesc}

GUIDELINES:
- Use the 10-day forecast actively — if rain is coming, say so for watering/neem/fertilizer timing
- Don't tell Tucker to water before rain. Don't tell him to apply neem oil if rain is within 24h (it'll wash off)
- Be specific to these plants and this terrace
- Think about what's actually happening biologically right now: soil, roots, buds
- Tone: direct, warm, expert. Grounded and specific, not atmospheric
- 2–4 sentences unless a how-to genuinely needs more steps
- If you don't know something, say so honestly`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const { messages, gardenContext } = req.body || {};

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: buildSystem(gardenContext || {}),
      messages: messages || [],
    });

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    await stream.finalMessage();
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
};
