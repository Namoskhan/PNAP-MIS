const asyncHandler = require('express-async-handler');
const FieldDefinition = require('../models/FieldDefinition');
const EventTypeConfig = require('../models/EventTypeConfig');
const { ok, created, ApiError } = require('../utils/response');
const { audit } = require('../utils/audit');

// fieldDefinitionController — Super Admin's field library. Field
// definitions are referenced by EventTypeConfig.fields[] and frozen
// into EventConfigSnapshot at meeting/activity create+finalize time.
//
// Hard rules from §9 of the design:
//   • `key` is immutable after publication — only the create endpoint
//      accepts it; PATCH ignores any key in the body.
//   • System fields (isSystem=true) cannot be deleted, only
//      deactivated.
//   • Soft-delete only — set isActive=false to retire a field; do not
//      remove existing data.
//
// PR 1 does not yet wire these into Meeting/Activity creation, so
// "in use" guards rely on EventTypeConfig.fields[] containing the id.

// GET /admin/events/fields
exports.list = asyncHandler(async (req, res) => {
  const { active } = req.query;
  const filter = {};
  if (active === 'true') filter.isActive = true;
  if (active === 'false') filter.isActive = false;
  const items = await FieldDefinition.find(filter).sort({ sortOrder: 1, label: 1 });
  ok(res, items);
});

// GET /admin/events/fields/:id
exports.getOne = asyncHandler(async (req, res) => {
  const doc = await FieldDefinition.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Field not found');
  ok(res, doc);
});

// POST /admin/events/fields
exports.create = asyncHandler(async (req, res) => {
  const d = req.body;
  const exists = await FieldDefinition.findOne({ key: d.key });
  if (exists) throw new ApiError(409, 'DUPLICATE', `Field key "${d.key}" already exists`);

  // SELECT/MULTISELECT must declare options — otherwise the form
  // would render an empty dropdown.
  if ((d.type === 'SELECT' || d.type === 'MULTISELECT') && !(d.validation?.options?.length)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `${d.type} field "${d.key}" requires at least one option`);
  }

  const doc = await FieldDefinition.create({
    key: d.key,
    label: d.label,
    helpText: d.helpText,
    type: d.type,
    required: !!d.required,
    validation: d.validation || {},
    visibility: d.visibility || {},
    reporting: d.reporting || {},
    isActive: d.isActive !== false,
    sortOrder: typeof d.sortOrder === 'number' ? d.sortOrder : 100,
    isSystem: false,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  await audit({
    req,
    action: 'FIELD_DEFINITION_CREATE',
    targetType: 'FieldDefinition',
    targetId: doc._id,
    targetLabel: doc.key,
    after: doc.toObject(),
  });

  created(res, doc);
});

// PATCH /admin/events/fields/:id
//
// `key` is intentionally not editable. Type changes are permitted but
// flagged via incrementing every parent type's configVersion so any
// in-flight Meetings/Activities re-snapshot on next save.
exports.update = asyncHandler(async (req, res) => {
  const doc = await FieldDefinition.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Field not found');

  const before = doc.toObject();
  const d = req.body;

  if (d.label !== undefined) doc.label = d.label;
  if (d.helpText !== undefined) doc.helpText = d.helpText || undefined;
  if (d.required !== undefined) doc.required = !!d.required;
  if (typeof d.sortOrder === 'number') doc.sortOrder = d.sortOrder;

  if (d.isActive !== undefined) {
    if (doc.isSystem && !d.isActive) {
      throw new ApiError(400, 'INVALID_OPERATION', 'Built-in fields cannot be deactivated.');
    }
    doc.isActive = !!d.isActive;
  }

  if (d.type !== undefined && d.type !== doc.type) {
    // Allow the change but the snapshot bump below will force any
    // future reads to re-validate against the new type.
    doc.type = d.type;
  }

  if (d.validation !== undefined) {
    doc.validation = d.validation;
    if ((doc.type === 'SELECT' || doc.type === 'MULTISELECT') && !(doc.validation?.options?.length)) {
      throw new ApiError(400, 'VALIDATION_ERROR', `${doc.type} fields must keep at least one option`);
    }
  }
  if (d.visibility !== undefined) doc.visibility = d.visibility;
  if (d.reporting !== undefined) doc.reporting = d.reporting;

  doc.updatedBy = req.user._id;
  await doc.save();

  // Bump configVersion on every EventTypeConfig that references this
  // field, so the next materialise() produces a fresh snapshot. We
  // pull existing rows individually so the modified timestamps + the
  // monotonic version increment are both honoured.
  const refs = await EventTypeConfig.find({ fields: doc._id }).select('_id entity code');
  for (const r of refs) {
    await EventTypeConfig.updateOne(
      { _id: r._id },
      { $inc: { configVersion: 1 }, $set: { updatedBy: req.user._id, updatedAt: new Date() } }
    );
  }

  await audit({
    req,
    action: 'FIELD_DEFINITION_UPDATE',
    targetType: 'FieldDefinition',
    targetId: doc._id,
    targetLabel: doc.key,
    before,
    after: doc.toObject(),
    note: refs.length ? `Bumped configVersion on ${refs.length} parent type(s)` : undefined,
  });

  ok(res, doc);
});

// DELETE /admin/events/fields/:id — only safe when no
// EventTypeConfig still references the field. Otherwise the admin
// must remove the field from each type first, then delete.
exports.remove = asyncHandler(async (req, res) => {
  const doc = await FieldDefinition.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Field not found');
  if (doc.isSystem) {
    throw new ApiError(400, 'INVALID_OPERATION', 'Built-in fields cannot be deleted; deactivate instead.');
  }

  const refCount = await EventTypeConfig.countDocuments({ fields: doc._id });
  if (refCount > 0) {
    throw new ApiError(409, 'IN_USE',
      `Field is referenced by ${refCount} event type(s). Remove it from those types first, or deactivate.`);
  }

  await doc.deleteOne();

  await audit({
    req,
    action: 'FIELD_DEFINITION_DELETE',
    targetType: 'FieldDefinition',
    targetId: doc._id,
    targetLabel: doc.key,
    before: doc.toObject(),
  });

  ok(res, { deleted: true });
});
