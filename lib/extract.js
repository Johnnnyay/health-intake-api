/* Pull the one JSON object out of a model reply and ignore anything around it: a code fence, a
   line of preamble, or a note the model adds after the object (it has been seen to append the
   spec's pre-write checklist, which made an otherwise complete report unparseable and cost a
   retry each time). Text inside strings is respected, so braces in a sentence do not count. */
function extractJson(raw) {
  const s = String(raw || '');
  const start = s.indexOf('{');
  if (start < 0) throw new Error('no JSON object in the reply');
  let depth = 0, inStr = false, escaped = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return JSON.parse(s.slice(start, i + 1));
    }
  }
  throw new Error('the JSON object never closes (the reply was cut off)');
}

module.exports = { extractJson };
