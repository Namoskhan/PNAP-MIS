const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const { ok, ApiError } = require('../utils/response');
const { audit } = require('../utils/audit');

// Super Admin god-mode user management. All endpoints in this file
// are gated by requireRole('SUPER_ADMIN') in the route layer.

// Refuse to demote / deactivate / delete the only remaining
// SUPER_ADMIN — otherwise the system locks itself out of god mode.
async function isLastSuperAdmin(userId) {
  const others = await User.countDocuments({
    _id: { $ne: userId },
    roles: 'SUPER_ADMIN',
    isActive: true,
  });
  return others === 0;
}

// POST /api/admin/users — create a tier admin user.
// Hierarchy enforced:
//   SUPER_ADMIN can create PROVINCE_ADMIN (must include scope.provinceId)
//   PROVINCE_ADMIN can create DISTRICT_ADMIN within their own province
//   DISTRICT_ADMIN can create AREA_ADMIN within their own district
//   AREA_ADMIN cannot use this endpoint (creates Basic Units instead).
// Body: { fullName, email|cnic|username, password, role, scope }
exports.create = asyncHandler(async (req, res) => {
  const { fullName, email, cnic, username, password, role, scope } = req.body || {};
  const me = req.user;
  const myRoles = me?.roles || [];

  if (!fullName || !password || !role) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'fullName, password and role are required');
  }
  if (!email && !cnic && !username) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'At least one of email / cnic / username is required');
  }

  // Hierarchy creator → role allowlist
  const HIERARCHY = {
    SUPER_ADMIN:    ['PROVINCE_ADMIN'],
    PROVINCE_ADMIN: ['DISTRICT_ADMIN'],
    DISTRICT_ADMIN: ['AREA_ADMIN'],
  };
  const allowed = (() => {
    if (myRoles.includes('SUPER_ADMIN')) return HIERARCHY.SUPER_ADMIN;
    if (myRoles.includes('PROVINCE_ADMIN')) return HIERARCHY.PROVINCE_ADMIN;
    if (myRoles.includes('DISTRICT_ADMIN')) return HIERARCHY.DISTRICT_ADMIN;
    return [];
  })();
  if (!allowed.includes(role)) {
    throw new ApiError(403, 'FORBIDDEN', `Your role cannot create a ${role}`);
  }

  // Scope validation per tier
  const cleanScope = {};
  if (role === 'PROVINCE_ADMIN') {
    if (!scope?.provinceId) throw new ApiError(400, 'VALIDATION_ERROR', 'scope.provinceId required for PROVINCE_ADMIN');
    cleanScope.provinceId = scope.provinceId;
  } else if (role === 'DISTRICT_ADMIN') {
    if (!scope?.districtId) throw new ApiError(400, 'VALIDATION_ERROR', 'scope.districtId required for DISTRICT_ADMIN');
    if (!myRoles.includes('SUPER_ADMIN')) {
      const District = require('../models/District');
      const d = await District.findById(scope.districtId);
      if (!d) throw new ApiError(400, 'INVALID_DISTRICT', 'District not found');
      if (String(d.provinceId) !== String(me.scope?.provinceId || '')) {
        throw new ApiError(403, 'FORBIDDEN', 'You can only create District Admins within your own province');
      }
      cleanScope.provinceId = d.provinceId;
    } else if (scope.provinceId) {
      cleanScope.provinceId = scope.provinceId;
    }
    cleanScope.districtId = scope.districtId;
  } else if (role === 'AREA_ADMIN') {
    if (!scope?.areaId) throw new ApiError(400, 'VALIDATION_ERROR', 'scope.areaId required for AREA_ADMIN');
    const Area = require('../models/Area');
    const a = await Area.findById(scope.areaId);
    if (!a) throw new ApiError(400, 'INVALID_AREA', 'Area not found');
    if (!myRoles.includes('SUPER_ADMIN') && String(a.districtId) !== String(me.scope?.districtId || '')) {
      throw new ApiError(403, 'FORBIDDEN', 'You can only create Area Admins within your own district');
    }
    cleanScope.provinceId = a.provinceId;
    cleanScope.districtId = a.districtId;
    cleanScope.areaId = a._id;
  }

  // Conflict check on identifiers
  const orClauses = [];
  if (email) orClauses.push({ email: String(email).toLowerCase().trim() });
  if (cnic) orClauses.push({ cnic: String(cnic).trim() });
  if (username) orClauses.push({ username: String(username).toLowerCase().trim() });
  if (orClauses.length > 0) {
    const dup = await User.findOne({ $or: orClauses });
    if (dup) throw new ApiError(409, 'DUPLICATE', 'A user with that email / CNIC / username already exists');
  }

  const user = new User({
    fullName: String(fullName).trim(),
    email: email ? String(email).toLowerCase().trim() : undefined,
    cnic: cnic ? String(cnic).trim() : undefined,
    username: username ? String(username).toLowerCase().trim() : undefined,
    roles: [role],
    scope: cleanScope,
    isActive: true,
  });
  await user.setPassword(String(password));
  await user.save();

  audit({
    actor: me,
    action: 'admin.users.create',
    target: { kind: 'User', id: user._id },
    detail: { role, scope: cleanScope },
  }).catch(() => {});

  const obj = user.toJSON();
  ok(res, obj, 201);
});

