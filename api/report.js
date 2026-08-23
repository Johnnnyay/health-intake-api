const https = require('https');
const { getFile, pushFile, ghRequest, getIndex, cors } = require('../lib/github');
const { buildHTML } = require('../lib/render');
const I18N = require('../lib/i18n');
const { generateAnalysis } = require('../lib/generate');

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

/* Translate one batch of leaves into `locale` and write them into the overlay. */
async function translateBatch(items, locale, overlay) {
  const user = 'Translate each value. Return JSON keyed by the same ids.\n\n'
    + JSON.stringify(Object.fromEntries(items.map((it, i) => [String(i), it.text])), null, 1);
  const raw = await callClaude({
    model: 'claude-haiku-4-5-20251001', max_tokens: 16384,
    system: [{ type: 'text', text: I18N.systemPrompt(locale), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }]
  });
  const map = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim());
  items.forEach((it, i) => {
    const v = map[String(i)];
    if (v && String(v).trim()) I18N.setPath(overlay, it.path, String(v));
  });
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
  const BATCH = Number(process.env.TRANSLATE_BATCH || 10);
  let done = false;
  while (!done) {
    const todo = I18N.missing(doc.analysis, overlay);
    if (!todo.length) { done = true; break; }
    if (Date.now() - started > budgetMs) break;
    await translateBatch(todo.slice(0, BATCH), locale, overlay);
    await pushFile(`reports/${rid}.analysis.json`, JSON.stringify(doc, null, 1),
      `Translate ${locale}: ${rid}`);
  }
  return I18N.isComplete(doc.analysis, overlay);
}

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).send('Method not allowed');

  const rid = String(req.query.r || '').trim();
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

      /* Generation is deferred at submit time because a rich report does not fit the
         60s ceiling. Produce it here, on first view, and save it. If this request dies
         the next one simply tries again, which is recoverable in a way that a failed
         form submission is not. */
      if (!doc.analysis) {
        try {
          doc.analysis = await generateAnalysis(doc.form || {});
          await pushFile(`reports/${rid}.analysis.json`, JSON.stringify(doc, null, 1),
            `Generate analysis: ${rid}`);
        } catch (e) {
          console.error('deferred generation failed:', e && e.message);
          return res.status(200).send(page('Your report is being prepared',
            'This takes up to a minute the first time. This page will refresh itself.',
            '<meta http-equiv="refresh" content="12">'));
        }
      }

      /* A locale is offered only when it will render completely. A page that is
         half translated is worse than one that is not translated at all, so the
         toggle never points at something that would come back mixed. */
      const ready = (l) => l === I18N.CANONICAL || I18N.isComplete(doc.analysis, doc.i18n[l]);

      let shown = locale;
      if (locale !== I18N.CANONICAL && !ready(locale)) {
        /* First request for this language: fill it in. Budget leaves room to render
           and respond inside the function ceiling. */
        const done = await fillLocale(doc, rid, locale, 30000).catch(e => {
          console.error('translation failed:', e && e.message); return false;
        });
        if (!done) shown = I18N.CANONICAL;   // still incomplete: canonical, never a mixture
      }

      /* The menu offers every language, matching the product site. A locale that is not
         yet filled is translated on first request; `shown` below still guarantees the page
         served is never a mixture. */
      const available = I18N.LOCALES;
      const resolved = I18N.resolve(doc.analysis, shown === I18N.CANONICAL ? null : doc.i18n[shown]);
      html = buildHTML(resolved, doc.form, doc.filename, doc.assessmentDate, shown, available);
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
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return res.status(200).send(html);
  } catch (err) {
    console.error('report fetch failed:', err);
    return res.status(500).send(page('Something went wrong', 'We could not load the report right now. Try again in a minute.'));
  }
};

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
