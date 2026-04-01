// POST /api/quicklog
// Parses natural-language garden care notes into structured care actions.
const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, plants = [], history = [] } = req.body || {};
  if (!text || !plants.length) {
    return res.status(400).json({ error: 'Missing text or plants' });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const today = new Date().toISOString().split('T')[0];

  const plantList = plants.map(p =>
    `  id="${p.id}" name="${p.name}"${p.subtitle ? ` (${p.subtitle})` : ''} type="${p.type}"` +
    ` section="${p.gardenSection || 'Terrace'}" actions=[${(p.actions || []).join(',')}]`
  ).join('\n');

  const systemPrompt = `You parse natural-language garden care notes into structured actions for a Brooklyn garden app.

SPATIAL ALIASES:
- "terrace" / "upstairs" / "the roof" / "up top" = rooftop terrace plants
- "downstairs" / "front" / "out front" / "Emma's garden" / "the rose garden" / "street" = Emma's Rose Garden (section="Emma's Rose Garden")
- "the roses" in front-garden context = all dko-* plants
- "the wisterias" = wisteria-l and wisteria-r
- "the hydrangeas" = hydrangea-1 through hydrangea-4
- "the climbing roses" / "the zephirines" = zephy-l and zephy-r
- "all the roses" with no location = ask which area

VALID ACTION KEYS:
water, rain, neem, prune, train, fertilize, photo, visit, note, tend, shelter

DATE PARSING (today = ${today}):
- "yesterday" → day before today
- "this morning" / "earlier today" → today
- "last week" → 7 days ago
- No date mentioned → today

PLANT LIST:
${plantList}

RULES:
1. Return { "actions": [...] } when you can confidently parse the note.
2. Return { "clarifications": [{ "question": "..." }] } when genuinely ambiguous — one question max.
3. Each action: { "plantId": "exact-id", "actionKey": "key", "customLabel": "optional override", "isoDate": "YYYY-MM-DD or omit for today" }
4. Only use plant IDs from the list. Only use valid action keys.
5. A plant can only receive each actionKey once per entry — no duplicates.
6. "neemed" → neem, "watered" → water, "pruned" → prune, "fertilized" → fertilize, "trained" / "tied" → train, "covered" / "sheltered" → shelter
7. Return ONLY valid JSON — no markdown, no explanation.`;

  const messages = [
    ...history,
    { role: 'user', content: text },
  ];

  try {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system: systemPrompt,
      messages,
    });

    const raw = response.content[0]?.text || '{}';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    if (parsed.actions) {
      const plantMap = new Map(plants.map(p => [p.id, p]));
      const validKeys = new Set(['water','rain','neem','prune','train','fertilize','photo','visit','note','tend','shelter']);
      const seen = new Set();
      const filtered = (parsed.actions || []).filter(a => {
        const key = `${a.plantId}:${a.actionKey}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return plantMap.has(a.plantId) && validKeys.has(a.actionKey);
      });
      return res.json({ actions: filtered });
    }

    if (parsed.clarifications) {
      return res.json({ clarifications: parsed.clarifications });
    }

    return res.json({ actions: [] });
  } catch (err) {
    console.error('quicklog error:', err);
    return res.status(500).json({ error: err.message });
  }
};
