const { getFile, cors, fromKnownOrigin } = require('../lib/github');
const ibo = require('../lib/ibo');

/* Admin sign-in and the two locks on a report. See lib/ibo.js.

   GET  ?r=<rid>                       { report }   is this report open yet (a locked page polls this)
   POST { action: 'login', code }      signs an admin in (sets the session cookie)
   POST { action: 'logout' }           signs out
   POST { action: 'set', rid, report?, products? }   admin only: open or lock either switch
   The passcode is checked here, on the server, so a report page never carries it. */

module.exports = async (req, res) => {
  cors(req, res);
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Vary', 'Cookie');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const rid = String(req.query.r || '').trim();
      if (!/^[a-f0-9]{24}$/.test(rid)) return res.status(400).json({ error: 'Bad report id' });
      return res.status(200).json({ report: await ibo.reportOpen(rid) });
    }
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const sameOrigin = (req.headers.origin || '') === 'https://' + (req.headers.host || '');
    if (!fromKnownOrigin(req) && !sameOrigin) return res.status(403).json({ error: 'Unknown origin' });

    const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
    const action = String(body.action || '');

    if (action === 'login') {
      if (!ibo.codeOk(body.code)) {
        await new Promise(r => setTimeout(r, 600));   // slows guessing; the code is short
        return res.status(401).json({ error: 'Incorrect passcode' });
      }
      ibo.setCookie(res);
      return res.status(200).json({ ok: true, token: ibo.sessionToken() });
    }

    if (action === 'logout') {
      ibo.clearCookie(res);
      return res.status(200).json({ ok: true });
    }

    if (action === 'set') {
      if (!ibo.fromRequest(req)) return res.status(401).json({ error: 'Sign in as admin first' });
      const rid = String(body.rid || '').trim();
      if (!/^[a-f0-9]{24}$/.test(rid)) return res.status(400).json({ error: 'Bad report id' });
      const stored = await getFile(`reports/${rid}.analysis.json`);
      if (!stored) return res.status(404).json({ error: 'Report not found' });
      const doc = JSON.parse(stored);
      const patch = {};
      if (typeof body.report === 'boolean') patch.report = body.report;
      if (typeof body.products === 'boolean') patch.products = body.products;
      if (patch.report === false && body.products === undefined) patch.products = false;   // locking the report locks the list too
      const now = await ibo.setAccess(rid, doc.assessmentDate, doc.unlocked, patch);
      return res.status(200).json(now);
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('unlock failed:', err);
    return res.status(500).json({ error: 'Could not update the report right now' });
  }
};

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
