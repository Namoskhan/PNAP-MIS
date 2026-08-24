// ─── Permission catalogue ─────────────────────────────────────────
// Discrete capability codes that gate every privileged action on the
// server. Each Role document stores an array of these codes; when a
// user holds a role, they inherit its permissions. The catalogue
// itself is hard-coded (these match the SRS-defined privileged
// actions) — Super Admin can grant/revoke them per role on the
// Roles page, but cannot create new permission codes (those would
// require a controller change to enforce).
//
// Categories drive the grouped checkbox layout in the role-edit
// dialog. Keep `code` UPPER_SNAKE — it's stored in DB and shipped
// to the client.
const PERMISSIONS = [
  // ─── Member management
  { code: 'REGISTER_MEMBER',   category: 'Members',         label: 'Register new members from inside the app' },
  { code: 'APPROVE_MEMBER',    category: 'Members',         label: 'Approve / reject member applications' },

  // ─── Finance
  { code: 'MANAGE_FINANCE',    category: 'Finance',         label: 'Record donations, expenses, and transfers' },
  { code: 'APPROVE_EXPENSE',   category: 'Finance',         label: 'Approve or reject pending expenses' },

  // ─── Meetings & activities
  { code: 'MANAGE_MEETINGS',   category: 'Meetings',        label: 'Create and finalize meetings, log activities' },

  // ─── Roles & cabinet
  { code: 'INITIATE_ROLE',     category: 'Roles',           label: 'Propose role assignments to cabinet members' },
  { code: 'DECIDE_ROLE',       category: 'Roles',           label: 'Approve or reject pending role proposals' },
  { code: 'MANAGE_PERMANENT_MEMBERS', category: 'Roles',    label: 'Nominate / revoke Permanent Members on a committee' },
  { code: 'MANAGE_JIRGA_MEMBERS', category: 'Roles',        label: 'Assign / remove members on Qomi or Sobayi Jirga' },

  // ─── Communication
  { code: 'POST_ANNOUNCEMENT', category: 'Communication',   label: 'Post announcements & send direct messages' },

  // ─── Org structure + System — SUPER-ADMIN RESERVED ──────────────
  // Administration is the Super Admin's work by product decision:
  // these codes cannot be granted to any other role. They are
  // stripped on every role save, hidden from the permission editor,
  // and purged from existing roles at boot — so the editor never
  // shows a checkbox that has no effect.
  { code: 'CREATE_PROVINCE',   category: 'Org Structure',   label: 'Create new provinces', superOnly: true },
  { code: 'CREATE_DISTRICT',   category: 'Org Structure',   label: 'Create new districts', superOnly: true },
  { code: 'CREATE_AREA',       category: 'Org Structure',   label: 'Create new areas', superOnly: true },
  { code: 'CREATE_BASIC_UNIT', category: 'Org Structure',   label: 'Create new basic units', superOnly: true },

  { code: 'MANAGE_USERS',      category: 'System',          label: 'Edit user accounts, reset passwords, deactivate', superOnly: true },
  { code: 'VIEW_AUDIT',        category: 'System',          label: 'View the audit log', superOnly: true },
  { code: 'MANAGE_ROLES',      category: 'System',          label: 'Edit role catalog and assign permissions', superOnly: true },
  { code: 'VIEW_FINANCE_OVERVIEW', category: 'System',      label: 'View global finance overview across all units', superOnly: true },
  { code: 'MANAGE_EVENT_CONFIG', category: 'System',        label: 'Configure meeting / activity types and custom fields', superOnly: true },
  { code: 'VIEW_EVENT_CONFIG',  category: 'System',         label: 'View meeting / activity type configuration', superOnly: true },
  { code: 'MANAGE_UNIT_CONFIG',  category: 'System',         label: 'Configure tier labels, capabilities, and per-unit custom fields', superOnly: true },
  { code: 'VIEW_UNIT_CONFIG',    category: 'System',         label: 'View unit tier configuration', superOnly: true },
  { code: 'MANAGE_SYSTEM_BRANDING', category: 'System',      label: 'Edit system identity, theme, logos, and appearance', superOnly: true },
  { code: 'VIEW_SYSTEM_BRANDING',   category: 'System',      label: 'View system branding configuration', superOnly: true },
];

