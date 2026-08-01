const asyncHandler = require('express-async-handler');
const Role = require('../models/Role');
const { ok, created, ApiError } = require('../utils/response');
const {
  PERMISSIONS, PERMISSION_CODES, RESERVED_PERMISSION_CODES,
  loadRolePermissionCache,
} = require('../utils/permissions');

// Refresh the in-memory role-permission cache so the next request's
// permission checks see the new state. Called after every successful
// role write below.
async function refreshCache() {
  try { await loadRolePermissionCache(); } catch { /* best-effort */ }
}

// Sanitize an incoming permissions array — strip anything that isn't
// in the catalogue so a misbehaving client can't slip in a phantom
// permission code. Returns a deduped array.
function cleanPermissions(input) {
  if (!Array.isArray(input)) return null;
  const valid = new Set(PERMISSION_CODES);
  const reserved = new Set(RESERVED_PERMISSION_CODES);
  // Reserved (super-only) codes are silently dropped — they have no
  // effect on other roles, and storing them made the editor lie
  // about what a role could actually do.
  return [...new Set(input.filter((p) => valid.has(p) && !reserved.has(p)))];
}

// Slugify a free-text label into a SCREAMING_SNAKE_CASE role code.
// Custom codes are prefixed with CUSTOM_ to keep them visually
// distinct from SRS-defined ones and to prevent collisions.
function makeCustomCode(label) {
  const slug = String(label || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!slug) return null;
  return `CUSTOM_${slug}`.slice(0, 60);
}

// GET /admin/roles — list every role plus the static permission
// catalogue so the client can render the permission picker without
// a second round trip. Anyone authenticated can read; writes are
// gated on Super Admin at the route layer.
exports.list = asyncHandler(async (req, res) => {
  const items = await Role.find({})
    .sort({ category: 1, sortOrder: 1, label: 1 })
    .lean();
  ok(res, { roles: items, permissions: PERMISSIONS });
});

// POST /admin/roles — create a custom role.
exports.create = asyncHandler(async (req, res) => {
  const { label, description, category, sortOrder, permissions } = req.body;
  if (!label || String(label).trim().length < 2) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Role label is required (min 2 chars)');
  }
  const code = makeCustomCode(label);
  if (!code) throw new ApiError(400, 'VALIDATION_ERROR', 'Role label could not be converted to a code');
  const exists = await Role.findOne({ code });
  if (exists) throw new ApiError(409, 'DUPLICATE', `A role with code "${code}" already exists`);

  const cleanPerms = cleanPermissions(permissions) || [];

  const doc = await Role.create({
    code,
    label: String(label).trim(),
    description: description ? String(description).trim() : undefined,
    category: ['BU_AREA_DISTRICT', 'PROVINCE', 'CENTRAL', 'CUSTOM'].includes(category) ? category : 'CUSTOM',
    sortOrder: typeof sortOrder === 'number' ? sortOrder : 500,
    isSystem: false,
    isActive: true,
    permissions: cleanPerms,
    createdBy: req.user._id,
  });
  await refreshCache();
  created(res, doc);
});

