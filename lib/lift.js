// Lift Log: Johnny's workout app (diamond-hq /lift/), reached through /api/save-functions?doc=lift.
//
// Johnny, 2026-10-20: "there's only one player ever, which is me. I want my web and phone app to
// sync the data ... everytime I add a new template on the phone or a workout record, it should sync
// to the web one and the offline file should be updated ... however you maintain people's record
// for the health assessment, this's the same thing." So his workouts live where the health records
// do, in the private reports repo, and no device signs in:
//
//   lift/johnny.json  every record, the source of truth the app syncs against
//   lift/LOG.md       the same data for reading: templates, best sets, every workout, newest first;
//                     rewritten on every change
//
// A record is one finished workout (w:<start>:<name hash>, so the same session from two devices is
// one record), a template (t:<id>), a custom exercise (c:<id>), a sticky note (s:<exercise id>) or
// the settings (cfg). Each change carries the time it was made on the device (`u`) and the later one
// wins, deletions included. `at` marks when the store took it, strictly increasing, so a device asks
// only for what changed since its last sync. Claude edits the file directly in the repo the same way
// (README.md in lift/ says how).
//
// GET  ?since=<at>                       -> { at, entries, count }
// POST { since, changes:[{k,u,d|del}], names:{id:label}, unit } -> { at, applied, entries, count }

const https = require('https');

const REPO = process.env.REPORTS_REPO || 'johnnnyay/health-reports';
const DATA = 'lift/johnny.json';
const LOG = 'lift/LOG.md';
const KEY = /^(w:\d{10,14}:[a-z0-9]{1,13}|[tcs]:[A-Za-z0-9_-]{1,64}|cfg)$/;
const MAX = 60000;          /* characters per record */
const LB = 0.45359237, MI = 1.609344;

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

function storeError(what, status) {
  const e = new Error(`lift store unreachable: GitHub returned ${status} for ${what}`);
  e.storeUnreachable = true; return e;
}

/* The contents API inlines files up to 1 MB; past that the blob API has it. */
async function readText(path) {
  const r = await gh('GET', 'contents/' + path);
  if (r.status === 404) return { text: null, sha: null };
  if (r.status !== 200) throw storeError(path, r.status);
  if (r.data.content) return { text: Buffer.from(r.data.content, 'base64').toString('utf-8'), sha: r.data.sha };
  const b = await gh('GET', 'git/blobs/' + r.data.sha);
  if (b.status !== 200 || !b.data.content) throw storeError(path + ' (blob)', b.status);
  return { text: Buffer.from(b.data.content, 'base64').toString('utf-8'), sha: r.data.sha };
}
function empty() { return { v: 1, at: 0, unit: 'lb', names: {}, records: {} }; }
async function readDoc() {
  const { text, sha } = await readText(DATA);
  if (text == null) return { doc: empty(), sha: null };
  const doc = Object.assign(empty(), JSON.parse(text));
  return { doc, sha };
}
async function writeText(path, text, sha, message) {
  const body = { message, content: Buffer.from(text).toString('base64'), branch: 'main' };
  if (sha) body.sha = sha;
  return gh('PUT', 'contents/' + path, body);
}

