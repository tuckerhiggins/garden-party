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
    plantContext = {},   // {name, species, type, health, container, visualNote, stage, careHistory, forecast}
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
${plantContext.forecast ? `3-day forecast: ${plantContext.forecast}` : ''}
${action ? `\nTucker is performing: ${action}` : ''}

Rules:
- Be concise: 2–4 sentences unless steps genuinely need more
- Give exact instructions for this specific plant in this specific container at this stage
- When you see a photo, describe exactly what you see and what to do next — no generalities
- No markdown formatting, no bullet points in responses, just clear prose
- If something looks wrong in a photo, say so plainly
- If rain ≥60% is forecast in the next 24h, factor that into any watering or neem oil advice
\nOptional capabilities — use when they genuinely add value:\n- Photo request: if a specific visual would meaningfully change your advice, ask for it. Embed <photo-request>exactly what to photograph — e.g. "the soil surface near the crown" or "the cut you just made"</photo-request> anywhere in your response.\n- Diagram: for steps where a visual clarifies the action (where to cut, which cane to train, how deep), add a simple SVG diagram AFTER all your text using <diagram>[SVG]</diagram>. Style: viewBox="0 0 220 140", warm parchment background (#f8f0e0), warm strokes (#6a4020 stems, #487820 foliage, #d4a830 highlights), clean instructional lines, arrows showing direction or cut points. 15–35 elements, no text elements, no scripts.`;

  // Convert messages to Claude format, handling embedded images.
  // Only the LAST message that has images gets them sent — older image messages
  // are stripped to text to keep the payload under Vercel's 4.5MB body limit.
  const lastImgIdx = messages.reduce((last, m, i) => m.images?.length ? i : last, -1);
  const claudeMessages = messages.map((m, i) => {
    if (m.images?.length) {
      if (i === lastImgIdx) {
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
      // Older image message — keep text only to avoid payload bloat
      return { role: m.role, content: `${m.content || ''}${m.images.length ? ' [photo]' : ''}` };
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