// PATCH /admin/roles/:id — update editable fields. For built-in
// (isSystem=true) roles we permit label / description / sortOrder /
// isActive only; the code + category are locked. Custom roles allow
// the full set.
exports.update = asyncHandler(async (req, res) => {
  const r = await Role.findById(req.params.id);
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'Role not found');

  // SUPER_ADMIN is fully locked — no field on it can be edited from
  // the UI. The bootstrap / break-glass identity has to stay
  // canonical so it can never be misconfigured into uselessness.
  if (r.code === 'SUPER_ADMIN') {
    throw new ApiError(400, 'INVALID_OPERATION',
      'Super Admin is built-in and cannot be edited.');
  }

  const { label, description, category, sortOrder, isActive, permissions, endExistingAssignments } = req.body;

  // Track diffs so we can cascade safely.
  const labelChanged = label != null && String(label).trim() !== r.label;
  const oldLabel = r.label;
  const willDeactivate = isActive != null && !isActive && r.isActive;

  if (label != null) {
    const trimmed = String(label).trim();
    if (trimmed.length < 2) throw new ApiError(400, 'VALIDATION_ERROR', 'Role label too short');
    r.label = trimmed;
  }
  if (description != null) r.description = String(description).trim() || undefined;
  if (sortOrder != null && typeof sortOrder === 'number') r.sortOrder = sortOrder;
  if (isActive != null) {
    if (r.isSystem && !isActive) {
      throw new ApiError(400, 'INVALID_OPERATION', 'Built-in system roles cannot be deactivated');
    }
    r.isActive = !!isActive;
  }
  if (category != null && !r.isSystem) {
    if (!['BU_AREA_DISTRICT', 'PROVINCE', 'CENTRAL', 'CUSTOM'].includes(category)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Unknown category');
    }
    r.category = category;
  }
  if (permissions != null) {
    const clean = cleanPermissions(permissions);
    if (clean === null) throw new ApiError(400, 'VALIDATION_ERROR', 'permissions must be an array of strings');
    r.permissions = clean;
  }
  await r.save();
  await refreshCache();

  // ── Cascade side-effects to RoleAssignment ─────────────────────
  // (a) Label rename — only fires for custom roles and only when the
  //     label actually changed. Updates the denormalized
  //     customRoleName on every existing assignment so historical
  //     records, audit views, and pending-approval lists stay
  //     consistent with the current catalogue label.
  let renamedAssignments = 0;
  if (labelChanged && !r.isSystem) {
    const RoleAssignment = require('../models/RoleAssignment');
    const upd = await RoleAssignment.updateMany(
      { roleCode: r.code },
      { $set: { customRoleName: r.label } }
    );
    renamedAssignments = upd.modifiedCount || 0;
  }

  // (b) Deactivation cascade — when the admin opts in via
  //     `endExistingAssignments=true`, force-end every active
  //     APPROVED assignment of this role so holders lose access
  //     immediately (not only on next login). Without the flag the
  //     role is "frozen" — new assignments blocked, existing ones
  //     stay until explicitly ended.
  let endedAssignments = 0;
  if (willDeactivate && endExistingAssignments) {
    const RoleAssignment = require('../models/RoleAssignment');
    // Capture the affected holders BEFORE ending, so their User.roles
    // can be re-derived afterwards — otherwise they keep the role's
    // capabilities until their next login.
    const affectedMembers = await RoleAssignment.distinct('memberId', {
      roleCode: r.code, state: 'APPROVED', endedAt: { $exists: false },
    });
    const upd = await RoleAssignment.updateMany(
      { roleCode: r.code, state: 'APPROVED', endedAt: { $exists: false } },
      { $set: { state: 'ENDED', endedAt: new Date(), endReason: 'TERM_ENDED', decisionNote: 'Role deactivated in catalogue' } }
    );
    endedAssignments = upd.modifiedCount || 0;
    try {
      const { syncMemberUserRoles } = require('../utils/syncMemberRoles');
      await Promise.all(affectedMembers.map((mid) => syncMemberUserRoles(mid)));
    } catch { /* non-fatal */ }
  }

  ok(res, { ...r.toObject(), _cascade: { renamedAssignments, endedAssignments, oldLabel } });
});

// DELETE /admin/roles/:id — only valid for custom roles AND only when
// no User / RoleAssignment is using the code. Built-in roles can't
// be deleted; deactivate via PATCH instead.
exports.remove = asyncHandler(async (req, res) => {
  const r = await Role.findById(req.params.id);
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'Role not found');
  if (r.isSystem) throw new ApiError(400, 'INVALID_OPERATION', 'Built-in roles cannot be deleted; deactivate instead');

  const User = require('../models/User');
  const RoleAssignment = require('../models/RoleAssignment');
  const [userCount, assignCount] = await Promise.all([
    User.countDocuments({ roles: r.code }),
    RoleAssignment.countDocuments({ roleCode: r.code }),
  ]);
  if (userCount + assignCount > 0) {
    throw new ApiError(409, 'IN_USE',
      `Role is in use by ${userCount} user(s) and ${assignCount} cabinet assignment(s). Deactivate it instead.`);
  }
  await r.deleteOne();
  await refreshCache();
  ok(res, { deleted: true });
});
