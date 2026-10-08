// Johnny's answers on HQ › Team Building › "Zoom meetings to check".
// Reached through /api/save-functions?doc=review, so the API stays at 12 functions (the Vercel
// Hobby limit) instead of adding a 13th file.
//
// The card lists Zoom meetings Johnny or Irene was in that the calendar-classify skill did not
// count as process meetings (data/pipeline-review.json, written by Claude). Each click is one key
// in data/pipeline-review-edits.json; calendar.py reads them on its next run, and the board lays
// them on top until then.
//
// GET  -> { ok, edits: { rev, savedAt } }   read fresh from GitHub
// POST -> { rev: { "<12 hex id>": { v: "process", name, stage, at } | { v: "drop", at } | { reset: true, at } } }
// Per id the later `at` wins, so a tab left open on a phone can only overwrite what it touched.

const { ghRequest } = require('./github');

const HUB_REPO = process.env.HUB_REPO || 'Johnnnyay/diamond-hq';
const PATH = 'data/pipeline-review-edits.json';
const KEY = /^[a-f0-9]{12}$/;
const STAGES = ['MG1/Coffee Chat', 'MG2', 'MG3/BP1/TE', 'FU', 'Questionnaire', 'Launched'];

const obj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function clean(section) {
  const out = {};
  const keys = Object.keys(section || {});
  if (keys.length > 300) throw new Error('too many edits in one save');
  for (const k of keys) {
    const e = section[k];
    if (!KEY.test(k) || !obj(e) || typeof e.at !== 'string' || isNaN(Date.parse(e.at))) throw new Error('bad entry for ' + k);
    if (e.reset === true) { out[k] = { reset: true, at: e.at }; continue; }
    if (e.v === 'drop') { out[k] = { v: 'drop', at: e.at }; continue; }
    if (e.v !== 'process') throw new Error('bad answer for ' + k);
    const name = typeof e.name === 'string' ? e.name.trim() : '';
    if (!name || name.length > 60 || /[<>@]/.test(name)) throw new Error('bad name for ' + k);
    if (!STAGES.includes(e.stage)) throw new Error('bad stage for ' + k);
    out[k] = { v: 'process', name, stage: e.stage, at: e.at };
  }
  return out;
}

async function read() {
  const head = await ghRequest('GET', PATH, null, HUB_REPO);
  let prev = { rev: {} };
  if (head.status === 200) {
    try { prev = JSON.parse(Buffer.from(head.data.content, 'base64').toString('utf8')); } catch (e) {}
  }
  prev.rev = prev.rev || {};
  return { head, prev };
}

module.exports = async function review(req, res) {
  if (req.method === 'GET') {
    try {
      const { prev } = await read();
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, edits: { rev: prev.rev, savedAt: prev.savedAt || null } });
    } catch (err) {
      return res.status(500).json({ error: 'Read failed', detail: err.message });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;
  if (!obj(body)) return res.status(400).json({ error: 'Expected { rev }.' });
  let rev;
  try { rev = clean(body.rev); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!Object.keys(rev).length) return res.status(400).json({ error: 'Nothing to save.' });

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { head, prev } = await read();
      const out = Object.assign({}, prev.rev);
      let n = 0;
      for (const [k, e] of Object.entries(rev)) {
        if (!out[k] || Date.parse(e.at) >= Date.parse(out[k].at)) { out[k] = e; n++; }
      }
      const doc = { rev: out, savedAt: new Date().toISOString(), savedFrom: 'hub' };
      const put = await ghRequest('PUT', PATH, {
        message: 'Pipeline review: checked in the hub (' + n + ' answer' + (n === 1 ? '' : 's') + ')',
        content: Buffer.from(JSON.stringify(doc, null, 1) + '\n').toString('base64'),
        branch: 'main',
        ...(head.status === 200 ? { sha: head.data.sha } : {})
      }, HUB_REPO);
      if (put.status === 409 && attempt === 0) continue;
      if (put.status >= 300) return res.status(502).json({ error: 'GitHub rejected the write', detail: put.data && put.data.message });
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, changed: n, savedAt: doc.savedAt, edits: { rev: out, savedAt: doc.savedAt } });
    }
  } catch (err) {
    console.error('review save failed:', err);
    return res.status(500).json({ error: 'Save failed', detail: err.message });
  }
};
