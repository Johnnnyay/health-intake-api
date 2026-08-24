// Report generation, shared by api/submit.js and api/report.js.
//
// Extracted because a rich report does not reliably generate inside the 60s function
// ceiling: a light questionnaire took 20s, a realistic one with 20 symptoms and a full
// body-composition panel hit FUNCTION_INVOCATION_TIMEOUT. Submission now stores the
// intake and returns immediately, and the analysis is produced on first view of the
// report, where a timeout is recoverable instead of being an error the client sees.

const https = require('https');
const { getFile: getPrivateFile } = require('./github');

let _specCache = { text: null, at: 0 };
let _nutCache  = { text: null, at: 0 };
const SPEC_TTL_MS = 5 * 60 * 1000;

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

/* The verified reference intakes, from the same private repo as the spec.
   This file exists so that a dose and its citation come from NIH ODS rather than
   from the model's memory, and until now it was never actually sent. Every UL,
   every RDA and every "source" line in every report to date was invented. That
   produced a plan telling a client magnesium has no fixed UL, that 1000 to 1200 mg
   is tolerated, and to go to 600 mg, against a real supplemental UL of 350 mg. */
async function fetchNutrients() {
  if (_nutCache.text && Date.now() - _nutCache.at < SPEC_TTL_MS) return _nutCache.text;
  const text = await getPrivateFile('nutrient-reference.json');
  if (!text) return _nutCache.text || null;   // stale beats nothing, nothing beats a guess
  _nutCache = { text, at: Date.now() };
  return text;
}

function callClaude(formText, SYSTEM) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  const payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    /* The four-section schema carries a dosing block per product, which pushed a full
       report past 8192 and truncated the JSON mid-object. The parse then threw and the
       reader saw the waiting page forever, with no clue why. */
    max_tokens: 32000,
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

  /* A diagnosis and a symptom marked Often are identical in the symptom grid, and
     they are not the same input: a named condition sets the depth of the plan and
     requires the report to involve their physician. Surface it above the grid. */
  if (form.diagnosed && (Array.isArray(form.diagnosed) ? form.diagnosed.length : String(form.diagnosed).trim())) {
    lines.push('--- Physician-confirmed diagnoses ---');
    lines.push(Array.isArray(form.diagnosed) ? form.diagnosed.join(', ') : String(form.diagnosed));
    if (form.diagnosedNote) lines.push(`Their note: ${form.diagnosedNote}`);
    lines.push('These are confirmed by a doctor, not self-reported symptoms. They set the depth of');
    lines.push('the plan and require the report to involve their physician.');
    lines.push('');
  }

  /* Why they came. Two people with identical symptoms who came for different
     reasons should not read the same report, and this is the only field that says
     which is which. */
  if (form.motivation && form.motivation.length) {
    lines.push('--- Why they came ---');
    lines.push([].concat(form.motivation).join('; '));
    lines.push('');
  }

  if (form.medication) {
    lines.push('--- Prescription medication ---');
    lines.push(String(form.medication));
    lines.push('Check any recommendation against these for interactions.');
    lines.push('');
  }

  /* Structured food frequency. The free-text diet description carries the detail;
     these carry the arithmetic, and they are what a second assessment compares
     against. Scale: Most days / Few weekly / Rarely / Never. */
  if (form.dietFrequency && Object.keys(form.dietFrequency).length) {
    const NAMES = {
      'd-veg': 'Vegetables (fibre, folate, magnesium, potassium)',
      'd-fruit': 'Fruit (vitamin C, potassium)',
      'd-protein': 'Meat, eggs or fish at a meal (protein, B12, iron, zinc)',
      'd-oilyfish': 'Oily fish (omega 3 EPA and DHA)',
      'd-dairy': 'Dairy or fortified alternative (calcium, vitamin D)',
      'd-wholegrain': 'Whole grains, beans, lentils (fibre, B vitamins, magnesium)',
      'd-processed': 'Packaged or takeaway as the main part of a meal',
      'd-sugarydrink': 'Sugary drinks including juice and sweetened coffee',
      'd-alcohol': 'Alcohol'
    };
    lines.push('--- Food frequency (Most days / Few weekly / Rarely / Never) ---');
    for (const [k, v] of Object.entries(form.dietFrequency)) {
      lines.push(`  ${NAMES[k] || k}: ${v}`);
    }
    lines.push('');
  }

  if (form.smoking) lines.push(`Smoking: ${form.smoking}` +
    (/^(daily|sometimes)$/i.test(form.smoking) ? '  (NIH sets vitamin C 35 mg/day higher for smokers)' : ''));
  if (form.smoking) lines.push('');

  if (form.symptoms && Object.keys(form.symptoms).length > 0) {
    lines.push('--- Symptoms (Often / Occasionally / Barely / N/A) ---');
    lines.push('N/A means the question does not apply to them, which is not the same as never.');
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
  if (form.diet) lines.push(`What they eat in a day, in their words: ${form.diet}`);
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
    'produce', 'diet', 'breakfastFreq', 'breakfastProtein', 'bedtime', 'waking13',
    'supplements', 'supplementFreq', 'notes', 'analysis', 'specVersion', 'diagnosed',
    'diagnosedNote', 'motivation', 'medication', 'dietFrequency', 'smoking', 'formVersion']);
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
  const [cat, spec, nutrients] = await Promise.all([buildCatalogue(), fetchSpec(), fetchNutrients()]);
  const SYSTEM = spec
    + (nutrients ? `\n\n---\n\nVERIFIED REFERENCE INTAKES. These are the ONLY reference values you may `
      + `use. Do not recall an RDA, an AI, a UL, a %DV or a source from memory: if a nutrient is not in `
      + `this file, say the value is not verified and give no number for it. Read ul_applies_to before `
      + `comparing anything against a UL, because some ULs cover supplements only, and read ul_below_rda, `
      + `because for magnesium the UL is LOWER than the RDA and a naive comparison produces a dose above `
      + `the ceiling. Cite the source block verbatim.\n${nutrients}` : '')
    + `\n\n---\n\nCATALOGUE (${cat.count} products — recommend from ANY of these):\n${cat.menu}`
    + (cat.stages ? `\n\n清调补养 stage definitions from the live site:\n${cat.stages}` : '');
  const raw = await callClaude(formatForm(form), SYSTEM);
  const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(clean);
  } catch (e) {
    /* Truncation is the likely cause and it is invisible from the outside: the caller
       just sees a rejected promise and serves the waiting page again. Say which it is. */
    const tail = clean.slice(-160).replace(/\s+/g, ' ');
    throw new Error(`model output was not valid JSON (${clean.length} chars, ends: ...${tail})`);
  }
}

module.exports = { generateAnalysis, buildCatalogue, fetchSpec, callClaude, formatForm };
