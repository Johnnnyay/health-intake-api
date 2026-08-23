// POST /api/lookup  { email, dob }
// Powers my-report.html. Returns only the matching client's own reports, and only
// when both email and date of birth are correct. Never returns the full index.
//
// Was initials + date of birth, which collided: three clients share AH and two
// share JH. Initials also asked people to reconstruct something the form never
// requested, since plenty give only a first name. Email is what they actually
// typed into the form, and it is unique.

const { getIndex, cors } = require('../lib/github');

const hits = new Map(); // best-effort per-instance throttle

function throttled(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { n: 0, t: now };
  if (now - rec.t > 60000) { rec.n = 0; rec.t = now; }
  rec.n += 1;
  hits.set(ip, rec);
  return rec.n > 10;
}

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (throttled(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Wait a minute and try again.' });
  }

  const email = String((req.body && req.body.email) || '').trim().toLowerCase();
  const dob = String((req.body && req.body.dob) || '').trim();

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return res.status(400).json({ error: 'Enter the email address you used on the form, and your date of birth.' });
  }

  try {
    const index = await getIndex();
    /* The index is still keyed by initials and date of birth, so match on the stored
       email instead of the key. Date of birth must also match, so an email alone is
       not enough to retrieve anyone's report. */
    const client = Object.values(index.clients || {}).find(c =>
      String(c.email || '').trim().toLowerCase() === email && String(c.dob || '') === dob);

    // Same response shape and timing for "wrong details" as for "no reports yet",
    // so this cannot be used to probe which clients exist.
    if (!client) {
      return res.status(404).json({ error: 'No report found for those details. Double-check the email you used on the form and your date of birth, or contact your consultant.' });
    }

    return res.status(200).json({
      name: client.name,
      dob: client.dob,
      reports: (client.reports || []).map(r => ({
        date: r.date,
        rid: r.rid,
        signals: r.signals || [],
        products: r.products || [],
        consultant: r.consultant || 'Johnny/Irene'
      }))
    });
  } catch (err) {
    console.error('lookup failed:', err);
    return res.status(500).json({ error: 'Lookup failed. Try again in a minute.' });
  }
};
