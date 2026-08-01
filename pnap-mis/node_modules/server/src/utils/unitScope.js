const BasicUnit = require('../models/BasicUnit');
const Area = require('../models/Area');
const District = require('../models/District');
const Province = require('../models/Province');

// Resolve the full hierarchy chain for a given unit, used to
// denormalize basicUnitId/areaId/districtId/provinceId on every
// owned record (meeting, activity, donation, expense). This is what
// makes upward roll-ups (§11) cheap.
async function resolveUnitChain(unitLevel, unitId) {
  if (unitLevel === 'BASIC_UNIT') {
    const u = await BasicUnit.findById(unitId).lean();
    if (!u) return null;
    return {
      basicUnitId: u._id,
      areaId: u.areaId,
      districtId: u.districtId,
      provinceId: u.provinceId,
    };
  }
  if (unitLevel === 'AREA') {
    const a = await Area.findById(unitId).lean();
    if (!a) return null;
    return {
      basicUnitId: null,
      areaId: a._id,
      districtId: a.districtId,
      provinceId: a.provinceId,
    };
  }
  if (unitLevel === 'DISTRICT') {
    const d = await District.findById(unitId).lean();
    if (!d) return null;
    return {
      basicUnitId: null,
      areaId: null,
      districtId: d._id,
      provinceId: d.provinceId,
    };
  }
  if (unitLevel === 'PROVINCE') {
    const p = await Province.findById(unitId).lean();
    if (!p) return null;
    return { basicUnitId: null, areaId: null, districtId: null, provinceId: p._id };
  }
  if (unitLevel === 'CENTRAL') {
    return { basicUnitId: null, areaId: null, districtId: null, provinceId: null };
  }
  return null;
}

// SRS §6 — RBAC helpers. Atomic permission checks rather than role
// checks so multi-role users get the union of capabilities.
function userHasRole(user, ...roles) {
  if (!user || !user.roles) return false;
  return user.roles.some((r) => roles.includes(r));
}

const ADMIN_ROLES = ['SUPER_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN'];
// Higher-tier admins (everyone except AREA_ADMIN). AREA_ADMIN is
// scoped to approving members in their area and assigning roles for
// basic units within that area — so they're excluded from meeting /
// finance / unit-creation management.
const HIGHER_ADMIN_ROLES = ['SUPER_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN'];

// SUPER_ADMIN is now included in every role list — with NATIONAL_ADMIN
// removed, Super is the bootstrap authority for the Central tier and
// the override for any tier below. Member approval still excludes
// Super Admin (delegated to the unit's Secretary/Area-Admin) so
// approvals stay accountable to a real territorial holder.
const MEMBER_APPROVER_ROLES = [
  'SUPER_ADMIN',
  'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN', 'SECRETARY',
];
const ROLE_DECIDER_ROLES = [
  'SUPER_ADMIN',
  'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN',
  // SRS §5.2 approvers — Secretary (basic/area/district), President
  // (province), Chairman & Co-Chairman (central).
  'SECRETARY', 'PRESIDENT', 'CHAIRMAN', 'CO_CHAIRMAN',
  // Per product directive — Senior Mawin and General Secretary can
  // also decide on role proposals + end existing roles, alongside
  // initiating them. This makes them single-action role-assigners.
  'SENIOR_MAWIN', 'GENERAL_SECRETARY',
];
const ROLE_INITIATOR_ROLES = [
  'SUPER_ADMIN',
  'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN',
  // SRS §5.2 initiators — Senior Mawin (basic/area/district),
  // General Secretary (province), Senior VP (province per directive),
  // First Secretary (central per §5.2).
  'SENIOR_MAWIN', 'GENERAL_SECRETARY', 'SR_VICE_PRESIDENT', 'FIRST_SECRETARY',
];

function isAdmin(user) {
  // Persona / category check — stays role-code based since "admin"
  // describes a class of role, not a single capability.
  return userHasRole(user, ...ADMIN_ROLES);
}

