// api/analyze-plant.js — Vision analysis + botanical portrait generation
const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageBase64, plantName, plantType, plantSpecies, today } = req.body || {};
  if (!imageBase64 || !plantName) return res.status(400).json({ error: 'Missing required fields' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  // Strip data URL prefix if present
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are a botanical illustrator and plant health expert working with Garden Party, a garden tracking app for a Brooklyn rooftop terrace.

You analyze real garden photos and produce two things:
1. A structured JSON assessment of the plant's current state
2. An SVG botanical illustration that represents exactly what you see in the photo

Illustration style guidelines:
- Warm botanical field guide style — Miyazaki/Studio Ghibli-inspired, soft and naturalistic
- Background: light cream/parchment wash (use #f8f0e0 or similar for the base rect)
- Include the planter, pot, or container if visible in the photo
- Show the actual state of the plant — if dormant draw bare canes, if budding draw small tight buds, do NOT draw imagined open flowers if you don't see them
- Warm naturalistic palette: greens (#4a7030, #6a9040), browns (#8a6040, #6a4828), reds (#c03058, #e84070), purples (#9860c8), blues (#9ab8d0)
- Clean, purposeful SVG elements — 30-60 elements total
- The SVG must have: viewBox="0 0 240 180" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%"
- Plant should fill most of the canvas. Background subtle, plant is the subject.`;

  const userPrompt = `This is a photo of ${plantName}${plantSpecies ? ` (${plantSpecies})` : ''}, a ${plantType} on a Brooklyn rooftop terrace in Zone 7b.
Today's date: ${today || new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}.

Look at this photo carefully. Describe what you actually see — the plant's real current state, not what it typically looks like.

Respond in EXACTLY this format with nothing outside the tags:

<analysis>
{"growth": 0.XX, "visualNote": "One specific sentence describing what you literally observe in this photo", "bloomState": "dormant|budding|opening|peak|fading", "foliageState": "bare|sparse|leafing|full"}
</analysis>
<portrait>
[Full SVG element here, starting with <svg and ending with </svg>]
</portrait>

Rules:
- growth: 0.0 = fully dormant/bare canes, 1.0 = peak bloom or full dense canopy
- visualNote must be specific to THIS photograph — actual details you see, not generic plant descriptions
- The SVG portrait must accurately represent what you see, not an idealized version`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: base64Data },
          },
          { type: 'text', text: userPrompt },
        ],
      }],
    });

    const text = message.content[0].text;

    // Parse analysis JSON
    const analysisMatch = text.match(/<analysis>([\s\S]*?)<\/analysis>/);
    let analysis = {};
    if (analysisMatch) {
      try { analysis = JSON.parse(analysisMatch[1].trim()); } catch {}
    }

    // Parse SVG portrait
    const portraitMatch = text.match(/<portrait>([\s\S]*?)<\/portrait>/);
    let svg = null;
    if (portraitMatch) {
      const raw = portraitMatch[1].trim();
      if (raw.startsWith('<svg')) svg = raw;
    }

    res.json({ analysis, svg });
  } catch (err) {
    console.error('analyze-plant error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
