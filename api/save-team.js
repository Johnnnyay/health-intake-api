// POST /api/save-team
// Commits the Team & Org overrides (notes, to-dos, PV goals, DCR and conference flags)
// back into the diamond-hq repo. Same guard and same shape as save-learning.
//
// Why this exists: all of it lived in one browser's localStorage. Clearing site data,
// switching machines or opening the hub on the phone showed an empty board, and nothing
// on screen said the notes were only local. The PV goals added in August made that worse,
// because they render on the chart and so read as real data.

const { ghRequest, cors, fromHub } = require('../lib/github');

const HUB_REPO = process.env.HUB_REPO || 'Johnnnyay/diamond-hq';
const PATH = 'data/team-notes.json';

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!fromHub(req)) {
    return res.status(403).json({ error: 'This endpoint only accepts writes from the hub.' });
  }

  const obj = (v) => (typeof v === 'object' && v !== null && !Array.isArray(v));

  const body = req.body;
  if (!body || !obj(body.people)) {
    return res.status(400).json({ error: 'Expected { people: {...} }.' });
  }
  // Candidates carry what Johnny knows about a person rather than what a calendar knows:
  // whether they are still in process, their background, and the yellow flags. Same file
  // and same write, because it is the same act of annotating the team.
  if (body.candidates !== undefined && !obj(body.candidates)) {
    return res.status(400).json({ error: 'candidates must be an object.' });
  }
  const candidates = body.candidates || {};
  const count = Object.keys(body.people).length;
  const cCount = Object.keys(candidates).length;
  // The org chart drawing he edits by hand (2026-11-06): circles he adds, names he types over,
  // line styles, people he hides. Only plain objects of short strings and flags get through.
  if (body.chart !== undefined && !obj(body.chart)) {
    return res.status(400).json({ error: 'chart must be an object.' });
  }
  const chart = cleanChart(body.chart || {});
  const chCount = Object.keys(chart.add).length + Object.keys(chart.edit).length + Object.keys(chart.versions).length;

  try {
    const head = await ghRequest('GET', PATH, null, HUB_REPO);
    const sha = head.status === 200 ? head.data.sha : undefined;

    // An empty payload over an existing file is almost always a browser that lost its
    // localStorage, not a deliberate wipe. Refuse it. Deleting every note is then a
    // deliberate act against the repo rather than something a cleared cache can do.
    if (count === 0 && cCount === 0 && chCount === 0 && head.status === 200) {
      let prev = 0;
      try {
        const j = JSON.parse(Buffer.from(head.data.content, 'base64').toString('utf8'));
        prev = Object.keys(j.people || {}).length + Object.keys(j.candidates || {}).length
          + Object.keys((j.chart || {}).add || {}).length + Object.keys((j.chart || {}).edit || {}).length
          + Object.keys((j.chart || {}).versions || {}).length;
      } catch (e) {}
      if (prev > 0) {
        return res.status(409).json({
          error: 'Refusing to overwrite ' + prev + ' saved records with an empty set.',
          saved: prev
        });
      }
    }

    const out = { people: body.people, candidates, chart, count, candidateCount: cCount,
                  savedAt: new Date().toISOString(), savedFrom: 'hub' };

    const put = await ghRequest('PUT', PATH, {
      message: 'Team & Org: edited in the hub (' + count + ' people, ' + cCount + ' candidates)',
      content: Buffer.from(JSON.stringify(out, null, 1)).toString('base64'),
      branch: 'main',
      ...(sha ? { sha } : {})
    }, HUB_REPO);

    if (put.status >= 300) {
      return res.status(502).json({ error: 'GitHub rejected the write', detail: put.data && put.data.message });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true, count, candidateCount: cCount, savedAt: out.savedAt,
                                  commit: put.data.commit && put.data.commit.sha });
  } catch (err) {
    console.error('save-team failed:', err);
    return res.status(500).json({ error: 'Save failed', detail: err.message });
  }
};

