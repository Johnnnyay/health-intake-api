// HY team night agendas for the product site's team-event.html.
// Reached through /api/save-functions?doc=team-events, so the API stays at 12 functions (the Vercel
// Hobby limit) instead of adding a 13th file.
//
// The agendas live in data/team-events.json in the product-marketing repo, next to the page, and
// are public (the page is). Anyone can read them here, fresh from GitHub, which is faster than
// GitHub Pages after a save. Only the admin login (the same session as the health site: the ···
// on the page, a Bearer token from /api/unlock) can write.
//
// GET  -> { ok, savedAt, events }
// POST -> { events: { "<id>": <event> | { deleted: true } }, base: { "<id>": "<at it was loaded at>" | null } }
//   One event is replaced whole. `base` is the `at` the editor loaded; if the stored event has
//   moved on since (another phone saved it), nothing is written and the answer is 409 with the
//   current list, so an older tab can never silently overwrite a newer edit.

const { ghRequest } = require('./github');
const ibo = require('./ibo');

const REPO = process.env.SITE_REPO || 'Johnnnyay/product-marketing';
const PATH = 'data/team-events.json';
const ID = /^\d{4}-\d{2}-\d{2}(-[a-z0-9]{1,8})?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const obj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);

function str(v, max, what) {
  if (v == null || v === '') return '';
  if (typeof v !== 'string') throw new Error(what + ' must be text');
  const s = v.replace(/\r\n?/g, '\n').trim();
  if (s.length > max) throw new Error(what + ' is too long (' + max + ' characters at most)');
  return s;
}
function list(v, max, what) {
  if (v == null) return [];
  if (!Array.isArray(v)) throw new Error(what + ' must be a list');
  if (v.length > max) throw new Error('too many ' + what + ' (' + max + ' at most)');
  return v;
}
function rows(v, max, widths, what) {
  return list(v, max, what).map(function (r, i) {
    if (!Array.isArray(r)) throw new Error(what + ' row ' + (i + 1) + ' is not a row');
    return widths.map(function (w, k) { return str(r[k], w, what); });
  }).filter(function (r) { return r.some(Boolean); });
}
function points(v) {
  return list(v, 40, 'points').map(function (p) {
    if (Array.isArray(p)) return [str(p[0], 500, 'a point'), list(p[1], 30, 'sub-points').map(function (q) { return str(q, 500, 'a sub-point'); }).filter(Boolean)];
    return str(p, 500, 'a point');
  }).filter(function (p) { return Array.isArray(p) ? p[0] || p[1].length : p; });
}

/* The agenda is the five sections of a team night, in the event's own order, each a list of items.
   Johnny, 2026-10-14: every item has a topic, a speaker (one person, or a panel and the person who
   leads it), the minutes and bullet points. The calendar section's item lists events instead. */
const SECTIONS = ['intro', 'calendar', 'volume', 'growth', 'leadership'];
const OLD = { intro: 'intro', calendar: 'calendar', product: 'volume', retail: 'volume', growth: 'growth',
  spotlight: 'leadership', panel: 'leadership', training: 'leadership', wrapup: 'leadership', qa: 'leadership' };
function item(s, where) {
  if (!obj(s)) throw new Error(where + ' is not an item');
  const min = s.min == null || s.min === '' ? null : Number(s.min);
  if (min != null && !(Number.isInteger(min) && min >= 0 && min <= 240)) throw new Error('minutes in ' + where + ' must be a whole number');
  const it = {};
  const t = str(s.t, 160, 'topic'); if (t) it.t = t;
  const who = str(s.who, 200, 'speakers'); if (who) it.who = who;
  const by = str(s.by, 80, 'panel lead'); if (by) it.by = by;
  if (min) it.min = min;
  const pts = points(s.pts); if (pts.length) it.pts = pts;
  const cal = rows(s.cal, 40, [40, 400], 'calendar rows'); if (cal.length) it.cal = cal;
  return it;
}
function sections(v) {
  const list = Array.isArray(v) ? v : [];
  /* A page loaded before 2026-10-14 sends the old flat list of segments: fold each into its section. */
  if (list.length && !list.some(function (x) { return obj(x) && Array.isArray(x.items); })) {
    const out = [];
    list.forEach(function (s, i) {
      if (!obj(s)) return;
      const k = OLD[s.k] || 'leadership';
      const t = s.lead || (/^(Introductions|Welcome|Calendar|Upcoming)/.test(s.t || '') ? '' : s.t);
      const it = item({ t: t, who: s.who, min: s.min, pts: s.pts, cal: s.cal }, 'segment ' + (i + 1));
      const last = out[out.length - 1];
      if (last && last.k === k) last.items.push(it); else out.push({ k: k, items: [it] });
    });
    return out;
  }
  if (list.length > 10) throw new Error('too many agenda sections');
  return list.map(function (sec, i) {
    if (!obj(sec) || SECTIONS.indexOf(sec.k) < 0) throw new Error('agenda section ' + (i + 1) + ' is not one of the five');
    const items = Array.isArray(sec.items) ? sec.items : [];
    if (items.length > 25) throw new Error('too many items in one section');
    return { k: sec.k, items: items.map(function (s, j) { return item(s, sec.k + ' item ' + (j + 1)); })
      .filter(function (it) { return Object.keys(it).length; }) };
  });
}

