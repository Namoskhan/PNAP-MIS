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

// Locate the user account behind a Member, if one exists.
async function userIdForMember(memberId) {
  if (!memberId) return null;
  const u = await User.findOne({ memberId }).select('_id').lean();
  return u?._id || null;
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