const ID = /^[A-Za-z0-9_-]{1,80}$/;
const MONTH = /^\d{4}-\d{2}$/;
const STYLES = ['', 'solid', 'bold', 'dotted', 'dashed'];
// Ring and line classes a saved month-end circle may carry. Anything else is dropped, and the page
// escapes every name it draws, so a stored version can never carry markup.
const CLS = ['root', 'blank', 'inactive', 'todo', 'isnew', 'deep', 'nl', 'ph', 'added',
             'st-solid', 'st-bold', 'st-dotted', 'st-dashed', 's-nl', 's-a', 's-b', 's-d90', 's-slot'];
// The stage a circle is drawn with (2026-11-09): new launch, Phase A, Phase B, 90 DCR.
const STAGES = ['nl', 'a', 'b', 'd90'];
const NUM = /^\d{1,6}(\.\d{0,2})?$/;
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
const o = (v) => (typeof v === 'object' && v !== null && !Array.isArray(v)) ? v : {};
function cleanChart(c) {
  const out = { add: {}, edit: {}, versions: {} };
  for (const [id, a] of Object.entries(o(c.add)).slice(0, 300)) {
    if (!ID.test(id) || !ID.test(str(o(a).parent, 80))) continue;
    const x = { parent: a.parent, mkt: str(a.mkt, 8) || 'us', name: str(a.name, 40), at: str(a.at, 30) };
    // A circle he added has no LOS record, so its stage, PV and goal live here.
    if (STAGES.includes(a.stage)) x.stage = a.stage;
    if (NUM.test(str(a.pv, 9))) x.pv = a.pv;
    if (NUM.test(str(a.pg, 9))) x.pg = a.pg;
    // Line styles from before stages. The page turns them into stages on its next load.
    if (STYLES.includes(a.style) && a.style) x.style = a.style;
    out.add[id] = x;
  }
  for (const [id, e] of Object.entries(o(c.edit)).slice(0, 300)) {
    if (!ID.test(id)) continue;
    const x = {};
    if (str(o(e).name, 40)) x.name = str(e.name, 40);
    if (STYLES.includes(o(e).style) && e.style) x.style = e.style;
    if (o(e).hidden === true) x.hidden = true;
    // Moved under someone else on the drawing (2026-11-09). The LOS keeps the real sponsor.
    if (ID.test(str(o(e).parent, 80)) && e.parent !== id) x.parent = e.parent;
    if (Object.keys(x).length) out.edit[id] = x;
  }
  // The month the live chart belongs to, and the function the star tracks ('' = the next one).
  if (MONTH.test(str(c.month, 7))) out.month = c.month;
  if (ID.test(str(c.track, 80))) out.track = c.track;
  // Month-end versions (2026-11-09): a frozen copy of the chart as it stood when the month ended,
  // so the next month's edits never change it. Data only: ids, names, numbers, ring classes.
  for (const [m, v] of Object.entries(o(c.versions)).filter(([m]) => MONTH.test(m)).sort().slice(-60)) {
    const meta = o(o(v).meta), mk = {};
    for (const [k, arr] of Object.entries(o(o(v).mk)).slice(0, 8)) {
      if (!/^[a-z]{2,8}$/.test(k) || !Array.isArray(arr)) continue;
      mk[k] = arr.slice(0, 400).map(cleanNode).filter(Boolean);
    }
    out.versions[m] = { meta: { month: m, period: str(meta.period, 8), exported: str(meta.exported, 10),
      event: str(meta.event, 80), savedAt: str(meta.savedAt, 30) }, mk };
  }
  return out;
}
function cleanNode(n) {
  n = o(n);
  const id = str(n.id, 80);
  if (!ID.test(id)) return null;
  const p = str(n.p, 80), op = str(n.o, 80);
  return { id, p: ID.test(p) ? p : '', n: (Array.isArray(n.n) ? n.n : []).slice(0, 3).map((x) => str(x, 60)),
    pv: str(n.pv, 8), pg: str(n.pg, 8),
    c: str(n.c, 160).split(' ').filter((x) => CLS.includes(x)).join(' '),
    star: n.star ? 1 : 0, td: Math.max(0, Math.min(99, parseInt(n.td, 10) || 0)), o: ID.test(op) ? op : '' };
}
