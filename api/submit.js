// Health Assessment API — Vercel Serverless Function
// Receives form data, calls Claude API, generates report, pushes to GitHub

const https = require('https');
const crypto = require('crypto');
const { pushFile: pushPrivate, getIndex: getPrivateIndex, cors } = require('../lib/github');

// ─── CONFIG ────────────────────────────────────────────────────────────────

const GITHUB_REPO = 'johnnnyay/product-marketing';
const CALC_BASE = 'https://johnnnyay.github.io/product-marketing/#s=';
// Reports are served through this API from a private repo, never as public files.
const REPORT_BASE = (process.env.API_BASE || 'https://health-intake-api.vercel.app') + '/api/report?r=';

// ─── SYSTEM PROMPT (knowledge base) ────────────────────────────────────────

const SYSTEM = `You are a health assessment analyst for a Nutrilite wellness consultant named Johnny Huang (johnnnyay.github.io/product-marketing).

Given a client's health questionnaire responses, identify the top 3 most clinically significant symptom CLUSTERS, perform root cause analysis, and recommend up to 2 Nutrilite products.

ASSESSMENT FRAMEWORK (损伤 to 修复 to 原料 to 营养素):
Every signal traces: symptom cluster → body system under-supported → missing nutrient or mechanism → product that delivers targeted support.

PRODUCT DATABASE (use exact IDs in calcUrl):
- probiotic | Probiotic | 6.3B CFU | gut dysbiosis root cause: diarrhea, gas, poor digestion, bad breath, dandruff, athlete's foot, frequent colds, nasal allergies, weak immunity. Best when 3+ gut symptoms rated Often AND/OR immune cluster present.
- vitamin-c-extended-release-180ct | Vitamin C Extended Release | 8-hour slow release | mucosal immune gap: frequent colds, cough, runny nose, sneezing, nasal allergies. Best when 3+ respiratory/immune symptoms rated Often.
- advanced-omega | Advanced Omega | rTG fish oil (3x absorption) | omega-3 deficit and inflammation: joint pain, heavy menstrual flow, PMS, brain fog, dry skin, heart health. Best when joint pain Often OR heavy flow + PMS cluster present.
- magnesium | Magnesium | TRAACS chelated | nervous system and sleep: 1-3 AM waking, restless sleep, anxiety, heart palpitations, muscle cramps, cold sweaty hands, mental tension. Best when 1-3 AM waking confirmed OR 3+ nervous system symptoms Often.
- prebiotic-fiber | Prebiotic Fiber | inulin blend | fiber deficit and metabolic: constipation, high visceral fat (>10), blood sugar instability, low produce intake. Best when constipation Often OR visceral fat >10 OR <2 F&V servings/day.
- double-x-multivitamin-31-day-refill | Double X Multivitamin | 12 vitamins, 10 minerals, 10 plant concentrates | comprehensive gap: fatigue, poor diet quality, multiple Often symptoms across 3+ categories, heavy stress load. Best when no clear single-organ target but broad deficiency pattern.
- digestive-enzyme | Digestive Enzyme | protease, lipase, amylase | enzyme insufficiency: bloating immediately after meals, heartburn, reflux, inability to digest heavy/greasy meals. Best when bloating or reflux rated Often.
- plant-protein-powder | Plant Protein Powder | 20g pea and rice protein | protein deficit: low protein intake, breakfast skipping, muscle loss risk, low body weight, anemia signals. Best when no protein at breakfast AND weight is low OR lean mass is low.
- sleep-gummies | Sleep Gummies | melatonin + L-theanine | sleep onset difficulty: hard to fall asleep, racing mind, severe sleep debt. Best when hard-to-fall-asleep is Often AND 1-3 AM waking is absent (distinguishes from magnesium case).
- womens-daily-multivitamin | Women's Daily Multivitamin | iron, calcium, folate, D3 | women's gap: heavy menstrual flow, fatigue, PMS, bone concerns, iron signals. Best for women with heavy flow + fatigue combination.

PRODUCT SELECTION RULES:
- Maximum 2 products. Choose the ones that address the ROOT CAUSE of the most symptom clusters, not just the most symptoms.
- Probiotic + Vitamin C is appropriate when gut-immune axis is the dominant pattern.
- Magnesium + Advanced Omega is appropriate when sleep/nervous system + inflammation are the two dominant clusters.
- Never recommend both Probiotic and Digestive Enzyme (redundant).
- If only 1 product is clearly indicated, recommend only 1.

SIGNAL IDENTIFICATION RULES:
- A cluster of 3+ "Often" symptoms in the same category = strong signal.
- 1-3 AM waking confirmed = always top-3 signal regardless of other symptoms.
- Gut symptoms (digestion, gas, diarrhea, bad breath) + immune symptoms (colds, allergies, cough) together = gut-immune axis signal, treat as one compound signal.
- Body composition: visceral fat >10, body fat >25% male or >32% female, body water <58%, metabolic age >actual age = each counts as a signal.
- Lifestyle factors that compound symptoms (cold food + gut issues, after-midnight sleep + 1-3 AM waking, breakfast skipping + afternoon fatigue) must be explicitly named in the RCA.

WRITING RULES:
- Never use em-dashes. Use commas, periods, or "and" or "but" instead.
- Be specific and mechanistic. Reference the client's actual data (e.g., "At 75kg consuming 1.5L of water, you are mildly dehydrated").
- Every claim needs a mechanism. Not "omega-3 helps inflammation" but "the high-meat diet creates a predictable omega-6 to omega-3 imbalance that tips the prostaglandin pathway toward pro-inflammatory signaling, which shows up first in joints."
- Tone: confident, clinical, warm. Like a knowledgeable friend who happens to be a doctor.
- Plan items: specific and behavioral, not vague. "Add one vegetable to every meal" not "eat more vegetables."
- RCA sections: 4-6 sentences each.
- No marketing language. No "powerful antioxidant" or "boost your immunity."

OUTPUT: Return ONLY valid JSON. No markdown, no explanation, no other text. Exactly this schema:
{
  "signals": [
    {"name": "Signal name (5-8 words)", "badge": "Badge text (3-4 words)", "description": "2-3 sentences: what data points form this signal and why it matters."}
  ],
  "bodyCompNote": "2-3 sentences interpreting body composition holistically. Name what is strong. Name what needs attention. Reference specific numbers.",
  "rcaSections": [
    {"label": "Section label (matches signal)", "text": "4-6 sentences: root cause, mechanism, why it shows up this way in this specific person, what it means going forward."}
  ],
  "summary": "3-4 sentences. Open with a genuine strength. Name the pattern. End with why now is the right time to act.",
  "plan": [
    {"label": "Priority label", "items": ["Specific action with reason", "Specific action with reason", "Specific action with reason"]}
  ],
  "products": [
    {"id": "exact-product-id", "name": "Product Display Name", "rationale": "4-6 sentences connecting this client's specific data to this product's specific mechanism. Not generic. Reference actual symptom values.", "note": "1-2 sentence usage note: when to take, with what, what to expect and when."}
  ],
  "wins": ["Expected win 1 with timeframe", "Expected win 2 with timeframe", "Expected win 3", "Expected win 4", "Expected win 5", "Expected win 6"],
  "optionA": "2-3 sentences: lifestyle-only path with what to expect at 4 weeks.",
  "optionB": "2-3 sentences: lifestyle + products path and why the combination addresses the root cause faster.",
  "recheckItems": "Comma-separated list of 6-8 specific metrics to track at the 4-week check-in",
  "calcUrl": "https://johnnnyay.github.io/product-marketing/#s=product-id:1 or product-id-1:1,product-id-2:1"
}`;

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

