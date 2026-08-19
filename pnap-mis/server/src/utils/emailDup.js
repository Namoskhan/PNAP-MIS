const Member = require('../models/Member');

// Email uniqueness helper — the counterpart to phoneDup for the other
// contactable identifier.
//
// The registration form posts an EMPTY STRING when the (optional) email
// field is left blank, so "no email" arrives as '' rather than as an
// absent key. Normalizing that to undefined is what makes the partial
// unique index on Member.email workable: the constraint then covers
// real addresses only, and every member without one stays exempt
// instead of all colliding on a shared ''.
function normalizeEmail(raw) {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).trim().toLowerCase();
  return s === '' ? undefined : s;
}

// Find an existing member holding this address. Stored values are
// already normalized by the schema setter, so plain equality is an
// exact match — unlike phones, no regex narrowing is needed.
async function findMemberByEmail(email, excludeId) {
  const norm = normalizeEmail(email);
  if (!norm) return null;
  const filter = { email: norm };
  if (excludeId) filter._id = { $ne: excludeId };
  return Member.findOne(filter).select('_id email fullName').lean();
}

module.exports = { normalizeEmail, findMemberByEmail };
