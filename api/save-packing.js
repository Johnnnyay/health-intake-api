// GET|POST /api/save-packing
// The packing list on HQ (pack.html): what Johnny and Irene have ticked for the trip they are
// packing for, the items they added themselves, and when each list was last reset. Both phones
// read and write the same file, data/packing-edits.json in the diamond-hq repo, so a tick on one
// phone shows on the other. The base list itself is data/packing.json, which Claude maintains.
//
// Same merge as save-functions: every entry carries the time it was made (`at`) and the later one
// wins, per key, so a phone that was offline can only overwrite what it touched.
//
// Body: { checks: { "<tab>-<tripId>|<itemId>|<j|i|s>": { v: true|false, at } },
//         items:  { "<itemId>": { v: { t, sec, who, tabs, q?, mode?, note?, removed? }, at } | { reset: true, at } },
// An items entry is the whole item. For one of the built-in items (ids from data/packing.json) it
// replaces that item, which is how the page edits or removes them; ids starting "c-" are items
// Johnny or Irene added. removed: true hides an item but keeps it, so it can be restored.
//         trips:  { "<tab>": { v: { id, prev, nights, modes }, at } } }   modes: drive, fly, rental
// A new trip on a tab is a new trip id. The ticks of the trip before it (prev) are kept so the
// page can undo a reset; anything older is dropped on the next write.
//
// GET returns the current file straight from GitHub, so the other phone sees a tick within
// seconds instead of waiting for the site to redeploy.

const { ghRequest, cors, fromKnownOrigin } = require('../lib/github');

const HUB_REPO = process.env.HUB_REPO || 'Johnnnyay/diamond-hq';
const PATH = 'data/packing-edits.json';
const TABS = ['day', 'one', 'conf', 'intl'];
const SECS = ['docs', 'tech', 'clothes', 'toiletries', 'health', 'biz', 'way', 'home'];
const WHO = ['b', 'j', 'i', 's'];
const CHECK = /^(day|one|conf|intl)-[a-z0-9]{2,20}\|[a-z0-9-]{2,40}\|[jis]$/;
const ITEM = /^[a-z0-9-]{2,40}$/;
const QTY = ['d', 'n', 'h'];
const TRIPID = /^[a-z0-9]{2,20}$/;
const MODES = ['drive', 'fly', 'rental'];

const obj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const okAt = (e) => obj(e) && typeof e.at === 'string' && !isNaN(Date.parse(e.at));

function clean(body) {
  const out = { checks: {}, items: {}, trips: {} };
  for (const [k, e] of Object.entries(body.checks || {})) {
    if (!CHECK.test(k) || !okAt(e) || typeof e.v !== 'boolean') throw new Error('bad check ' + k);
    out.checks[k] = { v: e.v, at: e.at };
  }
  for (const [k, e] of Object.entries(body.items || {})) {
    if (!ITEM.test(k) || !okAt(e)) throw new Error('bad item ' + k);
    if (e.reset === true) { out.items[k] = { reset: true, at: e.at }; continue; }
    const v = e.v;
    const t = obj(v) && typeof v.t === 'string' ? v.t.trim() : '';
    const note = obj(v) && typeof v.note === 'string' ? v.note.trim() : '';
    const mode = obj(v) && Array.isArray(v.mode) ? v.mode : [];
    if (!t || t.length > 80 || note.length > 120 || !SECS.includes(v.sec) || !WHO.includes(v.who)
        || !Array.isArray(v.tabs) || !v.tabs.every((x) => TABS.includes(x))
        || (v.q !== undefined && v.q !== null && v.q !== '' && !QTY.includes(v.q))
        || !mode.every((m) => MODES.includes(m))
        || (v.removed !== undefined && typeof v.removed !== 'boolean')) {
      throw new Error('bad item ' + k);
    }
    const item = { t, sec: v.sec, who: v.who, tabs: Array.from(new Set(v.tabs)) };
    if (QTY.includes(v.q)) item.q = v.q;
    if (mode.length) item.mode = Array.from(new Set(mode));
    if (note) item.note = note;
    if (v.removed === true) item.removed = true;
    out.items[k] = { v: item, at: e.at };
  }
  for (const [k, e] of Object.entries(body.trips || {})) {
    const v = okAt(e) && obj(e.v) ? e.v : null;
    const modes = v && v.modes !== undefined ? v.modes : [];
    if (!TABS.includes(k) || !v || !TRIPID.test(v.id || '') || !Number.isInteger(v.nights) || v.nights < 0 || v.nights > 60
        || !Array.isArray(modes) || !modes.every((m) => MODES.includes(m))
        || (v.prev !== undefined && v.prev !== null && !TRIPID.test(v.prev))) {
      throw new Error('bad trip ' + k);
    }
    out.trips[k] = { v: { id: v.id, prev: v.prev || null, nights: v.nights, modes: Array.from(new Set(modes)) }, at: e.at };
  }
  return out;
}

