// POST /api/save-image
// Commits a Dream Board image into the diamond-hq repo. The hub already stores its
// text this way, so pictures live next to the words rather than in a second service
// with a second bill and a second way to break.
//
// The browser downscales before it posts, so what arrives here is already web sized.
// Names are content addressed: the same photo dropped twice is one file, and a name
// can never collide with someone else's.

const crypto = require('crypto');
const { ghRequest, cors } = require('../lib/github');

const HUB_REPO = process.env.HUB_REPO || 'Johnnnyay/diamond-hq';
const DIR = 'assets/dream/';
const TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_BYTES = 3 * 1024 * 1024;

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

  const dataUrl = (req.body && req.body.dataUrl) || '';
  const m = /^data:([a-z/+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return res.status(400).json({ error: 'Expected { dataUrl } as a base64 data URL.' });

  const ext = TYPES[m[1]];
  if (!ext) return res.status(415).json({ error: 'Unsupported image type: ' + m[1] });

  const bytes = Buffer.from(m[2], 'base64');
  if (!bytes.length) return res.status(400).json({ error: 'Empty image.' });
  if (bytes.length > MAX_BYTES) {
    return res.status(413).json({ error: 'Image is ' + Math.round(bytes.length / 1024) + 'KB after downscaling; the limit is 3MB.' });
  }

  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 16);
  const path = DIR + hash + '.' + ext;

  try {
    // Already committed: the same picture, so hand back the same URL and write nothing.
    const head = await ghRequest('GET', path, null, HUB_REPO);
    if (head.status === 200) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, url: path, reused: true });
    }

    const put = await ghRequest('PUT', path, {
      message: 'Dream Board image ' + hash,
      content: m[2],
      branch: 'main'
    }, HUB_REPO);

    if (put.status >= 300) {
      return res.status(502).json({ error: 'GitHub rejected the write', detail: put.data && put.data.message });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, url: path, bytes: bytes.length });
  } catch (err) {
    console.error('save-image failed:', err);
    return res.status(500).json({ error: 'Save failed', detail: err.message });
  }
};
