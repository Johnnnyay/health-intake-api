// Health Assessment API — Vercel Serverless Function
// Receives form data, calls Claude API, generates report, pushes to GitHub

const https = require('https');
const crypto = require('crypto');
const { pushFile: pushPrivate, getIndex: getPrivateIndex, getFile: getPrivateFile, cors } = require('../lib/github');
const { buildHTML } = require('../lib/render');
const { CANONICAL } = require('../lib/i18n');

// ─── CONFIG ────────────────────────────────────────────────────────────────

const GITHUB_REPO = 'johnnnyay/product-marketing';
const CALC_BASE = 'https://johnnnyay.github.io/product-marketing/#s=';
// Reports are served through this API from a private repo, never as public files.
const REPORT_BASE = (process.env.API_BASE || 'https://health-intake-api.vercel.app') + '/api/report?r=';

// ─── PRODUCT CATALOGUE (fetched at request time — never hardcoded) ─────────

const SITE = 'https://johnnnyay.github.io/product-marketing';

function getJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

// Build the product menu from the live catalogue.
//
// details.json is the product universe: it is keyed by the exact product id the
// calculator URL uses, which is why it drives the menu. data/products.json is a
// Notion-derived view whose products live in categories[].rows[], and it carries the
// PV and price cells, so it is used only to enrich. Reading `products` off the top of
// that file yields nothing, which would silently hand the model an empty catalogue.
async function buildCatalogue() {
  const [details, prod, protocol] = await Promise.all([
    getJSON(SITE + '/details.json'),
    getJSON(SITE + '/data/products.json').catch(() => ({})),
    getJSON(SITE + '/protocol.json').catch(() => ({}))
  ]);

  // Prices live in the Notion table under display names carrying emoji and brand
  // prefixes ("🍒 Nutrilite Vitamin C Extended Release"), while ids are slugs. Match on
  // token overlap after dropping brand words, which recovers the priced core of the line.
  const STOP = new Set(['nutrilite','artistry','amway','the','and','with','glister',
                        'satinique','g','h','xs','legacy','of','clean']);
  const toks = (str) => new Set(String(str).toLowerCase().replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/).filter(t => t && !STOP.has(t) && !/^\d+$/.test(t)));

  const rows = [];
  for (const cat of (prod.categories || [])) {
    const cols = cat.columns || [];
    for (const row of (cat.rows || [])) {
      const cells = row.cells || [];
      const pick = (want) => {
        const i = cols.findIndex(c => c.toLowerCase().includes(want));
        return (i >= 0 && i < cells.length) ? String(cells[i] || '').trim() : '';
      };
      rows.push({ t: toks(row.name), pv: pick('pv'), ibo: pick('ibo'), retail: pick('retail') });
    }
  }

  const priceFor = (id) => {
    const pt = toks(id.replace(/-/g, ' '));
    let best = null, bs = 0;
    for (const r of rows) {
      if (!r.t.size) continue;
      let hit = 0;
      for (const t of r.t) if (pt.has(t)) hit++;
      const sc = hit / r.t.size;
      if (sc > bs) { bs = sc; best = r; }
    }
    return bs >= 0.6 ? best : null;
  };

  const titleize = (id) => id.split('-')
    .map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(' ');
  const ids = Object.keys(details);
  const lines = ids.map(id => {
    const d = details[id] || {};
    const name = titleize(id);
    const money = priceFor(id) || {};
    const adv = (d.advantage || '').replace(/\s+/g, ' ').slice(0, 105);
    const who = (d.who || '').replace(/\s+/g, ' ').slice(0, 70);
    const cost = [money.pv && money.pv + ' PV', money.ibo && money.ibo + ' IBO',
                  money.retail && money.retail + ' retail'].filter(Boolean).join(' / ');
    return `- ${id} | ${name}${cost ? ' | ' + cost : ''} | ${adv}${who ? ' | best for: ' + who : ''}`;
  });

  const stages = (protocol.stages || []).map(st =>
    `${st.zh} ${st.label} (${st.labelEnLong || ''}) — ${st.sub || ''}`).join('\n');

  return { menu: lines.join('\n'), count: ids.length, stages,
           areas: protocol.areas ? Object.keys(protocol.areas).join(', ') : '' };
}

