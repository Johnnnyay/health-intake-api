/* One spelling of an email address for storing and matching.

   Clients type their email on a phone, and a slip like "gmail.con" filed a report under an
   address nobody could look it up by (Hanwen Zhang, 2026-09-27: the My Health Reports page said
   "No report found" for her real gmail.com address). Submit, lookup and the event pages all run
   the address through here, so a typo is corrected on the way in and an old record that still
   carries one matches on the way out. Only unambiguous slips are corrected: a real domain is
   never rewritten into a different real domain. */

const DOMAIN_FIX = {
  'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gmal.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmaill.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com', 'gmail.c': 'gmail.com', 'gmail': 'gmail.com', 'gmailcom': 'gmail.com',
  'hotmial.com': 'hotmail.com', 'hotmai.com': 'hotmail.com', 'hotmail.co': 'hotmail.com',
  'yahooo.com': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.co': 'yahoo.com',
  'iclod.com': 'icloud.com', 'icoud.com': 'icloud.com', 'icloud.co': 'icloud.com',
  'outlok.com': 'outlook.com', 'outlook.co': 'outlook.com', 'qq.co': 'qq.com',
};
/* Endings that are not real top-level domains and can only be a mistyped ".com". */
const TLD_FIX = /\.(con|cpm|vom|xom|comm|coom|ocm|cim|clm|cok)$/;

function normalizeEmail(raw) {
  let e = String(raw || '').trim().toLowerCase().replace(/\s+/g, '').replace(/[.,;]+$/, '');
  const at = e.lastIndexOf('@');
  if (at < 1) return e;
  let domain = e.slice(at + 1).replace(TLD_FIX, '.com');
  domain = DOMAIN_FIX[domain] || domain;
  return e.slice(0, at + 1) + domain;
}

module.exports = { normalizeEmail };
