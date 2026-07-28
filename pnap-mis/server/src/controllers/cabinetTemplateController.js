const asyncHandler = require('express-async-handler');
const CabinetTemplate = require('../models/CabinetTemplate');
const CabinetSlot = require('../models/CabinetSlot');
const Role = require('../models/Role');
const { ok, created, ApiError } = require('../utils/response');
const { audit } = require('../utils/audit');

// Helpers

// Verify the roleCode exists in the Role catalogue (custom or
// built-in). Throws 400 if unknown — admins can't reference a slot
// for a role that doesn't exist.
async function assertRoleExists(roleCode) {
  const r = await Role.findOne({ code: roleCode }).lean();
  if (!r) {
    throw new ApiError(400, 'ROLE_NOT_FOUND',
      `Role "${roleCode}" not in the Role catalogue. Create the role first.`);
  }
  return r;
}

// Locate every existing unit at a tier and ensure it has a
// CabinetSlot row for the given roleCode. Idempotent — uses
// $setOnInsert so existing rows aren't disturbed.
async function rolloutToTier(tierCode, roleCode, isMandatory, sortOrder) {
  const ModelByTier = {
    BASIC_UNIT: require('../models/BasicUnit'),
    AREA: require('../models/Area'),
    DISTRICT: require('../models/District'),
    PROVINCE: require('../models/Province'),
    CENTRAL: require('../models/Central'),
  };
  const M = ModelByTier[tierCode];
  if (!M) return 0;
  const units = await M.find({}).select('_id').lean();
  let added = 0;
  for (const u of units) {
    const r = await CabinetSlot.updateOne(
      { unitLevel: tierCode, unitId: u._id, roleCode },
      { $setOnInsert: {
          unitLevel: tierCode, unitId: u._id, roleCode,
          isMandatory: !!isMandatory,
          sortOrder,
        } },
      { upsert: true }
    );
    if (r.upsertedCount) added++;
  }
  return added;
}

// ─── List & read ──────────────────────────────────────────────────

// GET /admin/units/cabinet-templates?tier=AREA
exports.list = asyncHandler(async (req, res) => {
  const { tier, active } = req.query;
  const filter = {};
  if (tier) {
    if (!['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'].includes(tier)) {
      throw new ApiError(400, 'INVALID_TIER', 'tier must be a valid tierCode');
    }
    filter.tierCode = tier;
  }
  if (active === 'true') filter.isActive = true;
  if (active === 'false') filter.isActive = false;

  const TIER_ORDER = ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'];
  const items = await CabinetTemplate.find(filter);
  items.sort((a, b) => {
    const ta = TIER_ORDER.indexOf(a.tierCode);
    const tb = TIER_ORDER.indexOf(b.tierCode);
    if (ta !== tb) return ta - tb;
    if (a.sortOrder !== b.sortOrder) return (a.sortOrder || 0) - (b.sortOrder || 0);
    return (a.roleCode || '').localeCompare(b.roleCode || '');
  });
  ok(res, items);
});

// GET /admin/units/cabinet-templates/:id
exports.getOne = asyncHandler(async (req, res) => {
  const doc = await CabinetTemplate.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Template not found');
  ok(res, doc);
});

// ─── Create ───────────────────────────────────────────────────────

