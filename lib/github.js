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
  /* 404 is a real answer: the file is not there. Anything else is the store being
     unreachable, and the two must not look alike to the caller. A revoked token
     returns 401 here, and returning null for that made the admin page report
     "0 clients" for a store that was full. */
  if (res.status === 404) return null;
  if (res.status !== 200 || !res.data.content) {
    const e = new Error(`report store unreachable: GitHub returned ${res.status} for ${path}`);
    e.storeUnreachable = true;
    e.status = res.status;
    throw e;
  }
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
  const raw = await getFile('index.json');       // throws if the store is unreachable
  if (!raw) return { clients: {} };              // genuinely empty: no index yet
  try {
    return JSON.parse(raw);
  } catch (e) {
    const err = new Error('index.json exists but is not valid JSON');
    err.storeUnreachable = true;
    throw err;
  }
}

// CORS: only the sites that are allowed to call this API.
const ALLOWED = [
  'https://johnnnyay.github.io',
  /* The hub. Its Publish had never once succeeded, because this list did not have it
     and the browser dropped the response before any code could report why. */
  'https://diamond-hq.huangzheng0227.workers.dev',
  'http://localhost:8000',
  'http://localhost:8080',
  'http://localhost:8097'
];

/* What is left after the edit key was removed. The key existed to stop a stranger who
   found this endpoint from writing into the hub's repo, and it cost Johnny every save
   he ever tried to make: the one control that set it was destroyed on every render, so
   in practice it blocked him and nobody else. Requiring a known Origin blocks the
   drive-by case, which was the only case the key was ever going to catch. A determined
   caller can forge the header, and the real backstop for that is that every write is a
   git commit and nothing here is unrecoverable. */
function fromKnownOrigin(req) {
  return ALLOWED.includes(req.headers.origin || '');
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,x-intake-secret,x-admin-key,x-edit-key');
}

module.exports = { ghRequest, getFile, pushFile, getIndex, cors, fromKnownOrigin, REPORTS_REPO };
