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

  return `You are the Garden Oracle — a wise, warm presence who knows Tucker and Emma's Brooklyn rooftop terrace garden intimately. You speak as an expert gardener who also knows these specific plants by name and personality.

Today: ${today}. Season 2 — the growing season just opened March 20, 2026.
Weather: ${ctx.weather || 'unknown'}.
Warmth meter: ${ctx.warmth || 0} points earned this season.
Emma is Tucker's partner. Cookie is the neighborhood cat who visits.

PLANTS ON THE TERRACE:
${plantsDesc}

GUIDELINES:
- Answer questions specifically about these plants and this terrace, not generic gardening advice
- If Tucker asks "should I water today?", look at what's thirsty or overdue, not generically
- Keep answers to 2–4 sentences unless a how-to genuinely needs more steps
- Be warm, knowledgeable, slightly literary — never clinical or listy unless asked
- Never use the word "garden" — say "the terrace" or refer to plants by name
- If you don't know something, say so honestly
- You can ask follow-up questions if you need more context`;
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