function merge(prev, incoming) {
  const out = Object.assign({}, prev);
  let changed = 0;
  for (const [k, e] of Object.entries(incoming)) {
    if (!out[k] || Date.parse(e.at) >= Date.parse(out[k].at)) { out[k] = e; changed++; }
  }
  return { out, changed };
}

async function readFile() {
  const head = await ghRequest('GET', PATH, null, HUB_REPO);
  let data = { checks: {}, items: {}, trips: {} };
  if (head.status === 200) {
    try { data = JSON.parse(Buffer.from(head.data.content, 'base64').toString('utf8')); } catch (e) {}
  }
  ['checks', 'items', 'trips'].forEach((s) => { data[s] = data[s] || {}; });
  return { head, data };
}

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    try {
      const { data } = await readFile();
      return res.status(200).json({ ok: true, edits: { checks: data.checks, items: data.items, trips: data.trips, savedAt: data.savedAt || null } });
    } catch (err) {
      return res.status(500).json({ error: 'Read failed', detail: err.message });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!fromKnownOrigin(req)) {
    return res.status(403).json({ error: 'This endpoint only accepts writes from the hub.' });
  }
  if (!obj(req.body)) return res.status(400).json({ error: 'Expected { checks, items, trips }.' });

  let inc;
  try { inc = clean(req.body); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!Object.keys(inc.checks).length && !Object.keys(inc.items).length && !Object.keys(inc.trips).length) {
    return res.status(400).json({ error: 'Nothing to save.' });
  }

  try {
    // Two tries: if the file moved between our read and our write, read it again and re-merge.
    for (let attempt = 0; attempt < 2; attempt++) {
      const { head, data } = await readFile();
      const c = merge(data.checks, inc.checks);
      const it = merge(data.items, inc.items);
      const tr = merge(data.trips, inc.trips);
      // Keep only the ticks of each tab's current trip and the one before it.
      const live = [];
      TABS.forEach((t) => {
        const v = tr.out[t] && tr.out[t].v;
        live.push(t + '-' + ((v && v.id) || 't0') + '|');
        live.push(t + '-' + ((v && v.prev) || 't0') + '|');
      });
      Object.keys(c.out).forEach((k) => { if (!live.some((p) => k.indexOf(p) === 0)) delete c.out[k]; });
      const n = c.changed + it.changed + tr.changed;
      const out = { checks: c.out, items: it.out, trips: tr.out, savedAt: new Date().toISOString(), savedFrom: 'hub' };
      const put = await ghRequest('PUT', PATH, {
        message: 'Packing: edited in the hub (' + n + ' change' + (n === 1 ? '' : 's') + ')',
        content: Buffer.from(JSON.stringify(out, null, 1) + '\n').toString('base64'),
        branch: 'main',
        ...(head.status === 200 ? { sha: head.data.sha } : {})
      }, HUB_REPO);
      if (put.status === 409 && attempt === 0) continue;
      if (put.status >= 300) {
        return res.status(502).json({ error: 'GitHub rejected the write', detail: put.data && put.data.message });
      }
      return res.status(200).json({ ok: true, changed: n, savedAt: out.savedAt, edits: { checks: out.checks, items: out.items, trips: out.trips, savedAt: out.savedAt } });
    }
  } catch (err) {
    console.error('save-packing failed:', err);
    return res.status(500).json({ error: 'Save failed', detail: err.message });
  }
};
