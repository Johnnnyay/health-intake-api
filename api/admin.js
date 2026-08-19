// GET /api/admin   header: x-admin-key
// Full client index for admin.html. The key is checked server-side, so unlike the
// old client-side passcode this actually withholds the data.

const crypto = require('crypto');
const { getIndex, cors } = require('../lib/github');

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const expected = process.env.ADMIN_KEY;
  if (!expected) return res.status(500).json({ error: 'ADMIN_KEY is not configured on the server.' });

  const given = req.headers['x-admin-key'] || req.query.key || '';
  if (!safeEqual(given, expected)) {
    return res.status(401).json({ error: 'Wrong passcode.' });
  }

  try {
    const index = await getIndex();
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(index);
  } catch (err) {
    console.error('admin index failed:', err);
    return res.status(500).json({ error: 'Could not load the index.' });
  }
};