exports.list = asyncHandler(async (req, res) => {
  const { q, role, provinceId, districtId, areaId, basicUnitId, levelExact, isActive, page = 1, limit = 50 } = req.query;
  const filter = {};
  if (role) {
    filter.roles = role;
  } else {
    // Hide SUPER_ADMIN entries from the default list — the operator
    // shouldn't be looking at their own account in the user roster.
    // Pass ?role=SUPER_ADMIN explicitly to override.
    filter.roles = { $ne: 'SUPER_ADMIN' };
  }

  // levelExact — return users whose deepest territorial scope sits
  // at exactly that level (used by the drill-down navigator so each
  // level lists only its own officers, not officers nested below).
  if (levelExact === 'CENTRAL') {
    filter['scope.provinceId'] = { $in: [null, undefined] };
    filter['scope.districtId'] = { $in: [null, undefined] };
    filter['scope.areaId'] = { $in: [null, undefined] };
    filter['scope.basicUnitId'] = { $in: [null, undefined] };
  } else if (levelExact === 'PROVINCE' && provinceId) {
    filter['scope.provinceId'] = provinceId;
    filter['scope.districtId'] = { $in: [null, undefined] };
    filter['scope.areaId'] = { $in: [null, undefined] };
    filter['scope.basicUnitId'] = { $in: [null, undefined] };
  } else if (levelExact === 'DISTRICT' && districtId) {
    filter['scope.districtId'] = districtId;
    filter['scope.areaId'] = { $in: [null, undefined] };
    filter['scope.basicUnitId'] = { $in: [null, undefined] };
  } else if (levelExact === 'AREA' && areaId) {
    filter['scope.areaId'] = areaId;
    filter['scope.basicUnitId'] = { $in: [null, undefined] };
  } else if (levelExact === 'BASIC_UNIT' && basicUnitId) {
    filter['scope.basicUnitId'] = basicUnitId;
  } else {
    // Fallback to the existing wide filters when levelExact is absent.
    if (provinceId) filter['scope.provinceId'] = provinceId;
    if (districtId) filter['scope.districtId'] = districtId;
    if (areaId) filter['scope.areaId'] = areaId;
    if (basicUnitId) filter['scope.basicUnitId'] = basicUnitId;
  }
  if (isActive === 'true') filter.isActive = true;
  if (isActive === 'false') filter.isActive = false;
  if (q) {
    const rx = { $regex: q.trim(), $options: 'i' };
    filter.$or = [
      { username: rx }, { email: rx }, { cnic: rx }, { fullName: rx },
    ];
  }
  const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(200, parseInt(limit, 10));
  const lim = Math.min(200, parseInt(limit, 10));
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
    User.countDocuments(filter),
  ]);
  // toJSON strips passwordHash on lean queries we still need to drop manually.
  for (const u of items) delete u.passwordHash;
  ok(res, { items, total, page: Number(page), limit: lim });
});

exports.getOne = asyncHandler(async (req, res) => {
  const u = await User.findById(req.params.id).lean();
  if (!u) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  delete u.passwordHash;
  ok(res, u);
});

