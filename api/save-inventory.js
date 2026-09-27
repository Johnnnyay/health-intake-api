// POST /api/save-inventory
// Commits the hand edits from HQ › Volume & Retail › DITTO into data/inventory-edits.json in
// the diamond-hq repo: a product's count, how many of those are opened, and how many units are
// set aside for retail. inventory/inventory.py reads the same file when it plans the next order.
//
// Unlike save-team this merges per product instead of replacing the file. Each entry carries
// the time it was made (`at`), and the later one wins. A tab left open on the phone since
// yesterday can then only overwrite the products it actually touched, and only with newer taps.
//
// Body: { stock:  { "<sku>": { qty, opened, at } | { reset: true, at } },
//         ditto:  { "<sku>": { n, for, at } | { reset: true, at } },   Next DITTO set by hand, for one DITTO date
//         retail: { "<sku>": { n, at } | { reset: true, at } } }         (no longer used by the page)

const { ghRequest, cors, fromKnownOrigin } = require('../lib/github');

const HUB_REPO = process.env.HUB_REPO || 'Johnnnyay/diamond-hq';
const PATH = 'data/inventory-edits.json';
const SKU = /^[A-Za-z0-9]{3,12}$/;

const obj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v) => typeof v === 'number' && isFinite(v) && v >= 0 && v <= 999;

function clean(section, kind) {
  const out = {};
  for (const [sku, e] of Object.entries(section || {})) {
    if (!SKU.test(sku) || !obj(e) || typeof e.at !== 'string' || isNaN(Date.parse(e.at))) {
      throw new Error('bad entry for ' + sku);
    }
    if (e.reset === true) { out[sku] = { reset: true, at: e.at }; continue; }
    if (kind === 'stock') {
      if (!num(e.qty) || !num(e.opened || 0) || (e.opened || 0) > e.qty) throw new Error('bad count for ' + sku);
      out[sku] = { qty: e.qty, opened: e.opened || 0, at: e.at };
    } else if (kind === 'ditto') {
      if (!num(e.n) || !Number.isInteger(e.n) || !/^\d{4}-\d{2}-\d{2}$/.test(e.for || '')) throw new Error('bad Next DITTO for ' + sku);
      out[sku] = { n: e.n, for: e.for, at: e.at };
    } else {
      if (!num(e.n)) throw new Error('bad retail count for ' + sku);
      out[sku] = { n: e.n, at: e.at };
    }
  }
  return out;
}

function merge(prev, incoming) {
  const out = Object.assign({}, prev);
  let changed = 0;
  for (const [sku, e] of Object.entries(incoming)) {
    if (!out[sku] || Date.parse(e.at) >= Date.parse(out[sku].at)) { out[sku] = e; changed++; }
  }
  return { out, changed };
}

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!fromKnownOrigin(req)) {
    return res.status(403).json({ error: 'This endpoint only accepts writes from the hub.' });
  }

  const body = req.body;
  if (!obj(body)) return res.status(400).json({ error: 'Expected { stock, retail }.' });
  let stock, retail, ditto;
  try {
    stock = clean(body.stock, 'stock');
    retail = clean(body.retail, 'retail');
    ditto = clean(body.ditto, 'ditto');
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  if (!Object.keys(stock).length && !Object.keys(retail).length && !Object.keys(ditto).length) {
    return res.status(400).json({ error: 'Nothing to save.' });
  }

  try {
    // Two tries: if the file moved between our read and our write, read it again and re-merge.
    for (let attempt = 0; attempt < 2; attempt++) {
      const head = await ghRequest('GET', PATH, null, HUB_REPO);
      let prev = { stock: {}, retail: {}, ditto: {} };
      if (head.status === 200) {
        try { prev = JSON.parse(Buffer.from(head.data.content, 'base64').toString('utf8')); } catch (e) {}
      }
      const s = merge(prev.stock || {}, stock);
      const r = merge(prev.retail || {}, retail);
      const t = merge(prev.ditto || {}, ditto);
      const out = { stock: s.out, ditto: t.out, retail: r.out, savedAt: new Date().toISOString(), savedFrom: 'hub' };
      const put = await ghRequest('PUT', PATH, {
        message: 'Inventory: edited in the hub (' + (s.changed + r.changed + t.changed) + ' change' + (s.changed + r.changed + t.changed === 1 ? '' : 's') + ')',
        content: Buffer.from(JSON.stringify(out, null, 1) + '\n').toString('base64'),
        branch: 'main',
        ...(head.status === 200 ? { sha: head.data.sha } : {})
      }, HUB_REPO);
      if (put.status === 409 && attempt === 0) continue;
      if (put.status >= 300) {
        return res.status(502).json({ error: 'GitHub rejected the write', detail: put.data && put.data.message });
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json({ ok: true, changed: s.changed + r.changed + t.changed, savedAt: out.savedAt,
                                    edits: { stock: out.stock, ditto: out.ditto, retail: out.retail } });
    }
  } catch (err) {
    console.error('save-inventory failed:', err);
    return res.status(500).json({ error: 'Save failed', detail: err.message });
  }
};
