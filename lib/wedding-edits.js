// The wedding task list on HQ (/wedding/, Plan view): ticks, edits and new tasks made by Johnny
// or Irene on the site. Reached through /api/save-functions?doc=wedding, so the API stays at 12
// functions (the Vercel Hobby limit).
//
// The base list is wedding/tasks.json in diamond-hq, which Claude maintains (Notion is no longer
// used). Each change on the site is one key in wedding/task-edits.json, "<task id>.<field>", and
// the page lays the edits on top of the base list. Claude folds them into tasks.json from time to
// time and clears the file.
//
// GET  -> { ok, edits: { tasks, savedAt } }   read fresh from GitHub
// POST -> { tasks: { "<id>.<field>": { v, at } } }
//   id: the 32-hex page id of an existing task, or "c" + 12 hex for a task added on the site
//   field: status | dueDate | name | notes | owner | workstream | hard | removed
// Per key the later `at` wins, so a phone that was offline can only overwrite what it touched.

const { ghRequest } = require('./github');

const HUB_REPO = process.env.HUB_REPO || 'Johnnnyay/diamond-hq';
const PATH = 'wedding/task-edits.json';
const KEY = /^([0-9a-f]{32}|c[0-9a-f]{12})\.(status|dueDate|name|notes|owner|workstream|hard|removed)$/;
const STATUS = ['Not started', 'In progress', 'Done'];
const OWNERS = ['Johnny', 'Irene', 'Both', 'Claude', 'Coordinator', 'Photographer', 'Florist', 'Videographer'];
const WS = ['Vision', 'Budget', 'Guests', 'Venue', 'Food', 'Ceremony & legal', 'Traditions', 'Vendors',
  'Attire & beauty', 'People & roles', 'Day-of', 'Admin & after', 'China orders', ''];

const obj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function okValue(field, v) {
  switch (field) {
    case 'status': return STATUS.includes(v);
    case 'dueDate': return v === '' || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
    case 'name': return typeof v === 'string' && v.trim().length > 0 && v.length <= 160;
    case 'notes': return typeof v === 'string' && v.length <= 1500;
    case 'owner': return v === '' || OWNERS.includes(v);
    case 'workstream': return WS.includes(v);
    case 'hard':
    case 'removed': return typeof v === 'boolean';
  }
  return false;
}

function clean(section) {
  const out = {};
  const keys = Object.keys(section || {});
  if (keys.length > 300) throw new Error('too many edits in one save');
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

async function read() {
  const head = await ghRequest('GET', PATH, null, HUB_REPO);
  let prev = { tasks: {} };
  if (head.status === 200) {
    try { prev = JSON.parse(Buffer.from(head.data.content, 'base64').toString('utf8')); } catch (e) {}
  }
  prev.tasks = prev.tasks || {};
  return { head, prev };
}

module.exports = async function wedding(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    try {
      const { prev } = await read();
      return res.status(200).json({ ok: true, edits: { tasks: prev.tasks, savedAt: prev.savedAt || null } });
    } catch (err) {
      return res.status(500).json({ error: 'Read failed', detail: err.message });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body;
  if (!obj(body)) return res.status(400).json({ error: 'Expected { tasks }.' });
  let inc;
  try { inc = clean(body.tasks); } catch (e) { return res.status(400).json({ error: e.message }); }
  if (!Object.keys(inc).length) return res.status(400).json({ error: 'Nothing to save.' });

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { head, prev } = await read();
      const out = Object.assign({}, prev.tasks);
      let n = 0;
      for (const [k, e] of Object.entries(inc)) {
        if (!out[k] || Date.parse(e.at) >= Date.parse(out[k].at)) { out[k] = e; n++; }
      }
      const doc = { tasks: out, savedAt: new Date().toISOString(), savedFrom: 'hub' };
      const put = await ghRequest('PUT', PATH, {
        message: 'Wedding tasks: edited in the hub (' + n + ' change' + (n === 1 ? '' : 's') + ')',
        content: Buffer.from(JSON.stringify(doc, null, 1) + '\n').toString('base64'),
        branch: 'main',
        ...(head.status === 200 ? { sha: head.data.sha } : {})
      }, HUB_REPO);
      if (put.status === 409 && attempt === 0) continue;
      if (put.status >= 300) return res.status(502).json({ error: 'GitHub rejected the write', detail: put.data && put.data.message });
      return res.status(200).json({ ok: true, changed: n, savedAt: doc.savedAt, edits: { tasks: out, savedAt: doc.savedAt } });
    }
  } catch (err) {
    console.error('wedding save failed:', err);
    return res.status(500).json({ error: 'Save failed', detail: err.message });
  }
};