// ─── Capability gates ──────────────────────────────────────────────
// All capability gates now resolve through the dynamic permission
// catalogue (server/src/utils/permissions.js + Role.permissions).
// Super Admin can grant/revoke any of these from the Role Management
// page; the legacy hard-coded role lists live as fallback defaults
// in DEFAULT_PERMISSIONS so seed + cold-start behaviour matches the
// SRS-defined original.
const { userHasPermission } = require('./permissions');
function canApprove(user)               { return userHasPermission(user, 'APPROVE_EXPENSE'); }
function canInitiateRole(user)          { return userHasPermission(user, 'INITIATE_ROLE'); }
function canDecideRole(user)            { return userHasPermission(user, 'DECIDE_ROLE'); }
function canApproveMember(user)         { return userHasPermission(user, 'APPROVE_MEMBER'); }
function canManageMeetings(user)        { return userHasPermission(user, 'MANAGE_MEETINGS'); }
function canManageFinance(user)         { return userHasPermission(user, 'MANAGE_FINANCE'); }
function canPostAnnouncement(user)      { return userHasPermission(user, 'POST_ANNOUNCEMENT'); }

// Scope check — the unit being acted on must fall within the user's
// territorial scope. SUPER_ADMIN has global reach.
// PROVINCE_ADMIN is bounded to their province; DISTRICT_ADMIN to
// their district; AREA_ADMIN to their area + the basic units under it.
// Non-admin users (Senior Mawin, Secretary, Finance Sec.) have their
// own per-controller checks and are passed through here.
async function unitWithinAreaAdminScope(user, unitLevel, unitId) {
  if (userHasRole(user, 'SUPER_ADMIN')) return true;

  if (user.roles?.includes('PROVINCE_ADMIN')) {
    const provId = String(user.scope?.provinceId || '');
    if (!provId) return false;
    const chain = await resolveUnitChain(unitLevel, unitId);
    return !!chain && String(chain.provinceId || '') === provId;
  }

  if (user.roles?.includes('DISTRICT_ADMIN')) {
    const distId = String(user.scope?.districtId || '');
    if (!distId) return false;
    const chain = await resolveUnitChain(unitLevel, unitId);
    return !!chain && String(chain.districtId || '') === distId;
  }

  if (user.roles?.includes('AREA_ADMIN')) {
    const areaId = String(user.scope?.areaId || '');
    if (!areaId) return false;
    if (unitLevel === 'AREA') return String(unitId) === areaId;
    if (unitLevel === 'BASIC_UNIT') {
      const u = await BasicUnit.findById(unitId).lean();
      return !!u && String(u.areaId) === areaId;
    }
    return false;
  }
  return true;
}

// Member-scope check: the member must fall within the admin's
// territorial scope. Mirror of unitWithinAreaAdminScope for member
// records (which already store the denormalized hierarchy).
function memberWithinAreaAdminScope(user, member) {
  if (userHasRole(user, 'SUPER_ADMIN')) return true;
  if (user.roles?.includes('PROVINCE_ADMIN')) {
    return String(member.provinceId) === String(user.scope?.provinceId || '');
  }
  if (user.roles?.includes('DISTRICT_ADMIN')) {
    return String(member.districtId) === String(user.scope?.districtId || '');
  }
  if (user.roles?.includes('AREA_ADMIN')) {
    return String(member.areaId) === String(user.scope?.areaId || '');
  }
  return true;
}

// The caller's own place in the hierarchy. User.scope carries the
// whole chain for member-provisioned logins; territorial admins get
// only the keys at/above their tier, so a partial scope is widened by
// resolving the unit it names. Falls back to the linked Member record
// for accounts with no scope at all.
async function resolveUserChain(user) {
  const s = user?.scope || {};
  if (s.basicUnitId) return (await resolveUnitChain('BASIC_UNIT', s.basicUnitId)) || {};
  if (s.areaId) return (await resolveUnitChain('AREA', s.areaId)) || {};
  if (s.districtId) return (await resolveUnitChain('DISTRICT', s.districtId)) || {};
  if (s.provinceId) return { provinceId: s.provinceId };
  if (user?.memberId) {
    const Member = require('../models/Member');
    const m = await Member.findById(user.memberId)
      .select('basicUnitId areaId districtId provinceId').lean();
    if (m) return m;
  }
  return {};
}

