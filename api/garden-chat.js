// api/garden-chat.js — Live garden oracle chat for single-plant sessions
// Used during "help me do it" and "I did it + photo" flows.
// Streams SSE (same pattern as oracle-chat.js).
// Accepts photos embedded in messages — they are ephemeral and never persisted.
const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'No API key' });

  const {
    messages = [],       // [{role, content, images?: string[]}]
    plantContext = {},   // {name, species, type, health, container, visualNote, stage, careHistory}
    action = '',         // label of care action being performed
  } = req.body || {};

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const recentCare = (plantContext.careHistory || []).slice(0, 5)
    .map(e => `${e.label} ${new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`)
    .join(', ');

  const system = `You are a practical garden advisor helping Tucker tend his Brooklyn rooftop terrace (Zone 7b). You're a knowledgeable friend — direct, specific, zero fluff.

Plant: ${plantContext.name}${plantContext.species ? ` (${plantContext.species})` : ''}
Health: ${plantContext.health || 'unknown'} · Container: ${plantContext.container || 'pot'}
Current phenological stage: ${plantContext.stage || 'unknown'}
${plantContext.visualNote ? `Last observed: ${plantContext.visualNote}` : ''}
${recentCare ? `Recent care: ${recentCare}` : ''}
${action ? `\nTucker is performing: ${action}` : ''}

Rules:
- Be concise: 2–4 sentences unless steps genuinely need more
- Give exact instructions for this specific plant in this specific container at this stage
- When you see a photo, describe exactly what you see and what to do next — no generalities
- No markdown formatting, no bullet points in responses, just clear prose
- If something looks wrong in a photo, say so plainly`;

  // Convert messages to Claude format, handling embedded images
  const claudeMessages = messages.map(m => {
    if (m.images?.length) {
      return {
        role: m.role,
        content: [
          ...m.images.map(img => ({
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: img.replace(/^data:image\/\w+;base64,/, ''),
            },
          })),
          { type: 'text', text: m.content || '' },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system,
      messages: claudeMessages,
    });

    stream.on('text', text => {
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    await stream.finalMessage();
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('garden-chat error:', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
};
