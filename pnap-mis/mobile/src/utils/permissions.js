// Ported directly from web/src/utils/permissions.js.
// All logic is pure JS — no DOM dependencies — so it ports verbatim.

export const HIGHER_ADMIN_ROLES = ['SUPER_ADMIN', 'CENTRAL_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN'];

export function hasRole(user, ...roles) {
  if (!user?.roles) return false;
  const userRoles = (user.roles || []).map((r) => String(r).toUpperCase());
  return roles.some((role) => userRoles.includes(String(role).toUpperCase()));
}

export function hasPermission(user, perm) {
  if (!user) return false;
  if (user.roles?.includes('SUPER_ADMIN')) return true;
  return Array.isArray(user.permissions) && user.permissions.includes(perm);
}

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

export function roleLabel(user, code) {
  if (!code) return '';
  const map = user?.roleLabels;
  if (map && map[code]) return map[code];
  if (BUILTIN_ROLE_LABELS[code]) return BUILTIN_ROLE_LABELS[code];
  return String(code)
    .replace(/^CUSTOM_/, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isHigherAdmin(user) { return hasRole(user, ...HIGHER_ADMIN_ROLES); }
export function isAreaAdmin(user) { return hasRole(user, 'AREA_ADMIN') && !isHigherAdmin(user); }
export function isSuperAdmin(user) { return hasRole(user, 'SUPER_ADMIN'); }
export function isSuperAdminOversight(user) {
  return user?.roles?.length === 1 && user.roles[0] === 'SUPER_ADMIN';
}
export function isCentralAdminOversight() { return false; }

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
export function canPostAnnouncement(user) { return hasPermission(user, 'POST_ANNOUNCEMENT'); }
export function canApproveMember(user) { return hasPermission(user, 'APPROVE_MEMBER'); }
export function canDecideRole(user) { return hasPermission(user, 'DECIDE_ROLE'); }
export function canInitiateRole(user) { return hasPermission(user, 'INITIATE_ROLE'); }
export function canManageJirgaMembers(user) { return hasPermission(user, 'MANAGE_JIRGA_MEMBERS'); }
export function canManageCongressMembers(user) { return hasPermission(user, 'MANAGE_CONGRESS_MEMBERS'); }

export const CABINET_ROLES = [
  'SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY',
  'PRESS_SECRETARY', 'CULTURE_SECRETARY', 'SPORTS_SECRETARY',
  'PRESIDENT', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY',
  'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN', 'FIRST_SECRETARY',
  'OTHER',
];

export const PRESIDENT_PERSONA_ROLES = [
  'PRESIDENT', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY',
  'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN',
];

export const OPERATOR_AUTOPIN_ROLES = [
  'SENIOR_MAWIN', 'SR_VICE_PRESIDENT', 'FIRST_SECRETARY',
  'SECRETARY', 'FINANCE_SECRETARY',
  'PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY',
  'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN',
];

export function isPureMember(user) {
  if (!hasRole(user, 'MEMBER')) return false;
  if (isHigherAdmin(user) || hasRole(user, 'AREA_ADMIN')) return false;
  if (CABINET_ROLES.some((r) => hasRole(user, r))) return false;
  if (Array.isArray(user.permissions) && user.permissions.length > 0) return false;
  return true;
}

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
  return hasRole(user, 'PROVINCE_ADMIN') && !hasRole(user, 'SUPER_ADMIN') && !hasRole(user, 'CENTRAL_ADMIN');
}

export function isDistrictAdminOnly(user) {
  return hasRole(user, 'DISTRICT_ADMIN') && !hasRole(user, 'SUPER_ADMIN') && !hasRole(user, 'PROVINCE_ADMIN');
}

export function isCentralAdminOnly(user) {
  return hasRole(user, 'CENTRAL_ADMIN') && !hasRole(user, 'SUPER_ADMIN');
}
