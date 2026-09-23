const crypto = require('crypto');
const { ghRequest, getFile, pushFile, deleteFile, getIndex, cors, fromKnownOrigin } = require('../lib/github');
const ibo = require('../lib/ibo');

/* Event pages (glow.html, assess.html on the product site).

   POST { action: 'submit', event, type: 'skin'|'hair', answers }   anyone: store one quick assessment
   GET  ?event=<slug>                                               admin: every answer for that event
   POST { action: 'delete', event, type, id }                       admin: remove one quick assessment

   Quick assessments are stored as answers only, one file each, in the private reports repo at
   events/<event>/<type>/<id>.json. Nothing is analysed. The health column of the admin view comes
   from index.json rows that the health assessment tagged with the same event. */

const TYPES = ['skin', 'hair'];
const EVENT_RE = /^[a-z0-9-]{3,40}$/;
const ID_RE = /^[a-z0-9]{6,14}-[a-f0-9]{6}$/;

const FIELDS = {
  name: 120, email: 160, routine: 1500, concerns: null, concernOther: 200,
  hasAllergy: 5, allergies: 500, type: 60, chemical: 40,
};

function clean(answers) {
  const a = answers && typeof answers === 'object' ? answers : {};
  const out = {};
  for (const [k, max] of Object.entries(FIELDS)) {
    if (k === 'concerns') {
      out.concerns = (Array.isArray(a.concerns) ? a.concerns : [])
        .map(c => String(c || '').trim().slice(0, 80)).filter(Boolean).slice(0, 2);
      continue;
    }
    const v = a[k] === undefined || a[k] === null ? '' : String(a[k]).trim().slice(0, max);
    if (v) out[k] = v;
  }
  if (out.email) out.email = out.email.toLowerCase();
  return out;
}

async function listType(event, type) {
  const res = await ghRequest('GET', `events/${event}/${type}`);
  if (res.status === 404) return [];
  if (res.status !== 200 || !Array.isArray(res.data)) {
    const e = new Error(`report store unreachable: GitHub returned ${res.status} listing ${type}`);
    e.storeUnreachable = true;
    throw e;
  }
  const files = res.data.filter(f => f.type === 'file' && /\.json$/.test(f.name));
  const docs = await Promise.all(files.map(f => getFile(f.path).then(raw => {
    try { return JSON.parse(raw); } catch (e) { return null; }
  })));
  return docs.filter(Boolean).sort((x, y) => String(y.submittedAt).localeCompare(String(x.submittedAt)));
}

async function healthRows(event) {
  const index = await getIndex();
  const rows = [];
  for (const client of Object.values(index.clients || {})) {
    for (const r of client.reports || []) {
      if (r.event !== event) continue;
      rows.push({
        rid: r.rid, name: client.name, email: client.email || null, date: r.date,
        submittedAt: r.submittedAt || r.date, pending: !!r.pending,
        priorities: r.priorities || [], signals: r.signals || [], products: r.products || [],
      });
    }
  }
  return rows.sort((x, y) => String(y.submittedAt).localeCompare(String(x.submittedAt)));
}

module.exports = async (req, res) => {
  cors(req, res);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      if (!ibo.fromRequest(req)) return res.status(401).json({ error: 'Sign in as admin first' });
      const event = String(req.query.event || '').trim();
      if (!EVENT_RE.test(event)) return res.status(400).json({ error: 'Bad event' });
      const [health, skin, hair] = await Promise.all([
        healthRows(event), listType(event, 'skin'), listType(event, 'hair'),
      ]);
      return res.status(200).json({ event, health, skin, hair, at: new Date().toISOString() });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!fromKnownOrigin(req)) return res.status(403).json({ error: 'Unknown origin' });

    const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
    const action = String(body.action || '');
    const event = String(body.event || '').trim();
    const type = String(body.type || '');
    if (!EVENT_RE.test(event)) return res.status(400).json({ error: 'Bad event' });
    if (!TYPES.includes(type)) return res.status(400).json({ error: 'Bad assessment type' });

    if (action === 'submit') {
      const answers = clean(body.answers);
      if (!answers.name) return res.status(400).json({ error: 'Name is required' });
      if (!answers.concerns.length && !answers.concernOther) return res.status(400).json({ error: 'Pick at least one concern' });
      const id = Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex');
      const doc = { id, event, type, submittedAt: new Date().toISOString(), answers };
      const put = await pushFile(`events/${event}/${type}/${id}.json`, JSON.stringify(doc, null, 1),
        `Event ${event}: ${type} assessment`);
      if (put.status !== 200 && put.status !== 201) throw new Error(`store write failed: GitHub returned ${put.status}`);
      return res.status(200).json({ ok: true, id, submittedAt: doc.submittedAt });
    }

    if (action === 'delete') {
      if (!ibo.fromRequest(req)) return res.status(401).json({ error: 'Sign in as admin first' });
      const id = String(body.id || '');
      if (!ID_RE.test(id)) return res.status(400).json({ error: 'Bad id' });
      const gone = await deleteFile(`events/${event}/${type}/${id}.json`, `Event ${event}: delete ${type} ${id}`);
      if (!gone) return res.status(404).json({ error: 'Already deleted' });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('event failed:', err);
    return res.status(err && err.storeUnreachable ? 502 : 500).json({ error: 'Could not reach the answer store right now' });
  }
};

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
