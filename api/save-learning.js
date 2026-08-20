// POST /api/save-learning
// Commits the Learning & Teaching content back into the diamond-hq repo so edits
// made in the hub outlive the browser they were typed in. Guarded by EDIT_KEY.

const crypto = require('crypto');
const { ghRequest, cors } = require('../lib/github');

const HUB_REPO = process.env.HUB_REPO || 'Johnnnyay/diamond-hq';
const PATH = (t) => 'data/learning-' + t + '.json';

function safeEqual(a, b) {
  const ab = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const expected = process.env.EDIT_KEY;
  if (!expected) return res.status(500).json({ error: 'EDIT_KEY is not configured on the server.' });
  if (!safeEqual(req.headers['x-edit-key'] || '', expected)) {
    return res.status(401).json({ error: 'Wrong edit key.' });
  }

  const body = req.body;
  if (!body || !body.tab || !/^[a-z0-9-]{1,32}$/.test(body.tab) || !Array.isArray(body.chapters)) {
    return res.status(400).json({ error: 'Expected { tab, title, chapters[] }.' });
  }
  const chapters = body.chapters.length;
  if (chapters === 0) return res.status(400).json({ error: 'Refusing to save: no chapters in the payload.' });
  const path = PATH(body.tab);

  try {
    const head = await ghRequest('GET', path, null, HUB_REPO);
    const sha = head.status === 200 ? head.data.sha : undefined;
    body.savedAt = new Date().toISOString(); body.savedFrom = 'hub';

    const put = await ghRequest('PUT', path, {
      message: 'Learning & Teaching: ' + body.tab + ' edited in the hub',
      content: Buffer.from(JSON.stringify(body, null, 1)).toString('base64'),
      branch: 'main',
      ...(sha ? { sha } : {})
    }, HUB_REPO);

    if (put.status >= 300) {
      return res.status(502).json({ error: 'GitHub rejected the write', detail: put.data && put.data.message });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, chapters, commit: put.data.commit && put.data.commit.sha });
  } catch (err) {
    console.error('save-learning failed:', err);
    return res.status(500).json({ error: 'Save failed', detail: err.message });
  }
};