// POST /admin/units/cabinet-templates
exports.create = asyncHandler(async (req, res) => {
  const d = req.body;
  await assertRoleExists(d.roleCode);

  const exists = await CabinetTemplate.findOne({ tierCode: d.tierCode, roleCode: d.roleCode });
  if (exists) {
    throw new ApiError(409, 'DUPLICATE',
      `A cabinet template for ${d.tierCode}/${d.roleCode} already exists`);
  }

  const doc = await CabinetTemplate.create({
    tierCode: d.tierCode,
    roleCode: d.roleCode,
    isMandatory: !!d.isMandatory,
    sortOrder: typeof d.sortOrder === 'number' ? d.sortOrder : 100,
    appliesToBody: d.appliesToBody || 'BOTH',
    termDays: typeof d.termDays === 'number' ? d.termDays : 0,
    allowedAppointerRoles: d.allowedAppointerRoles || [],
    allowedDeciderRoles: d.allowedDeciderRoles || [],
    visibilityScope: d.visibilityScope || 'TIER_ONLY',
    isSystem: false,
    isActive: true,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  let rolledOut = 0;
  if (d.rolloutToExistingUnits) {
    rolledOut = await rolloutToTier(doc.tierCode, doc.roleCode, doc.isMandatory, doc.sortOrder);
  }

  await audit({
    req,
    action: 'CABINET_TEMPLATE_CREATE',
    targetType: 'CabinetTemplate',
    targetId: doc._id,
    targetLabel: `${d.tierCode}:${d.roleCode}`,
    after: doc.toObject(),
    note: rolledOut ? `Rolled out to ${rolledOut} existing unit(s)` : undefined,
  });

  created(res, { ...doc.toObject(), _rolledOutTo: rolledOut });
});

// ─── Update ───────────────────────────────────────────────────────

// PATCH /admin/units/cabinet-templates/:id
//
// When isMandatory or sortOrder change, we cascade the update to
// every existing CabinetSlot row for this (tier, role) pair —
// matching the boot reconcile behavior so admin edits take effect
// immediately, not on next restart.
exports.update = asyncHandler(async (req, res) => {
  const doc = await CabinetTemplate.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Template not found');

  const before = doc.toObject();
  const d = req.body;

  // System templates: lock isMandatory at false → true changes only
  // if admin really wants them — actually let's just allow the edits.
  // The cabinet-slot reconcile keeps existing units consistent.
  if (d.isMandatory !== undefined) doc.isMandatory = !!d.isMandatory;
  if (typeof d.sortOrder === 'number') doc.sortOrder = d.sortOrder;
  if (d.appliesToBody !== undefined) doc.appliesToBody = d.appliesToBody;
  if (typeof d.termDays === 'number') doc.termDays = d.termDays;
  if (Array.isArray(d.allowedAppointerRoles)) doc.allowedAppointerRoles = d.allowedAppointerRoles;
  if (Array.isArray(d.allowedDeciderRoles)) doc.allowedDeciderRoles = d.allowedDeciderRoles;
  if (d.visibilityScope !== undefined) doc.visibilityScope = d.visibilityScope;

  if (d.isActive !== undefined) {
    if (doc.isSystem && !d.isActive) {
      throw new ApiError(400, 'INVALID_OPERATION',
        'Built-in cabinet templates cannot be deactivated. Hide individual slots via per-tier overrides instead.');
    }
    doc.isActive = !!d.isActive;
  }

  doc.updatedBy = req.user._id;
  await doc.save();

  // Cascade isMandatory + sortOrder to existing CabinetSlot rows.
  // Without this, the change would only land on freshly-created
  // units (because seedFor uses $setOnInsert).
  const cascadeFilter = {
    unitLevel: doc.tierCode,
    roleCode: doc.roleCode,
    $or: [
      { isMandatory: { $ne: doc.isMandatory } },
      { sortOrder: { $ne: doc.sortOrder } },
    ],
  };
  const cascade = await CabinetSlot.updateMany(
    cascadeFilter,
    { $set: { isMandatory: doc.isMandatory, sortOrder: doc.sortOrder } }
  );

  await audit({
    req,
    action: 'CABINET_TEMPLATE_UPDATE',
    targetType: 'CabinetTemplate',
    targetId: doc._id,
    targetLabel: `${doc.tierCode}:${doc.roleCode}`,
    before,
    after: doc.toObject(),
    note: cascade.modifiedCount ? `Reconciled ${cascade.modifiedCount} CabinetSlot row(s)` : undefined,
  });

  ok(res, { ...doc.toObject(), _cascade: { reconciled: cascade.modifiedCount || 0 } });
});

// ─── Delete ───────────────────────────────────────────────────────

// DELETE /admin/units/cabinet-templates/:id — only valid for non-
// system rows. Blocks if any FILLED CabinetSlot references this
// (tier, role); admin must end the role assignment first. Empty
// (vacant) CabinetSlot rows are removed alongside the template.
exports.remove = asyncHandler(async (req, res) => {
  const doc = await CabinetTemplate.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Template not found');
  if (doc.isSystem) {
    throw new ApiError(400, 'INVALID_OPERATION',
      'Built-in cabinet templates cannot be deleted; deactivate instead.');
  }

  // Refuse if any slot is currently filled. Vacant slots are safe to
  // remove since they carry no member data.
  const filled = await CabinetSlot.countDocuments({
    unitLevel: doc.tierCode, roleCode: doc.roleCode,
    filledMemberId: { $exists: true, $ne: null },
  });
  if (filled > 0) {
    throw new ApiError(409, 'IN_USE',
      `${filled} cabinet slot(s) for ${doc.tierCode}/${doc.roleCode} are currently filled. End those role assignments first.`);
  }

  // Vacant slots — delete them so the cabinet pages don't show
  // orphaned rows for a slot that no longer exists in the catalogue.
  const vacant = await CabinetSlot.deleteMany({
    unitLevel: doc.tierCode, roleCode: doc.roleCode,
    filledMemberId: { $in: [null, undefined] },
  });

  await doc.deleteOne();

  await audit({
    req,
    action: 'CABINET_TEMPLATE_DELETE',
    targetType: 'CabinetTemplate',
    targetId: doc._id,
    targetLabel: `${doc.tierCode}:${doc.roleCode}`,
    before: doc.toObject(),
    note: vacant.deletedCount ? `Removed ${vacant.deletedCount} vacant slot(s)` : undefined,
  });

  ok(res, { deleted: true, vacantSlotsRemoved: vacant.deletedCount || 0 });
});

// ─── Rollout ──────────────────────────────────────────────────────

// POST /admin/units/cabinet-templates/:id/rollout — backfill the
// CabinetSlot collection so every existing unit at this tier has a
// row for this template. Idempotent. Useful when an admin forgot to
// tick `rolloutToExistingUnits` on create, or when new units have
// since been added.
exports.rollout = asyncHandler(async (req, res) => {
  const doc = await CabinetTemplate.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Template not found');
  if (!doc.isActive) throw new ApiError(400, 'TEMPLATE_INACTIVE', 'Template is deactivated');

  const added = await rolloutToTier(doc.tierCode, doc.roleCode, doc.isMandatory, doc.sortOrder);

  await audit({
    req,
    action: 'CABINET_TEMPLATE_ROLLOUT',
    targetType: 'CabinetTemplate',
    targetId: doc._id,
    targetLabel: `${doc.tierCode}:${doc.roleCode}`,
    note: `Rolled out to ${added} existing unit(s)`,
  });

  ok(res, { rolledOutTo: added });
});
