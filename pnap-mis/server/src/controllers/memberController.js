const asyncHandler = require('express-async-handler');
const Member = require('../models/Member');
const BasicUnit = require('../models/BasicUnit');
const { ok, created, ApiError } = require('../utils/response');
const { generateMemberId } = require('../utils/memberId');
const { canApproveMember, memberWithinAreaAdminScope } = require('../utils/unitScope');
const workflowEngine = require('../services/workflowEngine');
const activityService = require('../services/activityService');

// Member records already carry their denormalized hierarchy, so every
// activity hook in this file can hand the chain straight over instead
// of making activityService resolve it again.
function chainOf(member) {
  return {
    basicUnitId: member.basicUnitId,
    areaId: member.areaId,
    districtId: member.districtId,
    provinceId: member.provinceId,
  };
}

// PR F1 — shared workflow decide helper. Runs alongside the bespoke
// authorize* check on each controller: bespoke handles unit/scope
// authorization, this helper handles permission/role + multi-stage
// chain. With the default single-stage workflow this returns
// finalState === decision and the chain has one entry, so the
// caller's existing state-transition logic still fires unchanged.
//
// Returns { finalState, chain, configId, configVersion }.
//   finalState is one of 'APPROVED' | 'REJECTED' | 'PENDING'
//   PENDING means a stage was decided but more stages remain.
async function _runWorkflow(domain, tierCode, record, user, decision, note, payloadExtra = {}) {
  const { config, stages } = await workflowEngine.resolveStages(domain, tierCode, payloadExtra);
  if (!config || stages.length === 0) {
    // No workflow configured — fall through. Caller uses their
    // legacy single-call decide path.
    return { finalState: decision, chain: record.approvalChain || [], configId: null };
  }
  const stage = workflowEngine.nextPendingStage(record, stages);
  if (!stage) {
    throw new ApiError(400, 'NO_PENDING_STAGE', 'No pending workflow stage to decide');
  }
  workflowEngine.canDecideAt(stage, user); // throws on permission/role miss
  const chain = workflowEngine.recordDecision(record, stages, stage, user, decision, note);
  const finalState = workflowEngine.computeFinalState(stages, chain);
  return { finalState, chain, configId: config._id, configVersion: config.configVersion };
}

// Centralized check used by approve / reject / setStatus. SUPER_ADMIN
// is intentionally NOT in the allowed list — member approval is
// delegated to area-and-above admins per product policy.
function authorizeMemberDecision(user, member) {
  if (!canApproveMember(user)) {
    throw new ApiError(403, 'FORBIDDEN', 'Your role cannot decide on members');
  }
  if (!memberWithinAreaAdminScope(user, member)) {
    throw new ApiError(403, 'OUT_OF_SCOPE',
      'This member is not in your area. Only the matching Area Admin can decide.');
  }
}

