const asyncHandler = require('express-async-handler');
const FundTransfer = require('../models/FundTransfer');
const Area = require('../models/Area');
const District = require('../models/District');
const Province = require('../models/Province');
const { ok, created, ApiError } = require('../utils/response');
const { canManageFinance, resolveUnitChain } = require('../utils/unitScope');
const policyEngine = require('../services/policyEngine');
const workflowEngine = require('../services/workflowEngine');
const activityService = require('../services/activityService');
// Destination rule lives in utils/transferRouting so the preview
// endpoint below and the create path share one implementation of what
// counts as a legal recipient.
const { resolveDestination } = require('../utils/transferRouting');

// Approval gate for acknowledge / reject. Under the revised finance
// policy the sender names the recipient outright, and THAT unit is the
// sole approver — no unit between the two has any say, in either
// direction. This gate was already expressed purely in terms of the
// stored destination rather than any notion of "parent", so it carries
// over unchanged: the decider must be the Finance Secretary of the
// destination unit itself (or a scope-bounded admin acting as
// override).
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

// SRS §3.1 body separation — identical fragment to
// financeController.bodyClause / activityController.list. The
// EXECUTIVE branch matches `$exists: false` so transfers written
// before the field existed keep showing under Executive. Returns null
// when `body` is omitted (pooled view — today's behavior).
function bodyClause(body) {
  if (body === 'EXECUTIVE' || body === 'NON_COMMITTEE') return { $or: [{ body: 'EXECUTIVE' }, { body: { $exists: false } }, { body: null }] };
  if (body === 'COMMITTEE') return { body: 'COMMITTEE' };
  return null;
}

exports.list = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, direction, state, body } = req.query;
  const filter = {};
  if (state) filter.state = state;

  // Merged per-clause below rather than once at the top: the
  // no-direction branch already owns `filter.$or` for the
  // source/destination union, and the EXECUTIVE fragment carries its
  // own `$or`. Nesting it inside each union arm keeps both intact.
  const bc = bodyClause(body);

  if (unitLevel && unitId) {
    if (direction === 'incoming') {
      filter.destinationLevel = unitLevel;
      filter.destinationUnitId = unitId;
      if (bc) Object.assign(filter, bc);
    } else if (direction === 'outgoing') {
      filter.sourceLevel = unitLevel;
      filter.sourceUnitId = unitId;
      if (bc) Object.assign(filter, bc);
    } else {
      filter.$or = [
        { sourceLevel: unitLevel, sourceUnitId: unitId, ...(bc || {}) },
        { destinationLevel: unitLevel, destinationUnitId: unitId, ...(bc || {}) },
      ];
    }
  } else if (bc) {
    Object.assign(filter, bc);
  }

  const items = await FundTransfer.find(filter)
    .sort({ createdAt: -1 })
    .populate('initiatedBy', 'fullName')
    .populate('acknowledgedBy', 'fullName');
  ok(res, items);
});

// GET /api/transfers/destination-preview?sourceLevel=&sourceUnitId=&destinationId=
//
// Authoritative echo of a destination the sender picked in the tree:
// the resolved unit, its full hierarchy, and which way the funds
// move. Runs the same resolveDestination the create path runs, so if
// this returns 200 the transfer will be accepted, and if it 400s the
// UI can show exactly why before the sender fills in an amount.
//
// Advisory to the client, authoritative in effect: create re-resolves
// the destination from scratch, so a client that skips this call, or
// edits its response, gains nothing.
exports.destinationPreview = asyncHandler(async (req, res) => {
  const { sourceLevel, sourceUnitId, destinationId } = req.query;
  if (!sourceLevel || !sourceUnitId) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'sourceLevel and sourceUnitId are required');
  }
  const { source, destination, path, direction } = await resolveDestination(
    sourceLevel, sourceUnitId, destinationId,
  );
  ok(res, { source, destination, path, direction });
});

