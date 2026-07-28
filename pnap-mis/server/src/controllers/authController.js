const asyncHandler = require('express-async-handler');
const User = require('../models/User');
const Member = require('../models/Member');
const RoleAssignment = require('../models/RoleAssignment');
const { ok, ApiError } = require('../utils/response');
const { signToken } = require('../middleware/auth');

const CNIC_RX = /^\d{5}-\d{7}-\d$/;

// Role derivation lives in utils/syncMemberRoles so the login path
// and the live re-sync (role approved / ended mid-session) share one
// source of truth and can never drift apart.
const { deriveMemberRoles } = require('../utils/syncMemberRoles');

// ---------------------------------------------------------------------------
// Login
// Accepts ONE OF:
//   { email, password }                — admin / officeholder path
//   { cnic, password }                  — citizen / member path
//   { identifier, password }            — auto-detect by format
// ---------------------------------------------------------------------------
// Decorate the User payload with the live permission set + a label
// map for every active role code + a per-role permissions map (used
// by the View As selector to narrow effective permissions to a
// single role). Server-side checks always re-resolve via
// userHasPermission so a stale client token can't escalate.
const { userPermissions } = require('../utils/permissions');
async function buildRoleMaps(userRoles) {
  const Role = require('../models/Role');
  // Pull labels for every active role (for global lookups) plus the
  // permission lists for the user's own roles (for View As filtering).
  const all = await Role.find({}).select('code label permissions isActive').lean();
  const labels = {};
  const userPerms = {};
  const userRoleSet = new Set(userRoles || []);
  for (const r of all) {
    labels[r.code] = r.label;
    if (userRoleSet.has(r.code)) {
      userPerms[r.code] = r.isActive !== false ? (r.permissions || []) : [];
    }
  }
  // SUPER_ADMIN — always grant the full catalogue server-side.
  if (userRoleSet.has('SUPER_ADMIN')) {
    const { PERMISSION_CODES } = require('../utils/permissions');
    userPerms.SUPER_ADMIN = PERMISSION_CODES.slice();
  }
  return { labels, userPerms };
}
async function shapeUser(user) {
  const obj = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  obj.permissions = userPermissions(user);
  const { labels, userPerms } = await buildRoleMaps(obj.roles);
  obj.roleLabels = labels;
  obj.rolePermissions = userPerms;
  return obj;
}

exports.login = asyncHandler(async (req, res) => {
  const id = (req.body.identifier || req.body.email || req.body.cnic || req.body.username || '').trim();
  const password = req.body.password;
  if (!id || !password) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Login ID and password required');
  }

  if (CNIC_RX.test(id)) return loginByCnic(id, password, res);
  if (id.includes('@')) return loginByEmail(id.toLowerCase(), password, res);
  return loginByUsername(id.toLowerCase(), password, res);
});

// Username-based login. First tries the admin User table (used by
// auto-provisioned area-admin accounts), then falls through to the
// Member table so registered members can sign in with the username
// derived from their first name.
async function loginByUsername(username, password, res) {
  const user = await User.findOne({ username });
  if (user && user.isActive && await user.verifyPassword(password)) {
    user.lastLoginAt = new Date();
    await user.save();
    return ok(res, { token: signToken(user), user: await shapeUser(user) });
  }
  // Fall through to Member by username
  const member = await Member.findOne({ username }).select('+passwordHash');
  if (member) return _finishMemberLogin(member, password, res);
  throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
}

async function loginByEmail(email, password, res) {
  const user = await User.findOne({ email });
  if (user && user.isActive && await user.verifyPassword(password)) {
    user.lastLoginAt = new Date();
    await user.save();
    return ok(res, { token: signToken(user), user: await shapeUser(user) });
  }
  // Fall through to Member by email (sparse-indexed, lowercased)
  const member = await Member.findOne({ email }).select('+passwordHash');
  if (member) return _finishMemberLogin(member, password, res);
  throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
}

async function loginByCnic(cnic, password, res) {
  // Lazy-load the password (model has select: false for safety).
  const member = await Member.findOne({ cnic }).select('+passwordHash');
  if (!member) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
  }
  return _finishMemberLogin(member, password, res);
}

// Shared member-login tail. Verifies password + status, derives
// system roles from active cabinet assignments, lazy-creates the
// linked User record, signs a token. Called from all three login
// branches (CNIC / email / username) once a Member is resolved.
async function _finishMemberLogin(member, password, res) {
  if (member.status !== 'ACTIVE') {
    throw new ApiError(403, 'NOT_APPROVED',
      'Your application is not yet approved. Please check status with your local Secretary.');
  }
  // Member may have been loaded without +passwordHash (e.g. via the
  // username/email branches). Reload with the hash before verifying.
  if (!member.passwordHash) {
    member = await Member.findById(member._id).select('+passwordHash');
    if (!member) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
  }
  const matched = await member.verifyPassword(password);
  if (!matched) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
  }

  // Derive the system roles from the member's currently-active
  // cabinet assignments. Always includes MEMBER for the base portal.
  const roles = await deriveMemberRoles(member._id);

  // Find or auto-create the linked User record. Sync roles + scope
  // so permission checks and dashboards use the latest values.
  let user = await User.findOne({ cnic: member.cnic });
  if (!user) {
    user = new User({
      cnic: member.cnic,
      fullName: member.fullName,
      memberId: member._id,
      roles,
      isActive: true,
      scope: {
        basicUnitId: member.basicUnitId,
        areaId: member.areaId,
        districtId: member.districtId,
        provinceId: member.provinceId,
      },
    });
  } else {
    user.fullName = member.fullName;
    user.memberId = member._id;
    user.roles = roles;
    user.scope = {
      basicUnitId: member.basicUnitId,
      areaId: member.areaId,
      districtId: member.districtId,
      provinceId: member.provinceId,
    };
    user.isActive = true;
  }
  user.lastLoginAt = new Date();
  await user.save();

  return ok(res, { token: signToken(user), user: await shapeUser(user) });
}

exports.me = asyncHandler(async (req, res) => {
  ok(res, await shapeUser(req.user));
});
