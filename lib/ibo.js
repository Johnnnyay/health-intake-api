const crypto = require('crypto');
const { getFile, pushFile } = require('./github');

/* Partner (IBO) session and per-report access.

   One shared passcode (IBO_UNLOCK_CODE, default below) signs a partner in. The server checks it and
   sets a signed cookie; the cookie is what lets a browser see a locked report and change its locks.
   The cookie is an HMAC of the passcode, so changing the passcode signs everyone out.

   Each report has two locks, kept in reports/<rid>.access.json (its own file, so a translation
   write to the analysis file can never overwrite a lock):
     report    the client can read the report at all
     products  the "View My Products" button works
   Reports dated before LOCK_SINCE predate the lock and stay open unless someone locks them. */

const LOCK_SINCE = '2026-09-21';
const COOKIE = 'ibo_session';
const MAX_AGE = 24 * 60 * 60;

const code = () => (process.env.IBO_UNLOCK_CODE || '66866').trim();
const token = () => crypto.createHmac('sha256', code()).update('ibo-session-v1').digest('hex');

function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const codeOk = (given) => same(String(given || '').trim(), code());

function fromCookie(req) {
  const m = /(?:^|;\s*)ibo_session=([a-f0-9]+)/.exec((req.headers && req.headers.cookie) || '');
  return !!m && same(m[1], token());
}

/* The pages on github.io cannot use the cookie (it belongs to this domain), so login also hands
   back the same signed value as a token, which they send as `Authorization: Bearer <token>`. */
const sessionToken = () => token();
const tokenOk = (given) => same(String(given || ''), token());

function fromBearer(req) {
  const m = /^Bearer\s+([a-f0-9]+)\s*$/i.exec((req.headers && req.headers.authorization) || '');
  return !!m && same(m[1], token());
}

/* Signed in by either route. */
const fromRequest = (req) => fromBearer(req) || fromCookie(req);

function setCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token()}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`);
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
}

/* Current locks for a report. `date` is the assessment date, `legacyProducts` is the older
   single flag that used to live in the analysis file. */
async function getAccess(rid, date, legacyProducts) {
  const raw = await getFile(`reports/${rid}.access.json`);
  if (raw) {
    try {
      const a = JSON.parse(raw);
      return { report: a.report === true, products: a.products === true };
    } catch (e) { /* fall through to the defaults */ }
  }
  const legacy = String(date || '') < LOCK_SINCE;
  return { report: legacy, products: legacy || legacyProducts === true };
}

async function setAccess(rid, date, legacyProducts, patch) {
  const cur = await getAccess(rid, date, legacyProducts);
  const next = {
    report: patch.report === undefined ? cur.report : patch.report === true,
    products: patch.products === undefined ? cur.products : patch.products === true,
  };
  next.report = next.report || next.products;   // the product list cannot be open on a locked report
  await pushFile(`reports/${rid}.access.json`,
    JSON.stringify({ ...next, updatedAt: new Date().toISOString() }, null, 1),
    `Access ${rid}: report ${next.report ? 'open' : 'locked'}, products ${next.products ? 'open' : 'locked'}`);
  return next;
}

/* Status for a page that is waiting to be unlocked. Reads only the access file. */
async function reportOpen(rid) {
  const raw = await getFile(`reports/${rid}.access.json`);
  if (!raw) return false;
  try { return JSON.parse(raw).report === true; } catch (e) { return false; }
}

module.exports = { LOCK_SINCE, codeOk, sessionToken, tokenOk, fromRequest, fromCookie, setCookie, clearCookie, getAccess, setAccess, reportOpen };