exports.create = asyncHandler(async (req, res) => {
  // Permission-gated. Built-in admin / cabinet roles get this on seed
  // via DEFAULT_PERMISSIONS; custom roles require Super Admin to tick
  // REGISTER_MEMBER on the role's permission editor.
  const { userHasPermission } = require('../utils/permissions');
  if (!userHasPermission(req.user, 'REGISTER_MEMBER')) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to register new members');
  }

  const data = req.body;
  const unit = await BasicUnit.findById(data.basicUnitId);
  if (!unit || !unit.isActive) {
    throw new ApiError(400, 'INVALID_UNIT', 'Basic Unit not found or inactive');
  }

  const exists = await Member.findOne({ cnic: data.cnic });
  if (exists) {
    throw new ApiError(409, 'DUPLICATE_CNIC', 'A member with this CNIC already exists');
  }

  // One membership per mobile number (normalized: +92/0 prefixes and
  // separators are equivalent).
  const { findMemberByPhone } = require('../utils/phoneDup');
  const dupPhone = await findMemberByPhone(data.phone);
  if (dupPhone) {
    throw new ApiError(409, 'DUPLICATE_PHONE', 'A member with this mobile number already exists');
  }

  // One membership per email address (only checked when one is given —
  // the field is optional).
  const { findMemberByEmail } = require('../utils/emailDup');
  const dupEmail = await findMemberByEmail(data.email);
  if (dupEmail) {
    throw new ApiError(409, 'DUPLICATE_EMAIL', 'A member with this email address already exists');
  }

  const photoUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

  const member = await Member.create({
    ...data,
    photoUrl,
    areaId: unit.areaId,
    districtId: unit.districtId,
    provinceId: unit.provinceId,
    submittedBy: req.user._id,
    submittedVia: 'WEB',
    status: 'PENDING_APPROVAL',
  });

  // Member Registration — credited to the officer who filed it, not
  // to the applicant (who has done no organizational work yet and is
  // not even approved).
  activityService.record({
    action: 'MEMBER_REGISTERED',
    req,
    chain: chainOf(member),
    unitLevel: 'BASIC_UNIT',
    unitId: member.basicUnitId,
    targetType: 'Member',
    targetId: member._id,
    targetLabel: member.fullName,
  }).catch(() => {});

  created(res, member);
});

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, q, status, basicUnitId, areaId, districtId, provinceId, scope } = req.query;

  const filter = {};
  if (status) filter.status = status;
  if (basicUnitId) filter.basicUnitId = basicUnitId;
  if (areaId) filter.areaId = areaId;
  if (districtId) filter.districtId = districtId;
  if (provinceId) filter.provinceId = provinceId;

  // Server-side scope clamp: an Area Admin (without a higher admin
  // role) can only ever see members in their own area, regardless
  // of what the request asked for. Same for District / Province
  // scoped admins. Higher admins (Super / Central) see everything.
  //
  // basicUnitId is the last resort rather than the first: every
  // member-provisioned login carries its whole chain in scope (see
  // authController), so clamping on the narrowest key would pin a
  // Province office-holder to their home Basic Unit. The branch
  // exists so an account provisioned with ONLY a basic unit — which
  // previously fell through with no clamp at all — stays inside it.
  const u = req.user;
  // Super and Central are the two unbounded tiers (see
  // utils/adminHierarchy.GLOBAL_TIERS) — Central Admin is responsible
  // for every province, so a territorial clamp would blind it.
  const isSuper = require('../utils/adminHierarchy').isGlobalAdmin(u);
  let clamped = false;
  if (!isSuper) {
    if (u.scope?.areaId) { filter.areaId = u.scope.areaId; clamped = true; }
    else if (u.scope?.districtId) { filter.districtId = u.scope.districtId; clamped = true; }
    else if (u.scope?.provinceId) { filter.provinceId = u.scope.provinceId; clamped = true; }
    else if (u.scope?.basicUnitId) { filter.basicUnitId = u.scope.basicUnitId; clamped = true; }
  }

  // Breadth has to be deliberate. Without this, a caller who has no
  // territorial clamp (Super Admin, or any account with an empty
  // scope) and who forgets a unit filter walks away with the entire
  // membership — which is exactly how the meetings page leaked every
  // member in the system at CENTRAL level. A search term counts as a
  // filter; it is inherently narrow.
  const hasUnitFilter = !!(basicUnitId || areaId || districtId || provinceId);
  if (!hasUnitFilter && !q && !clamped && !(scope === 'all' && isSuper)) {
    throw new ApiError(
      400,
      'UNSCOPED_QUERY',
      'Member queries must be scoped: pass a unit filter (basicUnitId / areaId / districtId / provinceId) or a search term.',
    );
  }
  if (q) {
    filter.$or = [
      { fullName: { $regex: q, $options: 'i' } },
      { cnic: { $regex: q, $options: 'i' } },
      { phone: { $regex: q, $options: 'i' } },
      { memberId: { $regex: q, $options: 'i' } },
    ];
  }

  const [items, total] = await Promise.all([
    Member.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('basicUnitId', 'name')
      .populate('areaId', 'name')
      .populate('districtId', 'name')
      .populate('provinceId', 'name code'),
    Member.countDocuments(filter),
  ]);

  ok(res, items, { page, limit, total, totalPages: Math.ceil(total / limit) });
});

exports.getOne = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.params.id)
    .populate('basicUnitId', 'name')
    .populate('areaId', 'name')
    .populate('districtId', 'name')
    .populate('provinceId', 'name code')
    .populate('submittedBy', 'fullName email')
    .populate('approvedBy', 'fullName email')
    .populate('rejectedBy', 'fullName email');
  if (!member) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
  ok(res, member);
});

