// GET /api/admin   admin session (Authorization: Bearer, or cookie)
// Full client index for admin.html. The key is checked server-side, so unlike the
// old client-side passcode this actually withholds the data.

const { getIndex, cors } = require('../lib/github');
const ibo = require('../lib/ibo');

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  /* Signed in as admin (the login on the report pages and the github.io pages). The old
     ADMIN_KEY is no longer accepted: it had been published in this repo's history. */
  if (!ibo.fromRequest(req)) {
    return res.status(401).json({ error: 'Sign in as admin first.' });
  }

  try {
    const index = await getIndex();
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(index);
  } catch (err) {
    console.error('admin index failed:', err);
    /* Say which failure this is. "0 clients" and "we cannot reach the store" look
       identical on the page otherwise, and the first one is a lie. */
    if (err && err.storeUnreachable) {
      return res.status(502).json({
        error: 'Cannot reach the report store. This is usually an expired GITHUB_TOKEN on the server, not missing data. Your reports are safe.',
        detail: err.message
      });
    }
    return res.status(500).json({ error: 'Could not load the index.' });
  }
};
