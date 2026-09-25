const { getFile, pushFile, deleteFile, getIndex, cors, fromKnownOrigin } = require('../lib/github');
const ibo = require('../lib/ibo');

/* Admin sign-in and the two locks on a report. See lib/ibo.js.

   GET  ?r=<rid>                       { report }   is this report open yet (a locked page polls this)
   POST { action: 'login', code }      signs an admin in (sets the session cookie)
   POST { action: 'logout' }           signs out
   POST { action: 'set', rid, report?, products? }   admin only: open or lock either switch
   POST { action: 'delete', rid }                    admin only: permanently remove one report
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

    if (action === 'delete') {
      if (!ibo.fromRequest(req)) return res.status(401).json({ error: 'Sign in as admin first' });
      const rid = String(body.rid || '').trim();
      if (!/^[a-f0-9]{24}$/.test(rid)) return res.status(400).json({ error: 'Bad report id' });

      /* Every file this report could have left behind, across the shapes the store has used:
         current (analysis + access + generation), and the older single-file HTML report. Each
         delete is independent and a 404 (already gone) is not an error, so a report missing one
         piece still cleans up the rest instead of failing whole. */
      const paths = [
        `reports/${rid}.analysis.json`, `reports/${rid}.access.json`, `reports/${rid}.generation.json`,
        `reports/${rid}.translate.json`,
        `reports/${rid}.html`, `reports/${rid}.zh.html`, `reports/${rid}.pdf`, `intake/${rid}.json`,
      ];
      const removed = [];
      for (const p of paths) {
        if (await deleteFile(p, `Delete ${p}`)) removed.push(p);
      }

      // Drop the report from the client's index entry, and the client entry itself if that was
      // their last report, so a deleted test report also disappears from All Reports.
      const index = await getIndex();
      let indexChanged = false, clientRemoved = null;
      for (const [key, client] of Object.entries(index.clients || {})) {
        const before = (client.reports || []).length;
        client.reports = (client.reports || []).filter(r => r.rid !== rid);
        if (client.reports.length !== before) {
          indexChanged = true;
          if (client.reports.length === 0) { delete index.clients[key]; clientRemoved = key; }
          break;
        }
      }
      if (indexChanged) {
        await pushFile('index.json', JSON.stringify(index, null, 2), `Remove report ${rid} from index`);
      }

      if (!removed.length && !indexChanged) return res.status(404).json({ error: 'Report not found' });
      return res.status(200).json({ ok: true, removedFiles: removed.length, clientRemoved });
    }

    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    console.error('unlock failed:', err);
    return res.status(500).json({ error: 'Could not update the report right now' });
  }
};

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
