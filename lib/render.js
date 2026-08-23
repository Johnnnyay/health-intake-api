// Shared report renderer. Required by api/submit.js and api/report.js so both
// produce byte-identical pages and neither can drift from the other.


const L = {
  en: { heroLabel:'Personalized Health Analysis', consultant:'Consultant', recheck:'Recheck in 4 Weeks',
        overview:'Client Overview', name:'Name', age:'Age', gender:'Gender', height:'Height',
        bodyComp:'Body Composition', signals:'Top 3 Priority Signals', rca:'Root Cause Analysis',
        summary:'Summary', lifestyle:'Lifestyle Plan', lifestyleSub:'What to change, stage by stage. This is the foundation and it is free.',
        supps:'Supplement Protocol', suppsSub:'What to take, why, and when. Each one answers a specific finding in your assessment.',
        wins:'What to Track', next:'Next Step', optA:'Option A: Lifestyle Only', optB:'Option B: Lifestyle + Supplements',
        recheckItems:'Track at 4 Weeks', disclaimer:'This report is for wellness education only and does not constitute medical advice.',
        toggle:'中文', tier:'Tier', takeWith:'How to take it',
        cWeight:'Weight', cBmi:'BMI', cFat:'Body Fat %', cVisc:'Visceral Fat', cMuscle:'Skeletal Muscle',
        cWater:'Body Water', cMetAge:'Metabolic Age', cProtein:'Protein %',
        rHealthy:'Healthy range', rAbove:'Above ideal', rViscOk:'Healthy (<10)', rViscHigh:'High (10+)',
        rWaterOk:'Good (60%+)', rWaterLow:'Low-normal (60%+ ideal)', rProteinOk:'Adequate (>18%)' },
  zh: { heroLabel:'个人健康分析', consultant:'顾问', recheck:'四周后复查',
        overview:'客户概况', name:'姓名', age:'年龄', gender:'性别', height:'身高',
        bodyComp:'身体成分', signals:'三大优先信号', rca:'根本原因分析',
        summary:'总结', lifestyle:'生活方式方案', lifestyleSub:'清调补养四个阶段，分别要改什么。这是基础，也是免费的。',
        supps:'营养补充方案', suppsSub:'吃什么、为什么、什么时候吃。每一项都对应你评估中的具体发现。',
        wins:'需要追踪的指标', next:'下一步', optA:'方案A：只调整生活方式', optB:'方案B：生活方式 + 营养补充',
        recheckItems:'四周后复查项目', disclaimer:'本报告仅供健康教育参考，不构成医疗建议。',
        toggle:'English', tier:'等级', takeWith:'服用方法',
        cWeight:'体重', cBmi:'身体质量指数', cFat:'体脂率', cVisc:'内脏脂肪', cMuscle:'骨骼肌',
        cWater:'身体水分', cMetAge:'代谢年龄', cProtein:'蛋白质',
        rHealthy:'正常范围', rAbove:'高于理想值', rViscOk:'健康（低于10）', rViscHigh:'偏高（10以上）',
        rWaterOk:'良好（60%以上）', rWaterLow:'偏低（理想为60%以上）', rProteinOk:'充足（高于18%）' }
};

