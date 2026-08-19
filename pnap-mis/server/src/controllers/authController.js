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
  return loginByBootstrapUsername(id.toLowerCase(), password, res);
});

// Username login has been withdrawn: accounts sign in with a CNIC or an
// email address, and nothing else.
//
// ONE exception survives, and it is not a convenience. The bootstrap
// Super Admin carries no email and no CNIC — it has no mailbox to
// recover to, and utils/superAdmin flags it isBootstrap precisely so
// that accountService excludes it from BOTH password reset and email
// verification. Without a username route that account would have no way
// to sign in at all and no way to regain one, which would leave the
// organization locked out of its own root account.
//
// The `isBootstrap: true` clause is part of the QUERY rather than a
// check afterwards: any other account that happens to match by username
// fails identically to a wrong password, so this cannot be used to
// discover which usernames exist.
async function loginByBootstrapUsername(username, password, res) {
  const user = await User.findOne({ username, isBootstrap: true });
  if (user && user.isActive && await user.verifyPassword(password)) {
    user.lastLoginAt = new Date();
    await user.save();
    return ok(res, { token: signToken(user), user: await shapeUser(user) });
  }
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
// linked User record, signs a token. Called from both member-capable
// login branches (CNIC / email) once a Member is resolved — the
// bootstrap-username branch never reaches a Member.
async function _finishMemberLogin(member, password, res) {
  if (member.status !== 'ACTIVE') {
    throw new ApiError(403, 'NOT_APPROVED',
      'Your application is not yet approved. Please check status with your local Secretary.');
  }
  // Member may have been loaded without +passwordHash (e.g. via the
  // email branch). Reload with the hash before verifying.
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

// ---------------------------------------------------------------------------
// Account security — email verification + forgot/reset password
// ---------------------------------------------------------------------------
// Appended below the login path, which is untouched. These handlers are
// thin: every decision lives in services/verificationService and
// services/passwordResetService, and the rule about WHERE a password is
// actually stored lives in services/accountService.
//
// The two "request" endpoints answer identically no matter what the
// server found, and they answer WITHOUT awaiting the lookup or the mail
// send. That is not laziness — awaiting would make a hit measurably
// slower than a miss and turn the response time into an account-
// existence oracle, which is the exact leak the identical body is there
// to prevent.
const verificationService = require('../services/verificationService');
const resetService = require('../services/passwordResetService');

const GENERIC_SENT =
  'If an account matches that information, we have sent an email with further instructions.';

function detach(promise, label) {
  promise
    .then((outcome) => {
      if (outcome !== 'SENT') console.log(`[auth] ${label}: ${outcome}`);
    })
    .catch((err) => console.error(`[auth] ${label} failed: ${err.stack || err.message}`));
}

// POST /auth/forgot-password  { identifier }
exports.forgotPassword = asyncHandler(async (req, res) => {
  const identifier = String(req.body.identifier || req.body.email || '').trim();
  if (!identifier) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Enter your email or CNIC.');
  }
  detach(resetService.requestReset(identifier), 'forgot-password');
  return res.status(202).json({ success: true, data: { message: GENERIC_SENT } });
});

// POST /auth/resend-verification  { identifier }
exports.resendVerification = asyncHandler(async (req, res) => {
  const identifier = String(req.body.identifier || req.body.email || '').trim();
  if (!identifier) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Enter your email or CNIC.');
  }
  detach(verificationService.requestVerification(identifier), 'resend-verification');
  return res.status(202).json({ success: true, data: { message: GENERIC_SENT } });
});

// GET /auth/verify-email/:token
exports.verifyEmail = asyncHandler(async (req, res) => {
  const result = await verificationService.confirmVerification(req.params.token);
  if (!result.ok) {
    throw new ApiError(
      400,
      result.code,
      result.code === 'TOKEN_EXPIRED'
        ? 'This verification link has expired. Request a new one.'
        : 'This verification link is not valid. Request a new one.'
    );
  }
  return ok(res, { verified: true, alreadyVerified: result.alreadyVerified });
});

// GET /auth/reset-password/:token — check a link before showing the form.
exports.checkResetToken = asyncHandler(async (req, res) => {
  const result = await resetService.inspectToken(req.params.token);
  if (!result.ok) {
    throw new ApiError(
      400,
      result.code,
      result.code === 'TOKEN_EXPIRED'
        ? 'This reset link has expired. Request a new one.'
        : 'This reset link is not valid. Request a new one.'
    );
  }
  return ok(res, { valid: true, fullName: result.fullName });
});

// POST /auth/reset-password  { token, password, confirmPassword }
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token, password, confirmPassword } = req.body;
  const result = await resetService.confirmReset(token, password, confirmPassword);
  if (!result.ok) {
    const message =
      result.message ||
      (result.code === 'TOKEN_EXPIRED'
        ? 'This reset link has expired. Request a new one.'
        : 'This reset link is not valid. Request a new one.');
    throw new ApiError(400, result.code, message);
  }
  return ok(res, { reset: true, message: 'Your password has been updated. You can now sign in.' });
});