exports.update = asyncHandler(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) throw new ApiError(404, 'NOT_FOUND', 'User not found');

  const before = {
    username: u.username, email: u.email, cnic: u.cnic, fullName: u.fullName,
    roles: [...(u.roles || [])], scope: { ...(u.scope || {}) }, isActive: u.isActive,
  };

  const { username, email, cnic, fullName, roles, scope, isActive } = req.body;

  // Last-super-admin guard — refuse to strip SUPER_ADMIN from the
  // only remaining super, or to deactivate them.
  if (u.roles?.includes('SUPER_ADMIN')) {
    const removingSuper = Array.isArray(roles) && !roles.includes('SUPER_ADMIN');
    const deactivating = isActive === false;
    if ((removingSuper || deactivating) && await isLastSuperAdmin(u._id)) {
      throw new ApiError(409, 'LAST_SUPER_ADMIN',
        'Cannot demote or deactivate the last remaining Super Admin. Promote another user first.');
    }
  }
  if (username !== undefined) u.username = username ? String(username).trim().toLowerCase() : undefined;
  if (email !== undefined) u.email = email ? String(email).trim().toLowerCase() : undefined;
  if (cnic !== undefined) u.cnic = cnic ? String(cnic).trim() : undefined;
  if (fullName !== undefined) u.fullName = String(fullName).trim();
  if (Array.isArray(roles)) u.roles = roles.filter((r) => User.ROLES.includes(r));
  if (scope) {
    u.scope = {
      provinceId: scope.provinceId || undefined,
      districtId: scope.districtId || undefined,
      areaId: scope.areaId || undefined,
      basicUnitId: scope.basicUnitId || undefined,
    };
  }
  if (typeof isActive === 'boolean') u.isActive = isActive;

  await u.save();

  await audit({
    req,
    action: 'USER_UPDATE',
    targetType: 'User',
    targetId: u._id,
    targetLabel: u.fullName,
    before,
    after: {
      username: u.username, email: u.email, cnic: u.cnic, fullName: u.fullName,
      roles: u.roles, scope: u.scope, isActive: u.isActive,
    },
  });

  const out = u.toJSON();
  ok(res, out);
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < 6) {
    throw new ApiError(400, 'WEAK_PASSWORD', 'Password must be at least 6 characters.');
  }
  await u.setPassword(newPassword);
  await u.save();

  await audit({
    req,
    action: 'USER_RESET_PASSWORD',
    targetType: 'User',
    targetId: u._id,
    targetLabel: u.fullName,
    note: 'New password set by Super Admin',
  });

  ok(res, { ok: true });
});

exports.deactivate = asyncHandler(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  if (u.roles?.includes('SUPER_ADMIN') && await isLastSuperAdmin(u._id)) {
    throw new ApiError(409, 'LAST_SUPER_ADMIN',
      'Cannot deactivate the last remaining Super Admin.');
  }
  const wasActive = u.isActive;
  u.isActive = false;
  await u.save();

  // Cascade: end every active RoleAssignment this user holds (via
  // their linked memberId) and free the matching cabinet slots.
  // Without this, the cabinet view would still show them as the
  // current holder even though they can no longer log in.
  let cascadedRoles = 0;
  if (u.memberId) {
    const RoleAssignment = require('../models/RoleAssignment');
    const CabinetSlot = require('../models/CabinetSlot');
    const active = await RoleAssignment.find({
      memberId: u.memberId,
      state: 'APPROVED',
      endedAt: { $exists: false },
    });
    for (const ra of active) {
      ra.state = 'ENDED';
      ra.endedAt = new Date();
      ra.endReason = 'ADMIN_DEACTIVATED';
      ra.decisionNote = `User deactivated by Super Admin (${req.user.fullName || req.user.username || 'super'})`;
      await ra.save();
      await CabinetSlot.updateOne(
        { unitLevel: ra.unitLevel, unitId: ra.unitId, roleCode: ra.roleCode, filledByAssignmentId: ra._id },
        { $unset: { filledByAssignmentId: '', filledMemberId: '' } }
      );
      cascadedRoles++;
    }
  }

  await audit({
    req,
    action: 'USER_DEACTIVATE',
    targetType: 'User',
    targetId: u._id,
    targetLabel: u.fullName,
    before: { isActive: wasActive },
    after: { isActive: false, cascadedRoles },
  });

  ok(res, { ok: true, cascadedRoles });
});

exports.activate = asyncHandler(async (req, res) => {
  const u = await User.findById(req.params.id);
  if (!u) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  u.isActive = true;
  await u.save();
  await audit({
    req,
    action: 'USER_ACTIVATE',
    targetType: 'User',
    targetId: u._id,
    targetLabel: u.fullName,
  });
  ok(res, { ok: true });
});

