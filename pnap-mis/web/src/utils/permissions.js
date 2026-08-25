// UI permission helpers. Mirror server-side gates in
// server/src/utils/unitScope.js + server/src/utils/permissions.js so
// the UI doesn't show buttons that would 403. Capability gates now
// consult the live `user.permissions` array shipped by /auth/me +
// /auth/login (computed from the dynamic Role catalogue). Persona
// predicates remain role-code based since those describe *who you
// are*, not *what you can do*.

// Mirrors server/src/utils/unitScope.HIGHER_ADMIN_ROLES.
export const HIGHER_ADMIN_ROLES = ['SUPER_ADMIN', 'CENTRAL_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN'];

export function hasRole(user, ...roles) {
  if (!user?.roles) return false;
  const userRoles = (user.roles || []).map((r) => String(r).toUpperCase());
  return roles.some((role) => userRoles.includes(String(role).toUpperCase()));
}

// True if the current user holds the given permission code (e.g.
// 'MANAGE_FINANCE'). Falls back to false when the server payload
// doesn't include a permissions array (legacy token without the new
// shape) — Super Admin always passes.
export function hasPermission(user, perm) {
  if (!user) return false;
  if (user.roles?.includes('SUPER_ADMIN')) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(perm);
}

// Hard-coded labels for the SRS-defined built-in role codes. These
// are pinned even when offline / pre-login so login pages and other
// non-authed surfaces still render meaningful names.
const BUILTIN_ROLE_LABELS = {
  SUPER_ADMIN: 'Super Admin',
  CENTRAL_ADMIN: 'Central Admin',
  PROVINCE_ADMIN: 'Province Admin',
  DISTRICT_ADMIN: 'District Admin',
  AREA_ADMIN: 'Area Admin',
  SECRETARY: 'Secretary',
  SENIOR_MAWIN: 'Senior Mawin Secretary',
  FINANCE_SECRETARY: 'Finance Secretary',
  PRESS_SECRETARY: 'Press Secretary',
  CULTURE_SECRETARY: 'Culture Secretary',
  SPORTS_SECRETARY: 'Sports Secretary',
  PRESIDENT: 'President / Saddar',
  SR_VICE_PRESIDENT: 'Senior Vice President',
  VICE_PRESIDENT: 'Vice President',
  GENERAL_SECRETARY: 'General Secretary',
  CHAIRMAN: 'Chairman',
  CO_CHAIRMAN: 'Co-Chairman',
  SR_VICE_CHAIRMAN: 'Sr. Vice Chairman',
  VICE_CHAIRMAN: 'Vice Chairman',
  FIRST_SECRETARY: 'First Secretary',
  OTHER: 'Other',
  MEMBER: 'Member',
};

