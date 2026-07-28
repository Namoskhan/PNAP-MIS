const asyncHandler = require('express-async-handler');
const WorkflowConfig = require('../models/WorkflowConfig');
const { ok, created, ApiError } = require('../utils/response');
const { audit } = require('../utils/audit');
const workflowEngine = require('../services/workflowEngine');

// Validate that stage codes are unique within a single workflow.
// Codes are immutable per stage (used as keys in the record's
// approvalChain), so duplicates would corrupt history reconstruction.
function assertUniqueStageCodes(stages) {
  const seen = new Set();
  for (const s of stages || []) {
    const code = String(s.code || '').toUpperCase();
    if (seen.has(code)) {
      throw new ApiError(400, 'DUPLICATE_STAGE',
        `Duplicate stage code "${code}" — every stage must have a unique code.`);
    }
    seen.add(code);
  }
}

// GET /admin/units/workflows?domain=EXPENSE_APPROVAL&scope=TIER&tierCode=AREA
exports.list = asyncHandler(async (req, res) => {
  const { domain, scope, tierCode, active } = req.query;
  const filter = {};
  if (domain) filter.domain = domain;
  if (scope) filter.scope = scope;
  if (tierCode) filter.tierCode = String(tierCode).toUpperCase();
  if (active === 'true') filter.isActive = true;
  if (active === 'false') filter.isActive = false;

  const SCOPE_ORDER = { GLOBAL: 0, TIER: 1 };
  const items = await WorkflowConfig.find(filter);
  items.sort((a, b) => {
    if (a.domain !== b.domain) return a.domain.localeCompare(b.domain);
    if (a.scope !== b.scope) return SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
    return (a.tierCode || '').localeCompare(b.tierCode || '');
  });
  ok(res, items);
});

// GET /admin/units/workflows/:id
exports.getOne = asyncHandler(async (req, res) => {
  const doc = await WorkflowConfig.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Workflow not found');
  ok(res, doc);
});

// GET /admin/units/workflows/preview?domain=EXPENSE_APPROVAL&tierCode=AREA&amount=15000
// Returns the resolved stages for a given (domain, tier, payload),
// with `_applies` flags computed against the supplied payload —
// useful for the admin UI's "what would happen if I tried..." view.
exports.preview = asyncHandler(async (req, res) => {
  const { domain, tierCode, ...payload } = req.query;
  if (!domain) throw new ApiError(400, 'DOMAIN_REQUIRED', 'domain query param is required');
  // Coerce numeric payload fields — query strings arrive as strings.
  const numericPayload = {};
  for (const [k, v] of Object.entries(payload)) {
    const n = parseFloat(v);
    numericPayload[k] = Number.isFinite(n) && String(n) === v ? n : v;
  }
  const result = await workflowEngine.resolveStages(domain, tierCode, numericPayload);
  ok(res, result);
});

// POST /admin/units/workflows — create a TIER override (or, by
// admin's explicit choice, a GLOBAL row when none exists for the
// domain — but the seeder lays GLOBAL rows down at boot, so this
// is mostly used for TIER overrides).
exports.create = asyncHandler(async (req, res) => {
  const d = req.body;
  assertUniqueStageCodes(d.stages);

  if (d.scope === 'GLOBAL') {
    const existing = await WorkflowConfig.findOne({ domain: d.domain, scope: 'GLOBAL' });
    if (existing) {
      throw new ApiError(409, 'DUPLICATE',
        `A GLOBAL workflow for ${d.domain} already exists. Edit it via PATCH.`);
    }
  } else if (d.scope === 'TIER') {
    const existing = await WorkflowConfig.findOne({
      domain: d.domain, scope: 'TIER', tierCode: d.tierCode,
    });
    if (existing) {
      throw new ApiError(409, 'DUPLICATE',
        `A TIER workflow for ${d.domain}/${d.tierCode} already exists. Edit it via PATCH.`);
    }
  }

  const doc = await WorkflowConfig.create({
    domain: d.domain,
    scope: d.scope,
    tierCode: d.scope === 'TIER' ? d.tierCode : undefined,
    stages: d.stages,
    isActive: d.isActive !== false,
    isSystem: false,
    configVersion: 1,
    note: d.note,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  workflowEngine.invalidate(doc.domain, doc.tierCode);

  await audit({
    req,
    action: 'WORKFLOW_CONFIG_CREATE',
    targetType: 'WorkflowConfig',
    targetId: doc._id,
    targetLabel: `${doc.domain}:${doc.scope}${doc.tierCode ? ':' + doc.tierCode : ''}`,
    after: doc.toObject(),
  });

  created(res, doc);
});

// PATCH /admin/units/workflows/:id — edit stages / activation. Bumps
// configVersion. The engine cache is invalidated for (domain, tier).
exports.update = asyncHandler(async (req, res) => {
  const doc = await WorkflowConfig.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Workflow not found');

  const before = doc.toObject();
  const d = req.body;

  if (Array.isArray(d.stages)) {
    assertUniqueStageCodes(d.stages);
    doc.stages = d.stages;
  }
  if (d.note !== undefined) doc.note = d.note || undefined;

  if (d.isActive !== undefined) {
    if (doc.isSystem && !d.isActive) {
      throw new ApiError(400, 'INVALID_OPERATION',
        'The seeded GLOBAL workflow cannot be deactivated. Edit its stages instead.');
    }
    doc.isActive = !!d.isActive;
  }

  doc.configVersion = (doc.configVersion || 1) + 1;
  doc.updatedBy = req.user._id;
  await doc.save();

  workflowEngine.invalidate(doc.domain, doc.tierCode);

  await audit({
    req,
    action: 'WORKFLOW_CONFIG_UPDATE',
    targetType: 'WorkflowConfig',
    targetId: doc._id,
    targetLabel: `${doc.domain}:${doc.scope}${doc.tierCode ? ':' + doc.tierCode : ''}`,
    before,
    after: doc.toObject(),
  });

  ok(res, doc);
});

// DELETE /admin/units/workflows/:id — only valid for non-system rows
// (TIER overrides). Removing an override falls back to GLOBAL — no
// in-flight record is orphaned because the engine re-resolves on
// every decide call.
exports.remove = asyncHandler(async (req, res) => {
  const doc = await WorkflowConfig.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Workflow not found');
  if (doc.isSystem) {
    throw new ApiError(400, 'INVALID_OPERATION',
      'The seeded GLOBAL workflow cannot be deleted. Edit its stages instead.');
  }

  await doc.deleteOne();
  workflowEngine.invalidate(doc.domain, doc.tierCode);

  await audit({
    req,
    action: 'WORKFLOW_CONFIG_DELETE',
    targetType: 'WorkflowConfig',
    targetId: doc._id,
    targetLabel: `${doc.domain}:${doc.scope}${doc.tierCode ? ':' + doc.tierCode : ''}`,
    before: doc.toObject(),
  });

  ok(res, { deleted: true });
});
