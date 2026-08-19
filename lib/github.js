// Shared GitHub helpers. All report content lives in a PRIVATE repo and is only
// ever fetched server-side, so nothing is reachable without going through the API.

const https = require('https');

const REPORTS_REPO = process.env.REPORTS_REPO || 'johnnnyay/health-reports';

function ghRequest(method, path, body, repo) {
  const token = process.env.GITHUB_TOKEN;
  const target = repo || REPORTS_REPO;
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${target}/contents/${path}`,
      method,
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'health-intake-api',
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
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

async function getFile(path) {
  const res = await ghRequest('GET', path);
  if (res.status !== 200 || !res.data.content) return null;
  return Buffer.from(res.data.content, 'base64').toString('utf-8');
}

async function pushFile(path, content, message) {
  const head = await ghRequest('GET', path);
  const body = {
    message,
    content: Buffer.from(content).toString('base64'),
    branch: 'main'
  };
  if (head.status === 200 && head.data.sha) body.sha = head.data.sha;
  return ghRequest('PUT', path, body);
}

async function getIndex() {
  const raw = await getFile('index.json');
  if (!raw) return { clients: {} };
  try { return JSON.parse(raw); } catch (e) { return { clients: {} }; }
}

// CORS: only the sites that are allowed to call this API.
const ALLOWED = [
  'https://johnnnyay.github.io',
  'http://localhost:8000',
  'http://localhost:8080'
];

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-intake-secret,x-admin-key');
}

module.exports = { ghRequest, getFile, pushFile, getIndex, cors, REPORTS_REPO };