// Codes that only Super Admin may hold (never stored on other roles).
const RESERVED_PERMISSION_CODES = PERMISSIONS.filter((p) => p.superOnly).map((p) => p.code);

const PERMISSION_CODES = PERMISSIONS.map((p) => p.code);
const PERMISSION_BY_CODE = Object.fromEntries(PERMISSIONS.map((p) => [p.code, p]));

// ─── Per-role default grants ──────────────────────────────────────
// Mirrors the existing hard-coded gates in the (legacy) unitScope
// helpers. SUPER_ADMIN gets every code automatically (it's also a
// runtime fallback in userHasPermission, so even an empty array
// would behave the same).
const DEFAULT_PERMISSIONS = {
  SUPER_ADMIN:        PERMISSION_CODES,

  // National tier between Super and Province. Its distinguishing
  // authority — creating Provinces and administering Province Admins —
  // is enforced by role in utils/adminHierarchy, not by a permission
  // code: the CREATE_* codes above are catalogued but never consulted
  // by any route (org CRUD has always been role-gated). Its operational
  // grants mirror PROVINCE_ADMIN so the shared member / cabinet /
  // finance surfaces behave identically one tier up, plus
  // POST_ANNOUNCEMENT for the national communication surface.
  CENTRAL_ADMIN: [
    'REGISTER_MEMBER', 'APPROVE_MEMBER',
    'MANAGE_FINANCE', 'APPROVE_EXPENSE',
    'MANAGE_MEETINGS',
    'INITIATE_ROLE', 'DECIDE_ROLE', 'MANAGE_PERMANENT_MEMBERS', 'MANAGE_JIRGA_MEMBERS',
    'POST_ANNOUNCEMENT',
  ],

  PROVINCE_ADMIN: [
    'REGISTER_MEMBER', 'APPROVE_MEMBER',
    'MANAGE_FINANCE', 'APPROVE_EXPENSE',
    'MANAGE_MEETINGS',
    'INITIATE_ROLE', 'DECIDE_ROLE', 'MANAGE_PERMANENT_MEMBERS', 'MANAGE_JIRGA_MEMBERS',
  ],
  DISTRICT_ADMIN: [
    'REGISTER_MEMBER', 'APPROVE_MEMBER',
    'MANAGE_FINANCE', 'APPROVE_EXPENSE',
    'MANAGE_MEETINGS',
    'INITIATE_ROLE', 'DECIDE_ROLE', 'MANAGE_PERMANENT_MEMBERS',
  ],
  AREA_ADMIN: [
    'REGISTER_MEMBER', 'APPROVE_MEMBER',
    'INITIATE_ROLE', 'DECIDE_ROLE', 'MANAGE_PERMANENT_MEMBERS',
  ],

  // Below-province cabinet
  SECRETARY:          ['REGISTER_MEMBER', 'APPROVE_MEMBER', 'APPROVE_EXPENSE', 'DECIDE_ROLE'],
  SENIOR_MAWIN:       ['REGISTER_MEMBER', 'MANAGE_FINANCE', 'MANAGE_MEETINGS', 'INITIATE_ROLE', 'DECIDE_ROLE', 'MANAGE_PERMANENT_MEMBERS', 'POST_ANNOUNCEMENT'],
  FINANCE_SECRETARY:  ['MANAGE_FINANCE'],
  PRESS_SECRETARY:    [],
  CULTURE_SECRETARY:  [],
  SPORTS_SECRETARY:   [],

  // Province cabinet
  PRESIDENT:          ['DECIDE_ROLE'],
  SR_VICE_PRESIDENT:  ['MANAGE_FINANCE', 'MANAGE_MEETINGS', 'INITIATE_ROLE', 'POST_ANNOUNCEMENT'],
  VICE_PRESIDENT:     [],
  GENERAL_SECRETARY:  ['REGISTER_MEMBER', 'MANAGE_FINANCE', 'MANAGE_MEETINGS', 'INITIATE_ROLE', 'DECIDE_ROLE', 'MANAGE_PERMANENT_MEMBERS', 'MANAGE_JIRGA_MEMBERS', 'POST_ANNOUNCEMENT'],

  // Central cabinet
  CHAIRMAN:           ['DECIDE_ROLE'],
  CO_CHAIRMAN:        ['DECIDE_ROLE'],
  SR_VICE_CHAIRMAN:   [],
  VICE_CHAIRMAN:      [],
  FIRST_SECRETARY:    ['MANAGE_FINANCE', 'MANAGE_MEETINGS', 'INITIATE_ROLE', 'POST_ANNOUNCEMENT'],

  // Catch-all + base
  OTHER:              [],
  MEMBER:             [],
};