exports.initiate = asyncHandler(async (req, res) => {
  if (!canManageFinance(req.user)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only Finance Secretary / Admin may initiate transfers');
  }
  const { sourceLevel, sourceUnitId, destinationId, mode, reference, note } = req.body;
  // SRS §3.1 — which body's books this movement belongs to. Same
  // coercion as activityController's `requestedBody`: anything that
  // isn't COMMITTEE is EXECUTIVE, so a caller that omits it gets
  // today's behavior. This route has no zod schema, so the value
  // arrives raw off the multipart form.
  const body = (req.body.body === 'COMMITTEE') ? 'COMMITTEE' : 'EXECUTIVE';
  // Multipart payload — amount comes through as a string from the form.
  const amount = parseFloat(req.body.amount);
  if (!amount || amount <= 0) throw new ApiError(400, 'VALIDATION_ERROR', 'amount must be positive');
  if (!req.file) {
    throw new ApiError(400, 'RECEIPT_REQUIRED',
      'Upload a receipt / proof-of-payment image — the receiving Finance Secretary must verify it before approving.');
  }

  // The only routing input accepted from the client is an opaque id.
  // resolveDestination looks up its tier AND its province in the
  // database, then throws a specific 400 for each way it can be
  // illegitimate — unknown id, deactivated unit, sender paying itself,
  // or a unit outside the sender's province when the sender is not a
  // Province. Nothing the client asserts about either endpoint is
  // believed; both are re-resolved from stored data.
  const { source, destination, direction } = await resolveDestination(
    sourceLevel, sourceUnitId, destinationId,
  );

  // PR U3 — direction policy. Transfers are no longer upward by
  // construction, so the real direction is computed from the two tiers
  // and asserted against UnitPolicy.transfer.allowedDirections. The
  // seeded GLOBAL policy now permits UP / DOWN / SAME_TIER to match
  // the revised business rule; an admin who narrows it still governs.
  const policy = await policyEngine.resolveFor(sourceLevel, sourceUnitId);
  policyEngine.assertTransferDirection(direction, policy);

  // Source-side hierarchy, denormalized for the §11 roll-ups. This is
  // the SENDER's chain and stays that way — the destination is no
  // longer guaranteed to sit anywhere near it.
  const chain = await resolveUnitChain(sourceLevel, sourceUnitId);
  if (!chain) throw new ApiError(400, 'INVALID_UNIT', 'Source unit not found');

  const t = await FundTransfer.create({
    sourceLevel,
    sourceUnitId,
    sourceName: source.name,
    destinationLevel: destination.level,
    destinationUnitId: destination.id,
    destinationName: destination.name,
    direction,
    ...chain,
    body,
    amount, mode, reference, note,
    receiptImageUrl: `/uploads/${req.file.filename}`,
    initiatedBy: req.user._id,
  });

  activityService.record({
    action: 'FUND_TRANSFER_INITIATED',
    req,
    chain,
    unitLevel: sourceLevel,
    unitId: sourceUnitId,
    targetType: 'FundTransfer',
    targetId: t._id,
    targetLabel: `${t.sourceName} → ${t.destinationName}`,
  }).catch(() => {});

  created(res, t);
});

// PR F1 — workflow gate. authorizeAck already enforced unit-scope
// (must be Finance Sec / admin at destination unit). workflowEngine
// adds permission/role + multi-stage chain, and the two are ANDed.
//
// The default single-stage TRANSFER_APPROVAL workflow requires
// MANAGE_FINANCE — held by every role authorizeAck admits except
// AREA_ADMIN. It originally required APPROVE_EXPENSE, which the
// destination Finance Secretary does NOT hold (that permission
// belongs to the Secretary, who approves the expenses the FS
// records); the mismatch made every incoming transfer un-acknowledgable
// by its named approver. See utils/seedWorkflowConfigs.
//
// The chain is resolved for the tier of the CHOSEN destination and no
// other, so a Basic Unit → Province transfer runs the PROVINCE-tier
// workflow (or GLOBAL if admin defined none for that tier), and a
// District → Basic Unit transfer runs the BASIC_UNIT one. Units the
// transfer passed over — in either direction — contribute no stages.
// One destination, one approver, which is exactly the revised policy:
// the engine was already keyed on destinationLevel, so it needed no
// change to express it.
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

  // Two distinct activities, matching the two things that can happen
  // here: clearing an intermediate workflow stage is an APPROVAL; the
  // final transition that moves the money is the ACKNOWLEDGEMENT.
  // Scoped to the DESTINATION unit — the sender's denormalized chain
  // on the record describes where the money came from, not where this
  // decision was taken.
  activityService.record({
    action: wf.finalState === 'APPROVED' ? 'FUND_TRANSFER_ACKNOWLEDGED' : 'FUND_TRANSFER_APPROVED',
    req,
    unitLevel: t.destinationLevel,
    unitId: t.destinationUnitId,
    targetType: 'FundTransfer',
    targetId: t._id,
    targetLabel: `${t.sourceName} → ${t.destinationName}`,
  }).catch(() => {});

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
