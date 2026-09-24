const https = require('https');
const { getFile, pushFile, ghRequest, getIndex, cors } = require('../lib/github');
const { buildHTML } = require('../lib/render');
const I18N = require('../lib/i18n');
const { generateAnalysis } = require('../lib/generate');
const ibo = require('../lib/ibo');
const { extractJson } = require('../lib/extract');

/* Write a freshly generated report's summary into its row in index.json. Best-effort: the
   report itself is already stored and correct, this only affects how it looks in All Reports,
   so a failure here is logged and never allowed to break serving the report. */
async function backfillIndex(rid, analysis) {
  const index = await getIndex();
  for (const client of Object.values(index.clients || {})) {
    const row = (client.reports || []).find(r => r.rid === rid);
    if (!row) continue;
    row.signals = (analysis.signals || []).map(s => s.name).filter(Boolean);
    row.products = (analysis.products || []).map(p => p.name).filter(Boolean);
    row.pending = false;
    await pushFile('index.json', JSON.stringify(index, null, 2), `Update index: report ${rid} ready`);
    return;
  }
}

/* Stay under the function's maxDuration in vercel.json so the timeout is ours, not
   the platform's. Ours returns a page that retries; the platform's returns a 504. */
const GEN_BUDGET_MS = Number(process.env.GEN_BUDGET_MS || 260000);
const MAX_ATTEMPTS = 3;   // then the page stops retrying by itself and an admin decides

/* Translation runs here rather than at submit time so the analysis and the
   translation each get their own function-time budget. It is locale-generic:
   nothing below names a language, so adding one is a lib/i18n.js change only. */

function callClaude(payloadObj) {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
  const payload = JSON.stringify(payloadObj);
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com', path: '/v1/messages', method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01',
                 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
    }, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (j.error) return reject(new Error(j.error.message));
          resolve(j.content[0].text);
        } catch (e) { reject(new Error('bad response from model')); }
      });
    });
    req.on('error', reject);
    req.write(payload); req.end();
  });
}

/* Translate one batch of leaves into `locale` and write them into the overlay.

   A reply that cannot be read, or that skips some ids, used to throw the whole batch away, and the
   next request asked for the same batch and failed the same way: the report sat on "Preparing this
   language" forever. Now the leaves that did not come back are retried in halves, and a single leaf
   that still will not translate keeps its English text (noted in `log`), so a language always
   finishes. A failed call to the model itself (network, outage) still throws: that is transient, and
   filling English in for it would make the gap permanent. */
async function translateBatch(items, locale, overlay, log) {
  const user = 'Translate each value. Return JSON keyed by the same ids.\n\n'
    + JSON.stringify(Object.fromEntries(items.map((it, i) => [String(i), it.text])), null, 1);
  const raw = await callClaude({
    model: 'claude-haiku-4-5-20251001', max_tokens: 16384,
    system: [{ type: 'text', text: I18N.systemPrompt(locale), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }]
  });
  let map = null, err = '';
  try { map = extractJson(raw); } catch (e) { err = e.message; }
  const missed = [];
  items.forEach((it, i) => {
    const v = map && map[String(i)];
    if (v && String(v).trim()) I18N.setPath(overlay, it.path, String(v));
    else missed.push(it);
  });
  if (!missed.length) return overlay;
  if (missed.length > 1) {
    const half = Math.ceil(missed.length / 2);
    await translateBatch(missed.slice(0, half), locale, overlay, log);
    await translateBatch(missed.slice(half), locale, overlay, log);
    return overlay;
  }
  /* One leaf left. The usual cause is a straight quote inside the translated text that breaks
     the JSON, so ask for this one as plain text, where there is nothing to escape. */
  const plain = await callClaude({
    model: 'claude-haiku-4-5-20251001', max_tokens: 4096,
    system: [{ type: 'text', text: I18N.systemPrompt(locale), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: 'Translate this one value. Reply with the translation only, no quotes around it, no JSON, no notes.\n\n' + missed[0].text }]
  }).catch(() => '');
  let text = String(plain || '').trim();
  if (text.startsWith('{')) {   // the system prompt asks for JSON, so it may still answer that way
    try { const o = extractJson(text); text = String(Object.values(o)[0] || '').trim(); } catch (e) { text = ''; }
  }
  if (text) { I18N.setPath(overlay, missed[0].path, text); return overlay; }
  I18N.setPath(overlay, missed[0].path, missed[0].text);
  log.push({ path: missed[0].path, error: err || 'no translation came back' });
  return overlay;
}