// ─── In-memory cache of role → Set<permission> ────────────────────
// Loaded once at boot via loadRolePermissionCache(); refreshed by
// the role-catalog controller after any write. Sync lookup keeps the
// existing canX(user) helpers synchronous, so call sites don't have
// to be touched.
let _cache = new Map();        // Map<code, { permissions: Set<string>, isActive: boolean }>
let _cacheReady = false;

async function loadRolePermissionCache() {
  const Role = require('../models/Role');
  const all = await Role.find({}).lean();
  const next = new Map();
  for (const r of all) {
    next.set(r.code, {
      permissions: new Set(r.permissions || []),
      isActive: r.isActive !== false,
    });
  }
  _cache = next;
  _cacheReady = true;
}

function invalidateRolePermissionCache() {
  _cacheReady = false;
}

// Sync permission check. Returns true iff any of the user's roles
// (excluding deactivated ones) grant `perm`. SUPER_ADMIN always
// returns true — guards against startup races + serves as the
// always-allowed override matching the SRS bootstrap design.
function userHasPermission(user, perm) {
  if (!user || !Array.isArray(user.roles)) return false;
  if (user.roles.includes('SUPER_ADMIN')) return true;
  if (!_cacheReady) {
    // Fallback: if the cache hasn't loaded yet, derive from the
    // hard-coded defaults so behavior matches the legacy gates.
    for (const code of user.roles) {
      const list = DEFAULT_PERMISSIONS[code] || [];
      if (list.includes(perm)) return true;
    }
    return false;
  }
  for (const code of user.roles) {
    const entry = _cache.get(code);
    if (entry && entry.isActive && entry.permissions.has(perm)) return true;
  }
  return false;
}

// Return the union of all permissions the user holds across their
// active roles. Used by /auth/me to ship permissions to the client.
function userPermissions(user) {
  if (!user || !Array.isArray(user.roles)) return [];
  if (user.roles.includes('SUPER_ADMIN')) return PERMISSION_CODES.slice();
  const out = new Set();
  if (!_cacheReady) {
    for (const code of user.roles) {
      for (const p of (DEFAULT_PERMISSIONS[code] || [])) out.add(p);
    }
  } else {
    for (const code of user.roles) {
      const entry = _cache.get(code);
      if (entry && entry.isActive) {
        for (const p of entry.permissions) out.add(p);
      }
    }
  }
  return [...out];
}

// Inverse lookup — which active role codes currently grant `perm`?
// Used by checks that need to scope a query to "any role assignment
// whose role grants this permission" (e.g. canManagePermanentMembers).
function rolesWithPermission(perm) {
  if (!_cacheReady) {
    return Object.keys(DEFAULT_PERMISSIONS).filter((c) => (DEFAULT_PERMISSIONS[c] || []).includes(perm));
  }
  const out = [];
  for (const [code, entry] of _cache) {
    if (entry.isActive && entry.permissions.has(perm)) out.push(code);
  }
  return out;
}

module.exports = {
  PERMISSIONS,
  PERMISSION_CODES,
  PERMISSION_BY_CODE,
  RESERVED_PERMISSION_CODES,
  DEFAULT_PERMISSIONS,
  loadRolePermissionCache,
  invalidateRolePermissionCache,
  userHasPermission,
  userPermissions,
  rolesWithPermission,
};
