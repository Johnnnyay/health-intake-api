// POST /api/save-functions
// Commits the taps made on HQ › Team Building › Functions & events into data/functions-edits.json
// in the diamond-hq repo: whether each person came, and whether they have paid their room share
// back. The event itself (rooms, who paid what, each share) lives in data/functions.json, which
// Claude maintains from Irene's planning sheet; this file only ever holds the hand taps on top.
//
// Same shape of merge as save-inventory: every entry carries the time it was made (`at`) and the
// later one wins, per person, so a tab left open on a phone can only overwrite what it touched.
//
// Body: { status: { "<functionId>|<personKey>": { v, at } },
//         paid:   { "<functionId>|<personKey>": { amount, date, method, at } | { reset: true, at } },
//         board:  { "<functionId>|<path>": { v, at } | { reset: true, at } } }
// `board` holds the room board edits: hotel fields, who sits in each room slot, each room's type,
// price, confirmation number, who paid, and each person's arrival and departure. Paths look like
// hotel.main.name, room.m3.slot2, stay.thu.rooms, travel.lister.arrive, others.

const { ghRequest, cors, fromKnownOrigin } = require('../lib/github');

const HUB_REPO = process.env.HUB_REPO || 'Johnnnyay/diamond-hq';
const PATH = 'data/functions-edits.json';
const KEY = /^[a-z0-9-]{3,60}\|[a-z0-9-]{1,40}$/;
const BKEY = /^[a-z0-9-]{3,60}\|[a-z]{1,12}(\.[a-z0-9-]{1,40}){0,2}$/;
const STATUS = ['invited', 'confirmed', 'attended', 'no-show', 'cancelled'];
const METHOD = ['venmo', 'zelle', 'cash', 'other'];

const obj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function clean(section, kind) {
  const out = {};
  for (const [k, e] of Object.entries(section || {})) {
    if (!(kind === 'board' ? BKEY : KEY).test(k) || !obj(e) || typeof e.at !== 'string' || isNaN(Date.parse(e.at))) {
      throw new Error('bad entry for ' + k);
    }
    if (e.reset === true) { out[k] = { reset: true, at: e.at }; continue; }
    if (kind === 'board') {
      const v = e.v;
      const ok = v === null || typeof v === 'boolean' || (typeof v === 'number' && isFinite(v) && Math.abs(v) <= 100000)
        || (typeof v === 'string' && v.length <= 300);
      if (!ok) throw new Error('bad value for ' + k);
      out[k] = { v: typeof v === 'string' ? v.trim() : v, at: e.at };
    } else if (kind === 'status') {
      if (!STATUS.includes(e.v)) throw new Error('bad status for ' + k);
      out[k] = { v: e.v, at: e.at };
    } else {
      const amt = e.amount;
      if (typeof amt !== 'number' || !isFinite(amt) || amt < 0 || amt > 10000) throw new Error('bad amount for ' + k);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || '')) throw new Error('bad date for ' + k);
      if (!METHOD.includes(e.method)) throw new Error('bad method for ' + k);
      out[k] = { amount: Math.round(amt * 100) / 100, date: e.date, method: e.method, at: e.at };
    }
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

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!fromKnownOrigin(req)) {
    return res.status(403).json({ error: 'This endpoint only accepts writes from the hub.' });
  }

  const body = req.body;
  if (!obj(body)) return res.status(400).json({ error: 'Expected { status, paid, board }.' });
  let status, paid, board;
  try {
    status = clean(body.status, 'status');
    paid = clean(body.paid, 'paid');
    board = clean(body.board, 'board');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (!Object.keys(status).length && !Object.keys(paid).length && !Object.keys(board).length) {
    return res.status(400).json({ error: 'Nothing to save.' });
  }

  try {
    // Two tries: if the file moved between our read and our write, read it again and re-merge.
    for (let attempt = 0; attempt < 2; attempt++) {
      const head = await ghRequest('GET', PATH, null, HUB_REPO);
      let prev = { status: {}, paid: {}, board: {} };
      if (head.status === 200) {
        try { prev = JSON.parse(Buffer.from(head.data.content, 'base64').toString('utf8')); } catch (e) {}
      }
      const s = merge(prev.status || {}, status);
      const p = merge(prev.paid || {}, paid);
      const b = merge(prev.board || {}, board);
      const n = s.changed + p.changed + b.changed;
      const out = { status: s.out, paid: p.out, board: b.out, savedAt: new Date().toISOString(), savedFrom: 'hub' };
      const put = await ghRequest('PUT', PATH, {
        message: 'Functions: edited in the hub (' + n + ' change' + (n === 1 ? '' : 's') + ')',
        content: Buffer.from(JSON.stringify(out, null, 1) + '\n').toString('base64'),
        branch: 'main',
        ...(head.status === 200 ? { sha: head.data.sha } : {})
      }, HUB_REPO);
      if (put.status === 409 && attempt === 0) continue;
      if (put.status >= 300) {
        return res.status(502).json({ error: 'GitHub rejected the write', detail: put.data && put.data.message });
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, changed: n, savedAt: out.savedAt, edits: { status: out.status, paid: out.paid, board: out.board } });
    }
  } catch (err) {
    console.error('save-functions failed:', err);
    return res.status(500).json({ error: 'Save failed', detail: err.message });
  }
};