exports.update = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.params.id);
  if (!member) throw new ApiError(404, 'NOT_FOUND', 'Member not found');

  // Authorization: a member may edit ONLY their own record. Admins
  // (Super / National / PNAP / Province / District / Area) may edit
  // anyone within their territorial scope.
  const u = req.user;
  const isOwner = u?.memberId && String(u.memberId) === String(member._id);
  const isAnyAdmin = u?.roles?.some((r) => [
    'SUPER_ADMIN', 'CENTRAL_ADMIN',
    'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN',
  ].includes(r));
  if (!isOwner && !isAnyAdmin) {
    throw new ApiError(403, 'FORBIDDEN', 'You can only edit your own profile');
  }
  if (isAnyAdmin && !isOwner && !memberWithinAreaAdminScope(u, member)) {
    throw new ApiError(403, 'OUT_OF_SCOPE', 'This member is not in your scope');
  }

  if (member.status === 'ACTIVE') {
    const locked = ['cnic', 'fullName', 'fatherOrHusbandName', 'basicUnitId'];
    for (const k of locked) {
      if (k in req.body) throw new ApiError(403, 'LOCKED_FIELD', `Field ${k} cannot be self-updated for active members`);
    }
  }

  // Identity fields stay unique when edited.
  if (req.body.cnic && req.body.cnic !== member.cnic) {
    const dup = await Member.findOne({ cnic: req.body.cnic, _id: { $ne: member._id } });
    if (dup) throw new ApiError(409, 'DUPLICATE_CNIC', 'A member with this CNIC already exists');
  }
  if (req.body.phone) {
    const { findMemberByPhone } = require('../utils/phoneDup');
    const dupPhone = await findMemberByPhone(req.body.phone, member._id);
    if (dupPhone) throw new ApiError(409, 'DUPLICATE_PHONE', 'A member with this mobile number already exists');
  }
  if (req.body.email) {
    const { findMemberByEmail } = require('../utils/emailDup');
    const dupEmail = await findMemberByEmail(req.body.email, member._id);
    if (dupEmail) throw new ApiError(409, 'DUPLICATE_EMAIL', 'A member with this email address already exists');
  }

  Object.assign(member, req.body);
  if (req.file) member.photoUrl = `/uploads/${req.file.filename}`;
  await member.save();

  // Member Update. Both branches are real organizational work: a
  // member curating their own record, or an officer maintaining the
  // roster — so credit whoever actually made the edit.
  activityService.record({
    action: 'MEMBER_UPDATED',
    req,
    chain: chainOf(member),
    unitLevel: 'BASIC_UNIT',
    unitId: member.basicUnitId,
    targetType: 'Member',
    targetId: member._id,
    targetLabel: member.fullName,
  }).catch(() => {});

  ok(res, member);
});

// PR F1 — member approval now consults workflowEngine alongside the
// bespoke authorizeMemberDecision check. With the default seeded
// single-stage MEMBER_APPROVAL workflow (one stage requiring
// APPROVE_MEMBER), behavior is identical to the legacy gate:
// one call → ACTIVE | REJECTED. Multi-stage chains stay in
// PENDING_APPROVAL until all APPLIES stages decide.
exports.approve = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.params.id);
  if (!member) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
  authorizeMemberDecision(req.user, member);
  if (member.status !== 'PENDING_APPROVAL') {
    throw new ApiError(400, 'INVALID_STATE', `Cannot approve member in status ${member.status}`);
  }

  // Member tier is BASIC_UNIT (members are rostered at BU). Engine
  // resolves TIER override → GLOBAL fallback against that.
  const wf = await _runWorkflow('MEMBER_APPROVAL', 'BASIC_UNIT', member, req.user, 'APPROVED', req.body.note);
  if (wf.chain.length) {
    member.approvalChain = wf.chain;
    member.workflowConfigId = wf.configId;
    member.workflowVersion = wf.configVersion;
  }

  if (wf.finalState === 'APPROVED') {
    member.memberId = await generateMemberId(member);
    member.status = 'ACTIVE';
    member.approvedBy = req.user._id;
    member.approvedAt = new Date();
  }
  // finalState === 'PENDING' (multi-stage in flight) leaves
  // status=PENDING_APPROVAL untouched; the next approver continues.
  await member.save();

  // Notify only on final transition.
  if (wf.finalState === 'APPROVED') {
    const { notify, userIdForMember } = require('../utils/notify');
    // Awaited, not fire-and-forget. A newly approved member has never
    // logged in, so userIdForMember has to provision their User row
    // before the notification can be addressed to anything. Detaching
    // this raced the response and, worse, resolved to null every time —
    // which notify() drops in silence.
    const notifyUserId = await userIdForMember(member._id);
    await notify(notifyUserId, {
      type: 'MEMBER_APPROVED',
      severity: 'SUCCESS',
      title: 'Your membership was approved',
      body: `Welcome, ${member.fullName}. Your member ID is ${member.memberId}.`,
      link: `/members/${member._id}`,
    });

    // Approval is the moment the member gains a real login identity, so
    // it is also the moment their email is worth confirming — a
    // confirmed address is what lets them recover the account later
    // without an administrator resetting it by hand.
    //
    // Fire-and-forget, like the notification above: an SMTP outage must
    // not fail an approval, and the member can always request a fresh
    // link from /resend-verification.
    if (member.email) {
      require('../services/verificationService')
        .requestVerification(member.email)
        .catch(() => {});
    }
  }

  // Member Approval — deciding on an application is organizational
  // work regardless of whether it was the final stage of a multi-stage
  // workflow, so this fires on every decision, not only the last one.
  activityService.record({
    action: 'MEMBER_APPROVED',
    req,
    chain: chainOf(member),
    unitLevel: 'BASIC_UNIT',
    unitId: member.basicUnitId,
    targetType: 'Member',
    targetId: member._id,
    targetLabel: member.fullName,
  }).catch(() => {});

  ok(res, member);
});