function callClaude(formText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const payload = JSON.stringify({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4096,
    system: SYSTEM,
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
          if (parsed.error) return reject(new Error(parsed.error.message));
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

function buildHTML(r, form, filename, assessmentDate) {
  const age = form.dob ? Math.floor((new Date() - new Date(form.dob)) / (365.25 * 24 * 3600 * 1000)) : '?';
  const gender = form.gender || 'Not specified';

  const signalBadges = r.signals.map(s => `<span class="signal-badge">${s.badge}</span>`).join('\n    ');

  const compRows = [];
  if (form.weight) compRows.push({ label: 'Weight', value: `${form.weight} lb`, range: form.weightKg ? `${form.weightKg} kg` : '' });
  if (form.bmi) {
    const bmiNum = parseFloat(form.bmi);
    const cls = bmiNum < 25 ? 'comp-good' : 'comp-warn';
    const range = bmiNum < 18.5 ? 'Underweight' : bmiNum < 25 ? 'Healthy (18.5-24.9)' : bmiNum < 30 ? 'Overweight (25-29.9)' : 'Obese (30+)';
    compRows.push({ label: 'BMI', value: form.bmi, range, cls });
  }
  if (form.bodyFat) {
    const bf = parseFloat(form.bodyFat);
    const limit = gender === 'Female' ? 32 : 20;
    const cls = bf < limit ? 'comp-good' : 'comp-warn';
    compRows.push({ label: 'Body Fat %', value: `${form.bodyFat}%`, range: cls === 'comp-good' ? 'Healthy range' : 'Above ideal', cls });
  }
  if (form.visceralFat) {
    const vf = parseFloat(form.visceralFat);
    const cls = vf < 10 ? 'comp-good' : 'comp-warn';
    compRows.push({ label: 'Visceral Fat', value: form.visceralFat, range: cls === 'comp-good' ? 'Healthy (<10)' : 'High (10+)', cls });
  }
  if (form.skeletalMuscle) {
    compRows.push({ label: 'Skeletal Muscle', value: `${form.skeletalMuscle}%`, range: '', cls: 'comp-good' });
  }
  if (form.bodyWater) {
    const bw = parseFloat(form.bodyWater);
    const cls = bw >= 60 ? 'comp-good' : 'comp-warn';
    compRows.push({ label: 'Body Water', value: `${form.bodyWater}%`, range: cls === 'comp-good' ? 'Good (60%+)' : 'Low-normal (60%+ ideal)', cls });
  }
  if (form.metabolicAge) {
    const diff = parseInt(form.metabolicAge) - age;
    const cls = diff <= 0 ? 'comp-good' : 'comp-warn';
    const range = diff < 0 ? `${Math.abs(diff)} years younger than actual` : diff === 0 ? 'Matches actual age' : `${diff} years older than actual`;
    compRows.push({ label: 'Metabolic Age', value: form.metabolicAge, range, cls });
  }
  if (form.protein) {
    compRows.push({ label: 'Protein %', value: `${form.protein}%`, range: 'Adequate (>18%)', cls: parseFloat(form.protein) >= 18 ? 'comp-good' : 'comp-warn' });
  }

  const compGridHTML = compRows.length > 0 ? `
  <div class="card">
    <div class="card-title">Body Composition</div>
    <div class="comp-grid">
      ${compRows.map(c => `<div class="comp-row">
        <div class="comp-label">${c.label}</div>
        <div class="comp-value${c.cls ? ' ' + c.cls : ''}">${c.value}</div>
        ${c.range ? `<div class="comp-range${c.cls ? ' ' + c.cls : ''}">${c.range}</div>` : ''}
      </div>`).join('\n      ')}
    </div>
    ${r.bodyCompNote ? `<p class="comp-note">${r.bodyCompNote}</p>` : ''}
  </div>` : '';

  const signalsHTML = r.signals.map((s, i) => `
      <div class="signal-item">
        <div class="signal-num">${i + 1}</div>
        <div class="signal-content">
          <div class="signal-name">${s.name}</div>
          <div class="signal-desc">${s.description}</div>
        </div>
      </div>`).join('');

  const rcaHTML = r.rcaSections.map(s => `
    <div class="rca-section">
      <div class="rca-label"><span class="rca-dot"></span>${s.label}</div>
      <div class="rca-text">${s.text}</div>
    </div>`).join('');

  const planHTML = r.plan.map((p, i) => `
    <div class="plan-priority">
      <div class="plan-priority-label"><span class="plan-num">${i + 1}</span>${p.label}</div>
      <ul class="plan-items">
        ${p.items.map(item => `<li>${item}</li>`).join('\n        ')}
      </ul>
    </div>`).join('');

  const productsHTML = r.products.map(p => `
    <div class="product-card">
      <div class="product-name">${p.name}</div>
      <div class="product-rationale">${p.rationale}</div>
      <div class="product-note">${p.note}</div>
    </div>`).join('');

  const winsHTML = r.wins.map(w => `<li>${w}</li>`).join('\n      ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Health Progress Report — ${form.name}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Caveat:wght@500;600&display=swap" rel="stylesheet">
<style>
  :root{--navy:#3D5A4C;--green:#5C8A6E;--green-mid:#6F9E80;--green-light:#EDF2EE;--off-white:#F7F9F7;--gray-100:#F0F3F0;--gray-200:#E4E9E5;--gray-400:#9ca3af;--gray-500:#6E7B74;--gray-600:#55605A;--gray-800:#2A332D;--amber:#b45309;--amber-light:#fffbeb;--shadow-sm:0 1px 4px rgba(0,0,0,.07),0 1px 2px rgba(0,0,0,.04);--radius:12px;--radius-lg:18px}
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',-apple-system,BlinkMacSystemFont,sans-serif;background:var(--off-white);color:var(--gray-800);-webkit-font-smoothing:antialiased;line-height:1.65}
  .site-header{background:var(--navy);color:#fff;padding:14px 24px;display:flex;align-items:center;gap:12px}
  .site-logo{font-family:'Caveat',cursive;font-size:22px;font-weight:600;color:rgba(255,255,255,.95);text-decoration:none}
  .site-header-sub{font-size:12px;color:rgba(255,255,255,.45);margin-left:auto}
  .hero{background:linear-gradient(135deg,var(--navy) 0%,var(--green) 100%);color:#fff;padding:40px 24px 36px;text-align:center}
  .hero-label{font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,.55);margin-bottom:8px}
  .hero-name{font-size:30px;font-weight:700;margin-bottom:6px}
  .hero-meta{font-size:13px;color:rgba(255,255,255,.65);margin-bottom:20px}
  .hero-signals{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:4px}
  .signal-badge{background:rgba(255,255,255,.15);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:4px 12px;font-size:12px;font-weight:500;color:rgba(255,255,255,.9)}
  .page-body{max-width:760px;margin:0 auto;padding:28px 16px 60px}
  .card{background:#fff;border-radius:var(--radius-lg);box-shadow:var(--shadow-sm);padding:24px;margin-bottom:16px}
  .card-title{font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--green);margin-bottom:16px;display:flex;align-items:center;gap:6px}
  .card-title::after{content:'';flex:1;height:1px;background:var(--gray-200)}
  .comp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px}
  .comp-row{background:var(--gray-100);border-radius:8px;padding:10px 14px}
  .comp-label{font-size:11px;font-weight:600;color:var(--gray-500);margin-bottom:2px;text-transform:uppercase;letter-spacing:.5px}
  .comp-value{font-size:16px;font-weight:600;color:var(--gray-800)}
  .comp-range{font-size:11px;color:var(--gray-400);margin-top:1px}
  .comp-good{color:var(--green)}.comp-warn{color:var(--amber)}
  .comp-note{margin-top:14px;font-size:13.5px;color:var(--gray-600);line-height:1.6}
  .client-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
  .signal-list{display:flex;flex-direction:column;gap:10px}
  .signal-item{display:flex;gap:12px;align-items:flex-start}
  .signal-num{background:var(--navy);color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0;margin-top:1px}
  .signal-name{font-size:14px;font-weight:600;color:var(--gray-800);margin-bottom:2px}
  .signal-desc{font-size:13.5px;color:var(--gray-600);line-height:1.55}
  .rca-section{margin-bottom:20px}.rca-section:last-child{margin-bottom:0}
  .rca-label{font-size:13px;font-weight:600;color:var(--navy);margin-bottom:6px;display:flex;align-items:center;gap:6px}
  .rca-dot{width:6px;height:6px;border-radius:50%;background:var(--green);flex-shrink:0}
  .rca-text{font-size:13.5px;color:var(--gray-600);line-height:1.65}
  .summary-box{background:var(--green-light);border-left:3px solid var(--green);border-radius:0 var(--radius) var(--radius) 0;padding:16px 18px;font-size:14px;color:var(--gray-800);line-height:1.65}
  .plan-priority{margin-bottom:18px}.plan-priority:last-child{margin-bottom:0}
  .plan-priority-label{font-size:13px;font-weight:600;color:var(--navy);margin-bottom:6px;display:flex;align-items:center;gap:6px}
  .plan-num{background:var(--green-light);color:var(--green);border-radius:6px;padding:1px 7px;font-size:11px;font-weight:700}
  .plan-items{list-style:none;padding:0}
  .plan-items li{font-size:13.5px;color:var(--gray-600);padding:4px 0 4px 16px;position:relative;line-height:1.55}
  .plan-items li::before{content:'→';position:absolute;left:0;color:var(--green-mid);font-size:12px;top:5px}
  .product-card{background:var(--amber-light);border:1px solid rgba(180,83,9,.12);border-radius:var(--radius);padding:16px;margin-bottom:12px}
  .product-card:last-child{margin-bottom:0}
  .product-name{font-size:14px;font-weight:600;color:var(--amber);margin-bottom:4px}
  .product-rationale{font-size:13.5px;color:#374151;line-height:1.6}
  .product-note{font-size:12px;color:var(--gray-400);margin-top:6px}
  .wins-list{list-style:none;padding:0;display:flex;flex-direction:column;gap:8px}
  .wins-list li{font-size:13.5px;color:var(--gray-600);padding-left:20px;position:relative;line-height:1.55}
  .wins-list li::before{content:'✓';position:absolute;left:0;color:var(--green);font-weight:700}
  .next-steps-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
  @media(max-width:520px){.next-steps-grid{grid-template-columns:1fr}}
  .next-step-box{background:var(--gray-100);border-radius:var(--radius);padding:14px}
  .next-step-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--gray-500);margin-bottom:6px}
  .next-step-text{font-size:13px;color:#374151;line-height:1.6}
  .recheck-label{font-size:12px;font-weight:600;color:var(--gray-500);margin-top:14px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.5px}
  .recheck-items{font-size:13px;color:var(--gray-600)}
  .cta-section{background:var(--navy);border-radius:var(--radius-lg);padding:28px 24px;text-align:center;margin-bottom:16px}
  .cta-title{color:#fff;font-size:17px;font-weight:600;margin-bottom:6px}
  .cta-sub{font-size:13px;color:rgba(255,255,255,.55);margin-bottom:18px}
  .cta-btn{display:inline-block;background:#fff;color:var(--navy);font-weight:700;font-size:15px;padding:12px 28px;border-radius:999px;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.18)}
  .cta-passcode{font-size:12px;color:rgba(255,255,255,.4);margin-top:12px}
  .report-footer{text-align:center;font-size:12px;color:var(--gray-400);padding-top:8px}
  @media(max-width:600px){.hero-name{font-size:24px}.comp-grid{grid-template-columns:1fr 1fr}}
</style>
</head>
<body>

<header class="site-header">
  <span class="site-logo">Health Progress Report</span>
  <span class="site-header-sub">Confidential &nbsp;·&nbsp; ${assessmentDate}</span>
</header>

<div class="hero">
  <div class="hero-label">Personalized Health Analysis</div>
  <div class="hero-name">${form.name}</div>
  <div class="hero-meta">${assessmentDate} &nbsp;·&nbsp; Consultant: Johnny / Irene &nbsp;·&nbsp; Recheck in 4 Weeks</div>
  <div class="hero-signals">
    ${signalBadges}
  </div>
</div>

<div class="page-body">

  <div class="card">
    <div class="card-title">Client Overview</div>
    <div class="comp-grid client-grid">
      <div class="comp-row"><div class="comp-label">Name</div><div class="comp-value" style="font-size:14px">${form.name}</div></div>
      <div class="comp-row"><div class="comp-label">Age</div><div class="comp-value" style="font-size:14px">${age}</div></div>
      <div class="comp-row"><div class="comp-label">Gender</div><div class="comp-value" style="font-size:14px">${gender}</div></div>
      ${form.height ? `<div class="comp-row"><div class="comp-label">Height</div><div class="comp-value" style="font-size:14px">${form.height}</div></div>` : ''}
    </div>
  </div>

  ${compGridHTML}

  <div class="card">
    <div class="card-title">Top 3 Priority Signals</div>
    <div class="signal-list">${signalsHTML}</div>
  </div>

  <div class="card">
    <div class="card-title">Root Cause Analysis</div>
    ${rcaHTML}
  </div>

  <div class="card">
    <div class="card-title">Summary</div>
    <div class="summary-box">${r.summary}</div>
  </div>

  <div class="card">
    <div class="card-title">30-Day Plan</div>
    ${planHTML}
  </div>

  <div class="card">
    <div class="card-title">Support Tools (Optional)</div>
    <p style="font-size:13px;color:var(--gray-500);margin-bottom:14px">Food, sleep, and movement are always the foundation. These are targeted bridge tools for the specific gaps the data reveals.</p>
    ${productsHTML}
  </div>

  <div class="card">
    <div class="card-title">What to Expect in 30 Days</div>
    <ul class="wins-list">${winsHTML}</ul>
  </div>

  <div class="card">
    <div class="card-title">Next Step</div>
    <div class="next-steps-grid">
      <div class="next-step-box">
        <div class="next-step-label">Option A — Lifestyle Only</div>
        <div class="next-step-text">${r.optionA}</div>
      </div>
      <div class="next-step-box">
        <div class="next-step-label">Option B — Lifestyle + Support</div>
        <div class="next-step-text">${r.optionB}</div>
      </div>
    </div>
    <div class="recheck-label">4-Week Recheck</div>
    <div class="recheck-items">${r.recheckItems}</div>
  </div>

  <div class="cta-section">
    <div class="cta-title">Your Personalized Product Stack</div>
    <div class="cta-sub">Pre-loaded based on your assessment. View pricing and order in one click.</div>
    <a class="cta-btn" href="${r.calcUrl}" target="_blank">View My Products →</a>
    <div class="cta-passcode">For member pricing: tap ··· in the top right and enter the passcode your consultant gave you</div>
  </div>

  <div class="report-footer">
    Health Progress Report &nbsp;·&nbsp; ${assessmentDate}<br>
    This report is for wellness education only and does not constitute medical advice.
  </div>

</div>
</body>
</html>`;
}

// ─── FORMAT FORM DATA FOR CLAUDE ─────────────────────────────────────────────

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

    // Call Claude
    const rawJson = await callClaude(formText);

    // Parse JSON (handle code fences if present)
    let reportData;
    try {
      const clean = rawJson.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      reportData = JSON.parse(clean);
    } catch (e) {
      throw new Error('Claude returned invalid JSON: ' + rawJson.slice(0, 200));
    }

    // Build HTML
    const html = buildHTML(reportData, form, filename, assessmentDate);

    // Push report HTML to the PRIVATE reports repo
    await pushPrivate(repoPath, html, `Add health report: ${form.name} (${assessmentDate})`);

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
