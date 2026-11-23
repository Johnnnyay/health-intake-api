// Year-end gala show board (Johnny, 2026-11-23): "跨年晚会大家都可以报名节目。我想 build 一个 site 去让我的
// team 来 propose shows idea 并 vote 想看哪个以及想参加哪个." A new kind of event on team.unityhyventures.com
// (kind "Gala"), reached through /api/save-functions?doc=gala&event=<event id>, so the API stays at
// 12 functions.
//
// His rules: anyone with the link can take part (no sign-in, a name is enough); each person has 3
// red hearts (最想看) and unlimited white hearts (比较期待); proposals and hearts close at the
// deadline (default Sun Nov 29, 11:59 PM ET), "I want to be in it" stays open after it for
// rehearsals; the admin login picks the lineup (selected / maybe / cut), merges duplicates, sets the
// order and a lead.
//
// The board lives in the private reports repo (gala/<event id>.json), not the public site repo, so
// a heart doesn't rebuild the site. Every write is one small operation (toggle one heart, add one
// show), applied to the latest copy and retried when two phones write at once, so nobody's tap
// overwrites someone else's.
//
// GET  ?event=<id>                       -> board
// POST { op: "vote", name, sid, kind: "red"|"white"|"join", on }
//      { op: "propose", name, show }      { op: "edit", name, sid, show }      { op: "delete", name, sid }
//      admin only: { op: "admin", sid, status?, order?, lead?, mergeInto? }   { op: "deadline", deadline }

const https = require('https');
const ibo = require('./ibo');

const REPO = process.env.REPORTS_REPO || 'johnnnyay/health-reports';
const EVENT = /^\d{4}-\d{2}-\d{2}(-[a-z0-9]{1,8})?$/;
const SID = /^s[a-z0-9]{4,16}$/;
const KINDS = ['song', 'dance', 'skit', 'lipsync', 'video', 'game', 'other'];
const MODES = ['live', 'recorded'];
const STATUS = ['open', 'selected', 'maybe', 'cut'];
const RED_MAX = 3;
const DEFAULT_DEADLINE = '2026-11-30T04:59:00.000Z';   /* Sun Nov 29, 11:59 PM ET */

/* What the board starts with (Johnny, 2026-11-23: only these two; everyone else proposes again). */
const SEED = {
  '2026-12-31-gala': [
    { id: 'ssnowwhite', title: 'Snow White, the product edition (白雪公主)', kind: 'skit', mode: 'recorded', minutes: 6, need: 6,
      desc: 'A pre-recorded skit, played on the screen. The poisoned comb fails because her hair is too smooth from Satinique, the poisoned apple works because it oxidized, and the prince wakes her up because he takes his vitamin C, an antioxidant. Funnier reasons welcome.',
      link: '', by: 'Johnny' },
    { id: 'ssongremix', title: 'Group singing remix with a story line (歌曲串烧)', kind: 'song', mode: 'live', minutes: 6, need: 8,
      desc: 'A medley that tells one story from song to song. Ideas: Can\'t Stop the Feeling (Justin Timberlake), I Want It That Way (Backstreet Boys), Maroon 5 (Memories, Payphone, Moves Like Jagger, Sugar, Maps).',
      link: 'https://www.youtube.com/watch?v=dTp5VySDwyE', by: 'Johnny' }
  ]
};

const obj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
function str(v, max, what) {
  if (v == null || v === '') return '';
  if (typeof v !== 'string') throw new Error(what + ' must be text');
  const s = v.replace(/\r\n?/g, '\n').trim();
  if (s.length > max) throw new Error(what + ' is too long (' + max + ' characters at most)');
  return s;
}
function personKey(name) { return String(name || '').toLowerCase().replace(/\s+/g, ' ').trim(); }
function cleanName(v) {
  const n = str(v, 40, 'Your name').replace(/\s+/g, ' ');
  if (!n) throw new Error('Type your name first.');
  return n;
}