exports.reject = asyncHandler(async (req, res) => {
  const member = await Member.findById(req.params.id);
  if (!member) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
  authorizeMemberDecision(req.user, member);
  if (member.status !== 'PENDING_APPROVAL') {
    throw new ApiError(400, 'INVALID_STATE', `Cannot reject member in status ${member.status}`);
  }

  // Rejection short-circuits the chain — workflowEngine
  // computeFinalState() returns 'REJECTED' on any rejection.
  const wf = await _runWorkflow('MEMBER_APPROVAL', 'BASIC_UNIT', member, req.user, 'REJECTED', req.body.reason);
  if (wf.chain.length) {
    member.approvalChain = wf.chain;
    member.workflowConfigId = wf.configId;
    member.workflowVersion = wf.configVersion;
  }

  member.status = 'REJECTED';
  member.statusReason = req.body.reason;
  member.rejectedBy = req.user._id;
  member.rejectedAt = new Date();
  await member.save();

  const { notify, userIdForMember } = require('../utils/notify');
  notify(await userIdForMember(member._id), {
    type: 'MEMBER_REJECTED',
    severity: 'WARNING',
    title: 'Your membership application was not approved',
    body: req.body.reason ? `Reason: ${req.body.reason}` : undefined,
    link: `/members/${member._id}`,
  }).catch(() => {});

  ok(res, member);
});

exports.setStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;
  if (!Member.STATUSES.includes(status)) {
    throw new ApiError(400, 'INVALID_STATUS', 'Invalid status value');
  }
  const member = await Member.findById(req.params.id);
  if (!member) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
  authorizeMemberDecision(req.user, member);
  member.status = status;
  member.statusReason = reason;
  await member.save();
  ok(res, member);
});

