// POST /api/identify-plant
// Receives a photo + plant list, returns ranked matches via Claude vision.
const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageBase64, mimeType = 'image/jpeg', plants = [] } = req.body || {};
  if (!imageBase64 || !plants.length) {
    return res.status(400).json({ error: 'Missing imageBase64 or plants', matches: [] });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const plantList = plants.map((p, i) =>
    `${i + 1}. id="${p.id}" — ${p.name}` +
    (p.subtitle ? ` (${p.subtitle})` : '') +
    ` [${p.type}]` +
    (p.gardenSection ? `, ${p.gardenSection}` : '')
  ).join('\n');

  const prompt = `You are identifying a plant photographed in a Brooklyn rooftop garden.

The garden contains:
${plantList}

Examine the photo carefully. Return a JSON array of up to 3 best-matching plants, best first:

[
  { "plantId": "exact-id", "confidence": "high", "reason": "brief visual reason" },
  { "plantId": "another-id", "confidence": "medium", "reason": "brief visual reason" }
]

Rules:
- Only use IDs from the list above
- confidence: "high" | "medium" | "low"
- reason: one short visual observation (leaf shape, color, flower, bark, etc.)
- If the image is unclear or ambiguous, include up to 3 options
- Return ONLY valid JSON, nothing else`;

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mimeType, data: imageBase64 } },
          { type: 'text', text: prompt },
        ],
      }],
    });

    const text = response.content[0]?.text || '[]';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    const raw = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    const plantMap = new Map(plants.map(p => [p.id, p]));
    const matches = raw
      .filter(m => plantMap.has(m.plantId))
      .slice(0, 3)
      .map(m => ({
        plantId: m.plantId,
        confidence: m.confidence,
        reason: m.reason,
        name: plantMap.get(m.plantId).name,
        type: plantMap.get(m.plantId).type,
        health: plantMap.get(m.plantId).health,
        subtitle: plantMap.get(m.plantId).subtitle || null,
      }));

    return res.json({ matches });
  } catch (err) {
    console.error('identify-plant error:', err);
    return res.status(500).json({ error: err.message, matches: [] });
  }
};
