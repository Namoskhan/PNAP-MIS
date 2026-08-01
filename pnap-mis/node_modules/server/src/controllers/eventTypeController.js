const asyncHandler = require('express-async-handler');
const EventTypeConfig = require('../models/EventTypeConfig');
const FieldDefinition = require('../models/FieldDefinition');
const { ok, created, ApiError } = require('../utils/response');
const { audit } = require('../utils/audit');
const { invalidate: invalidateSnapshotCache } = require('../services/configSnapshotService');
const eventLifecycleService = require('../services/eventLifecycleService');

// ─── Helpers ──────────────────────────────────────────────────────

// Validate that every extra-state's `after` references a real core
// state and the extra codes don't collide with existing core codes.
function validateWorkflow(entity, workflow) {
  if (!workflow) return;
  const core = new Set(eventLifecycleService.coreStatesFor(entity));
  const seen = new Set();
  for (const ex of workflow.extraStates || []) {
    const code = String(ex.code || '').toUpperCase();
    const after = String(ex.after || '').toUpperCase();
    if (core.has(code)) {
      throw new ApiError(400, 'WORKFLOW_INVALID', `Extra state code "${code}" collides with a core state`);
    }
    if (!core.has(after)) {
      throw new ApiError(400, 'WORKFLOW_INVALID', `Extra state "${code}" must follow a core state, got "${after}"`);
    }
    if (seen.has(code)) {
      throw new ApiError(400, 'WORKFLOW_INVALID', `Duplicate extra-state code "${code}"`);
    }
    seen.add(code);
  }
}

// Normalize the photo policy so its flags can't contradict each
// other: "not required" with a leftover minCount silently blocked
// finalize, and "required" with minCount 0 enforced nothing.
// Invariant after this: required ⇔ minCount ≥ 1.
function normalizePhotoPolicy(p) {
  if (!p) return p;
  const required = !!p.required;
  let minCount = Math.max(0, parseInt(p.minCount, 10) || 0);
  if (!required) minCount = 0;
  else if (minCount < 1) minCount = 1;
  return { ...p, required, minCount };
}

// A type must stay usable by at least one body — with both flags off
// every create attempt fails BODY_NOT_ALLOWED and the type is dead.
function assertAppliesTo(appliesTo) {
  if (!appliesTo) return;
  if (appliesTo.executive === false && appliesTo.committee === false) {
    throw new ApiError(400, 'VALIDATION_ERROR',
      'Type must apply to at least one body (Executive or Committee)');
  }
}

// Confirm every field id exists and is active. Returns the doc array
// so the caller doesn't have to refetch.
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

// ─── List & read ──────────────────────────────────────────────────

// GET /admin/events/types?entity=MEETING
exports.list = asyncHandler(async (req, res) => {
  const { entity } = req.query;
  const filter = {};
  if (entity) {
    if (!['MEETING', 'ACTIVITY'].includes(entity)) {
      throw new ApiError(400, 'INVALID_ENTITY', 'entity must be MEETING or ACTIVITY');
    }
    filter.entity = entity;
  }
  const items = await EventTypeConfig.find(filter)
    .sort({ entity: 1, sortOrder: 1, label: 1 })
    .populate({ path: 'fields', match: { isActive: true } });
  ok(res, items);
});

// GET /admin/events/types/:id
exports.getOne = asyncHandler(async (req, res) => {
  const doc = await EventTypeConfig.findById(req.params.id).populate('fields');
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Event type not found');
  ok(res, doc);
});

// ─── Create ───────────────────────────────────────────────────────

