const Member = require('../models/Member');

// Phone uniqueness helper. Stored phone formats vary within the
// accepted pattern (+92 / 0 prefix, optional "-" or " " separator),
// so equality is decided on the significant digits: the last 10
// (3XXXXXXXXX). "03001234567", "+92 300-1234567" and "3001234567"
// all collide.
function phoneSig(p) {
  const digits = String(p || '').replace(/\D/g, '');
  return digits.slice(-10);
}

// Find an existing member holding the same significant number.
// The accepted format keeps the last 7 digits contiguous at the end
// of the string, so a cheap $regex narrows candidates before the
// exact normalized comparison in JS.
async function findMemberByPhone(phone, excludeId) {
  const sig = phoneSig(phone);
  if (sig.length < 10) return null;
  const filter = { phone: { $regex: `${sig.slice(-7)}$` } };
  if (excludeId) filter._id = { $ne: excludeId };
  const candidates = await Member.find(filter).select('_id phone fullName').lean();
  return candidates.find((m) => phoneSig(m.phone) === sig) || null;
}

module.exports = { phoneSig, findMemberByPhone };
