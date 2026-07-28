const asyncHandler = require('express-async-handler');
const FundTransfer = require('../models/FundTransfer');
const Area = require('../models/Area');
const District = require('../models/District');
const Province = require('../models/Province');
const { ok, created, ApiError } = require('../utils/response');
const { canManageFinance, canApprove, resolveUnitChain } = require('../utils/unitScope');
const policyEngine = require('../services/policyEngine');
const workflowEngine = require('../services/workflowEngine');

// SRS §9.3 — upward-only routing.
const PARENT_LEVEL = {
  BASIC_UNIT: 'AREA',
  AREA: 'DISTRICT',
  DISTRICT: 'PROVINCE',
  PROVINCE: 'CENTRAL',
};

async function destinationFor(sourceLevel, sourceChain) {
  const dl = PARENT_LEVEL[sourceLevel];
  if (dl === 'AREA') return { destinationLevel: dl, destinationUnitId: sourceChain.areaId };
  if (dl === 'DISTRICT') return { destinationLevel: dl, destinationUnitId: sourceChain.districtId };
  if (dl === 'PROVINCE') return { destinationLevel: dl, destinationUnitId: sourceChain.provinceId };
  if (dl === 'CENTRAL') {
    // Province → Central: receiver is the Central singleton. Use its
    // _id as destinationUnitId so the Central Finance Secretary's
    // RoleAssignment matches the gate below.
    const { ensureCentralSingleton } = require('../utils/centralUnit');
    const c = await ensureCentralSingleton();
    return { destinationLevel: dl, destinationUnitId: c._id };
  }
  return null;
}

// Approval gate for acknowledge / reject. Per product directive a
// transfer flows up exactly one level — Basic Unit → Area, Area →
// District, District → Province, Province → Central — and is approved
// by the Finance Secretary of THAT receiving unit (or a scope-
// bounded admin acting as override).
async function authorizeAck(user, transfer) {
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Login required');
  const roles = user.roles || [];

  // Global / oversight admins
  if (roles.includes('SUPER_ADMIN')) return;

  // Territorial admins — must own the destination unit
  if (roles.includes('PROVINCE_ADMIN')) {
    if (transfer.destinationLevel === 'PROVINCE'
        && String(user.scope?.provinceId) === String(transfer.destinationUnitId)) return;
    throw new ApiError(403, 'OUT_OF_SCOPE',
      'You can only approve transfers destined for your own province');
  }
  if (roles.includes('DISTRICT_ADMIN')) {
    if (transfer.destinationLevel === 'DISTRICT'
        && String(user.scope?.districtId) === String(transfer.destinationUnitId)) return;
    throw new ApiError(403, 'OUT_OF_SCOPE',
      'You can only approve transfers destined for your own district');
  }
  if (roles.includes('AREA_ADMIN')) {
    if (transfer.destinationLevel === 'AREA'
        && String(user.scope?.areaId) === String(transfer.destinationUnitId)) return;
    throw new ApiError(403, 'OUT_OF_SCOPE',
      'You can only approve transfers destined for your own area');
  }

  // Finance Secretary OR Senior-Mawin-class operator at the EXACT
  // destination unit. Looked up via RoleAssignment because user.scope
  // reflects the member's registration BU, not the unit where they
  // hold the cabinet seat. SR_VICE_PRESIDENT plays the Senior-Mawin
  // role at PROVINCE, FIRST_SECRETARY at CENTRAL.
  const allowedDestRoles = ['FINANCE_SECRETARY', 'SENIOR_MAWIN', 'SR_VICE_PRESIDENT', 'FIRST_SECRETARY'];
  if (user.memberId && allowedDestRoles.some((r) => roles.includes(r))) {
    const RoleAssignment = require('../models/RoleAssignment');
    const active = await RoleAssignment.findOne({
      memberId: user.memberId,
      roleCode: { $in: allowedDestRoles },
      unitLevel: transfer.destinationLevel,
      unitId: transfer.destinationUnitId,
      state: 'APPROVED',
      endedAt: { $exists: false },
    }).lean();
    if (active) return;
  }

  throw new ApiError(403, 'FORBIDDEN',
    `Only the Finance Secretary or Senior Mawin of the destination ${transfer.destinationLevel} (or its admin) may decide on this transfer`);
}

exports.list = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, direction, state } = req.query;
  const filter = {};
  if (state) filter.state = state;

  if (unitLevel && unitId) {
    if (direction === 'incoming') {
      filter.destinationLevel = unitLevel;
      filter.destinationUnitId = unitId;
    } else if (direction === 'outgoing') {
      filter.sourceLevel = unitLevel;
      filter.sourceUnitId = unitId;
    } else {
      filter.$or = [
        { sourceLevel: unitLevel, sourceUnitId: unitId },
        { destinationLevel: unitLevel, destinationUnitId: unitId },
      ];
    }
  }

  const items = await FundTransfer.find(filter)
    .sort({ createdAt: -1 })
    .populate('initiatedBy', 'fullName')
    .populate('acknowledgedBy', 'fullName');
  ok(res, items);
});