// GET /admin/search?q=ali
//
// Cross-cuts members + admin Users + active RoleAssignments so a single
// query string surfaces every match by name / CNIC / phone / member-id /
// username / email / role code. Used by the Users & Credentials live
// search dropdown so a Super Admin can find someone without drilling
// through the territorial tree.
exports.search = asyncHandler(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return ok(res, []);
  const rx = new RegExp(q.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'i');
  // Role-code search uses uppercase — let "secre" match SECRETARY,
  // "fin" match FINANCE_SECRETARY, etc.
  const upper = q.toUpperCase();

  const Member = require('../models/Member');
  const RoleAssignment = require('../models/RoleAssignment');

  // 1. Member matches — also drag in their active role assignments
  // so the dropdown can show "Senior Mawin · Area abc1".
  const memberMatches = await Member.find({
    $or: [
      { fullName: rx },
      { cnic: rx },
      { phone: rx },
      { memberId: rx },
    ],
  })
    .limit(40)
    .populate('basicUnitId', 'name')
    .populate('areaId', 'name')
    .populate('districtId', 'name')
    .populate('provinceId', 'name code')
    .lean();

  // 2. RoleAssignment matches by role code (so "secretary" finds every
  // Secretary). Then resolve their members.
  let roleMatches = [];
  if (/^[A-Z_]+$/i.test(q)) {
    const ras = await RoleAssignment.find({
      roleCode: { $regex: upper, $options: 'i' },
      state: 'APPROVED',
      endedAt: { $exists: false },
    })
      .limit(40)
      .populate({
        path: 'memberId',
        select: 'fullName cnic phone memberId status',
        populate: [
          { path: 'basicUnitId', select: 'name' },
          { path: 'areaId', select: 'name' },
          { path: 'districtId', select: 'name' },
          { path: 'provinceId', select: 'name code' },
        ],
      })
      .lean();
    roleMatches = ras.filter((ra) => ra.memberId);
  }

  // 3. Admin User accounts (territorial admins, super, etc.)
  const adminUsers = await User.find({
    roles: { $ne: 'MEMBER' },
    $or: [
      { fullName: rx },
      { username: rx },
      { email: rx },
      { cnic: rx },
    ],
  }).limit(20).lean();

  // ─── Merge into one flat result list ────────────────────────────
  const results = [];
  // Helper to look up active RoleAssignments per member in bulk.
  const memberIds = new Set(memberMatches.map((m) => String(m._id)));
  const allActiveRas = memberIds.size
    ? await RoleAssignment.find({
        memberId: { $in: Array.from(memberIds) },
        state: 'APPROVED',
        endedAt: { $exists: false },
      }).lean()
    : [];
  const rasByMember = new Map();
  for (const ra of allActiveRas) {
    const k = String(ra.memberId);
    if (!rasByMember.has(k)) rasByMember.set(k, []);
    rasByMember.get(k).push(ra);
  }

  // Member rows
  for (const m of memberMatches) {
    const ras = rasByMember.get(String(m._id)) || [];
    const roleLabel = ras.length
      ? ras.map((r) => `${r.roleCode}@${r.unitLevel}`).join(', ')
      : 'MEMBER';
    results.push({
      kind: 'MEMBER',
      _id: m._id,
      memberId: m._id,
      memberCode: m.memberId,
      fullName: m.fullName,
      cnic: m.cnic,
      phone: m.phone,
      status: m.status,
      roles: ras.length ? ras.map((r) => r.roleCode) : ['MEMBER'],
      roleLabel,
      location: [m.basicUnitId?.name, m.areaId?.name, m.districtId?.name, m.provinceId?.name].filter(Boolean).join(' · '),
    });
  }

  // RoleAssignment-only matches (members not already in the list)
  const seenMembers = new Set(memberMatches.map((m) => String(m._id)));
  for (const ra of roleMatches) {
    const m = ra.memberId;
    const k = String(m._id);
    if (seenMembers.has(k)) continue;
    seenMembers.add(k);
    results.push({
      kind: 'CABINET',
      _id: m._id,
      memberId: m._id,
      memberCode: m.memberId,
      fullName: m.fullName,
      cnic: m.cnic,
      phone: m.phone,
      status: m.status,
      roles: [ra.roleCode],
      roleLabel: `${ra.roleCode} @ ${ra.unitLevel}`,
      location: [m.basicUnitId?.name, m.areaId?.name, m.districtId?.name, m.provinceId?.name].filter(Boolean).join(' · '),
    });
  }

  // Admin User rows
  for (const u of adminUsers) {
    delete u.passwordHash;
    results.push({
      kind: 'ADMIN',
      _id: u._id,
      userId: u._id,
      fullName: u.fullName,
      username: u.username,
      email: u.email,
      cnic: u.cnic,
      roles: u.roles,
      roleLabel: (u.roles || []).join(', '),
      isActive: u.isActive,
    });
  }

  ok(res, results.slice(0, 50));
});

