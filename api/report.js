// GET /api/report?r=<rid>
// Serves one report from the private repo. The rid is a 24-char random token that
// only exists in the link emailed to the client, so reports are not enumerable and
// are never public files.

const https = require('https');
const { getFile, pushFile, ghRequest, getIndex, cors } = require('../lib/github');
const { buildHTML } = require('../lib/render');

/* Translate the report's prose into Chinese, once, then cache the rendered page.
   Doing it here rather than at submit time keeps generation under the 60s function
   ceiling: the analysis and the translation each get their own request budget. */
const TRANSLATABLE = ['tierNote', 'summary', 'bodyCompNote', 'optionA', 'optionB', 'recheckItems'];

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

/* Collect every piece of prose, translate in one pass, write it back as *Zh fields. */
async function translateAnalysis(a, budgetMs) {
  const started = Date.now();
  const items = [];
  const has = (obj, field) => obj && obj[field + 'Zh'] && String(obj[field + 'Zh']).trim();
  const push = (path, text, obj, field) => {
    if (!text || !String(text).trim()) return;
    if (obj && field && has(obj, field)) return;   // already translated on an earlier pass
    items.push({ path, text });
  };
  TRANSLATABLE.forEach(k => push(k, a[k], a, k));
  (a.signals || []).forEach((x, i) => { push(`signals.${i}.name`, x.name, x, 'name'); push(`signals.${i}.badge`, x.badge, x, 'badge'); push(`signals.${i}.description`, x.description, x, 'description'); });
  (a.rcaSections || []).forEach((x, i) => { push(`rcaSections.${i}.label`, x.label, x, 'label'); push(`rcaSections.${i}.text`, x.text, x, 'text'); });
  (a.stages || []).forEach((x, i) => { push(`stages.${i}.focus`, x.focus, x, 'focus'); push(`stages.${i}.horizon`, x.horizon, x, 'horizon');
    if (!(x.itemsZh && x.itemsZh.length === (x.items || []).length)) (x.items || []).forEach((it, k) => push(`stages.${i}.items.${k}`, it)); });
  (a.products || []).forEach((pr, i) => { push(`products.${i}.rationale`, pr.rationale, pr, 'rationale'); push(`products.${i}.note`, pr.note, pr, 'note'); });
  if (!(a.winsZh && a.winsZh.length === (a.wins || []).length)) (a.wins || []).forEach((w, i) => push(`wins.${i}`, w));

  if (!items.length) return { out: a, done: true };

  /* One pass translates as much as fits. Whatever is left is picked up on the next
     request, because each pass skips fields that already carry a Zh value. Chunk size
     is deliberately conservative so a pass finishes well inside the function ceiling. */
  const CHUNK = 18;
  const slice = items.slice(0, CHUNK);

  const SYS = 'You translate a personalised health report from English into Simplified Chinese for a client in a wellness consulting practice.\n\n'
    + 'Rules:\n'
    + '- Translate meaning, not word for word. It must read as though written in Chinese.\n'
    + '- Keep the clinical register: direct, warm, specific. No marketing language.\n'
    + '- Use the established terms where they apply: 清 调 补 养, 肝经当令 for the 1-3 AM liver window, 心包经当令 for the 19:30-20:40 evening window, 胃经当令 for the 7-9 AM morning window, 亚健康, 隐性饥饿.\n'
    + '- Keep every number, measurement, product name and English brand name exactly as written.\n'
    + '- Never add a claim, a promise, or a timeframe that is not in the source.\n'
    + '- Return ONLY a JSON object mapping each id to its Chinese string. No markdown, no commentary.';

  const user = 'Translate each value into Simplified Chinese. Return JSON keyed by the same ids.\n\n'
    + JSON.stringify(Object.fromEntries(slice.map((it, i) => [String(i), it.text])), null, 1);

  const raw = await callClaude({
    model: 'claude-haiku-4-5-20251001', max_tokens: 8192,
    system: [{ type: 'text', text: SYS, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }]
  });
  const map = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim());

  const out = JSON.parse(JSON.stringify(a));
  slice.forEach((it, i) => {
    const zh = map[String(i)];
    if (!zh) return;
    const parts = it.path.split('.');
    if (parts.length === 1) { out[parts[0] + 'Zh'] = zh; return; }
    if (parts[0] === 'wins') { (out.winsZh = out.winsZh || [])[+parts[1]] = zh; return; }
    const arr = out[parts[0]], idx = +parts[1], field = parts[2];
    if (!arr || !arr[idx]) return;
    if (field === 'items') { (arr[idx].itemsZh = arr[idx].itemsZh || [])[+parts[3]] = zh; }
    else { arr[idx][field + 'Zh'] = zh; }
  });
  return { out, done: items.length <= CHUNK, remaining: Math.max(0, items.length - CHUNK) };
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
    const known = Object.values(index.clients || {})
      .some(c => (c.reports || []).some(r => r.rid === rid));
    if (!known) {
      return res.status(404).send(page('Report not found', 'This link has expired or was never valid. Ask Johnny or Irene to resend it.'));
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

    const lang = String(req.query.lang || '').toLowerCase() === 'zh' ? 'zh' : 'en';
    let html;
    if (lang === 'zh') {
      /* Whether a Chinese page is real is a property of the analysis, not of the HTML.
         The chrome is Chinese either way, so sniffing the page for CJK says nothing. */
      const stored = await getFile(`reports/${rid}.analysis.json`);
      if (stored) {
        const doc = JSON.parse(stored);
        const needsWork = doc.analysis && (!doc.analysis.summaryZh
          || !(doc.analysis.rcaSections || []).every(x => x.textZh)
          || !(doc.analysis.signals || []).every(x => x.descriptionZh));
        if (needsWork) {
          const { out: zhAnalysis } = await translateAnalysis(doc.analysis);
          html = buildHTML(zhAnalysis, doc.form, doc.filename, doc.assessmentDate, 'zh');
          await pushFile(`reports/${rid}.zh.html`, html, `Chinese version: ${rid}`);
          await pushFile(`reports/${rid}.analysis.json`,
            JSON.stringify({ ...doc, analysis: zhAnalysis }, null, 1),
            `Cache Chinese fields: ${rid}`);
        }
      }
      if (!html) html = await getFile(`reports/${rid}.zh.html`);
      if (!html) html = await getFile(`reports/${rid}.html`);
    } else {
      html = await getFile(`reports/${rid}.html`);
    }
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

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
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