function buildHTML(r, form, filename, assessmentDate, lang) {
  lang = (lang === 'zh') ? 'zh' : 'en';
  const T = L[lang];
  /* Body text: use the Chinese field when rendering Chinese and one exists, else the English. */
  const tx = (key) => (lang === 'zh' && r[key + 'Zh']) ? r[key + 'Zh'] : r[key];
  /* Same choice for a field on a nested object. Defined here, above every use. */
  const pick = (o, f) => (lang === 'zh' && o && o[f + 'Zh']) ? o[f + 'Zh'] : (o ? o[f] : '');
  const age = form.dob ? Math.floor((new Date() - new Date(form.dob)) / (365.25 * 24 * 3600 * 1000)) : '?';
  const gender = form.gender || 'Not specified';

  const signalBadges = r.signals.map(s => `<span class="signal-badge">${pick(s, 'badge')}</span>`).join('\n    ');

  const compRows = [];
  if (form.weight) compRows.push({ label: T.cWeight, value: `${form.weight} lb`, range: form.weightKg ? `${form.weightKg} kg` : '' });
  if (form.bmi) {
    const bmiNum = parseFloat(form.bmi);
    const cls = bmiNum < 25 ? 'comp-good' : 'comp-warn';
    const range = bmiNum < 18.5 ? 'Underweight' : bmiNum < 25 ? 'Healthy (18.5-24.9)' : bmiNum < 30 ? 'Overweight (25-29.9)' : 'Obese (30+)';
    compRows.push({ label: T.cBmi, value: form.bmi, range, cls });
  }
  if (form.bodyFat) {
    const bf = parseFloat(form.bodyFat);
    const limit = gender === 'Female' ? 32 : 20;
    const cls = bf < limit ? 'comp-good' : 'comp-warn';
    compRows.push({ label: T.cFat, value: `${form.bodyFat}%`, range: cls === 'comp-good' ? T.rHealthy : T.rAbove, cls });
  }
  if (form.visceralFat) {
    const vf = parseFloat(form.visceralFat);
    const cls = vf < 10 ? 'comp-good' : 'comp-warn';
    compRows.push({ label: T.cVisc, value: form.visceralFat, range: cls === 'comp-good' ? T.rViscOk : T.rViscHigh, cls });
  }
  if (form.skeletalMuscle) {
    compRows.push({ label: T.cMuscle, value: `${form.skeletalMuscle}%`, range: '', cls: 'comp-good' });
  }
  if (form.bodyWater) {
    const bw = parseFloat(form.bodyWater);
    const cls = bw >= 60 ? 'comp-good' : 'comp-warn';
    compRows.push({ label: T.cWater, value: `${form.bodyWater}%`, range: cls === 'comp-good' ? T.rWaterOk : T.rWaterLow, cls });
  }
  if (form.metabolicAge) {
    const diff = parseInt(form.metabolicAge) - age;
    const cls = diff <= 0 ? 'comp-good' : 'comp-warn';
    const range = diff < 0 ? `${Math.abs(diff)} years younger than actual` : diff === 0 ? 'Matches actual age' : `${diff} years older than actual`;
    compRows.push({ label: T.cMetAge, value: form.metabolicAge, range, cls });
  }
  if (form.protein) {
    compRows.push({ label: T.cProtein, value: `${form.protein}%`, range: T.rProteinOk, cls: parseFloat(form.protein) >= 18 ? 'comp-good' : 'comp-warn' });
  }

  const compGridHTML = compRows.length > 0 ? `
  <div class="card">
    <div class="card-title">${T.bodyComp}</div>
    <div class="comp-grid">
      ${compRows.map(c => `<div class="comp-row">
        <div class="comp-label">${c.label}</div>
        <div class="comp-value${c.cls ? ' ' + c.cls : ''}">${c.value}</div>
        ${c.range ? `<div class="comp-range${c.cls ? ' ' + c.cls : ''}">${c.range}</div>` : ''}
      </div>`).join('\n      ')}
    </div>
    ${r.bodyCompNote ? `<p class="comp-note">${tx('bodyCompNote')}</p>` : ''}
  </div>` : '';

  const signalsHTML = r.signals.map((s, i) => `
      <div class="signal-item">
        <div class="signal-num">${i + 1}</div>
        <div class="signal-content">
          <div class="signal-name">${pick(s, 'name')}</div>
          <div class="signal-desc">${pick(s, 'description')}</div>
        </div>
      </div>`).join('');

  const rcaHTML = r.rcaSections.map(s => `
    <div class="rca-section">
      <div class="rca-label"><span class="rca-dot"></span>${pick(s, 'label')}</div>
      <div class="rca-text">${pick(s, 'text')}</div>
    </div>`).join('');

  // 清调补养 — always four stages, always in order. Falls back to a legacy flat plan.
  /* English pages carry no Chinese at all: the glyph becomes the stage number. */
  const STAGE_META = {
    '清': { en:{g:'1', label:'Clear',     sub:'Take the load off first'},
            zh:{g:'清', label:'清',        sub:'清肠毒 · 清血毒'} },
    '调': { en:{g:'2', label:'Regulate',  sub:'Stop what is feeding the problem'},
            zh:{g:'调', label:'调',        sub:'调生活方式 · 调五脏六腑'} },
    '补': { en:{g:'3', label:'Replenish', sub:'Supply what is missing'},
            zh:{g:'补', label:'补',        sub:'补细胞营养 · 补隐性饥饿'} },
    '养': { en:{g:'4', label:'Sustain',   sub:'Hold the daily rhythm'},
            zh:{g:'养', label:'养',        sub:'四季时令 · 子午流注'} }
  };
  const stages = Array.isArray(r.stages) && r.stages.length
    ? r.stages
    : (r.plan || []).map((p, i) => ({
        glyph: ['清', '调', '补', '养'][i] || '养',
        label: p.label, focus: '', items: p.items, horizon: ''
      }));

  const planHTML = stages.map(st => {
    const m = (STAGE_META[st.glyph] || {})[lang] || { g: st.glyph || '', label: st.label || '', sub: '' };
    const focus = (lang === 'zh' && st.focusZh) ? st.focusZh : st.focus;
    const items = (lang === 'zh' && st.itemsZh) ? st.itemsZh : (st.items || []);
    const hor   = (lang === 'zh' && st.horizonZh) ? st.horizonZh : st.horizon;
    return `
    <div class="stage">
      <div class="stage-head">
        <span class="stage-glyph">${m.g}</span>
        <span class="stage-titles">
          <span class="stage-label">${lang === 'zh' ? m.label : (st.label || m.label)}</span>
          <span class="stage-sub">${m.sub}</span>
        </span>
      </div>
      ${focus ? `<div class="stage-focus">${focus}</div>` : ''}
      <ul class="plan-items">
        ${items.map(item => `<li>${item}</li>`).join('\n        ')}
      </ul>
      ${hor ? `<div class="stage-horizon">${hor}</div>` : ''}
    </div>`;
  }).join('');

  const tierHTML = r.tier ? `
    <div class="tier-note">
      <span class="tier-badge tier-${String(r.tier).toLowerCase()}">${T.tier} ${r.tier}</span>
      <span>${tx('tierNote') || ''}</span>
    </div>` : '';

  const STAGE_TAG = { '清':{en:'Clear',zh:'清'}, '调':{en:'Regulate',zh:'调'},
                      '补':{en:'Replenish',zh:'补'}, '养':{en:'Sustain',zh:'养'} };
  const productsHTML = (r.products || []).map((p, i) => {
    const tag = (STAGE_TAG[p.stage] || {})[lang];
    const rat = (lang === 'zh' && p.rationaleZh) ? p.rationaleZh : p.rationale;
    const not = (lang === 'zh' && p.noteZh) ? p.noteZh : p.note;
    return `
    <div class="product-card">
      <div class="product-head">
        <span class="product-num">${i + 1}</span>
        <span class="product-name">${p.name}</span>
        ${tag ? `<span class="product-stage">${tag}</span>` : ''}
      </div>
      <div class="product-rationale">${rat}</div>
      ${not ? `<div class="product-note"><span class="note-label">${T.takeWith}</span>${not}</div>` : ''}
    </div>`;
  }).join('');

  const winsList = (lang === 'zh' && r.winsZh && r.winsZh.length) ? r.winsZh : r.wins;
  const winsHTML = winsList.map(w => `<li>${w}</li>`).join('\n      ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Health Progress Report for ${form.name}</title>
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
  .card-sub{font-size:12.5px;color:var(--gray-500,#8a8f98);line-height:1.55;margin:-4px 0 16px}
  .lang-toggle{position:absolute;top:14px;right:18px;font-size:11.5px;font-weight:600;letter-spacing:.04em;
    color:rgba(255,255,255,.92);background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.28);
    border-radius:999px;padding:5px 13px;text-decoration:none;backdrop-filter:blur(4px)}
  .lang-toggle:hover{background:rgba(255,255,255,.26)}
  .hero{position:relative}
  .card-supp{border:1px solid var(--green-light);background:linear-gradient(180deg,#fbfdfb 0%,#fff 60%)}
  .product-head{display:flex;align-items:center;gap:9px;margin-bottom:7px;flex-wrap:wrap}
  .product-num{flex-shrink:0;width:22px;height:22px;border-radius:6px;background:var(--green);color:#fff;
    font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center}
  .product-stage{font-size:10.5px;font-weight:600;letter-spacing:.05em;color:var(--green);
    background:var(--green-light);border-radius:5px;padding:2px 7px}
  .note-label{display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;
    color:var(--green-mid);margin-bottom:3px}
  .tier-note{display:flex;align-items:baseline;gap:8px;font-size:12.5px;color:var(--gray-600);
    line-height:1.5;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid var(--gray-200)}
  .tier-badge{flex-shrink:0;font-size:10.5px;font-weight:700;letter-spacing:.06em;border-radius:5px;
    padding:2px 7px;background:var(--green-light);color:var(--green)}
  .tier-b{background:#fff4e5;color:#a65b00}.tier-c{background:#fdecec;color:#b3261e}
  .stage{margin-bottom:20px;padding-left:14px;border-left:2px solid var(--green-light)}
  .stage:last-child{margin-bottom:0}
  .stage-head{display:flex;align-items:center;gap:9px;margin-bottom:5px}
  .stage-glyph{flex-shrink:0;width:26px;height:26px;border-radius:7px;background:var(--green-light);
    color:var(--green);font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center}
  .stage-titles{display:flex;flex-direction:column;line-height:1.3}
  .stage-label{font-size:13px;font-weight:600;color:var(--navy)}
  .stage-sub{font-size:10.5px;color:var(--gray-500,#8a8f98);letter-spacing:.04em}
  .stage-focus{font-size:12.5px;color:var(--gray-600);line-height:1.55;margin:0 0 6px 35px;font-style:italic}
  .stage .plan-items{margin-left:35px}
  .stage-horizon{font-size:11.5px;color:var(--green-mid);margin:7px 0 0 35px;font-weight:500}
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
  <a class="lang-toggle" href="?r=${filename.replace(/\.[^.]+$/, '')}${lang === 'zh' ? '' : '&lang=zh'}">${T.toggle}</a>
  <div class="hero-label">${T.heroLabel}</div>
  <div class="hero-name">${form.name}</div>
  <div class="hero-meta">${assessmentDate} &nbsp;·&nbsp; ${T.consultant}: Johnny / Irene &nbsp;·&nbsp; ${T.recheck}</div>
  <div class="hero-signals">
    ${signalBadges}
  </div>
</div>

<div class="page-body">

  <div class="card">
    <div class="card-title">${T.overview}</div>
    <div class="comp-grid client-grid">
      <div class="comp-row"><div class="comp-label">${T.name}</div><div class="comp-value" style="font-size:14px">${form.name}</div></div>
      <div class="comp-row"><div class="comp-label">${T.age}</div><div class="comp-value" style="font-size:14px">${age}</div></div>
      <div class="comp-row"><div class="comp-label">${T.gender}</div><div class="comp-value" style="font-size:14px">${gender}</div></div>
      ${form.height ? `<div class="comp-row"><div class="comp-label">${T.height}</div><div class="comp-value" style="font-size:14px">${form.height}</div></div>` : ''}
    </div>
  </div>

  ${compGridHTML}

  <div class="card">
    <div class="card-title">${T.signals}</div>
    <div class="signal-list">${signalsHTML}</div>
  </div>

  <div class="card">
    <div class="card-title">${T.rca}</div>
    ${rcaHTML}
  </div>

  <div class="card">
    <div class="card-title">${T.summary}</div>
    <div class="summary-box">${tx('summary')}</div>
  </div>

  <div class="card">
    <div class="card-title">${T.lifestyle}</div>
    <p class="card-sub">${T.lifestyleSub}</p>
    ${tierHTML}
    ${planHTML}
  </div>

  ${(r.products && r.products.length) ? `<div class="card card-supp">
    <div class="card-title">${T.supps}</div>
    <p class="card-sub">${T.suppsSub}</p>
    ${productsHTML}
  </div>` : ''}

  <div class="card">
    <div class="card-title">${T.wins}</div>
    <ul class="wins-list">${winsHTML}</ul>
  </div>

  <div class="card">
    <div class="card-title">${T.next}</div>
    <div class="next-steps-grid">
      <div class="next-step-box">
        <div class="next-step-label">${T.optA}</div>
        <div class="next-step-text">${tx('optionA')}</div>
      </div>
      <div class="next-step-box">
        <div class="next-step-label">${T.optB}</div>
        <div class="next-step-text">${tx('optionB')}</div>
      </div>
    </div>
    <div class="recheck-label">4-Week Recheck</div>
    <div class="recheck-items">${tx('recheckItems')}</div>
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

module.exports = { buildHTML, L };