/* Fill in as much of `locale` as fits in the time budget, saving after each batch so
   progress survives a timeout. Returns whether the locale is now complete. */
async function fillLocale(doc, rid, locale, budgetMs) {
  const started = Date.now();
  doc.i18n = doc.i18n || {};
  const overlay = doc.i18n[locale] = doc.i18n[locale] || {};

  /* Save after EVERY batch, not at the end. If a batch overruns the function ceiling the
     request dies with it, and anything held in memory is lost -- which meant a report whose
     first batch was too slow could never make progress no matter how many times it was
     retried. Writing each batch turns a timeout into "resumes next request". */
  const BATCH = Number(process.env.TRANSLATE_BATCH || 16);
  const log = [];
  let done = false;
  while (!done) {
    const todo = I18N.missing(doc.analysis, overlay);
    if (!todo.length) { done = true; break; }
    if (Date.now() - started > budgetMs) break;
    await translateBatch(todo.slice(0, BATCH), locale, overlay, log);
    if (log.length) {
      doc.i18nLog = doc.i18nLog || {};
      doc.i18nLog[locale] = { at: new Date().toISOString(), keptEnglish: (doc.i18nLog[locale] ? doc.i18nLog[locale].keptEnglish || [] : []).concat(log.splice(0)) };
    }
    await pushFile(`reports/${rid}.analysis.json`, JSON.stringify(doc, null, 1),
      `Translate ${locale}: ${rid}`);
  }
  return I18N.isComplete(doc.analysis, overlay);
}

/* One translation at a time per report. The "preparing" page refreshes every few seconds, and
   each refresh used to start its own translation of the same leaves while the last was running. */
async function translationRunning(rid) {
  const t = await readGen(`reports/${rid}.translate.json`);
  return !!(t.startedAt && !t.finishedAt && Date.now() - t.startedAt < 200000);
}
async function translateWithLock(doc, rid, locale, budgetMs) {
  const path = `reports/${rid}.translate.json`;
  await writeGen(path, { locale, startedAt: Date.now() });
  try { return await fillLocale(doc, rid, locale, budgetMs); }
  finally { await writeGen(path, { locale, startedAt: 0, finishedAt: Date.now() }); }
}

/* Start a report's Chinese version in the background right after it is written, so switching
   language is instant for whoever opens it next. Fire and hang up: the server keeps working. */
