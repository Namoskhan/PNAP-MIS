const Member = require('../models/Member');

// memberUsername — derive a login handle from the first token of
// fullName and make it unique across the Member collection.
//
// Rule (per product spec): username = first word of fullName,
// lowercased, alphanumeric only. Collisions get numeric suffixes
// (`owais`, `owais2`, `owais3`, …). Sparse-unique index on the
// model is the authoritative collision guard; the in-process loop
// just minimises retries by checking first.

function deriveBase(fullName) {
  const first = String(fullName || '').trim().split(/\s+/)[0] || '';
  // Strip diacritics + any char that isn't a letter/digit. Keep it
  // tight (no underscores) so URLs and audit labels stay clean.
  const cleaned = first
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '')
    .toLowerCase();
  return cleaned.slice(0, 30);
}

async function pickUnique(base, excludeId = null) {
  if (!base) return null;
  let candidate = base;
  let n = 1;
  // Worst-case bounded loop — defensive only; in practice we hit a
  // free slot in 1–2 tries.
  for (let i = 0; i < 1000; i++) {
    const q = { username: candidate };
    if (excludeId) q._id = { $ne: excludeId };
    const exists = await Member.exists(q);
    if (!exists) return candidate;
    n += 1;
    candidate = `${base}${n}`;
  }
  // Fallback — extremely unlikely. Append a random short tail.
  return `${base}${Date.now().toString(36).slice(-4)}`;
}

module.exports = { deriveBase, pickUnique };