// GET /admin/executives?level=PROVINCE&unitId=...
//
// Unified "executives at exactly this level" list. Combines:
//   1. Territorial admin User accounts (PROVINCE_ADMIN / DISTRICT_ADMIN
//      / AREA_ADMIN) scoped to that level. Central tier has none —
//      Super Admin owns it directly.
//   2. Cabinet officers: Members who hold an APPROVED RoleAssignment
//      at that exact (unitLevel, unitId), regardless of where the
//      member originally registered. This is what fixes the bug
//      where a Sr. Vice President of Sindh was being filtered out
//      because their User.scope still pointed at the Basic Unit
//      where they registered.
exports.listExecutives = asyncHandler(async (req, res) => {
  const { level, unitId } = req.query;
  if (!level) throw new ApiError(400, 'VALIDATION_ERROR', 'level required');
  const RoleAssignment = require('../models/RoleAssignment');
  const Member = require('../models/Member');

  // 1. Cabinet members at this (level, unitId)
  const raQuery = { state: 'APPROVED', endedAt: { $exists: false }, unitLevel: level };
  if (level === 'CENTRAL') {
    const { ensureCentralSingleton } = require('../utils/centralUnit');
    const c = await ensureCentralSingleton();
    raQuery.unitId = c._id;
  } else {
    if (!unitId) return ok(res, []);
    raQuery.unitId = unitId;
  }
  const ras = await RoleAssignment.find(raQuery)
    .populate('memberId', 'fullName cnic phone memberId status')
    .lean();

  // Merge multi-role holders into one row per member.
  const byMember = new Map();
  for (const ra of ras) {
    const m = ra.memberId;
    if (!m) continue;
    const k = String(m._id);
    if (!byMember.has(k)) {
      byMember.set(k, {
        entityType: 'CABINET',
        _id: m._id,
        memberId: m._id,
        memberCode: m.memberId,
        fullName: m.fullName,
        cnic: m.cnic,
        phone: m.phone,
        roles: [],
        roleAssignments: [],
        status: m.status,
        isActive: m.status === 'ACTIVE',
      });
    }
    const e = byMember.get(k);
    e.roles.push(ra.customRoleName ? `${ra.roleCode} (${ra.customRoleName})` : ra.roleCode);
    e.roleAssignments.push({ _id: ra._id, roleCode: ra.roleCode, customRoleName: ra.customRoleName });
  }

  // Attach linked User info (login identifiers + isActive) when one exists.
  const mids = Array.from(byMember.keys());
  if (mids.length) {
    const users = await User.find({ memberId: { $in: mids } }).lean();
    const userByMember = new Map(users.map((u) => [String(u.memberId), u]));
    for (const e of byMember.values()) {
      const u = userByMember.get(String(e.memberId));
      if (u) {
        e.userId = u._id;
        e.username = u.username;
        e.email = u.email;
        e.userIsActive = u.isActive;
        e.lastLoginAt = u.lastLoginAt;
      }
    }
  }

  // 2. Territorial admin Users (one per level, if provisioned)
  // Central tier has no territorial admin — Super Admin owns it.
  const adminFilter = {};
  if (level === 'PROVINCE') {
    adminFilter.roles = 'PROVINCE_ADMIN';
    adminFilter['scope.provinceId'] = unitId;
  } else if (level === 'DISTRICT') {
    adminFilter.roles = 'DISTRICT_ADMIN';
    adminFilter['scope.districtId'] = unitId;
  } else if (level === 'AREA') {
    adminFilter.roles = 'AREA_ADMIN';
    adminFilter['scope.areaId'] = unitId;
  }
  let adminEntries = [];
  if (Object.keys(adminFilter).length) {
    const admins = await User.find(adminFilter).lean();
    adminEntries = admins.map((u) => ({
      entityType: 'ADMIN',
      _id: u._id,
      userId: u._id,
      fullName: u.fullName,
      username: u.username,
      email: u.email,
      cnic: u.cnic,
      roles: u.roles,
      isActive: u.isActive,
      userIsActive: u.isActive,
      lastLoginAt: u.lastLoginAt,
    }));
  }

  ok(res, [...adminEntries, ...Array.from(byMember.values())]);
});
