// Finance edits for HQ › 06 Finance (Business expenses, Tax, Personal).
// Reached through /api/save-functions?doc=finance, so the API stays at 12 functions (the
// Vercel Hobby limit) instead of adding a 13th file.
//
// GET  -> { ok, edits: { fin } }   read fresh from GitHub, for the two phones to stay in step
// POST -> { fin: { "<kind>.<id>.<field>": { v, at } | { reset: true, at } } }
//
// Same rule as the room board: one value per key, the later `at` wins, so a tab left open on a
// phone can only overwrite the fields it touched. Kinds:
//   item.<id>.<field>    a business expense row (new rows get a fresh id from the page)
//   occ.<id>.<field>     a trip or event (purpose, dates, business days)
//   sample.<id>.<field>  product given to a new person
//   tax.<id>.<field>     a tax to-do (done)
//   bill.<id>.<field>    a monthly bill (name, amount, due day, autopay)
//   paid.<yyyy-mm>.<billId>  that bill ticked as paid for the month
// The base data (data/expenses.json, data/finance.json) is written by Claude; this file only
// ever holds the taps and typing on top.

const { ghRequest } = require('./github');

const HUB_REPO = process.env.HUB_REPO || 'Johnnnyay/diamond-hq';
const PATH = 'data/finance-edits.json';
const KEY = /^(item|occ|sample|tax|bill|paid)\.[a-z0-9-]{1,40}\.[a-z0-9-]{1,24}$/;

const obj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function clean(section) {
  const out = {};
  const keys = Object.keys(section || {});
  if (keys.length > 400) throw new Error('too many edits in one save');
  for (const k of keys) {
    const e = section[k];
    if (!KEY.test(k) || !obj(e) || typeof e.at !== 'string' || isNaN(Date.parse(e.at))) throw new Error('bad entry for ' + k);
    if (e.reset === true) { out[k] = { reset: true, at: e.at }; continue; }
    const v = e.v;
    const ok = v === null || typeof v === 'boolean' || (typeof v === 'number' && isFinite(v) && Math.abs(v) <= 10000000)
      || (typeof v === 'string' && v.length <= 500);
    if (!ok) throw new Error('bad value for ' + k);
    out[k] = { v: typeof v === 'string' ? v.trim() : v, at: e.at };
  }
  return out;
}

async function read() {
  const head = await ghRequest('GET', PATH, null, HUB_REPO);
  let prev = { fin: {} };
  if (head.status === 200) {
    try { prev = JSON.parse(Buffer.from(head.data.content, 'base64').toString('utf8')); } catch (e) {}
  }
  prev.fin = prev.fin || {};
  return { head, prev };
}

module.exports = async function finance(req, res) {
  if (req.method === 'GET') {
    try {
      const { prev } = await read();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, edits: { fin: prev.fin, savedAt: prev.savedAt || null } });
    } catch (err) {
      return res.status(500).json({ error: 'Read failed', detail: err.message });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;
  if (!obj(body)) return res.status(400).json({ error: 'Expected { fin }.' });
  let fin;
  try { fin = clean(body.fin); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!Object.keys(fin).length) return res.status(400).json({ error: 'Nothing to save.' });

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { head, prev } = await read();
      const out = Object.assign({}, prev.fin);
      let n = 0;
      for (const [k, e] of Object.entries(fin)) {
        if (!out[k] || Date.parse(e.at) >= Date.parse(out[k].at)) { out[k] = e; n++; }
      }
      const doc = { fin: out, savedAt: new Date().toISOString(), savedFrom: 'hub' };
      const text = JSON.stringify(doc, null, 1) + '\n';
      if (Buffer.byteLength(text) > 900000) return res.status(413).json({ error: 'The finance edits file is full. Ask Claude to fold the edits into the base file.' });
      const put = await ghRequest('PUT', PATH, {
        message: 'Finance: edited in the hub (' + n + ' change' + (n === 1 ? '' : 's') + ')',
        content: Buffer.from(text).toString('base64'),
        branch: 'main',
        ...(head.status === 200 ? { sha: head.data.sha } : {})
      }, HUB_REPO);
      if (put.status === 409 && attempt === 0) continue;
      if (put.status >= 300) return res.status(502).json({ error: 'GitHub rejected the write', detail: put.data && put.data.message });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, changed: n, savedAt: doc.savedAt, edits: { fin: out, savedAt: doc.savedAt } });
    }
  } catch (err) {
    console.error('finance save failed:', err);
    return res.status(500).json({ error: 'Save failed', detail: err.message });
  }
};
