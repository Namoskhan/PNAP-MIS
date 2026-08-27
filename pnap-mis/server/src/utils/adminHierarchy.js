// adminHierarchy — the one-level rule, in one place.
//
// Every administrative tier manages exactly the tier directly below
// it, and nothing else:
//
//   SUPER_ADMIN    → CENTRAL_ADMIN
//   CENTRAL_ADMIN  → PROVINCE_ADMIN   (and the Provinces themselves)
//   PROVINCE_ADMIN → DISTRICT_ADMIN   (and the Districts)
//   DISTRICT_ADMIN → AREA_ADMIN       (and the Areas)
//   AREA_ADMIN     → (Basic Units; units have no admin user of their
//                     own — they are run by their cabinet)
//
// Before CENTRAL_ADMIN existed this rule held everywhere except the
// top, where SUPER_ADMIN reached straight past it into Provinces.
// The map below closes that gap and becomes the single definition
// every caller consults: admin-user creation, credential management,
// org CRUD gates, and the scope clamps in unitScope.
//
// SUPER_ADMIN remains a break-glass override rather than a normal
// operator: it is excluded from the day-to-day Province surfaces in
// the UI, but retains the underlying capability so a system with no
// Central Admin yet can still be bootstrapped and recovered. Every
// helper here treats it accordingly.

// Ordered top → bottom. Index is the tier's rank; a lower index means
// more authority.
const ADMIN_TIERS = [
  'SUPER_ADMIN',
  'CENTRAL_ADMIN',
  'PROVINCE_ADMIN',
  'DISTRICT_ADMIN',
  'AREA_ADMIN',
];

// The admin role each tier may create and administer. AREA_ADMIN is
// terminal: Basic Units carry no admin user.
const MANAGES_ROLE = {
  SUPER_ADMIN: 'CENTRAL_ADMIN',
  CENTRAL_ADMIN: 'PROVINCE_ADMIN',
  PROVINCE_ADMIN: 'DISTRICT_ADMIN',
  DISTRICT_ADMIN: 'AREA_ADMIN',
  AREA_ADMIN: null,
};

// The org tier each admin is responsible for structuring, and the
// User.scope key that bounds them. CENTRAL_ADMIN has no scope key —
// it is national over provinces, the same way SUPER_ADMIN is national
// over everything.
const MANAGES_LEVEL = {
  SUPER_ADMIN: null,
  CENTRAL_ADMIN: 'PROVINCE',
  PROVINCE_ADMIN: 'DISTRICT',
  DISTRICT_ADMIN: 'AREA',
  AREA_ADMIN: 'BASIC_UNIT',
};

// Scope key that confines each tier. Null = unbounded (national).
const SCOPE_KEY = {
  SUPER_ADMIN: null,
  CENTRAL_ADMIN: null,
  PROVINCE_ADMIN: 'provinceId',
  DISTRICT_ADMIN: 'districtId',
  AREA_ADMIN: 'areaId',
};

// Tiers that see the whole organization rather than one branch of it.
// Used by the listing clamps (org, members, dashboards) — these two
// are the only admins with no territorial boundary.
const GLOBAL_TIERS = ['SUPER_ADMIN', 'CENTRAL_ADMIN'];

// The caller's highest admin tier, or null if they hold none.
function adminTierOf(user) {
  const roles = user?.roles || [];
  return ADMIN_TIERS.find((t) => roles.includes(t)) || null;
}

function isAdminTier(role) {
  return ADMIN_TIERS.includes(role);
}

// True when the user is an admin whose reach is the whole org.
function isGlobalAdmin(user) {
  const roles = user?.roles || [];
  return GLOBAL_TIERS.some((r) => roles.includes(r));
}

// Admin roles this user may create. Normally exactly one — the tier
// directly below. SUPER_ADMIN additionally keeps PROVINCE_ADMIN as a
// break-glass path so a database with no Central Admin can still be
// structured; that is the ONLY place the one-level rule is relaxed,
// and it is deliberate.
function creatableRoles(user) {
  const tier = adminTierOf(user);
  if (!tier) return [];
  if (tier === 'SUPER_ADMIN') {
    return ['CENTRAL_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN'];
  }
  const direct = MANAGES_ROLE[tier];
  return direct ? [direct] : [];
}

// Can `actor` administer the account of `targetUser` — reset its
// password, rename it, activate or deactivate it?
//
// Yes when the target holds the admin role directly below the actor's
// tier. Super Admin retains blanket authority as the break-glass
// operator; nobody may administer their own account through these
// endpoints (self-service lives on the profile routes).
function canManageAdminUser(actor, targetUser) {
  if (!actor || !targetUser) return false;
  if (String(actor._id) === String(targetUser._id)) return false;
  if ((actor.roles || []).includes('SUPER_ADMIN')) return true;

  const tier = adminTierOf(actor);
  if (!tier) return false;
  const manageable = MANAGES_ROLE[tier];
  if (!manageable) return false;
  return (targetUser.roles || []).includes(manageable);
}

// Territorial containment: is `chain` (a resolved {provinceId,
// districtId, areaId, …}) inside the actor's own branch? Global tiers
// are inside everything. Returns false when a scoped admin has no
// scope value at all — an unbounded scoped admin would otherwise read
// as national.
function chainWithinScope(actor, chain) {
  if (isGlobalAdmin(actor)) return true;
  const tier = adminTierOf(actor);
  if (!tier) return false;
  const key = SCOPE_KEY[tier];
  if (!key) return false;
  const mine = actor.scope?.[key];
  if (!mine) return false;
  return String(chain?.[key] || '') === String(mine);
}

module.exports = {
  ADMIN_TIERS,
  MANAGES_ROLE,
  MANAGES_LEVEL,
  SCOPE_KEY,
  GLOBAL_TIERS,
  adminTierOf,
  isAdminTier,
  isGlobalAdmin,
  creatableRoles,
  canManageAdminUser,
  chainWithinScope,
};