// POST /admin/events/types
exports.create = asyncHandler(async (req, res) => {
  const d = req.body;
  validateWorkflow(d.entity, d.workflow);
  assertAppliesTo(d.appliesTo);
  if (Array.isArray(d.fields)) await resolveFieldIds(d.fields);

  const exists = await EventTypeConfig.findOne({ entity: d.entity, code: d.code });
  if (exists) {
    throw new ApiError(409, 'DUPLICATE', `Type "${d.code}" already exists for ${d.entity}`);
  }

  const doc = await EventTypeConfig.create({
    entity: d.entity,
    code: d.code,
    label: d.label,
    description: d.description,
    isActive: d.isActive !== false,
    sortOrder: typeof d.sortOrder === 'number' ? d.sortOrder : 100,
    appliesTo: d.appliesTo || {},
    photoPolicy: normalizePhotoPolicy(d.photoPolicy) || {},
    workflow: d.workflow || {},
    fields: d.fields || [],
    isSystem: false,
    configVersion: 1,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  await audit({
    req,
    action: 'EVENT_TYPE_CREATE',
    targetType: 'EventTypeConfig',
    targetId: doc._id,
    targetLabel: `${d.entity}:${d.code}`,
    after: doc.toObject(),
  });

  invalidateSnapshotCache(d.entity, d.code);
  created(res, doc);
});

// ─── Update ───────────────────────────────────────────────────────

// PATCH /admin/events/types/:id
exports.update = asyncHandler(async (req, res) => {
  const doc = await EventTypeConfig.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Event type not found');

  const before = doc.toObject();
  const d = req.body;

  if (d.label !== undefined) doc.label = d.label;
  if (d.description !== undefined) doc.description = d.description || undefined;
  if (typeof d.sortOrder === 'number') doc.sortOrder = d.sortOrder;

  if (d.isActive !== undefined) {
    if (doc.isSystem && !d.isActive) {
      throw new ApiError(400, 'INVALID_OPERATION', 'Built-in event types cannot be deactivated; rename or hide instead.');
    }
    doc.isActive = !!d.isActive;
  }

  if (d.appliesTo) {
    doc.appliesTo = {
      executive: d.appliesTo.executive ?? doc.appliesTo?.executive ?? true,
      committee: d.appliesTo.committee ?? doc.appliesTo?.committee ?? true,
    };
    assertAppliesTo(doc.appliesTo);
  }
  if (d.photoPolicy) {
    doc.photoPolicy = normalizePhotoPolicy({
      required: d.photoPolicy.required ?? doc.photoPolicy?.required ?? false,
      minCount: d.photoPolicy.minCount ?? doc.photoPolicy?.minCount ?? 0,
      requireGps: d.photoPolicy.requireGps ?? doc.photoPolicy?.requireGps ?? true,
      requireExif: d.photoPolicy.requireExif ?? doc.photoPolicy?.requireExif ?? true,
    });
  }
  if (d.workflow) {
    validateWorkflow(doc.entity, d.workflow);
    doc.workflow = {
      extraStates: d.workflow.extraStates || [],
      finalizeRequiresPhotos: d.workflow.finalizeRequiresPhotos
        ?? doc.workflow?.finalizeRequiresPhotos
        ?? true,
    };
  }
  if (Array.isArray(d.fields)) {
    await resolveFieldIds(d.fields);
    doc.fields = d.fields;
  }

  doc.configVersion = (doc.configVersion || 1) + 1;
  doc.updatedBy = req.user._id;
  await doc.save();

  invalidateSnapshotCache(doc.entity, doc.code);

  await audit({
    req,
    action: 'EVENT_TYPE_UPDATE',
    targetType: 'EventTypeConfig',
    targetId: doc._id,
    targetLabel: `${doc.entity}:${doc.code}`,
    before,
    after: doc.toObject(),
  });

  ok(res, doc);
});

// ─── Delete ───────────────────────────────────────────────────────

// DELETE /admin/events/types/:id — only valid for non-system rows
// AND only when no Meeting/Activity is using the code. Built-in
// types cannot be deleted; deactivate via PATCH instead.
exports.remove = asyncHandler(async (req, res) => {
  const doc = await EventTypeConfig.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Event type not found');
  if (doc.isSystem) {
    throw new ApiError(400, 'INVALID_OPERATION', 'Built-in event types cannot be deleted; deactivate instead.');
  }

  // Block delete if any Meeting/Activity references this type. We
  // check both `typeCode` (post-cutover) and `type` (legacy enum) so
  // the guard works during the migration window.
  const Model = doc.entity === 'MEETING'
    ? require('../models/Meeting')
    : require('../models/Activity');
  const inUse = await Model.countDocuments({
    $or: [{ typeCode: doc.code }, { type: doc.code }],
  });
  if (inUse > 0) {
    throw new ApiError(409, 'IN_USE',
      `Type is in use by ${inUse} ${doc.entity.toLowerCase()}(s). Deactivate instead.`);
  }

  await doc.deleteOne();
  invalidateSnapshotCache(doc.entity, doc.code);

  await audit({
    req,
    action: 'EVENT_TYPE_DELETE',
    targetType: 'EventTypeConfig',
    targetId: doc._id,
    targetLabel: `${doc.entity}:${doc.code}`,
    before: doc.toObject(),
  });

  ok(res, { deleted: true });
});

// ─── Snapshot preview ─────────────────────────────────────────────

// GET /admin/events/types/:id/snapshot — let the admin see exactly
// what would be frozen on the next create+finalize. Useful for
// verifying labels/order/exports before cutting over.
exports.previewSnapshot = asyncHandler(async (req, res) => {
  const doc = await EventTypeConfig.findById(req.params.id).populate({
    path: 'fields',
    match: { isActive: true },
  });
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Event type not found');

  // We don't write a snapshot row here — just preview the payload
  // that materialise() would produce.
  const sortedFields = (doc.fields || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  const preview = {
    entity: doc.entity,
    typeCode: doc.code,
    typeLabel: doc.label,
    configVersion: doc.configVersion,
    appliesTo: doc.appliesTo,
    photoPolicy: doc.photoPolicy,
    workflow: doc.workflow,
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