function gh(method, path, body) {
  const token = process.env.GITHUB_TOKEN;
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.github.com', path: `/repos/${REPO}/${path}`, method,
      headers: {
        'Authorization': `token ${token}`, 'User-Agent': 'health-intake-api',
        'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    }, (res) => {
      let data = ''; res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => { let j = {}; try { j = JSON.parse(data); } catch (e) {} resolve({ status: res.statusCode, data: j }); });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function seeded(eventId) {
  const doc = { v: 1, deadline: DEFAULT_DEADLINE, shows: {}, people: {} };
  (SEED[eventId] || []).forEach(function (s, i) {
    doc.shows[s.id] = Object.assign({ status: 'open', order: 0, lead: '', at: '2026-11-23T00:00:00.000Z', n: i }, s, { byKey: personKey(s.by) });
  });
  return doc;
}
async function readDoc(eventId) {
  const path = 'contents/gala/' + eventId + '.json';
  const r = await gh('GET', path);
  if (r.status === 404) return { doc: seeded(eventId), sha: null };
  if (r.status !== 200 || !r.data.content) { const e = new Error('GitHub returned ' + r.status); e.unreachable = true; throw e; }
  return { doc: JSON.parse(Buffer.from(r.data.content, 'base64').toString('utf8')), sha: r.data.sha };
}
function isOpen(doc) { return Date.now() < Date.parse(doc.deadline || DEFAULT_DEADLINE); }

/* What a phone sees: every show, and who gave which heart (names only). */
function view(doc) {
  const shows = Object.values(doc.shows || {}).filter(function (s) { return !s.mergedInto; });
  const people = {};
  Object.keys(doc.people || {}).forEach(function (k) {
    const p = doc.people[k]; people[k] = { name: p.name, red: p.red || [], white: p.white || [], join: p.join || [] };
  });
  return { ok: true, deadline: doc.deadline || DEFAULT_DEADLINE, open: isOpen(doc), redMax: RED_MAX, shows: shows, people: people };
}

function cleanShow(s) {
  if (!obj(s)) throw new Error('Expected a show.');
  const title = str(s.title, 120, 'The name of the show');
  if (!title) throw new Error('Give the show a name.');
  const kind = KINDS.includes(s.kind) ? s.kind : 'other';
  const mode = MODES.includes(s.mode) ? s.mode : 'live';
  const link = str(s.link, 400, 'The link');
  if (link && !/^https?:\/\/\S+$/.test(link)) throw new Error('The link must start with https://');
  const num = function (v, max) { const n = Math.round(Number(v)); return isFinite(n) && n > 0 ? Math.min(n, max) : 0; };
  return { title: title, kind: kind, mode: mode, desc: str(s.desc, 1200, 'The description'), link: link, minutes: num(s.minutes, 60), need: num(s.need, 60) };
}

/* One operation on the latest copy. Returns an error message, or null when applied. */
function apply(doc, op, isAdmin, at) {
  doc.shows = doc.shows || {}; doc.people = doc.people || {};
  const open = isOpen(doc);
  if (op.op === 'deadline' || op.op === 'admin') {
    if (!isAdmin) return 'Sign in as admin first.';
    if (op.op === 'deadline') {
      if (isNaN(Date.parse(op.deadline))) return 'Bad deadline.';
      doc.deadline = new Date(op.deadline).toISOString(); return null;
    }
    const s = doc.shows[op.sid]; if (!s || s.mergedInto) return 'That show is gone.';
    if (op.status !== undefined) { if (!STATUS.includes(op.status)) return 'Bad status.'; s.status = op.status; }
    if (op.order !== undefined) { const o = Math.round(Number(op.order)); s.order = isFinite(o) && o > 0 ? Math.min(o, 99) : 0; }
    if (op.lead !== undefined) s.lead = str(op.lead, 80, 'The lead');
    if (op.mergeInto !== undefined) {
      const into = doc.shows[op.mergeInto];
      if (!into || into.mergedInto || op.mergeInto === op.sid) return 'Pick another show to merge into.';
      s.mergedInto = op.mergeInto;
      /* Hearts and sign-ups follow the show; a red heart that would be a duplicate is dropped. */
      Object.values(doc.people).forEach(function (p) {
        ['red', 'white', 'join'].forEach(function (k) {
          const L = p[k] || []; if (L.indexOf(op.sid) < 0) return;
          p[k] = L.filter(function (x) { return x !== op.sid; });
          if (p[k].indexOf(op.mergeInto) < 0) p[k].push(op.mergeInto);
        });
      });
    }
    s.at = at; return null;
  }

  let name;
  try { name = cleanName(op.name); } catch (e) { return e.message; }
  const key = personKey(name);
  const me = doc.people[key] || (doc.people[key] = { name: name, red: [], white: [], join: [] });
  me.name = name; me.u = at;

  if (op.op === 'vote') {
    const s = doc.shows[op.sid]; if (!s || s.mergedInto) return 'That show is gone.';
    if (!['red', 'white', 'join'].includes(op.kind)) return 'Bad vote.';
    if (op.kind !== 'join' && !open) return 'Voting has closed.';
    if (op.kind !== 'join' && s.status === 'cut') return 'That show is not going ahead.';
    const L = me[op.kind] = (me[op.kind] || []).filter(function (x) { return doc.shows[x] && !doc.shows[x].mergedInto; });
    const has = L.indexOf(op.sid) > -1;
    if (op.on && !has) {
      if (op.kind === 'red' && L.length >= RED_MAX) return 'You have used all ' + RED_MAX + ' red hearts. Take one back first.';
      L.push(op.sid);
      /* one heart per show: a red heart replaces a white one */
      if (op.kind === 'red') me.white = (me.white || []).filter(function (x) { return x !== op.sid; });
      if (op.kind === 'white') me.red = (me.red || []).filter(function (x) { return x !== op.sid; });
    }
    if (!op.on && has) me[op.kind] = L.filter(function (x) { return x !== op.sid; });
    return null;
  }
  if (op.op === 'propose') {
    if (!open && !isAdmin) return 'Proposals have closed.';
    if (Object.keys(doc.shows).length >= 200) return 'The board is full.';
    let show; try { show = cleanShow(op.show); } catch (e) { return e.message; }
    let id; do { id = 's' + Math.random().toString(36).slice(2, 10); } while (doc.shows[id]);
    doc.shows[id] = Object.assign(show, { id: id, by: name, byKey: key, status: 'open', order: 0, lead: '', at: at, n: Object.keys(doc.shows).length });
    me.join = (me.join || []).concat(id);          /* whoever proposes it is in it */
    op._id = id; return null;
  }
  const s = doc.shows[op.sid]; if (!s || s.mergedInto) return 'That show is gone.';
  const mine = s.byKey === key;
  if (op.op === 'edit') {
    if (!mine && !isAdmin) return 'Only ' + s.by + ' can change this show.';
    let show; try { show = cleanShow(op.show); } catch (e) { return e.message; }
    Object.assign(s, show, { at: at }); return null;
  }
  if (op.op === 'delete') {
    if (!mine && !isAdmin) return 'Only ' + s.by + ' can delete this show.';
    const others = Object.keys(doc.people).some(function (k) {
      if (k === key) return false; const p = doc.people[k];
      return ['red', 'white', 'join'].some(function (x) { return (p[x] || []).indexOf(op.sid) > -1; });
    });
    if (others && !isAdmin) return 'Others have already voted for or joined this show, so ask Johnny to remove it.';
    delete doc.shows[op.sid];
    Object.values(doc.people).forEach(function (p) { ['red', 'white', 'join'].forEach(function (x) { p[x] = (p[x] || []).filter(function (y) { return y !== op.sid; }); }); });
    return null;
  }
  return 'Unknown action.';
}

module.exports = async function gala(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const eventId = String((req.query && req.query.event) || '');
  if (!EVENT.test(eventId)) return res.status(400).json({ error: 'Which event?' });
  if (req.method === 'GET') {
    try { const { doc } = await readDoc(eventId); return res.status(200).json(view(doc)); }
    catch (err) { return res.status(502).json({ error: 'Could not load the board', detail: err.message }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const op = req.body;
  if (!obj(op) || typeof op.op !== 'string') return res.status(400).json({ error: 'Expected an action.' });
  if (op.sid !== undefined && !SID.test(String(op.sid))) return res.status(400).json({ error: 'Bad show.' });
  if (op.mergeInto !== undefined && !SID.test(String(op.mergeInto))) return res.status(400).json({ error: 'Bad show.' });
  const isAdmin = !!ibo.fromRequest(req);
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const { doc, sha } = await readDoc(eventId);
      const at = new Date().toISOString();
      const err = apply(doc, op, isAdmin, at);
      if (err) return res.status(err === 'Sign in as admin first.' ? 401 : 400).json(Object.assign({ error: err }, view(doc)));
      if (Object.keys(doc.people).length > 600) return res.status(400).json({ error: 'Too many people on this board.' });
      doc.savedAt = at;
      const who = op.name ? String(op.name).slice(0, 40) : 'admin';
      const put = await gh('PUT', 'contents/gala/' + eventId + '.json', {
        message: 'Gala ' + eventId + ': ' + op.op + (op.kind ? ' ' + op.kind : '') + ' by ' + who,
        content: Buffer.from(JSON.stringify(doc, null, 1) + '\n').toString('base64'),
        branch: 'main', ...(sha ? { sha: sha } : {})
      });
      if ((put.status === 409 || put.status === 422) && attempt < 4) { await new Promise(function (r) { setTimeout(r, 150 + Math.random() * 350); }); continue; }
      if (put.status >= 300) return res.status(502).json({ error: 'Could not save, try again.', detail: put.data && put.data.message });
      return res.status(200).json(Object.assign(view(doc), op._id ? { id: op._id } : {}));
    }
    return res.status(503).json({ error: 'Busy, try again.' });
  } catch (err) {
    console.error('gala save failed:', err);
    return res.status(500).json({ error: 'Save failed', detail: err.message });
  }
};
