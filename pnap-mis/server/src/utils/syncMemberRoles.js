const RoleAssignment = require('../models/RoleAssignment');
const User = require('../models/User');

// Map a RoleAssignment.roleCode → User.roles value. Single source of
// truth shared by the login derivation (authController) and the
// live re-sync below, so the two can never drift apart.
const ROLE_MAP = {
  SECRETARY: 'SECRETARY',
  SENIOR_MAWIN: 'SENIOR_MAWIN',
  FINANCE_SECRETARY: 'FINANCE_SECRETARY',
  PRESS_SECRETARY: 'PRESS_SECRETARY',
  CULTURE_SECRETARY: 'CULTURE_SECRETARY',
  SPORTS_SECRETARY: 'SPORTS_SECRETARY',
  // Province cabinet
  PRESIDENT: 'PRESIDENT',
  SR_VICE_PRESIDENT: 'SR_VICE_PRESIDENT',
  VICE_PRESIDENT: 'VICE_PRESIDENT',
  GENERAL_SECRETARY: 'GENERAL_SECRETARY',
  // Central cabinet
  CHAIRMAN: 'CHAIRMAN',
  CO_CHAIRMAN: 'CO_CHAIRMAN',
  SR_VICE_CHAIRMAN: 'SR_VICE_CHAIRMAN',
  VICE_CHAIRMAN: 'VICE_CHAIRMAN',
  FIRST_SECRETARY: 'FIRST_SECRETARY',
  OTHER: 'OTHER',
};

// Derive the system role list for a member from their currently
// active cabinet assignments. Always includes MEMBER (base portal).
// Custom catalogue codes (CUSTOM_*) pass through unchanged.
async function deriveMemberRoles(memberId) {
  const assignments = await RoleAssignment.find({
    memberId,
    state: 'APPROVED',
    endedAt: { $exists: false },
  }).lean();
  const roleSet = new Set(['MEMBER']);
  for (const a of assignments) {
    const mapped = ROLE_MAP[a.roleCode];
    if (mapped) {
      roleSet.add(mapped);
    } else if (a.roleCode && a.roleCode !== 'OTHER') {
      roleSet.add(a.roleCode);
    }
  }
  return [...roleSet];
}

// Live re-sync of the linked User row. Without this, User.roles only
// updated at login — an ended assignment left the holder with full
// capabilities until they logged out, and a newly approved holder
// couldn't use their role until re-login. No-op for members without
// a User row yet (first login creates it with fresh roles).
async function syncMemberUserRoles(memberId) {
  if (!memberId) return { updated: false };
  const roles = await deriveMemberRoles(memberId);
  const r = await User.updateOne({ memberId }, { $set: { roles } });
  return { roles, updated: !!r.modifiedCount };
}

module.exports = { ROLE_MAP, deriveMemberRoles, syncMemberUserRoles };
