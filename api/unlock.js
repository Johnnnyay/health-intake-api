const { getFile, pushFile, cors, fromKnownOrigin } = require('../lib/github');

/* Unlock (or re-lock) the product stack on one report.

   A report is locked when it is created: the client fills in the assessment before an
   event and reads their findings, but the "View my products" button does nothing until
   an IBO who is with them enters the partner passcode. That keeps the product walk-through
   in the room, and gives Johnny time to adjust the report in between.

   POST { rid, code, lock? }   ->  { unlocked: true|false }
   The passcode is checked here, on the server, so the report page never carries it. */

const IBO_CODE = (process.env.IBO_UNLOCK_CODE || '66866').trim();

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const sameOrigin = (req.headers.origin || '') === 'https://' + (req.headers.host || '');
  if (!fromKnownOrigin(req) && !sameOrigin) return res.status(403).json({ error: 'Unknown origin' });

  const body = typeof req.body === 'string' ? safeJson(req.body) : (req.body || {});
  const rid = String(body.rid || '').trim();
  if (!/^[a-f0-9]{24}$/.test(rid)) return res.status(400).json({ error: 'Bad report id' });
  if (String(body.code || '').trim() !== IBO_CODE) return res.status(401).json({ error: 'Incorrect passcode' });

  try {
    const stored = await getFile(`reports/${rid}.analysis.json`);
    if (!stored) return res.status(404).json({ error: 'Report not found' });
    const doc = JSON.parse(stored);
    const unlocked = body.lock !== true;
    if (!!doc.unlocked !== unlocked) {
      doc.unlocked = unlocked;
      if (unlocked) doc.unlockedAt = new Date().toISOString(); else delete doc.unlockedAt;
      await pushFile(`reports/${rid}.analysis.json`, JSON.stringify(doc, null, 1),
        `${unlocked ? 'Unlock' : 'Lock'} products: ${rid}`);
    }
    return res.status(200).json({ unlocked });
  } catch (err) {
    console.error('unlock failed:', err);
    return res.status(500).json({ error: 'Could not update the report right now' });
  }
};

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
