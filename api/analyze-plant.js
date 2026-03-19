// api/analyze-plant.js — Vision analysis + botanical portrait generation
// Receives full plant context (care history, past visual notes, plant bio)
// so Claude can interpret the photo with complete knowledge of the plant's season
const Anthropic = require('@anthropic-ai/sdk');

function fmtCareEntry(e) {
  const d = new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${d}: ${e.label}${e.withEmma ? ' (with Emma)' : ''}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const {
    imageBase64,
    plantName, plantType, plantSpecies,
    today,
    careLog = [],        // array of care entries for this plant, recent-first
    plantHistory = [],   // array of { visualNote, growth, date } from past analyses
    plantContext = {},   // { health, container, poem, lore, special }
  } = req.body || {};

  if (!imageBase64 || !plantName) return res.status(400).json({ error: 'Missing required fields' });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });

  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build care history section
  const recentCare = careLog.slice(0, 20);
  const careSection = recentCare.length > 0
    ? `\nCARE HISTORY (most recent first):\n${recentCare.map(fmtCareEntry).join('\n')}`
    : '\nNo care logged yet this season.';

  // Build past visual notes section (the "memory window")
  const historySection = plantHistory.length > 0
    ? `\nPAST OBSERVATIONS (chronological):\n${plantHistory.map(h => {
        const d = new Date(h.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        return `${d} (growth ${Math.round((h.growth ?? 0) * 100)}%): ${h.visualNote}`;
      }).join('\n')}`
    : '';

  // Build plant biography section
  const bioLines = [];
  if (plantContext.health) bioLines.push(`Current health state: ${plantContext.health}`);
  if (plantContext.container) bioLines.push(`Container: ${plantContext.container}`);
  if (plantContext.special === 'wedding') bioLines.push(`Special: wedding gift for Emma`);
  if (plantContext.special === 'gift') bioLines.push(`Special: gift from a friend`);
  if (plantContext.poem) bioLines.push(`Plant poem: "${plantContext.poem.slice(0, 120)}"`);
  if (plantContext.lore) bioLines.push(`Lore: ${plantContext.lore}`);
  const bioSection = bioLines.length > 0 ? `\nPLANT BIOGRAPHY:\n${bioLines.join('\n')}` : '';

  const systemPrompt = `You are a botanical illustrator and plant expert who has been following Tucker and Emma's Brooklyn rooftop terrace garden all season. You know each plant's full history — its care, its struggles, its recoveries.

When you see a new photo, you interpret it in the context of everything you already know. You notice when a plant that was brown last month is now green. You recognize new growth after fertilizing. You can tell when a plant is recovering or declining relative to its last observation.

You produce two things:
1. A structured observation that synthesizes the photo with the plant's known history
2. An SVG botanical illustration showing the plant's actual current state

Illustration style:
- Warm botanical field guide — Miyazaki/Studio Ghibli soft palette
- Background: light cream/parchment (#f8f0e0 or similar)
- Include the planter/container if visible
- Show ACTUAL state — dormant means bare canes, budding means tight buds, don't draw what you don't see
- Warm naturalistic palette: greens (#4a7030, #6a9040), browns (#8a6040, #6a4828), reds (#c03058, #e84070), purples (#9860c8)
- 30-60 SVG elements, clean and purposeful
- SVG must have: viewBox="0 0 240 180" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%"`;

  const userPrompt = `Plant: ${plantName}${plantSpecies ? ` (${plantSpecies})` : ''}, ${plantType}
Location: Brooklyn rooftop terrace, Zone 7b
Today: ${today || new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
${bioSection}${careSection}${historySection}

Now look at this new photo. Use everything above to interpret what you see. Note changes relative to past observations. Explain what the care history might have caused in what you're seeing now.

Respond in EXACTLY this format with nothing outside the tags:

<analysis>
{"growth": 0.XX, "visualNote": "One specific sentence that synthesizes what you see in the photo with what you know about this plant's recent history", "bloomState": "dormant|budding|opening|peak|fading", "foliageState": "bare|sparse|leafing|full"}
</analysis>
<portrait>
[Full SVG element here — start with <svg and end with </svg>]
</portrait>

Rules:
- growth: 0.0 = fully dormant/bare, 1.0 = peak bloom/full canopy
- visualNote must reference something from this specific photo AND something from the history when relevant (e.g. "The new growth since fertilizing Mar 7 is visible in the top laterals — about 4cm of fresh green shoot")
- SVG portrait captures actual state seen in photo, not an idealized or generic version`;

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

    const analysisMatch = text.match(/<analysis>([\s\S]*?)<\/analysis>/);
    let analysis = {};
    if (analysisMatch) {
      try { analysis = JSON.parse(analysisMatch[1].trim()); } catch {}
    }

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
