// api/advise-plant.js — Oracle shopping advisory via Claude Vision
// Tucker takes a photo at the farmer's market; Claude identifies + advises
const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageBase64, gardenContext = {} } = req.body || {};
  if (!imageBase64) return res.status(400).json({ error: 'Missing imageBase64' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const { existingPlants = [], availableContainers = [], weather, season } = gardenContext;

  const containersDesc = availableContainers.length > 0
    ? availableContainers.map(c => `• ${c.name}: ${c.container}`).join('\n')
    : 'No empty containers currently available — would need a new one.';

  const existingDesc = existingPlants.length > 0
    ? existingPlants.map(p => `${p.name} (${p.type})`).join(', ')
    : 'none yet';

  const systemPrompt = `You are the garden oracle for Tucker and Emma's Brooklyn rooftop terrace — Zone 7b, 5th floor, mostly full sun on the south and east walls, partial shade on the fence wall. Tucker is at a farmer's market or nursery and wants to know whether to buy this plant.

Be direct and fact-intensive. Identify the plant, assess its fit for this specific terrace, and give a clear recommendation. Lead with the most important facts. No more than 3 sentences.

Respond in EXACTLY this format with nothing outside the tags:

<identification>
{"name": "Common Name", "species": "Genus species or cultivar if identifiable", "type": "climbing-rose|rose|hydrangea|lavender|wisteria|fern|herb|annual|succulent|shrub|vine|bulb|tree|grass|other", "color": "#hexcolor"}
</identification>
<advice>
[First sentence: what you're looking at — species, cultivar if visible, key trait. Second sentence: zone 7b compatibility, sun and water needs vs. this rooftop terrace, and whether it will actually thrive here. Third sentence: which of the available containers would suit it best (or whether it needs a new one), and a clear get-it / skip-it signal with one-word reason.]
</advice>`;

  const userPrompt = `Tucker is considering buying this plant at the market.

TERRACE CONTEXT:
${season || 'Season 2, late March, Zone 7b Brooklyn rooftop'}
Existing plants: ${existingDesc}
Current weather: ${weather || 'mild'}

AVAILABLE EMPTY CONTAINERS:
${containersDesc}

Identify the plant and advise.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
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

    const idMatch = text.match(/<identification>([\s\S]*?)<\/identification>/);
    let identification = {};
    if (idMatch) {
      try { identification = JSON.parse(idMatch[1].trim()); } catch {}
    }

    const adviceMatch = text.match(/<advice>([\s\S]*?)<\/advice>/);
    const advice = adviceMatch ? adviceMatch[1].trim() : 'Unable to analyze this photo.';

    res.json({ identification, advice });
  } catch (err) {
    console.error('advise-plant error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