// Read gate for cabinet / role-assignment data on a given unit.
// Two directions are allowed:
//   • downward — a territorial admin reads anything in their subtree;
//   • upward + own — anyone reads their own unit's cabinet and the
//     cabinets above it, since those are the bodies that appoint and
//     supervise them. Central is above everyone.
// A sibling unit (another Area's cabinet, say) matches neither and is
// refused.
async function canReadUnitRoles(user, unitLevel, unitId) {
  if (userHasRole(user, 'SUPER_ADMIN')) return true;
  const target = await resolveUnitChain(unitLevel, unitId);
  if (!target) return false;
  const same = (a, b) => !!a && !!b && String(a) === String(b);

  if (user?.roles?.includes('PROVINCE_ADMIN') && same(target.provinceId, user.scope?.provinceId)) return true;
  if (user?.roles?.includes('DISTRICT_ADMIN') && same(target.districtId, user.scope?.districtId)) return true;
  if (user?.roles?.includes('AREA_ADMIN') && same(target.areaId, user.scope?.areaId)) return true;

  if (unitLevel === 'CENTRAL') return true;
  const mine = await resolveUserChain(user);
  if (unitLevel === 'PROVINCE') return same(unitId, mine.provinceId);
  if (unitLevel === 'DISTRICT') return same(unitId, mine.districtId);
  if (unitLevel === 'AREA') return same(unitId, mine.areaId);
  if (unitLevel === 'BASIC_UNIT') return same(unitId, mine.basicUnitId);
  return false;
}

// SRS §3.1 — Elaqayi / Zilla / Sobayi / Qomi committees include
// "Permanent Members" appointed by the level's Senior Mawin Secretary
// (or higher leadership). This gate authorizes the nominate / revoke
// flow:
//   • Higher admins within scope → allowed (DISTRICT_ADMIN may manage
//     any AREA committee in their district, etc.).
//   • The level's own Senior Mawin Sec. → allowed (Area's Senior
//     Mawin manages the Elaqayi Committee, etc.).
// A Basic-Unit Senior Mawin cannot manage their parent Area's
// committee — they are a member of it via their BU role, but the
// management seat belongs to the Area-level Senior Mawin.
async function canManagePermanentMembers(user, unitLevel, unitId) {
  // Super Admin curates the Central Committee + Qomi Jirga
  // selective-member rosters directly at the Central tier.
  if (user.roles?.includes('SUPER_ADMIN') && unitLevel === 'CENTRAL') {
    return true;
  }
  if (!user.memberId) return false;
  // Resolve the set of role codes that currently grant the
  // MANAGE_PERMANENT_MEMBERS permission (computed from the live
  // catalogue, not hard-coded). The user must hold an active role
  // assignment AT THIS EXACT UNIT in one of those roles — local
  // authority, not a global capability.
  const { rolesWithPermission } = require('./permissions');
  const grantingCodes = rolesWithPermission('MANAGE_PERMANENT_MEMBERS');
  if (grantingCodes.length === 0) return false;
  const RoleAssignment = require('../models/RoleAssignment');
  const active = await RoleAssignment.findOne({
    memberId: user.memberId,
    roleCode: { $in: grantingCodes },
    unitLevel,
    unitId,
    state: 'APPROVED',
    endedAt: { $exists: false },
  }).lean();
  return !!active;
}

module.exports = {
  resolveUnitChain,
  isAdmin,
  canApprove,
  canInitiateRole,
  canDecideRole,
  canApproveMember,
  canManageMeetings,
  canManageFinance,
  canPostAnnouncement,
  canManagePermanentMembers,
  unitWithinAreaAdminScope,
  memberWithinAreaAdminScope,
  resolveUserChain,
  canReadUnitRoles,
  userHasRole,
  ADMIN_ROLES,
  HIGHER_ADMIN_ROLES,
};