function cleanEvent(id, e) {
  if (!ID.test(id)) throw new Error('bad event id ' + id);
  if (!obj(e)) throw new Error('bad event ' + id);
  if (e.deleted === true) return { deleted: true };
  if (!DATE.test(e.date || '')) throw new Error('the date must look like 2026-10-16');
  const zoom = str(e.zoom, 24, 'Zoom ID');
  if (zoom && !/^[\d \-]+$/.test(zoom)) throw new Error('the Zoom ID can only have digits');
  const out = {
    id: id, date: e.date,
    kind: str(e.kind, 30, 'Kind'), title: str(e.title, 140, 'Title'), sub: str(e.sub, 140, 'Subtitle'),
    time: str(e.time, 80, 'Time'), where: str(e.where, 160, 'Where'), whereNote: str(e.whereNote, 200, 'Where note'),
    zoom: zoom, pass: str(e.pass, 24, 'Zoom passcode'), dress: str(e.dress, 120, 'Dress code'),
    agendaTitle: str(e.agendaTitle, 80, 'Agenda heading'),
    flow: rows(e.flow, 12, [40, 100], 'overview rows'),
    roles: rows(e.roles, 16, [80, 120, 300], 'roles'),
    agenda: sections(e.agenda)
  };
  if (!out.title) throw new Error('the event needs a title');
  Object.keys(out).forEach(function (k) { if (out[k] === '') delete out[k]; });
  return out;
}

async function read() {
  const head = await ghRequest('GET', PATH, null, REPO);
  if (head.status === 404) return { head, doc: { events: [] } };
  if (head.status !== 200 || !head.data.content) {
    const e = new Error('GitHub returned ' + head.status + ' for ' + PATH); e.unreachable = true; throw e;
  }
  return { head, doc: JSON.parse(Buffer.from(head.data.content, 'base64').toString('utf8')) };
}

/* Can this server's GitHub token write to the repo? A yes/no only, nothing else from the token. */
function canPush() {
  return new Promise(function (resolve) {
    const r = require('https').request({ hostname: 'api.github.com', path: '/repos/' + REPO, method: 'GET',
      headers: { 'Authorization': 'token ' + process.env.GITHUB_TOKEN, 'User-Agent': 'health-intake-api', 'Accept': 'application/vnd.github+json' } },
      function (x) { let d = ''; x.on('data', function (c) { d += c; }); x.on('end', function () {
        try { const j = JSON.parse(d); resolve({ status: x.statusCode, push: !!(j.permissions && j.permissions.push) }); } catch (e) { resolve({ status: x.statusCode, push: false }); }
      }); });
    r.on('error', function () { resolve({ status: 0, push: false }); }); r.end();
  });
}

module.exports = async function teamEvents(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET' && req.query && req.query.check === 'push') return res.status(200).json(await canPush());
  if (req.method === 'GET') {
    try {
      const { doc } = await read();
      return res.status(200).json({ ok: true, savedAt: doc.savedAt || null, events: doc.events || [] });
    } catch (err) {
      return res.status(502).json({ error: 'Could not read the agendas', detail: err.message });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!ibo.fromRequest(req)) return res.status(401).json({ error: 'Sign in as admin first.' });

  const body = req.body;
  if (!obj(body) || !obj(body.events)) return res.status(400).json({ error: 'Expected { events, base }.' });
  const ids = Object.keys(body.events);
  if (!ids.length || ids.length > 10) return res.status(400).json({ error: 'Send between 1 and 10 events.' });
  const base = obj(body.base) ? body.base : {};
  let incoming;
  try {
    incoming = {};
    ids.forEach(function (id) { incoming[id] = cleanEvent(id, body.events[id]); });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const { head, doc } = await read();
      const events = (doc.events || []).slice();
      const at = new Date().toISOString();
      for (const id of ids) {
        const i = events.findIndex(function (x) { return x.id === id; });
        const cur = i > -1 ? events[i] : null;
        const was = Object.prototype.hasOwnProperty.call(base, id) ? base[id] : undefined;
        /* Changed elsewhere since this editor loaded it: a newer save, a delete, or a new event
           that took the same id. */
        if (was !== undefined && ((cur ? cur.at : null) !== was)) {
          return res.status(409).json({
            error: cur ? 'This event was changed on another device after you opened it.' : (was ? 'This event was deleted on another device.' : 'An event with this date already exists.'),
            savedAt: doc.savedAt || null, events: events
          });
        }
        if (incoming[id].deleted) { if (i > -1) events.splice(i, 1); continue; }
        const next = Object.assign({}, incoming[id], { at: at });
        if (i > -1) events[i] = next; else events.push(next);
      }
      events.sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
      const out = Object.assign({}, doc, { savedAt: at, events: events });
      const put = await ghRequest('PUT', PATH, {
        message: 'Team Event: edited on the page (' + ids.join(', ') + ')',
        content: Buffer.from(JSON.stringify(out, null, 1) + '\n').toString('base64'),
        branch: 'main',
        ...(head.status === 200 ? { sha: head.data.sha } : {})
      }, REPO);
      if (put.status === 409 && attempt === 0) continue;
      if (put.status >= 300) return res.status(502).json({ error: 'GitHub rejected the write', detail: put.data && put.data.message });
      return res.status(200).json({ ok: true, savedAt: at, events: events });
    }
  } catch (err) {
    console.error('team-events save failed:', err);
    return res.status(500).json({ error: 'Save failed', detail: err.message });
  }
};