exports.initiate = asyncHandler(async (req, res) => {
  if (!canManageFinance(req.user)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only Finance Secretary / Admin may initiate transfers');
  }
  const { sourceLevel, sourceUnitId, mode, reference, note } = req.body;
  // Multipart payload — amount comes through as a string from the form.
  const amount = parseFloat(req.body.amount);
  if (!PARENT_LEVEL[sourceLevel]) {
    throw new ApiError(400, 'INVALID_LEVEL', 'Cannot transfer from CENTRAL upward');
  }
  if (!amount || amount <= 0) throw new ApiError(400, 'VALIDATION_ERROR', 'amount must be positive');
  if (!req.file) {
    throw new ApiError(400, 'RECEIPT_REQUIRED',
      'Upload a receipt / proof-of-payment image — the receiving Finance Secretary must verify it before approving.');
  }

  // PR U3 — direction policy. Today every transfer is UP (PARENT_LEVEL
  // routing); the engine asserts that direction is in the policy's
  // allowedDirections list. The default seeded GLOBAL policy uses
  // ['UP'], so this is a no-op for the existing flow. Future PRs
  // can extend the controller to support DOWN/SAME_TIER once admin
  // explicitly opts in via the policy.
  const policy = await policyEngine.resolveFor(sourceLevel, sourceUnitId);
  policyEngine.assertTransferDirection('UP', policy);

  const chain = await resolveUnitChain(sourceLevel, sourceUnitId);
  if (!chain) throw new ApiError(400, 'INVALID_UNIT', 'Source unit not found');
  const dest = await destinationFor(sourceLevel, chain);

  const t = await FundTransfer.create({
    sourceLevel, sourceUnitId,
    ...dest,
    ...chain,
    amount, mode, reference, note,
    receiptImageUrl: `/uploads/${req.file.filename}`,
    initiatedBy: req.user._id,
  });
  created(res, t);
});

// PR F1 — workflow gate. authorizeAck already enforced unit-scope
// (must be Finance Sec / admin at destination unit). workflowEngine
// adds permission/role + multi-stage chain. Default single-stage
// TRANSFER_APPROVAL workflow uses APPROVE_EXPENSE, which the
// destination Finance Sec already has, so behavior is unchanged.
async function _runTransferWorkflow(t, user, decision, note) {
  const { stages, config } = await workflowEngine.resolveStages(
    'TRANSFER_APPROVAL', t.destinationLevel, { amount: t.amount },
  );
  if (!config || stages.length === 0) {
    return { finalState: decision, configId: null };
  }
  const stage = workflowEngine.nextPendingStage(t, stages);
  if (!stage) throw new ApiError(400, 'NO_PENDING_STAGE', 'No pending workflow stage to decide');
  workflowEngine.canDecideAt(stage, user);
  t.approvalChain = workflowEngine.recordDecision(t, stages, stage, user, decision, note);
  t.workflowConfigId = config._id;
  t.workflowVersion = config.configVersion;
  return {
    finalState: workflowEngine.computeFinalState(stages, t.approvalChain),
    configId: config._id,
  };
}

exports.acknowledge = asyncHandler(async (req, res) => {
  const t = await FundTransfer.findById(req.params.id);
  if (!t) throw new ApiError(404, 'NOT_FOUND', 'Transfer not found');
  if (t.state !== 'PENDING_ACK') {
    throw new ApiError(400, 'INVALID_STATE', `Cannot acknowledge in state ${t.state}`);
  }
  await authorizeAck(req.user, t);
  const wf = await _runTransferWorkflow(t, req.user, 'APPROVED', req.body.note);

  // Multi-stage in flight stays PENDING_ACK; only the final
  // APPROVED transition flips state to ACKNOWLEDGED.
  if (wf.finalState === 'APPROVED') {
    t.state = 'ACKNOWLEDGED';
    t.acknowledgedBy = req.user._id;
    t.acknowledgedAt = new Date();
  }
  // finalState === 'PENDING' (extra stages remain) leaves state alone.
  t.decisionNote = req.body.note;
  await t.save();
  ok(res, t);
});

exports.reject = asyncHandler(async (req, res) => {
  const t = await FundTransfer.findById(req.params.id);
  if (!t) throw new ApiError(404, 'NOT_FOUND', 'Transfer not found');
  if (t.state !== 'PENDING_ACK') {
    throw new ApiError(400, 'INVALID_STATE', `Cannot reject in state ${t.state}`);
  }
  await authorizeAck(req.user, t);
  // Rejection short-circuits the chain — computeFinalState returns
  // 'REJECTED' on any rejection.
  await _runTransferWorkflow(t, req.user, 'REJECTED', req.body.note);
  t.state = 'REJECTED';
  t.acknowledgedBy = req.user._id;
  t.acknowledgedAt = new Date();
  t.decisionNote = req.body.note;
  await t.save();
  ok(res, t);
});
