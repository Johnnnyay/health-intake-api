// The wedding attire contact tracker on HQ (/wedding/attire.html#tracker): status, appointment,
// quote, next step and a running note per shop, edited by Johnny or Irene on the page. Reached
// through /api/save-functions?doc=attire, so the API stays at 12 functions (the Vercel Hobby limit).
//
// The shop list is wedding/attire-tracker.json in diamond-hq, which Claude maintains (contacts,
// research, the chat log Johnny pastes in). Each change on the page is one key in
// wedding/attire-edits.json, "<shop id>.<field>", and the page lays the edits on top of the list.
//
// &list=invite (or any name in LISTS) uses the same shape for another tracker page, stored in
// wedding/<list>-edits.json. No list means attire.
//
// GET  -> { ok, edits: { shops, savedAt } }   read fresh from GitHub
// POST -> { shops: { "<id>.<field>": { v, at } } }
//   id: a shop id from attire-tracker.json (lowercase letters, digits, dashes)
//   field: status | appt | quote | next | memo
// Per key the later `at` wins, so a phone that was offline can only overwrite what it touched.

const { ghRequest } = require('./github');

const HUB_REPO = process.env.HUB_REPO || 'Johnnnyay/diamond-hq';
const LISTS = ['attire', 'invite'];
const pathFor = (req) => {
  const l = (req.query && req.query.list) || 'attire';
  if (!LISTS.includes(l)) throw new Error('unknown list');
  return 'wedding/' + l + '-edits.json';
};
const KEY = /^([a-z0-9-]{2,40})\.(status|appt|quote|next|memo)$/;
const STATUS = ['未联系', '已发消息', '已回复', '已约', '已下单', '已取货', '不考虑'];

const obj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function okValue(field, v) {
  switch (field) {
    case 'status': return STATUS.includes(v);
    case 'appt': return typeof v === 'string' && v.length <= 80;
    case 'quote':
    case 'next': return typeof v === 'string' && v.length <= 300;
    case 'memo': return typeof v === 'string' && v.length <= 2000;
  }
  return false;
}

function clean(section) {
  const out = {};
  const keys = Object.keys(section || {});
  if (keys.length > 200) throw new Error('too many edits in one save');
  for (const k of keys) {
    const m = KEY.exec(k);
    const e = section[k];
    if (!m || !obj(e) || typeof e.at !== 'string' || isNaN(Date.parse(e.at))) throw new Error('bad entry for ' + k);
    const v = typeof e.v === 'string' ? e.v.trim() : e.v;
    if (!okValue(m[2], v)) throw new Error('bad value for ' + k);
    out[k] = { v, at: e.at };
  }
  return out;
}

async function read(PATH) {
  const head = await ghRequest('GET', PATH, null, HUB_REPO);
  let prev = { shops: {} };
  if (head.status === 200) {
    try { prev = JSON.parse(Buffer.from(head.data.content, 'base64').toString('utf8')); } catch (e) {}
  }
  prev.shops = prev.shops || {};
  return { head, prev };
}

module.exports = async function attire(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  let PATH;
  try { PATH = pathFor(req); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (req.method === 'GET') {
    try {
      const { prev } = await read(PATH);
      return res.status(200).json({ ok: true, edits: { shops: prev.shops, savedAt: prev.savedAt || null } });
    } catch (err) {
      return res.status(500).json({ error: 'Read failed', detail: err.message });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;
  if (!obj(body)) return res.status(400).json({ error: 'Expected { shops }.' });
  let inc;
  try { inc = clean(body.shops); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!Object.keys(inc).length) return res.status(400).json({ error: 'Nothing to save.' });

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { head, prev } = await read(PATH);
      const out = Object.assign({}, prev.shops);
      let n = 0;
      for (const [k, e] of Object.entries(inc)) {
        if (!out[k] || Date.parse(e.at) >= Date.parse(out[k].at)) { out[k] = e; n++; }
      }
      const doc = { shops: out, savedAt: new Date().toISOString(), savedFrom: 'hub' };
      const put = await ghRequest('PUT', PATH, {
        message: 'Wedding ' + PATH.split('/')[1].split('-')[0] + ' tracker: edited in the hub (' + n + ' change' + (n === 1 ? '' : 's') + ')',
        content: Buffer.from(JSON.stringify(doc, null, 1) + '\n').toString('base64'),
        branch: 'main',
        ...(head.status === 200 ? { sha: head.data.sha } : {})
      }, HUB_REPO);
      if (put.status === 409 && attempt === 0) continue;
      if (put.status >= 300) return res.status(502).json({ error: 'GitHub rejected the write', detail: put.data && put.data.message });
      return res.status(200).json({ ok: true, changed: n, savedAt: doc.savedAt, edits: { shops: out, savedAt: doc.savedAt } });
    }
  } catch (err) {
    console.error('attire save failed:', err);
    return res.status(500).json({ error: 'Save failed', detail: err.message });
  }
};
