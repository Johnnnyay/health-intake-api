// POST /api/save-team
// Commits the Team & Org overrides (notes, to-dos, PV goals, DCR and conference flags)
// back into the diamond-hq repo. Same guard and same shape as save-learning.
//
// Why this exists: all of it lived in one browser's localStorage. Clearing site data,
// switching machines or opening the hub on the phone showed an empty board, and nothing
// on screen said the notes were only local. The PV goals added in August made that worse,
// because they render on the chart and so read as real data.

const { ghRequest, cors, fromKnownOrigin } = require('../lib/github');

const HUB_REPO = process.env.HUB_REPO || 'Johnnnyay/diamond-hq';
const PATH = 'data/team-notes.json';

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!fromKnownOrigin(req)) {
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

  try {
    const head = await ghRequest('GET', PATH, null, HUB_REPO);
    const sha = head.status === 200 ? head.data.sha : undefined;

    // An empty payload over an existing file is almost always a browser that lost its
    // localStorage, not a deliberate wipe. Refuse it. Deleting every note is then a
    // deliberate act against the repo rather than something a cleared cache can do.
    if (count === 0 && cCount === 0 && head.status === 200) {
      let prev = 0;
      try {
        const j = JSON.parse(Buffer.from(head.data.content, 'base64').toString('utf8'));
        prev = Object.keys(j.people || {}).length + Object.keys(j.candidates || {}).length;
      } catch (e) {}
      if (prev > 0) {
        return res.status(409).json({
          error: 'Refusing to overwrite ' + prev + ' saved records with an empty set.',
          saved: prev
        });
      }
    }

    const out = { people: body.people, candidates, count, candidateCount: cCount,
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
