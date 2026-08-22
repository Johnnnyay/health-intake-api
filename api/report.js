// GET /api/report?r=<rid>
// Serves one report from the private repo. The rid is a 24-char random token that
// only exists in the link emailed to the client, so reports are not enumerable and
// are never public files.

const { getFile, ghRequest, getIndex, cors } = require('../lib/github');

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
    const html = (lang === 'zh')
      ? (await getFile(`reports/${rid}.zh.html`)) || (await getFile(`reports/${rid}.html`))
      : await getFile(`reports/${rid}.html`);
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
