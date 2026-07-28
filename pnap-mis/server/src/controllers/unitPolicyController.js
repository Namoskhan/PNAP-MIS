const asyncHandler = require('express-async-handler');
const UnitPolicy = require('../models/UnitPolicy');
const { ok, created, ApiError } = require('../utils/response');
const { audit } = require('../utils/audit');
const policyEngine = require('../services/policyEngine');

// GET /admin/units/policies?scope=TIER&tierCode=AREA
// List policy rows. Optional filters narrow by scope / tier / unit.
exports.list = asyncHandler(async (req, res) => {
  const { scope, tierCode, unitId, active } = req.query;
  const filter = {};
  if (scope) filter.scope = scope;
  if (tierCode) filter.tierCode = String(tierCode).toUpperCase();
  if (unitId) filter.unitId = unitId;
  if (active === 'true') filter.isActive = true;
  if (active === 'false') filter.isActive = false;

  const SCOPE_ORDER = { GLOBAL: 0, TIER: 1, UNIT: 2 };
  const items = await UnitPolicy.find(filter);
  items.sort((a, b) => {
    if (a.scope !== b.scope) return SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
    return (a.tierCode || '').localeCompare(b.tierCode || '');
  });
  ok(res, items);
});

// GET /admin/units/policies/:id
exports.getOne = asyncHandler(async (req, res) => {
  const doc = await UnitPolicy.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Policy not found');
  ok(res, doc);
});

// GET /admin/units/policies/resolve?tierCode=AREA&unitId=...
// Returns the deep-merged ResolvedPolicy for a (tier, unit) pair —
// the same object policyEngine.resolveFor() ships to assertX().
// Useful for the admin UI's "what actually applies?" view.
exports.resolve = asyncHandler(async (req, res) => {
  const { tierCode, unitId } = req.query;
  const merged = await policyEngine.resolveFor(tierCode, unitId);
  ok(res, merged);
});

// POST /admin/units/policies
// Creates a TIER or UNIT override. GLOBAL is seeded once at boot
// and updated only via PATCH — admins cannot create a second
// GLOBAL row.
exports.create = asyncHandler(async (req, res) => {
  const d = req.body;
  if (d.scope === 'GLOBAL') {
    throw new ApiError(400, 'INVALID_OPERATION',
      'The GLOBAL policy is seeded automatically. Edit it via PATCH instead of creating a new one.');
  }

  // Honor the per-scope unique index — surface a friendlier error.
  const dup = await UnitPolicy.findOne({
    scope: d.scope,
    tierCode: d.tierCode || null,
    ...(d.scope === 'UNIT' ? { unitId: d.unitId } : {}),
  });
  if (dup) {
    throw new ApiError(409, 'DUPLICATE',
      `A ${d.scope} policy for this scope key already exists. Edit it instead of creating a new one.`);
  }

  const doc = await UnitPolicy.create({
    scope: d.scope,
    tierCode: d.tierCode,
    unitId: d.scope === 'UNIT' ? d.unitId : undefined,
    member: d.member || {},
    meeting: d.meeting || {},
    finance: d.finance || {},
    transfer: d.transfer || {},
    isActive: d.isActive !== false,
    isSystem: false,
    policyVersion: 1,
    note: d.note,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  policyEngine.invalidate(doc.scope, doc.tierCode, doc.unitId);

  await audit({
    req,
    action: 'UNIT_POLICY_CREATE',
    targetType: 'UnitPolicy',
    targetId: doc._id,
    targetLabel: `${doc.scope}${doc.tierCode ? ':' + doc.tierCode : ''}${doc.unitId ? ':' + doc.unitId : ''}`,
    after: doc.toObject(),
  });

  created(res, doc);
});

// PATCH /admin/units/policies/:id
// Edit any of the four slices. Bumps policyVersion on every save so
// records that snapshot resolved policy at create-time can detect
// drift.
exports.update = asyncHandler(async (req, res) => {
  const doc = await UnitPolicy.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Policy not found');

  const before = doc.toObject();
  const d = req.body;

  if (d.member !== undefined) doc.member = d.member;
  if (d.meeting !== undefined) doc.meeting = d.meeting;
  if (d.finance !== undefined) doc.finance = d.finance;
  if (d.transfer !== undefined) doc.transfer = d.transfer;
  if (d.note !== undefined) doc.note = d.note || undefined;

  if (d.isActive !== undefined) {
    if (doc.isSystem && !d.isActive) {
      throw new ApiError(400, 'INVALID_OPERATION',
        'The seeded GLOBAL policy cannot be deactivated. Clear individual rules instead.');
    }
    doc.isActive = !!d.isActive;
  }

  doc.policyVersion = (doc.policyVersion || 1) + 1;
  doc.updatedBy = req.user._id;
  await doc.save();

  policyEngine.invalidate(doc.scope, doc.tierCode, doc.unitId);

  await audit({
    req,
    action: 'UNIT_POLICY_UPDATE',
    targetType: 'UnitPolicy',
    targetId: doc._id,
    targetLabel: `${doc.scope}${doc.tierCode ? ':' + doc.tierCode : ''}${doc.unitId ? ':' + doc.unitId : ''}`,
    before,
    after: doc.toObject(),
  });

  ok(res, doc);
});

// DELETE /admin/units/policies/:id — only valid for non-system rows
// (TIER + UNIT overrides). Removing an override means the next more-
// specific level (or GLOBAL) takes over — no record is orphaned.
exports.remove = asyncHandler(async (req, res) => {
  const doc = await UnitPolicy.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Policy not found');
  if (doc.isSystem) {
    throw new ApiError(400, 'INVALID_OPERATION',
      'The seeded GLOBAL policy cannot be deleted. Edit it to clear specific rules.');
  }

  await doc.deleteOne();
  policyEngine.invalidate(doc.scope, doc.tierCode, doc.unitId);

  await audit({
    req,
    action: 'UNIT_POLICY_DELETE',
    targetType: 'UnitPolicy',
    targetId: doc._id,
    targetLabel: `${doc.scope}${doc.tierCode ? ':' + doc.tierCode : ''}${doc.unitId ? ':' + doc.unitId : ''}`,
    before: doc.toObject(),
  });

  ok(res, { deleted: true });
});