// Resolve a role code to its human label, in priority order:
//   1. Live catalogue map shipped on user.roleLabels (covers custom codes)
//   2. Hard-coded built-in label (offline-safe baseline)
//   3. Pretty-print the code itself (e.g. "CUSTOM_YOUTH_LEADER" → "Youth Leader")
//      so even an unknown code never looks like a database ID.
export function roleLabel(user, code) {
  if (!code) return '';
  const map = user?.roleLabels;
  if (map && map[code]) return map[code];
  if (BUILTIN_ROLE_LABELS[code]) return BUILTIN_ROLE_LABELS[code];
  // Last-resort prettifier — strips CUSTOM_ prefix, replaces underscores,
  // title-cases the words. Keeps the UI friendly when the map hasn't
  // loaded yet.
  return String(code)
    .replace(/^CUSTOM_/, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
export function isHigherAdmin(user) {
  return hasRole(user, ...HIGHER_ADMIN_ROLES);
}
export function isAreaAdmin(user) {
  return hasRole(user, 'AREA_ADMIN') && !isHigherAdmin(user);
}
export function isSeniorMawin(user) {
  return hasRole(user, 'SENIOR_MAWIN') && !isHigherAdmin(user) && !hasRole(user, 'AREA_ADMIN');
}
export function isFinanceSecretary(user) {
  return hasRole(user, 'FINANCE_SECRETARY') && !isHigherAdmin(user);
}
// SRS §6.1 — Secretary is read-mostly: view dashboards/members/reports
// + approve role proposals (§5.2). Treat the user as "Secretary-only"
// when they hold SECRETARY but no higher write role.
export function isSecretaryOnly(user) {
  return hasRole(user, 'SECRETARY')
    && !isHigherAdmin(user)
    && !hasRole(user, 'AREA_ADMIN')
    && !hasRole(user, 'SENIOR_MAWIN')
    && !hasRole(user, 'FINANCE_SECRETARY');
}
// ─── Capability gates — now driven by the dynamic permission set ──
// Each helper resolves the matching server-side permission code via
// hasPermission(). The legacy role-list logic remains as a fallback
// for old client builds talking to a new server (or vice-versa).
export function canManageMeetings(user) {
  if (user?.permissions) return hasPermission(user, 'MANAGE_MEETINGS');
  return isHigherAdmin(user)
    || hasRole(user, 'SENIOR_MAWIN', 'SR_VICE_PRESIDENT', 'FIRST_SECRETARY', 'GENERAL_SECRETARY');
}
export function canManageFinance(user) {
  if (user?.permissions) return hasPermission(user, 'MANAGE_FINANCE');
  return isHigherAdmin(user)
    || hasRole(user, 'FINANCE_SECRETARY', 'SENIOR_MAWIN', 'SR_VICE_PRESIDENT', 'FIRST_SECRETARY', 'GENERAL_SECRETARY');
}
export function canApproveExpense(user) {
  if (user?.permissions) return hasPermission(user, 'APPROVE_EXPENSE');
  return isHigherAdmin(user)
    || hasRole(user, 'SECRETARY', 'SENIOR_MAWIN', 'SR_VICE_PRESIDENT', 'FIRST_SECRETARY');
}
// Capability gates added with the dynamic permission system. No
// legacy role-list — these only resolve via the catalogue.
export function canPostAnnouncement(user) {
  return hasPermission(user, 'POST_ANNOUNCEMENT');
}
export function canApproveMember(user) {
  return hasPermission(user, 'APPROVE_MEMBER');
}
export function canDecideRole(user) {
  return hasPermission(user, 'DECIDE_ROLE');
}
export function canInitiateRole(user) {
  return hasPermission(user, 'INITIATE_ROLE');
}

// CENTRAL_ADMIN role removed — kept as a no-op for backward
// compatibility with callsites (always returns false).
export function isCentralAdminOversight() { return false; }

// Super Admin god-mode role.
export function isSuperAdmin(user) {
  return hasRole(user, 'SUPER_ADMIN');
}

// When the active persona is just SUPER_ADMIN (no operator role
// layered in), the UI hides write actions on operator pages.
export function isSuperAdminOversight(user) {
  return user?.roles?.length === 1 && user.roles[0] === 'SUPER_ADMIN';
}

// ─── Canonical role / persona constants ────────────────────────────
// Single source of truth for the role groups used across Layout,
// UnitContext, dashboard, finance and cabinet pages. Keep this in
// sync with the SRS roles + the back-end User.ROLES enum.

// Every cabinet position (excludes admin tiers + plain MEMBER).
export const CABINET_ROLES = [
  'SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY',
  'PRESS_SECRETARY', 'CULTURE_SECRETARY', 'SPORTS_SECRETARY',
  'PRESIDENT', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY',
  'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN', 'FIRST_SECRETARY',
  'OTHER',
];

// Roles that share the President-style ceremonial / approver sidebar.
export const PRESIDENT_PERSONA_ROLES = [
  'PRESIDENT', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY',
  'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN',
];

// Roles eligible for ctx auto-pin to their RoleAssignment unit.
// Order is meaningful for `pinRoleCode` priority resolution.
export const OPERATOR_AUTOPIN_ROLES = [
  'SENIOR_MAWIN', 'SR_VICE_PRESIDENT', 'FIRST_SECRETARY',
  'SECRETARY', 'FINANCE_SECRETARY',
  'PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY',
  'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN',
];

// ─── Persona predicates ────────────────────────────────────────────
// Match the precise sidebar branches in Layout.jsx and the page-level
// gates (drilling, write controls, etc.). All "X-only" predicates
// require the user to hold X but NO other role that would route them
// to a higher-priority sidebar branch.

export function isAreaAdminOnly(user) {
  return hasRole(user, 'AREA_ADMIN') && !isHigherAdmin(user);
}

export function isPureMember(user) {
  if (!hasRole(user, 'MEMBER')) return false;
  if (isHigherAdmin(user) || hasRole(user, 'AREA_ADMIN')) return false;
  if (CABINET_ROLES.some((r) => hasRole(user, r))) return false;
  // A holder of a custom catalogue role with any permission grant is
  // an operator-class user, not a pure member — they get the fallback
  // unit sidebar instead of the read-only member portal.
  if (Array.isArray(user.permissions) && user.permissions.length > 0) return false;
  return true;
}

// SENIOR_MAWIN-style operator (BU/Area/District/Central) — the only
// SR_VICE_PRESIDENT / VICE_PRESIDENT / etc. now route to the
// President-style sidebar instead.
export function isOperatorPersona(user) {
  return (hasRole(user, 'SENIOR_MAWIN') || hasRole(user, 'FIRST_SECRETARY'))
    && !isHigherAdmin(user) && !hasRole(user, 'AREA_ADMIN');
}

export function isPresidentPersona(user) {
  return PRESIDENT_PERSONA_ROLES.some((r) => hasRole(user, r))
    && !isHigherAdmin(user) && !hasRole(user, 'AREA_ADMIN')
    && !hasRole(user, 'SENIOR_MAWIN') && !hasRole(user, 'FIRST_SECRETARY')
    && !hasRole(user, 'SECRETARY') && !hasRole(user, 'FINANCE_SECRETARY');
}

export function isFinanceOnly(user) {
  return hasRole(user, 'FINANCE_SECRETARY')
    && !isHigherAdmin(user) && !hasRole(user, 'AREA_ADMIN')
    && !hasRole(user, 'SENIOR_MAWIN') && !hasRole(user, 'SECRETARY');
}

export function isProvinceAdminOnly(user) {
  return hasRole(user, 'PROVINCE_ADMIN')
    && !hasRole(user, 'SUPER_ADMIN')
    && !hasRole(user, 'CENTRAL_ADMIN');
}

export function isDistrictAdminOnly(user) {
  return hasRole(user, 'DISTRICT_ADMIN')
    && !hasRole(user, 'SUPER_ADMIN')
    && !hasRole(user, 'PROVINCE_ADMIN');
}

// CENTRAL_ADMIN — the national tier between Super Admin and Province
// Admin. Responsible for structuring Provinces and administering
// Province Admins; see server/src/utils/adminHierarchy. This used to
// be a no-op stub from the period when the role did not exist.
export function isCentralAdminOnly(user) {
  return hasRole(user, 'CENTRAL_ADMIN')
    && !hasRole(user, 'SUPER_ADMIN');
}