function warmTranslation(rid, locale) {
  return new Promise((resolve) => {
    try {
      const base = process.env.API_BASE || 'https://health-intake-api.vercel.app';
      const r = https.get(`${base}/api/report?r=${rid}&prep=${locale}`, { headers: { 'User-Agent': 'translation-warmup' } }, (resp) => resp.resume());
      r.on('error', () => resolve());
      setTimeout(() => { try { r.destroy(); } catch (e) { /* closed */ } resolve(); }, 2500);
    } catch (e) { resolve(); }
  });
}

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'POST') {
    /* The all-reports page (github.io) opens a report by posting its admin token here. This sets
       the session cookie for this domain and continues to the report, so a locked report opens
       in full. The token travels in the body, never in a URL. */
    const b = typeof req.body === 'string' ? Object.fromEntries(new URLSearchParams(req.body)) : (req.body || {});
    const r = String(b.r || '').trim();
    if (!ibo.tokenOk(b.token) || !/^[a-f0-9]{24}$/.test(r)) {
      return res.status(401).send(page('Sign in as admin', 'Open this report from the All reports page after signing in as admin.'));
    }
    ibo.setCookie(res);
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    return res.redirect(303, `/api/report?r=${r}`);
  }
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const rid = String(req.query.r || '').trim();
  const partner = ibo.fromCookie(req);
  let access = { report: true, products: true };   // reports with no analysis file predate the lock
  if (!/^[a-f0-9]{24}$/.test(rid)) {
    return res.status(400).send(page('Invalid link', 'That link is not in the right format. Check that you copied the whole thing.'));
  }

  try {
    const index = await getIndex();
    const owner = Object.values(index.clients || {})
      .find(c => (c.reports || []).some(r => r.rid === rid));
    if (!owner) {
      return res.status(404).send(page('Report not found', 'This link has expired or was never valid. Ask Johnny or Irene to resend it.'));
    }

    /* A link, once sent, is out of our hands: it sits in somebody's inbox and gets
       opened months later. So a superseded rid resolves to the client's current
       report rather than serving whatever was written that day. Without this, every
       regeneration silently orphans every link already sent, and the person opening
       it sees an old report with no sign that a newer one exists.
       `&exact=1` opts out, for showing someone a previous assessment on purpose. */
    const current = (owner.reports || [])[0];
    const exact = String(req.query.exact || '') === '1';
    if (!exact && current && current.rid !== rid) {
      const q = new URLSearchParams({ r: current.rid });
      if (req.query.lang) q.set('lang', String(req.query.lang));
      if (req.query.f) q.set('f', String(req.query.f));
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      return res.redirect(302, `/api/report?${q.toString()}`);
    }

    // ?f=pdf serves the PDF version when one exists.
    if (String(req.query.f || '').toLowerCase() === 'pdf') {
      const entry = (owner.reports || []).find(r => r.rid === rid);
      const a = await ibo.getAccess(rid, entry && entry.date);
      if (!partner && !a.report) return res.status(404).send(page('Report locked', 'Your consultant will unlock this report when you go through it together.'));
      const meta = await ghRequest('GET', `reports/${rid}.pdf`);
      if (meta.status !== 200 || !meta.data.content) {
        return res.status(404).send(page('No PDF for this report', 'This assessment does not have a PDF version. Open the web version instead.'));
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="health-report-${rid}.pdf"`);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      return res.status(200).send(Buffer.from(meta.data.content, 'base64'));
    }

    const asked = String(req.query.lang || '').toLowerCase();
    const locale = I18N.LOCALES.includes(asked) ? asked : I18N.CANONICAL;

    /* Render fresh from the stored analysis every time. Rendering is free, so a
       renderer fix reaches every existing report instead of being masked by cached
       HTML, and both languages are guaranteed to come from the same source. */
    const stored = await getFile(`reports/${rid}.analysis.json`);
    let html;

    if (stored) {
      const doc = JSON.parse(stored);
      doc.i18n = doc.i18n || {};

      /* ?prep=zh makes a language ready without showing the report: used in the background right
         after a report is written, and to repair one whose translation stalled. It answers with
         counts only, never content, so it is safe on a locked report. */
      const prep = String(req.query.prep || '').toLowerCase();
      if (prep) {
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        if (!I18N.LOCALES.includes(prep) || prep === I18N.CANONICAL) return res.status(400).json({ error: 'Unknown language' });
        if (!doc.analysis || doc.analysis.error) return res.status(200).json({ rid, locale: prep, ready: false, reason: 'report not written yet' });
        if (I18N.isComplete(doc.analysis, doc.i18n[prep])) return res.status(200).json({ rid, locale: prep, ready: true });
        if (await translationRunning(rid)) return res.status(200).json({ rid, locale: prep, ready: false, reason: 'already translating' });
        const ok = await translateWithLock(doc, rid, prep, 170000)
          .catch((e) => { console.error('prep translation failed:', e && e.message); return false; });
        return res.status(200).json({ rid, locale: prep, ready: !!ok,
          missing: I18N.missing(doc.analysis, doc.i18n[prep]).length,
          keptEnglish: ((doc.i18nLog || {})[prep] || {}).keptEnglish ? doc.i18nLog[prep].keptEnglish.length : 0 });
      }

      /* Generation is deferred at submit time because a rich report does not fit the
         60s ceiling. Produce it here, on first view, and save it. If this request dies
         the next one simply tries again, which is recoverable in a way that a failed
         form submission is not. */
      /* The model sometimes decides an intake has too little to analyze and returns its own
         { error, missing_fields, ... } object instead of the report schema. That is valid JSON,
         so it is not caught as a generation failure, but it is not a report either: feeding it to
         buildHTML produced a page with literal "undefined" text where fields were expected.
         An admin retry clears it so it re-enters generation below like a fresh report. */
      if (doc.analysis && doc.analysis.error && partner && String(req.query.retry || '') === '1') {
        doc.analysis = null;
      }

      if (!doc.analysis) {
        /* One generation at a time, and a record of every attempt. The waiting page used to
           refresh every 15 seconds and each refresh started another full generation while the
           last was still running, and any failure looked exactly like "still preparing". */
        const genPath = `reports/${rid}.generation.json`;
        const g = await readGen(genPath);
        const retry = partner && String(req.query.retry || '') === '1';
        const running = g.startedAt && !g.finishedAt && Date.now() - g.startedAt < GEN_BUDGET_MS + 20000;
        if (running) return res.status(200).send(waitingPage(g, partner, rid));
        if (!retry && g.error && (g.attempts || 0) >= MAX_ATTEMPTS) return res.status(200).send(waitingPage(g, partner, rid));

        const attempts = retry ? 1 : (g.attempts || 0) + 1;
        const t0 = Date.now();
        await writeGen(genPath, { startedAt: t0, attempts });
        /* Race the platform, do not trust it. A thrown error lands in the catch below, but a
           function killed at its duration ceiling runs no catch at all and the reader gets a raw
           504 gateway page. Return the waiting page a little before that. */
        const budget = new Promise(r => setTimeout(() => r(null), GEN_BUDGET_MS));
        let produced = null, err = '';
        try {
          produced = await Promise.race([generateAnalysis(doc.form || {}), budget]);
          if (!produced) err = `no result after ${Math.round(GEN_BUDGET_MS / 1000)} seconds`;
        } catch (e) {
          err = (e && e.message) || String(e);
          console.error('deferred generation failed:', err);
        }
        if (!produced) {
          const rec = { startedAt: t0, finishedAt: Date.now(), attempts, error: String(err).slice(0, 700) };
          await writeGen(genPath, rec);
          return res.status(200).send(waitingPage(rec, partner, rid));
        }
        /* Deleted or replaced by an edited resubmission while this was being written: saving now
           would bring back a file nothing points to. */
        const still = await getFile(`reports/${rid}.analysis.json`).catch(() => 'unknown');
        if (!still) return res.status(410).send(page('This report was replaced', 'A newer version of this assessment was submitted. Use the link from that one.'));
        doc.analysis = produced;
        await pushFile(`reports/${rid}.analysis.json`, JSON.stringify(doc, null, 1),
          `Generate analysis: ${rid}`);
        await writeGen(genPath, { startedAt: t0, finishedAt: Date.now(), attempts, ok: true, ms: Date.now() - t0 });
        /* index.json's per-report row (signals, products, pending) is written once at submit
           time, before generation has run, and nothing else ever revisits it. Every report
           made the normal way sat there forever looking unfinished in All Reports even after
           it was ready. Update it now that there is something real to show. */
        await backfillIndex(rid, produced).catch(e => console.error('index backfill failed:', e && e.message));
        await warmTranslation(rid, 'zh');
      }

      /* The report is locked until a partner opens it (lib/ibo.js). Generation above already
         ran, so it is ready the moment it is unlocked. A locked visitor gets a placeholder page
         that carries none of the report, so nothing can be read out of its source. */
      access = await ibo.getAccess(rid, doc.assessmentDate, doc.unlocked);
      if (!partner && !access.report) {
        const l = I18N.LOCALES.includes(asked) ? asked : I18N.CANONICAL;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'private, no-store, max-age=0');
        res.setHeader('Vary', 'Cookie');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
        return res.status(200).send(buildHTML({}, { name: doc.form && doc.form.name }, doc.filename,
          doc.assessmentDate, l, I18N.LOCALES, { gate: true }));
      }

      if (doc.analysis && doc.analysis.error) {
        const missing = Array.isArray(doc.analysis.missing_fields) ? doc.analysis.missing_fields : [];
        const detail = partner
          ? `<br><br><small style="text-align:left;display:block">${esc(doc.analysis.message || '')}`
            + (missing.length ? `<br><br>Missing:<ul style="margin:4px 0 0;padding-left:18px">${missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul>` : '')
            + `<br><a href="/api/report?r=${esc(rid)}&retry=1">Regenerate now</a></small>`
          : '';
        return res.status(200).send(page('Not enough information for a report',
          (partner
            ? 'The assessment did not have enough detail to build a report.'
            : 'Your assessment did not have enough detail to build a report. Please ask your consultant for a new link and answer as many questions as you can.')
          + detail));
      }

      /* A locale is offered only when it will render completely. A page that is
         half translated is worse than one that is not translated at all, so the
         toggle never points at something that would come back mixed. */
      const ready = (l) => l === I18N.CANONICAL || I18N.isComplete(doc.analysis, doc.i18n[l]);

      let shown = locale;
      if (locale !== I18N.CANONICAL && !ready(locale)) {
        /* First request for this language: fill it in. */
        const done = (await translationRunning(rid)) ? false : await translateWithLock(doc, rid, locale, 42000).catch(e => {
          console.error('translation failed:', e && e.message); return false;
        });
        if (!done) {
          /* Do NOT quietly serve English here. Falling back looked exactly like the
             language button being broken: four clicks, nine seconds each, still
             English. Say what is happening and refresh, the way generation does. */
          return res.status(200).send(page(
            'Preparing this language',
            'The first time a report is opened in a new language it has to be translated. '
            + 'This takes up to a minute, once. This page will refresh itself.',
            '<meta http-equiv="refresh" content="8">'));
        }
      }

      /* The menu offers every language, matching the product site. A locale that is not
         yet filled is translated on first request; `shown` below still guarantees the page
         served is never a mixture. */
      const available = I18N.LOCALES;
      const resolved = I18N.resolve(doc.analysis, shown === I18N.CANONICAL ? null : doc.i18n[shown]);
      html = buildHTML(resolved, doc.form, doc.filename, doc.assessmentDate, shown, available,
        { unlocked: access.products, ibo: partner, reportOpen: access.report });
    }

    /* Reports generated before analyses were stored can only be served as written.
       No locale list is passed, so they show no language toggle rather than one that
       leads to a broken page. */
    if (!html) html = await getFile(`reports/${rid}.html`);

    if (!html) {
      return res.status(404).send(page('Report not found', 'The report file is missing. Please let Johnny know.'));
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Cookie');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return res.status(200).send(html);
  } catch (err) {
    console.error('report fetch failed:', err);
    return res.status(500).send(page('Something went wrong', 'We could not load the report right now. Try again in a minute.'));
  }
};

const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function readGen(path) {
  try { return JSON.parse((await getFile(path)) || '{}'); } catch (e) { return {}; }
}
async function writeGen(path, rec) {
  try { await pushFile(path, JSON.stringify(rec, null, 1), `Generation record ${path.replace(/^reports\//, '').slice(0, 24)}`); } catch (e) { /* a record is a courtesy, never a reason to fail */ }
}

/* The page a visitor sees while a report is not generated. A client gets a plain message; an
   admin also gets the real error and a way to retry. */
function waitingPage(g, admin, rid) {
  const stuck = g.error && (g.attempts || 0) >= MAX_ATTEMPTS;
  const detail = admin && (g.error || g.startedAt)
    ? `<br><br><small style="text-align:left;display:block;word-break:break-word">Attempt ${esc(g.attempts || 1)}`
      + (g.startedAt && !g.finishedAt ? ` running for ${Math.round((Date.now() - g.startedAt) / 1000)}s` : '')
      + (g.error ? `. Last error: ${esc(g.error)}` : '') + `</small>`
      + (stuck ? `<br><a href="/api/report?r=${esc(rid)}&retry=1">Try again</a>` : '')
    : '';
  if (stuck) {
    return page('We could not prepare this report',
      'Something went wrong while preparing it. Your consultant has been told and will sort it out, so you do not need to do anything.' + detail);
  }
  return page('Your report is being prepared',
    'This takes a minute or two the first time. This page will refresh itself.' + detail,
    '<meta http-equiv="refresh" content="15">');
}

function page(title, body, head) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${head || ''}
<title>${title}</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F4F6F9;color:#141922;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px}
.c{background:#fff;border:1px solid #DCE1EA;border-radius:12px;padding:32px;max-width:440px;text-align:center;
box-shadow:0 8px 24px -12px rgba(20,25,34,.18)}
h1{font-size:19px;margin:0 0 8px}p{margin:0;color:#5C6862;font-size:14px;line-height:1.6}
@media(prefers-color-scheme:dark){body{background:#0E1117;color:#E6EAF0}.c{background:#151A22;border-color:#262E3A}p{color:#95A29B}}
</style>
<div class="c"><h1>${title}</h1><p>${body}</p></div>`;
}
