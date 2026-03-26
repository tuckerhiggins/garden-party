// api/map-condition.js — Synthesize plant condition from 3-5 recent photos for map display
// Averages across multiple photos to capture typical appearance, not a single moment.
const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { plantName, plantType, imagesBase64 = [] } = req.body || {};
  if (!plantName || !imagesBase64.length) return res.status(400).json({ error: 'Missing fields' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build image content blocks — support both base64 dataUrls and public HTTP URLs
  const imageContent = imagesBase64.slice(0, 5).map(s => {
    if (s.startsWith('http://') || s.startsWith('https://')) {
      return { type: 'image', source: { type: 'url', url: s } };
    }
    const b64 = s.replace(/^data:image\/\w+;base64,/, '');
    return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } };
  });

  const systemPrompt = `You are analyzing ${imageContent.length} recent photos of a ${plantType} named "${plantName}" to synthesize its general current condition for a garden map display. Average across all photos to capture consistent, typical appearance — ignore transient moments.

Return JSON only:
{
  "leafCoverage": "sparse" | "moderate" | "lush",
  "bloomStatus": "none" | "budding" | "blooming" | "peak" | "fading",
  "healthSignal": "stressed" | "fair" | "good" | "excellent",
  "colorNote": "one-word dominant color (e.g. green, purple, pink, bronze)"
}`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 120,
      system: systemPrompt,
      messages: [{ role: 'user', content: [
        ...imageContent,
        { type: 'text', text: `Synthesize the condition of ${plantName} across these ${images.length} photos.` },
      ]}],
    });
    const raw = message.content[0].text.trim();
    const condition = JSON.parse(raw.replace(/```json|```/g, '').trim());
    res.json(condition);
  } catch (err) {
    console.error('map-condition error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
