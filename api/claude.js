// api/claude.js — Vercel serverless function
// Proxies Claude API calls so the API key stays server-side
// Set ANTHROPIC_API_KEY in Vercel project environment variables

const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  // CORS for local dev
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { systemPrompt, userPrompt, maxTokens = 200, imageBase64, imageMimeType, imageUrl } = req.body || {};

  if (!systemPrompt || !userPrompt) {
    return res.status(400).json({ error: 'Missing systemPrompt or userPrompt' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let userContent = userPrompt;
  if (imageBase64) {
    userContent = [
      { type: 'image', source: { type: 'base64', media_type: imageMimeType || 'image/jpeg', data: imageBase64 } },
      { type: 'text', text: userPrompt },
    ];
  } else if (imageUrl) {
    userContent = [
      { type: 'image', source: { type: 'url', url: imageUrl } },
      { type: 'text', text: userPrompt },
    ];
  }

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    });
    res.json({ text: message.content[0].text.trim() });
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
