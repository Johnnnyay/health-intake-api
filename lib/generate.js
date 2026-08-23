// Report generation, shared by api/submit.js and api/report.js.
//
// Extracted because a rich report does not reliably generate inside the 60s function
// ceiling: a light questionnaire took 20s, a realistic one with 20 symptoms and a full
// body-composition panel hit FUNCTION_INVOCATION_TIMEOUT. Submission now stores the
// intake and returns immediately, and the analysis is produced on first view of the
// report, where a timeout is recoverable instead of being an error the client sees.

const https = require('https');

const SITE = 'https://johnnnyay.github.io/product-marketing';

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


async function generateAnalysis(form) {
  const cat = await buildCatalogue();
  const spec = await fetchSpec();
  const SYSTEM = spec
    + `\n\n---\n\nCATALOGUE (${cat.count} products — recommend from ANY of these):\n${cat.menu}`
    + (cat.stages ? `\n\n清调补养 stage definitions from the live site:\n${cat.stages}` : '');
  const raw = await callClaude(formatForm(form), SYSTEM);
  const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  return JSON.parse(clean);
}

module.exports = { generateAnalysis, buildCatalogue, fetchSpec, callClaude, formatForm };
