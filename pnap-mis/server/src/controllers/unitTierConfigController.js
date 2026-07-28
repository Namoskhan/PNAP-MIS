const asyncHandler = require('express-async-handler');
const UnitTierConfig = require('../models/UnitTierConfig');
const FieldDefinition = require('../models/FieldDefinition');
const { ok, ApiError } = require('../utils/response');
const { audit } = require('../utils/audit');
const { invalidate: invalidateSnapshotCache } = require('../services/unitTierConfigService');

// Confirm every customField id exists and is active. Returns the doc
// array so the caller doesn't have to refetch.
async function resolveFieldIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const docs = await FieldDefinition.find({ _id: { $in: ids } }).lean();
  if (docs.length !== ids.length) {
    throw new ApiError(400, 'FIELD_NOT_FOUND', 'One or more field ids do not exist');
  }
  for (const d of docs) {
    if (d.isActive === false) {
      throw new ApiError(400, 'FIELD_INACTIVE', `Field "${d.key}" is deactivated`);
    }
  }
  return docs;
}

// GET /admin/units/tier-configs — list all 5 tier configs in the
// canonical hierarchy order (top-down).
exports.list = asyncHandler(async (req, res) => {
  const TIER_ORDER = ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'];
  const items = await UnitTierConfig.find({})
    .populate({ path: 'customFields', match: { isActive: true } });
  // Sort by canonical hierarchy order, not by tierCode alphabetically
  // (which would produce AREA, BASIC_UNIT, CENTRAL… — meaningless).
  items.sort((a, b) => TIER_ORDER.indexOf(a.tierCode) - TIER_ORDER.indexOf(b.tierCode));
  ok(res, items);
});

// GET /admin/units/tier-configs/:tier — fetch one tier by its code.
// `:tier` is the tierCode (BASIC_UNIT / AREA / etc.), not an ObjectId,
// since there's exactly one row per tier and the code is canonical.
exports.getOne = asyncHandler(async (req, res) => {
  const code = String(req.params.tier || '').toUpperCase();
  const doc = await UnitTierConfig.findOne({ tierCode: code })
    .populate('customFields');
  if (!doc) throw new ApiError(404, 'NOT_FOUND', `Tier config "${code}" not found`);
  ok(res, doc);
});

// PATCH /admin/units/tier-configs/:tier — edit the tier's editable
// surface. tierCode + isSystem stay locked. Bumps configVersion on
// every save so the next snapshot materialise() produces a fresh
// frozen copy.
exports.update = asyncHandler(async (req, res) => {
  const code = String(req.params.tier || '').toUpperCase();
  const doc = await UnitTierConfig.findOne({ tierCode: code });
  if (!doc) throw new ApiError(404, 'NOT_FOUND', `Tier config "${code}" not found`);

  const before = doc.toObject();
  const d = req.body;

  if (d.label !== undefined) doc.label = d.label;
  if (d.pluralLabel !== undefined) doc.pluralLabel = d.pluralLabel;
  if (d.description !== undefined) doc.description = d.description || undefined;

  // System tiers can't be deactivated — they're load-bearing for
  // resolveUnitChain and the sidebar persona logic. Admin can edit
  // labels / capabilities / fields but the tier row itself stays.
  if (d.isActive !== undefined && d.isActive === false) {
    throw new ApiError(400, 'INVALID_OPERATION',
      'Tier configs are built-in and cannot be deactivated. Toggle individual capabilities instead.');
  }

  if (d.capabilities) {
    doc.capabilities = {
      meetings: d.capabilities.meetings ?? doc.capabilities?.meetings ?? true,
      activities: d.capabilities.activities ?? doc.capabilities?.activities ?? true,
      finance: d.capabilities.finance ?? doc.capabilities?.finance ?? true,
      cabinet: d.capabilities.cabinet ?? doc.capabilities?.cabinet ?? true,
      committee: d.capabilities.committee ?? doc.capabilities?.committee ?? true,
      transfers: d.capabilities.transfers ?? doc.capabilities?.transfers ?? true,
      performance: d.capabilities.performance ?? doc.capabilities?.performance ?? true,
      responsibilities: d.capabilities.responsibilities ?? doc.capabilities?.responsibilities ?? true,
    };
  }
  if (d.bodyPolicy) {
    doc.bodyPolicy = {
      executive: d.bodyPolicy.executive ?? doc.bodyPolicy?.executive ?? true,
      committee: d.bodyPolicy.committee ?? doc.bodyPolicy?.committee ?? true,
    };
  }
  if (Array.isArray(d.customFields)) {
    await resolveFieldIds(d.customFields);
    doc.customFields = d.customFields;
  }

  doc.configVersion = (doc.configVersion || 1) + 1;
  doc.updatedBy = req.user._id;
  await doc.save();

  invalidateSnapshotCache(doc.tierCode);

  await audit({
    req,
    action: 'UNIT_TIER_CONFIG_UPDATE',
    targetType: 'UnitTierConfig',
    targetId: doc._id,
    targetLabel: doc.tierCode,
    before,
    after: doc.toObject(),
  });

  ok(res, doc);
});

// GET /admin/units/tier-configs/:tier/snapshot — preview exactly what
// would be frozen on the next unit-instance write under this tier.
// Doesn't actually write a snapshot row.
exports.previewSnapshot = asyncHandler(async (req, res) => {
  const code = String(req.params.tier || '').toUpperCase();
  const doc = await UnitTierConfig.findOne({ tierCode: code }).populate({
    path: 'customFields',
    match: { isActive: true },
  });
  if (!doc) throw new ApiError(404, 'NOT_FOUND', `Tier config "${code}" not found`);

  const sortedFields = (doc.customFields || []).slice().sort(
    (a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)
  );
  const preview = {
    tierCode: doc.tierCode,
    configVersion: doc.configVersion,
    label: doc.label,
    pluralLabel: doc.pluralLabel,
    capabilities: doc.capabilities,
    bodyPolicy: doc.bodyPolicy,
    resolvedFields: sortedFields.map((f) => ({
      key: f.key,
      label: f.label,
      type: f.type,
      required: !!f.required,
      validation: f.validation || {},
      visibility: f.visibility || {},
      reporting: f.reporting || {},
      sortOrder: f.sortOrder ?? 100,
    })),
  };
  ok(res, preview);
});
