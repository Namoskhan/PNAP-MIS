const Member = require('../models/Member');
const { deriveBase, pickUnique } = require('./memberUsername');

// Boot-time idempotent sweep. Any Member without a username gets
// one derived from their fullName. Existing members registered
// before the username field was introduced can log in by their
// first name as soon as the server comes up.
//
// Idempotent: rows that already have a username are skipped.

async function backfillMemberUsernames() {
  const candidates = await Member.find({
    $or: [{ username: { $exists: false } }, { username: null }, { username: '' }],
  }).select('_id fullName').lean();
  if (candidates.length === 0) return { backfilled: 0 };

  let backfilled = 0;
  for (const m of candidates) {
    const base = deriveBase(m.fullName);
    if (!base) continue;
    const username = await pickUnique(base, m._id);
    if (!username) continue;
    await Member.updateOne({ _id: m._id }, { $set: { username } });
    backfilled++;
  }
  return { backfilled };
}

module.exports = { backfillMemberUsernames };
