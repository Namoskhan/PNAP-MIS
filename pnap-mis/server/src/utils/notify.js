const Notification = require('../models/Notification');
const User = require('../models/User');

// Single-user notify. Fire-and-forget — never throws into the caller.
async function notify(userId, payload) {
  if (!userId) return null;
  try {
    return await Notification.create({ userId, ...payload });
  } catch (err) {
    console.error('[notify] failed:', err.message);
    return null;
  }
}

async function notifyMany(userIds, payload) {
  const ids = (userIds || []).filter(Boolean);
  if (ids.length === 0) return [];
  try {
    const docs = ids.map((userId) => ({ userId, ...payload }));
    return await Notification.insertMany(docs, { ordered: false });
  } catch (err) {
    console.error('[notify] bulk failed:', err.message);
    return [];
  }
}

// Locate the user account behind a Member.
//
// Resolution order matters, because a notification is only ever seen by
// the User row the person actually authenticates as:
//
//   1. memberId — the explicit link.
//   2. cnic     — the fallback. _finishMemberLogin finds the login row
//                 with `User.findOne({ cnic })`, and rows created before
//                 memberId was populated (or by an admin) carry only the
//                 CNIC. Addressing by memberId alone filed notifications
//                 against a row such a user never logs in as, so they
//                 were stored but never visible.
//   3. provision — a member approved but not yet logged in has NO User
//                 row at all, and notify(null) silently drops the
//                 message. Approval is the moment they gain a login
//                 identity, so materialising the row here is what makes
//                 "your membership was approved" deliverable.
async function userIdForMember(memberId) {
  if (!memberId) return null;

  let u = await User.findOne({ memberId }).select('_id').lean();
  if (u) return u._id;

  // Loaded as a full document, not lean — ensureUserForMember needs a
  // real Member instance below.
  const Member = require('../models/Member');
  const member = await Member.findById(memberId);
  if (!member) return null;

  if (member.cnic) {
    u = await User.findOne({ cnic: member.cnic }).select('_id').lean();
    if (u) return u._id;
  }

  // Only ACTIVE members are provisionable — accountService owns that
  // rule and returns null for every other status, so a rejected
  // applicant still resolves to null here (see notes on reject()).
  const { ensureUserForMember } = require('../services/accountService');
  const created = await ensureUserForMember(member);
  return created?._id || null;
}

// Find the territorial admins responsible for a given chain of
// {provinceId, districtId, areaId}. Order: AREA_ADMIN of the area,
// DISTRICT_ADMIN of the district, PROVINCE_ADMIN of the province.
// Super Admin is intentionally excluded so the bell doesn't drown in
// subordinate noise, and CENTRAL_ADMIN with it — it is unscoped, so
// every chain would match it and its bell would carry the whole
// organization's traffic.
async function admindIdsForChain({ provinceId, districtId, areaId }) {
  const queries = [];
  if (areaId) queries.push({ roles: 'AREA_ADMIN', 'scope.areaId': areaId, isActive: true });
  if (districtId) queries.push({ roles: 'DISTRICT_ADMIN', 'scope.districtId': districtId, isActive: true });
  if (provinceId) queries.push({ roles: 'PROVINCE_ADMIN', 'scope.provinceId': provinceId, isActive: true });
  if (queries.length === 0) return [];
  const users = await User.find({ $or: queries }).select('_id').lean();
  return users.map((u) => u._id);
}

module.exports = { notify, notifyMany, userIdForMember, admindIdsForChain };
