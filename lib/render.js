// Shared report renderer. Required by api/submit.js and api/report.js so both
// produce byte-identical pages and neither can drift from the other.
//
// This file knows nothing about which language it is drawing. It receives an
// already-resolved analysis (canonical prose with any translated leaves merged in)
// plus a chrome dictionary for the locale. Adding a language touches lib/i18n.js only.

const { CHROME, STAGES, LOCALES, LOCALE_NAME, LOCALE_SHORT, CANONICAL, stageKey,
        GLOSSARY, GLOSSARY_LINK } = require('./i18n');

/* r is the RESOLVED analysis: canonical prose with this locale's translated leaves
   already substituted in by i18n.resolve(). There is no second field to choose from
   here, which is deliberate -- every past bilingual bug in this file was a branch
   picking the wrong side. `available` lists the locales this report can be shown in,
   so the toggle only ever offers a language that will actually render. */
function buildHTML(r, form, filename, assessmentDate, locale, available) {
  locale = LOCALES.includes(locale) ? locale : CANONICAL;
  const T = CHROME[locale];
  const others = (available && available.length ? available : [CANONICAL]).filter(l => l !== locale);
  const rid = filename.replace(/\.[^.]+$/, '');
  const tx = (key) => r[key];
  const pick = (o, f) => (o ? o[f] : '');
  const age = form.dob ? Math.floor((new Date() - new Date(form.dob)) / (365.25 * 24 * 3600 * 1000)) : '?';
  const gender = form.gender || 'Not specified';

  const signalBadges = r.signals.map(s => `<span class="signal-badge">${pick(s, 'badge')}</span>`).join('\n    ');

  const compRows = [];
  if (form.weight) compRows.push({ label: T.cWeight, value: `${form.weight} lb`, range: form.weightKg ? `${form.weightKg} kg` : '' });
  if (form.bmi) {
    const bmiNum = parseFloat(form.bmi);
    const cls = bmiNum < 25 ? 'comp-good' : 'comp-warn';
    const range = bmiNum < 18.5 ? T.bUnder : bmiNum < 25 ? T.bHealthy : bmiNum < 30 ? T.bOver : T.bObese;
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
    const range = diff < 0 ? T.mYounger(Math.abs(diff)) : diff === 0 ? T.mMatch : T.mOlder(diff);
    compRows.push({ label: T.cMetAge, value: form.metabolicAge, range, cls });
  }
  if (form.protein) {
    compRows.push({ label: T.cProtein, value: `${form.protein}%`, range: T.rProteinOk, cls: parseFloat(form.protein) >= 18 ? 'comp-good' : 'comp-warn' });
  }

  /* Body composition now lives inside the profile card rather than in its own,
     so the stats a client scans first are all in one place. */
  const compInnerHTML = compRows.length > 0 ? `
    <div class="card-rule"></div>
    <div class="card-subtitle">${T.bodyComp}</div>
    <div class="comp-grid">
      ${compRows.map(c => `<div class="comp-row">
        <div class="comp-label">${c.label}</div>
        <div class="comp-value${c.cls ? ' ' + c.cls : ''}">${c.value}</div>
        ${c.range ? `<div class="comp-range${c.cls ? ' ' + c.cls : ''}">${c.range}</div>` : ''}
      </div>`).join('\n      ')}
    </div>
    ${r.bodyCompNote ? `<p class="comp-note">${tx('bodyCompNote')}</p>` : ''}` : '';

  /* Findings and their cause in one block. The old layout listed three signals and
     then explained the same three again underneath, which read as repetition and
     forced an arbitrary top-three on findings that are connected rather than ranked. */
  const findings = (r.signals || []).map((sg, i) => {
    const cause = (r.rcaSections || [])[i] || null;
    return { sg, cause };
  });
  const extraCauses = (r.rcaSections || []).slice((r.signals || []).length);
  const findingsHTML = findings.map(({ sg, cause }) => `
    <div class="finding">
      <div class="finding-head">
        <span class="finding-name">${sg.name}</span>
        ${sg.badge ? `<span class="signal-badge">${sg.badge}</span>` : ''}
      </div>
      <div class="finding-desc">${sg.description}</div>
      ${cause ? `<div class="finding-cause">${cause.text}</div>` : ''}
    </div>`).join('') + extraCauses.map(c => `
    <div class="finding">
      <div class="finding-head"><span class="finding-name">${c.label}</span></div>
      <div class="finding-cause">${c.text}</div>
    </div>`).join('');

  const rcaHTML = r.rcaSections.map(s => `
    <div class="rca-section">
      <div class="rca-label"><span class="rca-dot"></span>${pick(s, 'label')}</div>
      <div class="rca-text">${pick(s, 'text')}</div>
    </div>`).join('');

  // 清调补养 — always four stages, always in order. Falls back to a legacy flat plan.
  /* English pages carry no Chinese at all: the glyph becomes the stage number. */
  /* Declared before the stage block, which renders these inside the stage that prescribes them. */
  const bystage = {};
  (r.products || []).forEach((p, i) => {
    const k = stageKey(p.stage) || 'replenish';
    (bystage[k] = bystage[k] || []).push({ p, i });
  });
  /* [[UL]] anywhere in prose becomes the term with a definition bubble. The skill
     only has to mark the word; what the word means, in which language, and where it
     is sourced from all live in one place. */
  const withTerms = (text) => String(text || '').replace(/\[\[([A-Z%]+)\]\]/g, (m, key) => {
    const g = GLOSSARY[key];
    if (!g) return key;
    const [title, body] = g[locale] || g.en;
    const link = GLOSSARY_LINK[key];
    return `<span class="term" tabindex="0">${key}<span class="term-q">?</span>` +
      `<span class="term-pop"><span class="term-pop-t">${title}</span>${body}` +
      (link ? ` <a href="${link}" target="_blank">${T.dSource}</a>` : '') + `</span></span>`;
  });

  const productCard = ({ p, i }) => {
    const d = p.dosing || {};
    const n = (d.nutrients || []).filter(x => x.pctUL !== undefined && x.pctUL !== null);
    /* One disclosure, not two. The card used to carry a "How to take it" note AND a
       separate expander saying the same thing. How much and why the amount are the
       two questions this answers; the rationale above already covers why the product. */
    const detail = (d.howMuch || d.why || n.length) ? `
      <details class="dose-detail">
        <summary>${T.takeWith}</summary>
        <div class="dose-detail-body">
          ${d.howMuch ? `<div class="dose-field"><span class="dose-field-label">${T.dHow}</span>${withTerms(d.howMuch)}</div>` : ''}
          ${d.why ? `<div class="dose-field"><span class="dose-field-label">${T.dWhy}</span>${withTerms(d.why)}</div>` : ''}
          ${d.food ? `<div class="dose-food"><b>${T.foodInstead}</b> ${withTerms(d.food)}</div>` : ''}
          ${n.length ? `<table class="dose-table">
            <tr><th></th><th>${T.dLabel}</th><th>/${T.perDay}</th><th>${T.dOfUL}</th></tr>
            ${n.map(x => `<tr${x.limiting ? ' class="dose-lim"' : ''}>
              <td>${x.name}${x.limiting ? ` <span class="dose-tag">${T.dLimiting}</span>` : ''}</td>
              <td>${x.perServing}</td><td>${x.total}</td><td>${x.pctUL}${typeof x.pctUL === 'number' ? '%' : ''}</td></tr>`).join('')}
          </table>` : ''}
          ${d.tolerability ? `<div class="dose-flush"><b>${T.dFlush}</b> ${withTerms(d.tolerability)}</div>` : ''}
          ${n.some(x => x.source) ? `<div class="dose-src">${
            [...new Map(n.filter(x => x.source).map(x => [x.source.url, x.source])).values()]
              .map(sc => `<a href="${sc.url}" target="_blank">${sc.name}</a>${sc.updated ? ` (${sc.updated})` : ''}`).join(' · ')
          }</div>` : ''}
        </div>
      </details>` : '';
    return `
    <div class="product-card">
      <div class="product-name">${p.name}</div>
      <div class="product-rationale">${withTerms(p.rationale)}</div>
      ${detail}
    </div>`;
  };

  const stages = Array.isArray(r.stages) && r.stages.length
    ? r.stages
    : (r.plan || []).map((p, i) => ({
        glyph: ['清', '调', '补', '养'][i] || '养',
        label: p.label, focus: '', items: p.items, horizon: ''
      }));

  const stagesPlanHTML = stages.map(st => {
    const key = stageKey(st.glyph) || stageKey(st.key);
    const m = (key && STAGES[locale][key]) || { g: '', label: st.label || '', sub: '' };
    const focus = st.focus, items = st.items || [], hor = st.horizon;
    return `
    <div class="stage">
      <div class="stage-head">
        <span class="stage-glyph">${m.g}</span>
        <span class="stage-titles">
          <span class="stage-label">${m.label}</span>
          <span class="stage-sub">${m.sub}</span>
        </span>
      </div>
      ${focus ? `<div class="stage-focus">${focus}</div>` : ''}
      ${(bystage[key] || []).map(productCard).join('')}
      <ul class="plan-items">
        ${items.map(item => `<li>${item}</li>`).join('\n        ')}
      </ul>
      ${hor ? `<div class="stage-horizon">${hor}</div>` : ''}
    </div>`;
  }).join('');

  /* No tier badge. This practice does not grade people, and an A/B/C label on a
     client's own report reads as a verdict rather than an observation. Depth is
     carried by what the report says, not by a letter. */
  const tierHTML = r.tierNote ? `
    <div class="tier-note"><span>${tx('tierNote') || ''}</span></div>` : '';

  const productsHTML = (r.products || []).map((p, i) => {
    const pk = stageKey(p.stage);
    const tag = pk ? STAGES[locale][pk].label : '';
    const rat = p.rationale;
    const not = p.note;
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


  const expectations = r.expectations || [];
  const expectHTML = !expectations.length ? '' : `
  <div class="card">
    <div class="card-title">${T.expect}</div>
    <p class="card-sub">${T.expectSub}</p>
    ${expectations.map(e => `
      <div class="expect-row">
        <div class="expect-when">${e.when}</div>
        <div class="expect-body">
          <div class="expect-finding">${e.finding}</div>
          <div class="expect-change">${e.change}</div>
        </div>
      </div>`).join('')}
    ${r.recheckItems ? `<div class="recheck-label">${T.recheckItems}</div>
    <div class="recheck-items">${tx('recheckItems')}</div>` : ''}
  </div>`;

  const winsList = r.wins || [];
  const winsHTML = winsList.map(w => `<li>${w}</li>`).join('\n      ');

  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${T.docTitle(form.name)}</title>
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
  /* Language selector, ported from the product site so the two present the same control. */
  .lang-wrap{position:absolute;top:14px;right:18px;z-index:300}
  .lang-btn{display:inline-flex;align-items:center;gap:5px;background:rgba(255,255,255,0.1);
    border:1px solid rgba(255,255,255,0.16);color:rgba(255,255,255,0.85);font-family:inherit;
    font-size:12px;font-weight:600;padding:6px 11px;border-radius:18px;cursor:pointer;
    transition:background .18s;white-space:nowrap}
  .lang-btn:hover{background:rgba(255,255,255,0.2)}
  .lang-btn.zh-active{background:rgba(255,255,255,0.15)}
  .lang-caret{width:0;height:0;border-left:3.5px solid transparent;border-right:3.5px solid transparent;
    border-top:4px solid currentColor;opacity:.65}
  .lang-menu{display:none;position:absolute;top:calc(100% + 7px);right:0;z-index:300;background:#fff;
    border:1px solid var(--gray-200);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.16);
    padding:5px;min-width:150px}
  .lang-menu.open{display:block}
  .lang-opt{display:flex;align-items:center;gap:10px;width:100%;background:none;border:0;border-radius:7px;
    padding:8px 10px;cursor:pointer;text-align:left;font:inherit;font-size:13.5px;color:var(--gray-800);
    white-space:nowrap;text-decoration:none}
  .lang-opt:hover{background:var(--green-light)}
  .lang-opt.on{background:var(--green-light);color:var(--navy);font-weight:650}
  .lang-opt-label{flex:none;width:26px;font-size:10.5px;font-weight:700;letter-spacing:.04em;
    color:var(--green);text-transform:uppercase}
  @media(max-width:600px){.lang-btn{font-size:11px;padding:5px 8px}}
  .hero{position:relative}
  .card-supp{border:1px solid var(--green-light);background:linear-gradient(180deg,#fbfdfb 0%,#fff 60%)}
  .dose-detail{margin-top:10px;border-top:1px solid var(--green-light);padding-top:8px}
  .dose-detail summary{cursor:pointer;font-size:12px;font-weight:700;color:var(--green);
    list-style:none;padding:4px 0;user-select:none}
  .dose-detail summary::-webkit-details-marker{display:none}
  .dose-detail summary::before{content:"+ ";font-weight:800}
  .dose-detail[open] summary::before{content:"\\2212 "}
  .dose-detail-body{padding-top:8px;font-size:13px;line-height:1.65;color:var(--gray-600)}
  .dose-detail-body .dose-line{font-size:13px;line-height:1.65;margin-bottom:8px}
  .dose-detail-body b{color:var(--gray-800);font-weight:650}
  .dose-field{margin-bottom:10px}
  .dose-field-label{display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;
    text-transform:uppercase;color:var(--green);margin-bottom:3px}
  /* Glossary bubble. Reference-intake abbreviations mean nothing to a client the
     first time they meet them, and a report that uses UL without saying what it is
     is asking to be taken on faith. Focus/hover only, no script. */
  .term{position:relative;border-bottom:1px dotted var(--green);cursor:help;outline:none}
  .term-q{display:inline-grid;place-items:center;width:13px;height:13px;border-radius:50%;
    background:var(--green-light);color:var(--green);font-size:9px;font-weight:800;
    margin-left:2px;vertical-align:super}
  .term-pop{display:none;position:absolute;left:0;top:calc(100% + 6px);z-index:400;width:270px;
    background:#fff;border:1px solid var(--gray-200);border-radius:10px;padding:10px 12px;
    box-shadow:0 8px 24px rgba(0,0,0,.14);font-size:12px;line-height:1.6;color:var(--gray-600);
    font-weight:400;text-transform:none;letter-spacing:0}
  .term:hover .term-pop,.term:focus .term-pop,.term:focus-within .term-pop{display:block}
  .term-pop a{color:var(--green)}
  .term-pop-t{display:block;font-weight:700;color:var(--gray-800);margin-bottom:3px}
  .dose-food{font-size:12.5px;color:var(--gray-600);line-height:1.6;background:var(--gray-100);
    border-radius:8px;padding:9px 11px;margin:7px 0}
  .dose-food b{color:var(--gray-800);font-weight:650;margin-right:4px}
  .expect-row{display:flex;gap:14px;padding:11px 0;border-bottom:1px solid var(--gray-100)}
  .expect-row:last-of-type{border-bottom:0}
  .expect-when{flex:none;width:96px;font-size:11.5px;font-weight:700;color:var(--green);
    text-transform:uppercase;letter-spacing:.4px;padding-top:2px}
  .expect-finding{font-weight:650;font-size:13.5px;color:var(--gray-800);margin-bottom:2px}
  .expect-change{font-size:12.5px;color:var(--gray-600);line-height:1.6}
  .product-head{display:flex;align-items:center;gap:9px;margin-bottom:7px;flex-wrap:wrap}
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
  .product-card{background:var(--green-light);border:1px solid rgba(92,138,110,.18);border-radius:var(--radius);padding:16px;margin-bottom:12px}
  .product-card:last-child{margin-bottom:0}
  .product-name{font-size:15px;font-weight:700;color:var(--navy);margin-bottom:4px}
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
  <span class="site-logo">${T.siteLogo}</span>
  <span class="site-header-sub">${T.confidential} &nbsp;·&nbsp; ${assessmentDate}</span>
</header>

<div class="hero">
  ${available.length > 1 ? `<div class="lang-wrap">
    <button class="lang-btn${locale === CANONICAL ? '' : ' zh-active'}" id="lang-toggle-btn"
            onclick="toggleLangMenu()" aria-haspopup="true" aria-expanded="false">
      <span>${LOCALE_SHORT[locale]}</span><span class="lang-caret"></span>
    </button>
    <div class="lang-menu" id="lang-menu">
      ${available.map(l => `<a class="lang-opt${l === locale ? ' on' : ''}" href="?r=${rid}${l === CANONICAL ? '' : `&lang=${l}`}"><span class="lang-opt-label">${LOCALE_SHORT[l]}</span><span>${LOCALE_NAME[l]}</span></a>`).join('')}
    </div>
  </div>` : ''}
  <div class="hero-label">${T.heroLabel}</div>
  <div class="hero-name">${form.name}</div>
  <div class="hero-meta">${assessmentDate} &nbsp;·&nbsp; ${T.consultant}: Johnny / Irene &nbsp;·&nbsp; ${T.recheck}</div>
  <div class="hero-signals">
    ${signalBadges}
  </div>
</div>

<div class="page-body">

  <div class="card">
    <div class="card-title">${T.profile}</div>
    <div class="comp-grid client-grid">
      <div class="comp-row"><div class="comp-label">${T.name}</div><div class="comp-value" style="font-size:14px">${form.name}</div></div>
      <div class="comp-row"><div class="comp-label">${T.age}</div><div class="comp-value" style="font-size:14px">${age}</div></div>
      <div class="comp-row"><div class="comp-label">${T.gender}</div><div class="comp-value" style="font-size:14px">${gender}</div></div>
      ${form.height ? `<div class="comp-row"><div class="comp-label">${T.height}</div><div class="comp-value" style="font-size:14px">${form.height}</div></div>` : ''}
    </div>
    ${compInnerHTML}
  </div>

  <div class="card">
    <div class="card-title">${T.findings}</div>
    <p class="card-sub">${T.findingsSub}</p>
    ${findingsHTML}
    <div class="summary-box">${tx('summary')}</div>
  </div>

  <div class="card">
    <div class="card-title">${T.solution}</div>
    <p class="card-sub">${T.solutionSub}</p>
    ${tierHTML}
    ${stagesPlanHTML}
  </div>


  ${expectHTML}

  ${(r.products && r.products.length && r.calcUrl) ? `
  <div class="cta-section">
    <div class="cta-title">${T.ctaTitle}</div>
    <div class="cta-sub">${T.ctaSub}</div>
    <a class="cta-btn" href="${r.calcUrl}" target="_blank">${T.ctaBtn}</a>
    <div class="cta-passcode">${T.ctaPasscode}</div>
  </div>` : ''}

  <div class="report-footer">
    ${T.siteLogo} &nbsp;·&nbsp; ${assessmentDate}<br>
    ${T.disclaimer}
  </div>

</div>
<script>
function toggleLangMenu(force){
  var m=document.getElementById('lang-menu');
  if(!m) return;
  var open = force===undefined ? !m.classList.contains('open') : force;
  m.classList.toggle('open', open);
  document.getElementById('lang-toggle-btn').setAttribute('aria-expanded', open);
}
document.addEventListener('click', function(e){
  if(!e.target.closest('.lang-wrap')) toggleLangMenu(false);
});
</script>
</body>
</html>`;
}

// ─── FORMAT FORM DATA FOR CLAUDE ─────────────────────────────────────────────

module.exports = { buildHTML };