// ─── REPORT SPEC (single source of truth, fetched at request time) ─────────
//
// The analysis rules, the 清调补养 plan structure, the compliance guardrails and the
// output schema all live in ONE file: report-spec.md in the private health-reports repo.
// This function is the only way they enter the system. Do not paste a copy back in here.
// To change how reports are written, edit report-spec.md in Claude Code and push.

let _specCache = { text: null, at: 0 };
const SPEC_TTL_MS = 5 * 60 * 1000;

async function fetchSpec() {
  if (_specCache.text && Date.now() - _specCache.at < SPEC_TTL_MS) return _specCache.text;
  const text = await getPrivateFile('report-spec.md');   // returns string | null
  if (!text) {
    if (_specCache.text) return _specCache.text;   // serve stale rather than fail
    throw new Error('report-spec.md unavailable from the private reports repo');
  }
  _specCache = { text, at: Date.now() };
  return text;
}

// ─── GITHUB HELPERS ─────────────────────────────────────────────────────────

function githubRequest(method, path, body) {
  const token = process.env.GITHUB_TOKEN;
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/contents/${path}`,
      method,
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'health-intake-api',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { resolve({ status: res.statusCode, data: {} }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function getFileSha(path) {
  const res = await githubRequest('GET', path);
  return res.status === 200 ? res.data.sha : null;
}

async function pushFile(repoPath, content, message) {
  const sha = await getFileSha(repoPath);
  const encoded = Buffer.from(content).toString('base64');
  const body = { message, content: encoded, branch: 'main' };
  if (sha) body.sha = sha;
  return githubRequest('PUT', repoPath, body);
}

async function getIndexJSON() {
  const res = await githubRequest('GET', 'reports/index.json');
  if (res.status === 200) {
    const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
    return JSON.parse(content);
  }
  return { clients: {} };
}

// ─── ANTHROPIC API CALL ──────────────────────────────────────────────────────

function callClaude(formText, SYSTEM) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  const payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8192,
    // The spec and the 175-product catalogue are byte-identical across requests, so mark
    // them cacheable. Without this the prefill is paid on every submission and the
    // function runs close to the 60s ceiling.
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Analyze this health assessment and return JSON:\n\n${formText}` }]
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            const m = parsed.error.message || 'Anthropic error';
            const auth = /invalid|authentication/i.test(m);
            return reject(new Error(auth
              ? `${m} (key present: ${apiKey ? 'yes' : 'no'}, length: ${apiKey.length}, prefix: ${apiKey.slice(0, 7)})`
              : m));
          }
          resolve(parsed.content[0].text);
        } catch (e) {
          reject(new Error('Failed to parse Claude response'));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── HTML TEMPLATE ───────────────────────────────────────────────────────────

function formatForm(form) {
  const lines = ['=== HEALTH ASSESSMENT ===', ''];
  lines.push(`Name: ${form.name}`);
  lines.push(`Email: ${form.email || 'N/A'}`);
  lines.push(`DOB: ${form.dob}`);
  lines.push(`Gender: ${form.gender}`);
  lines.push(`Height: ${form.height || 'N/A'}`);
  lines.push(`Weight: ${form.weight ? form.weight + ' lb' : 'N/A'}`);
  lines.push('');

  if (form.bmi || form.bodyFat || form.visceralFat) {
    lines.push('--- Body Composition ---');
    if (form.bmi) lines.push(`BMI: ${form.bmi}`);
    if (form.bodyFat) lines.push(`Body Fat: ${form.bodyFat}%`);
    if (form.skeletalMuscle) lines.push(`Skeletal Muscle: ${form.skeletalMuscle}%`);
    if (form.visceralFat) lines.push(`Visceral Fat: ${form.visceralFat}`);
    if (form.bodyWater) lines.push(`Body Water: ${form.bodyWater}%`);
    if (form.metabolicAge) lines.push(`Metabolic Age: ${form.metabolicAge}`);
    if (form.protein) lines.push(`Protein: ${form.protein}%`);
    if (form.muscleMass) lines.push(`Muscle Mass: ${form.muscleMass} lb`);
    if (form.fatFreeMass) lines.push(`Fat-free Mass: ${form.fatFreeMass} lb`);
    lines.push('');
  }

  if (form.symptoms && Object.keys(form.symptoms).length > 0) {
    lines.push('--- Symptoms (Often / Sometimes / Rarely / Never) ---');
    const grouped = {};
    for (const [key, val] of Object.entries(form.symptoms)) {
      const [cat, sym] = key.split('__');
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(`  ${sym}: ${val}`);
    }
    for (const [cat, items] of Object.entries(grouped)) {
      lines.push(cat + ':');
      lines.push(...items);
    }
    lines.push('');
  }

  lines.push('--- Lifestyle ---');
  if (form.water) lines.push(`Daily water: ${form.water}`);
  if (form.produce) lines.push(`F&V servings/day: ${form.produce}`);
  if (form.diet) lines.push(`Diet type: ${form.diet}`);
  if (form.coldFood) lines.push(`Cold food/drink preference: ${form.coldFood}`);
  if (form.breakfastFreq) lines.push(`Eats breakfast: ${form.breakfastFreq}`);
  if (form.breakfastProtein) lines.push(`Protein at breakfast: ${form.breakfastProtein}`);
  if (form.bedtime) lines.push(`Bedtime: ${form.bedtime}`);
  if (form.waking13) lines.push(`1-3 AM waking: ${form.waking13}`);
  if (form.supplements) lines.push(`Current supplements: ${form.supplements}`);
  if (form.supplementFreq) lines.push(`Supplement consistency: ${form.supplementFreq}`);
  if (form.notes) lines.push(`Additional notes: ${form.notes}`);

  // Pass through everything not explicitly formatted above. Intake forms change and fields
  // get added, and silently dropping them means the model reasons on partial data. Budget
  // and medications in particular drive rules in the spec, so losing them changes the report.
  const KNOWN = new Set(['name', 'email', 'dob', 'gender', 'height', 'weight', 'weightKg',
    'bmi', 'bodyFat', 'skeletalMuscle', 'visceralFat', 'bodyWater', 'metabolicAge', 'protein',
    'muscleMass', 'fatFreeMass', 'subcutaneousFat', 'boneMass', 'bmr', 'symptoms', 'water',
    'produce', 'diet', 'coldFood', 'breakfastFreq', 'breakfastProtein', 'bedtime', 'waking13',
    'supplements', 'supplementFreq', 'notes', 'analysis', 'specVersion']);
  const label = (k) => k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim();
  const extra = Object.keys(form)
    .filter(k => !KNOWN.has(k) && form[k] !== null && form[k] !== undefined && form[k] !== '')
    .map(k => `${label(k)}: ${typeof form[k] === 'object' ? JSON.stringify(form[k]) : form[k]}`);
  if (extra.length) {
    lines.push('');
    lines.push('--- Other intake answers ---');
    lines.push(...extra);
  }

  return lines.join('\n');
}

// ─── MAIN HANDLER ────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  cors(req, res);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Optional secret check
  const secret = process.env.INTAKE_SECRET;
  if (secret && req.headers['x-intake-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const form = req.body;

    if (!form.name || !form.dob || !form.gender) {
      return res.status(400).json({ error: 'Missing required fields: name, dob, gender' });
    }

    // Client key stays human-readable (it is the my-report lookup key, and it never
    // leaves the server). The stored filename is a random token so that reports are
    // not enumerable even if a link leaks.
    const nameParts = form.name.trim().split(/\s+/);
    const initials = nameParts.map(w => w[0].toUpperCase()).join('');
    const key = `${initials}_${form.dob}`;
    const assessmentDate = new Date().toISOString().split('T')[0];
    const rid = crypto.randomBytes(12).toString('hex');
    const filename = `${rid}.html`;
    const repoPath = `reports/${filename}`;

    // Format form data for Claude
    const formText = formatForm(form);

    // Call Claude with the live catalogue and the 清调补养 stages
    // Two ways to get the analysis, one renderer and one store for both.
    //
    //  a) form only            -> the API calls Claude itself (client self-serve via the web form).
    //                             Needs ANTHROPIC_API_KEY.
    //  b) form + analysis      -> the caller already applied report-spec.md and passes the result.
    //                             Used to regenerate reports in batch when the spec changes.
    //                             Needs no Anthropic key at all.
    let rawJson;
    if (form.analysis && typeof form.analysis === 'object') {
      rawJson = JSON.stringify(form.analysis);
    } else {
      const cat = await buildCatalogue();
      const spec = await fetchSpec();
      const SYSTEM = spec
        + `\n\n---\n\nCATALOGUE (${cat.count} products — recommend from ANY of these):\n${cat.menu}`
        + (cat.stages ? `\n\n清调补养 stage definitions from the live site:\n${cat.stages}` : '');
      rawJson = await callClaude(formText, SYSTEM);
    }

    // Parse JSON (handle code fences if present)
    let reportData;
    try {
      const clean = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      reportData = JSON.parse(clean);
    } catch (e) {
      throw new Error('Claude returned invalid JSON: ' + rawJson.slice(0, 200));
    }

    // Write the canonical (English) page only. Other locales are rendered on demand
    // from the stored analysis plus a translation overlay, so there is no second HTML
    // file per language to keep in sync -- that duplication is what previously let a
    // renderer fix land in one language and not the other.
    const html = buildHTML(reportData, form, filename, assessmentDate, CANONICAL, [CANONICAL]);
    await pushPrivate(repoPath, html, `Add health report: ${form.name} (${assessmentDate})`);

    // The analysis is the source of truth for every language. `i18n` starts empty and
    // each locale is filled in the first time someone asks for it.
    const { analysis: _a, ...formOnly } = form;
    await pushPrivate(`reports/${rid}.analysis.json`,
      JSON.stringify({ rid, assessmentDate, filename, analysis: reportData, form: formOnly, i18n: {} }, null, 1),
      `Store analysis for ${form.name}`);

    // Persist the raw intake next to the report. This is what makes a report reproducible:
    // when report-spec.md changes, every past report can be regenerated from its own intake
    // instead of being re-derived from email. Same private repo, same access control.
    const { analysis: _omit, ...rawIntake } = form;
    await pushPrivate(`intake/${rid}.json`, JSON.stringify({
      rid, key, name: form.name, dob: form.dob, assessmentDate,
      generatedBy: form.analysis ? 'batch' : 'api',
      specVersion: form.specVersion || null,
      intake: rawIntake
    }, null, 2), `Store intake for ${form.name} (${assessmentDate})`);

    // Update the private index
    const index = await getPrivateIndex();
    const newEntry = {
      name: form.name,
      initials,
      dob: form.dob,
      reports: [{
        date: assessmentDate,
        rid,
        file: filename,
        signals: reportData.signals.map(s => s.name),
        products: reportData.products.map(p => p.name),
        tier: reportData.tier || null,
        specVersion: form.specVersion || null,
        generatedBy: form.analysis ? 'batch' : 'api',
        consultant: 'Johnny/Irene'
      }]
    };

    if (index.clients[key]) {
      // Add new report to existing client
      index.clients[key].reports.unshift(newEntry.reports[0]);
    } else {
      index.clients[key] = newEntry;
    }

    await pushPrivate('index.json', JSON.stringify(index, null, 2), `Update index: ${key}`);

    const reportUrl = `${REPORT_BASE}${rid}`;
    return res.status(200).json({ success: true, reportUrl, key, rid });

  } catch (err) {
    console.error('Report generation error:', err);
    return res.status(500).json({ error: 'Report generation failed', details: err.message });
  }
};
