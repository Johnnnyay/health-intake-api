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
  const chCount = Object.keys(chart.add).length + Object.keys(chart.edit).length;

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
          + Object.keys((j.chart || {}).add || {}).length + Object.keys((j.chart || {}).edit || {}).length;
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
const STYLES = ['', 'solid', 'bold', 'dotted', 'dashed'];
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
function cleanChart(c) {
  const out = { add: {}, edit: {} };
  const o = (v) => (typeof v === 'object' && v !== null && !Array.isArray(v)) ? v : {};
  for (const [id, a] of Object.entries(o(c.add)).slice(0, 300)) {
    if (!ID.test(id) || !ID.test(str(o(a).parent, 80))) continue;
    out.add[id] = { parent: a.parent, mkt: str(a.mkt, 8) || 'us', name: str(a.name, 40),
      style: STYLES.includes(a.style) ? a.style : 'dashed', at: str(a.at, 30) };
  }
  for (const [id, e] of Object.entries(o(c.edit)).slice(0, 300)) {
    if (!ID.test(id)) continue;
    const x = {};
    if (str(o(e).name, 40)) x.name = str(e.name, 40);
    if (STYLES.includes(o(e).style) && e.style) x.style = e.style;
    if (o(e).hidden === true) x.hidden = true;
    if (Object.keys(x).length) out.edit[id] = x;
  }
  return out;
}