/* Apply a device's changes. Pure, so it can be tested without GitHub. */
function merge(doc, body, now) {
  const changes = Array.isArray(body && body.changes) ? body.changes.slice(0, 5000) : [];
  const mark = Math.max(now, (doc.at || 0) + 1);
  const lost = [];
  let applied = 0, skipped = 0;
  for (const c of changes) {
    const k = c && String(c.k || ''), u = +(c && c.u) || 0;
    if (!KEY.test(k) || !u || u > now + 864e5) { skipped++; continue; }
    const cur = doc.records[k];
    if (cur && cur.u > u) { lost.push(cur); continue; }        /* a newer edit is already here */
    if (c.del) doc.records[k] = { k, u, del: true, at: mark };
    else {
      const txt = JSON.stringify(c.d);
      if (txt === undefined || txt.length > MAX) { skipped++; continue; }
      doc.records[k] = { k, u, d: c.d, at: mark };
    }
    applied++;
  }
  if (applied) doc.at = mark;
  /* Exercise names and the unit, so LOG.md reads like the app does. */
  const names = body && body.names;
  if (names && typeof names === 'object') {
    for (const [id, label] of Object.entries(names).slice(0, 2000)) {
      if (/^[A-Za-z0-9_-]{1,64}$/.test(id) && typeof label === 'string') doc.names[id] = label.slice(0, 120);
    }
  }
  if (body && (body.unit === 'lb' || body.unit === 'kg')) doc.unit = body.unit;
  /* Forget deletion markers after 90 days. */
  const cutoff = now - 90 * 864e5;
  for (const [k, e] of Object.entries(doc.records)) if (e.del && e.at < cutoff) delete doc.records[k];
  return { applied, skipped, lost };
}

function since(doc, n, extra) {
  const out = Object.values(doc.records).filter((e) => e.at > n);
  const seen = new Set(out.map((e) => e.k));
  (extra || []).forEach((e) => { if (!seen.has(e.k)) out.push(e); });
  return out;
}
function count(doc) { return Object.values(doc.records).filter((e) => !e.del).length; }

/* ---------------------------------------------------------------- LOG.md */

function day(t) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(t)).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
  return `${p.year}-${p.month}-${p.day} ${p.weekday}`;
}
function stamp(t) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(t)) + ' ET';
}
function num(v) { return String(Math.round(v * 10) / 10); }
function clock(sec) { sec = Math.round(sec); const m = Math.floor(sec / 60), s = sec % 60; return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; }
function setText(s, unit) {
  const w = s.w != null ? num(unit === 'lb' ? s.w / LB : s.w) : null;
  const d = s.d != null ? num(unit === 'lb' ? s.d / MI : s.d) + (unit === 'lb' ? ' mi' : ' km') : null;
  let t;
  if (w != null && s.r != null) t = `${w}×${s.r}`;
  else if (s.r != null) t = `${s.r} reps` + (w != null ? ` (${w})` : '');
  else if (w != null) t = `${w}`;
  else t = '';
  if (d) t = (t ? t + ' · ' : '') + d;
  if (s.t) t = (t ? t + ' · ' : '') + clock(s.t);
  if (!t) t = '·';
  return (s.kind === 'W' ? 'warm-up ' : s.kind === 'D' ? 'drop ' : s.kind === 'F' ? 'to failure ' : '') + t;
}
function logMd(doc, now) {
  const unit = doc.unit || 'lb';
  const name = (id) => doc.names[id] || (id || '').replace(/^c-/, '').replace(/-/g, ' ');
  const live = Object.values(doc.records).filter((e) => !e.del);
  const workouts = live.filter((e) => e.k[0] === 'w').map((e) => e.d).filter((w) => w && w.start).sort((a, b) => b.start - a.start);
  const templates = live.filter((e) => e.k[0] === 't').map((e) => e.d).filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const sticky = {}; live.filter((e) => e.k[0] === 's').forEach((e) => { sticky[e.k.slice(2)] = e.d; });
  const L = [];
  L.push('# Lift Log', '');
  L.push(`Johnny's workouts, kept in sync with the Lift Log app on his phone and on the web. Weights in ${unit}.`);
  L.push(`Updated ${stamp(now)} · ${workouts.length} workouts` + (workouts.length ? ` · ${day(workouts[workouts.length - 1].start).slice(0, 10)} to ${day(workouts[0].start).slice(0, 10)}` : '') + '.', '');
  L.push('This file is written by the API on every change; the data behind it is johnny.json in this folder.', '');

  L.push('## Templates', '');
  if (!templates.length) L.push('None yet.', '');
  for (const t of templates) {
    L.push(`### ${t.name}`);
    for (const it of t.items || []) {
      const sets = (it.sets || []).filter((s) => s.kind !== 'W');
      const filled = sets.filter((s) => s.w != null || s.r != null || s.t != null || s.d != null);
      const what = filled.length ? filled.map((s) => setText(s, unit)).join(', ') : `${sets.length} set${sets.length === 1 ? '' : 's'}`;
      L.push(`- ${name(it.ex)}: ${what}` + (it.rest != null ? ` · rest ${clock(it.rest)}` : '') + (sticky[it.ex] ? ` · note: ${sticky[it.ex]}` : ''));
    }
    L.push('');
  }

  /* The heaviest working set of every exercise with weights, and when. */
  const best = {};
  for (const w of workouts) for (const it of w.items || []) for (const s of it.sets || []) {
    if (!s.done || s.kind === 'W' || s.w == null || !s.r) continue;
    const b = best[it.ex];
    if (!b || s.w > b.w || (s.w === b.w && s.r > b.r)) best[it.ex] = { w: s.w, r: s.r, at: w.start };
  }
  const bestIds = Object.keys(best).sort((a, b) => name(a).localeCompare(name(b)));
  L.push('## Heaviest set per exercise', '');
  if (!bestIds.length) L.push('None yet.');
  for (const id of bestIds) L.push(`- ${name(id)}: ${setText(best[id], unit)} (${day(best[id].at).slice(0, 10)})`);
  L.push('');

  L.push('## Workouts, newest first', '');
  if (!workouts.length) L.push('None yet.');
  for (const w of workouts) {
    const mins = w.end && w.end > w.start ? Math.round((w.end - w.start) / 60000) : 0;
    L.push(`### ${day(w.start)} · ${w.name || 'Workout'}` + (mins ? ` · ${mins} min` : ''));
    if (w.note) L.push(w.note);
    for (const it of w.items || []) {
      const done = (it.sets || []).filter((s) => s.done);
      if (!done.length) continue;
      L.push(`- ${name(it.ex)}: ${done.map((s) => setText(s, unit)).join(', ')}` + (it.note ? ` · ${it.note}` : ''));
    }
    L.push('');
  }
  return L.join('\n');
}

