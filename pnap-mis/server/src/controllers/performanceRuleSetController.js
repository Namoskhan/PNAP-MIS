const asyncHandler = require('express-async-handler');
const PerformanceRuleSet = require('../models/PerformanceRuleSet');
const { ok, created, ApiError } = require('../utils/response');
const { audit } = require('../utils/audit');
const performanceEngine = require('../services/performanceEngine');

// GET /admin/units/performance-rulesets?scope=TIER&tierCode=AREA
exports.list = asyncHandler(async (req, res) => {
  const { scope, tierCode, active } = req.query;
  const filter = {};
  if (scope) filter.scope = scope;
  if (tierCode) filter.tierCode = String(tierCode).toUpperCase();
  if (active === 'true') filter.isActive = true;
  if (active === 'false') filter.isActive = false;

  const SCOPE_ORDER = { GLOBAL: 0, TIER: 1 };
  const items = await PerformanceRuleSet.find(filter);
  items.sort((a, b) => {
    if (a.scope !== b.scope) return SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope];
    return (a.tierCode || '').localeCompare(b.tierCode || '');
  });
  ok(res, items);
});

// GET /admin/units/performance-rulesets/metrics — list the engine's
// metric registry so the admin UI can render the metric picker
// without a code-side enum duplicate. Includes default params.
exports.listMetrics = asyncHandler(async (req, res) => {
  ok(res, performanceEngine.listMetrics());
});

// GET /admin/units/performance-rulesets/resolve?tierCode=AREA
// Returns the ACTIVE ruleset that would apply for a given tier
// (TIER override → GLOBAL fallback). Useful for the admin UI's
// "what's actually scoring this tier?" view.
exports.resolve = asyncHandler(async (req, res) => {
  const { tierCode } = req.query;
  const ruleset = await performanceEngine.resolveRulesetFor(tierCode);
  ok(res, ruleset);
});

// GET /admin/units/performance-rulesets/:id
exports.getOne = asyncHandler(async (req, res) => {
  const doc = await PerformanceRuleSet.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Ruleset not found');
  ok(res, doc);
});

// POST /admin/units/performance-rulesets
exports.create = asyncHandler(async (req, res) => {
  const d = req.body;
  if (d.scope === 'GLOBAL') {
    const dup = await PerformanceRuleSet.findOne({ scope: 'GLOBAL' });
    if (dup) {
      throw new ApiError(409, 'DUPLICATE',
        'A GLOBAL performance ruleset already exists. Edit it via PATCH.');
    }
  } else if (d.scope === 'TIER') {
    const dup = await PerformanceRuleSet.findOne({ scope: 'TIER', tierCode: d.tierCode });
    if (dup) {
      throw new ApiError(409, 'DUPLICATE',
        `A TIER ruleset for ${d.tierCode} already exists. Edit it via PATCH.`);
    }
  }

  const doc = await PerformanceRuleSet.create({
    name: d.name,
    description: d.description,
    scope: d.scope,
    tierCode: d.scope === 'TIER' ? d.tierCode : undefined,
    components: d.components,
    isSystem: false,
    isActive: d.isActive !== false,
    rulesetVersion: 1,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  performanceEngine.invalidate();

  await audit({
    req,
    action: 'PERFORMANCE_RULESET_CREATE',
    targetType: 'PerformanceRuleSet',
    targetId: doc._id,
    targetLabel: `${doc.scope}${doc.tierCode ? ':' + doc.tierCode : ''}`,
    after: doc.toObject(),
  });

  created(res, doc);
});

// PATCH /admin/units/performance-rulesets/:id — edit components /
// activation. Bumps rulesetVersion; engine cache invalidated.
exports.update = asyncHandler(async (req, res) => {
  const doc = await PerformanceRuleSet.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Ruleset not found');

  const before = doc.toObject();
  const d = req.body;

  if (d.name !== undefined) doc.name = d.name;
  if (d.description !== undefined) doc.description = d.description || undefined;
  if (Array.isArray(d.components)) doc.components = d.components;

  if (d.isActive !== undefined) {
    if (doc.isSystem && !d.isActive) {
      throw new ApiError(400, 'INVALID_OPERATION',
        'The seeded GLOBAL ruleset cannot be deactivated. Edit its components instead.');
    }
    doc.isActive = !!d.isActive;
  }

  doc.rulesetVersion = (doc.rulesetVersion || 1) + 1;
  doc.updatedBy = req.user._id;
  await doc.save();

  performanceEngine.invalidate();

  await audit({
    req,
    action: 'PERFORMANCE_RULESET_UPDATE',
    targetType: 'PerformanceRuleSet',
    targetId: doc._id,
    targetLabel: `${doc.scope}${doc.tierCode ? ':' + doc.tierCode : ''}`,
    before,
    after: doc.toObject(),
  });

  ok(res, doc);
});

// DELETE /admin/units/performance-rulesets/:id — only TIER overrides;
// GLOBAL is locked.
exports.remove = asyncHandler(async (req, res) => {
  const doc = await PerformanceRuleSet.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Ruleset not found');
  if (doc.isSystem) {
    throw new ApiError(400, 'INVALID_OPERATION',
      'The seeded GLOBAL ruleset cannot be deleted. Edit its components instead.');
  }

  await doc.deleteOne();
  performanceEngine.invalidate();

  await audit({
    req,
    action: 'PERFORMANCE_RULESET_DELETE',
    targetType: 'PerformanceRuleSet',
    targetId: doc._id,
    targetLabel: `${doc.scope}${doc.tierCode ? ':' + doc.tierCode : ''}`,
    before: doc.toObject(),
  });

  ok(res, { deleted: true });
});
