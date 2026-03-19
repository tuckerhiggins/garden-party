// Verifies a PIN server-side and returns the role.
// PINs are stored in Vercel env vars — never exposed to the client.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pin } = req.body || {};
  if (!pin) return res.status(400).json({ error: 'Missing PIN' });

  if (pin === process.env.TUCKER_PIN) return res.json({ role: 'tucker' });
  if (pin === process.env.EMMA_PIN)   return res.json({ role: 'emma' });

  return res.status(401).json({ error: 'Wrong PIN' });
};