exports.stats = asyncHandler(async (req, res) => {
  // Same territorial clamp as list(): only SUPER_ADMIN sees the
  // system-wide numbers; every scoped user gets counts for their
  // own subtree. Without this, any authenticated user could read
  // global membership statistics.
  const u = req.user;
  const match = {};
  const isHigher = require('../utils/adminHierarchy').isGlobalAdmin(u);
  if (!isHigher) {
    if (u.scope?.areaId) match.areaId = u.scope.areaId;
    else if (u.scope?.districtId) match.districtId = u.scope.districtId;
    else if (u.scope?.provinceId) match.provinceId = u.scope.provinceId;
  }
  const grouped = await Member.aggregate([
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(Member.STATUSES.map((s) => [s, 0]));
  for (const g of grouped) counts[g._id] = g.count;
  ok(res, counts);
});

// ─── Super Admin god-mode actions ──────────────────────────────────
const RoleAssignment = require('../models/RoleAssignment');
const User = require('../models/User');
const { audit } = require('../utils/audit');

function requireSuper(req) {
  if (!req.user?.roles?.includes('SUPER_ADMIN')) {
    throw new ApiError(403, 'FORBIDDEN', 'Only Super Admin can perform this action');
  }
}

exports.adminEdit = asyncHandler(async (req, res) => {
  requireSuper(req);
  const member = await Member.findById(req.params.id);
  if (!member) throw new ApiError(404, 'NOT_FOUND', 'Member not found');

  const before = {
    fullName: member.fullName, fatherOrHusbandName: member.fatherOrHusbandName,
    cnic: member.cnic, phone: member.phone, gender: member.gender,
    bloodGroup: member.bloodGroup, address: member.address,
    basicUnitId: member.basicUnitId, status: member.status,
  };

  // God-mode edits still respect identity uniqueness.
  if (req.body.cnic && req.body.cnic !== member.cnic) {
    const dup = await Member.findOne({ cnic: req.body.cnic, _id: { $ne: member._id } });
    if (dup) throw new ApiError(409, 'DUPLICATE_CNIC', 'A member with this CNIC already exists');
  }
  if (req.body.phone) {
    const { findMemberByPhone } = require('../utils/phoneDup');
    const dupPhone = await findMemberByPhone(req.body.phone, member._id);
    if (dupPhone) throw new ApiError(409, 'DUPLICATE_PHONE', 'A member with this mobile number already exists');
  }

  const editable = [
    'fullName', 'fatherOrHusbandName', 'cnic', 'phone', 'gender',
    'bloodGroup', 'address', 'photoUrl', 'status',
  ];
  for (const k of editable) {
    if (k in req.body) member[k] = req.body[k];
  }
  if (req.body.basicUnitId) {
    const u = await BasicUnit.findById(req.body.basicUnitId).lean();
    if (!u) throw new ApiError(400, 'INVALID_UNIT', 'Basic Unit not found');
    member.basicUnitId = u._id;
    member.areaId = u.areaId;
    member.districtId = u.districtId;
    member.provinceId = u.provinceId;
  }
  await member.save();

  await audit({
    req, action: 'MEMBER_ADMIN_EDIT',
    targetType: 'Member', targetId: member._id, targetLabel: member.fullName,
    before,
    after: {
      fullName: member.fullName, fatherOrHusbandName: member.fatherOrHusbandName,
      cnic: member.cnic, phone: member.phone, gender: member.gender,
      bloodGroup: member.bloodGroup, address: member.address,
      basicUnitId: member.basicUnitId, status: member.status,
    },
  });

  ok(res, member);
});

exports.adminResetPassword = asyncHandler(async (req, res) => {
  requireSuper(req);
  const member = await Member.findById(req.params.id).select('+passwordHash');
  if (!member) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
  const newPassword = String(req.body?.newPassword || '');
  if (newPassword.length < 6) {
    throw new ApiError(400, 'WEAK_PASSWORD', 'Password must be at least 6 characters');
  }

  // Writing Member.passwordHash alone is right for the CNIC login, but
  // if this member also holds an admin User row WITH its own password,
  // loginByUsername / loginByEmail check that row first — so the old
  // password would survive on those paths. applyNewPassword writes
  // every store the account can actually be verified against.
  const accountService = require('../services/accountService');
  const account = await accountService.accountForUser(
    await require('../models/User').findOne({ cnic: member.cnic })
  );
  if (account?.user) {
    await accountService.applyNewPassword({ user: account.user, member }, newPassword);
    await account.user.save();
  } else {
    await member.setPassword(newPassword);
    await member.save();
  }

  await audit({
    req, action: 'MEMBER_RESET_PASSWORD',
    targetType: 'Member', targetId: member._id, targetLabel: member.fullName,
    note: 'CNIC-login password set by Super Admin',
  });

  ok(res, { ok: true });
});

exports.adminRemove = asyncHandler(async (req, res) => {
  requireSuper(req);
  const member = await Member.findById(req.params.id);
  if (!member) throw new ApiError(404, 'NOT_FOUND', 'Member not found');

  const wasStatus = member.status;
  // Use 'EXPELLED' (defined in Member.STATUSES) to soft-delete.
  // Hard delete is intentionally avoided so audit + foreign-key
  // references (donations, attendance) remain intact.
  member.status = 'EXPELLED';
  member.statusReason = req.body?.reason || 'Removed by Super Admin';
  await member.save();

  // Cascade: end every active role assignment held by this member
  // and deactivate the linked User row so they can't log in.
  const ended = await RoleAssignment.updateMany(
    { memberId: member._id, state: 'APPROVED', endedAt: { $exists: false } },
    { $set: { state: 'ENDED', endedAt: new Date(), endReason: 'EXPELLED', decisionNote: 'Cascaded from member removal' } }
  );
  const userDeactivated = await User.updateOne(
    { memberId: member._id },
    { $set: { isActive: false } }
  );

  await audit({
    req, action: 'MEMBER_REMOVE',
    targetType: 'Member', targetId: member._id, targetLabel: member.fullName,
    before: { status: wasStatus },
    after: { status: 'EXPELLED', cascadedRoles: ended.modifiedCount, userDeactivated: !!userDeactivated.modifiedCount },
    note: req.body?.reason,
  });

  ok(res, { ok: true, cascadedRoles: ended.modifiedCount, userDeactivated: !!userDeactivated.modifiedCount });
});