/* ---------------------------------------------------------------- the handler */

async function lift(req, res) {
  try {
    if (req.method === 'GET') {
      const { doc } = await readDoc();
      const n = +(req.query && req.query.since) || 0;
      return res.status(200).json({ at: doc.at || 0, entries: since(doc, n), count: count(doc) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'GET or POST' });
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const n = +body.since || 0;
    /* Read, merge, write with the sha just read; if another device wrote in between, start over
       from its version so neither write is lost. */
    for (let attempt = 0; attempt < 4; attempt++) {
      const { doc, sha } = await readDoc();
      const now = Date.now();
      const r = merge(doc, body, now);
      const namesOnly = !r.applied;
      if (r.applied || (namesOnly && body.names && !sha)) {
        const put = await writeText(DATA, JSON.stringify(doc), sha, `lift: ${r.applied} change${r.applied === 1 ? '' : 's'} from the app`);
        if (put.status === 409 || put.status === 422) continue;
        if (put.status !== 200 && put.status !== 201) throw storeError(DATA + ' (write)', put.status);
        try {
          const old = await gh('GET', 'contents/' + LOG);
          await writeText(LOG, logMd(doc, now), old.status === 200 ? old.data.sha : null, 'lift: LOG.md');
        } catch (e) { /* the log catches up on the next change; the data is what matters */ }
      }
      return res.status(200).json({ at: doc.at || 0, applied: r.applied, skipped: r.skipped, entries: since(doc, n, r.lost), count: count(doc) });
    }
    return res.status(409).json({ error: 'busy, try again' });
  } catch (e) {
    return res.status(e.storeUnreachable ? 503 : 500).json({ error: e.message });
  }
}

module.exports = lift;
module.exports.merge = merge;
module.exports.logMd = logMd;
