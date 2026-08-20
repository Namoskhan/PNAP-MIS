const asyncHandler = require('express-async-handler');
const EventTypeConfig = require('../models/EventTypeConfig');
const EventConfigSnapshot = require('../models/EventConfigSnapshot');
const { ok, ApiError } = require('../utils/response');
const configSnapshotService = require('../services/configSnapshotService');
const eventLifecycleService = require('../services/eventLifecycleService');

// Public-ish events endpoints — read-only views the meeting/activity
// create forms (PR 4b frontend) need. Authenticated, but not gated
// on MANAGE_EVENT_CONFIG: anyone who can record meetings should be
// able to read the type catalogue and resolved field set.
//
// These endpoints intentionally redact admin-only metadata
// (createdBy, updatedBy, audit hooks) and only ship what the form
// needs to render.

function _publicTypeShape(t) {
  return {
    _id: t._id,
    entity: t.entity,
    code: t.code,
    label: t.label,
    description: t.description,
    isSystem: t.isSystem,
    isActive: t.isActive,
    sortOrder: t.sortOrder,
    appliesTo: t.appliesTo,
    photoPolicy: t.photoPolicy,
    workflow: t.workflow,
    configVersion: t.configVersion,
    fields: (t.fields || []).map((f) => (typeof f === 'object' && f.key) ? {
      _id: f._id,
      key: f.key,
      label: f.label,
      helpText: f.helpText,
      type: f.type,
      required: !!f.required,
      validation: f.validation || {},
      visibility: f.visibility || {},
      reporting: f.reporting || {},
      sortOrder: f.sortOrder ?? 100,
    } : f),
  };
}

// GET /api/events/types?entity=MEETING&body=EXECUTIVE
// Filters to active types and (when body is supplied) only those
// the requested body is allowed to run.
exports.listTypes = asyncHandler(async (req, res) => {
  const { entity, body } = req.query;
  if (entity && !['MEETING', 'ACTIVITY'].includes(entity)) {
    throw new ApiError(400, 'INVALID_ENTITY', 'entity must be MEETING or ACTIVITY');
  }
  const filter = { isActive: true };
  if (entity) filter.entity = entity;

  let types = await EventTypeConfig.find(filter)
    .sort({ entity: 1, sortOrder: 1, label: 1 })
    .populate({ path: 'fields', match: { isActive: true } });

  if (body === 'EXECUTIVE') {
    types = types.filter((t) => t.appliesTo?.executive !== false);
  } else if (body === 'COMMITTEE') {
    types = types.filter((t) => t.appliesTo?.committee !== false);
  } else if (body === 'GENERAL_BODY') {
    types = types.filter((t) => t.code === 'GBM' || t.code === 'GENERAL_BODY');
  }

  ok(res, types.map(_publicTypeShape));
});

// GET /api/events/types/:entity/:code/form
// Returns the resolved form schema (live config + populated fields,
// + the canonical lifecycle states) so the create form can render
// without a follow-up round trip.
exports.getTypeForm = asyncHandler(async (req, res) => {
  const entity = String(req.params.entity || '').toUpperCase();
  const code = String(req.params.code || '').toUpperCase();
  if (!['MEETING', 'ACTIVITY'].includes(entity)) {
    throw new ApiError(400, 'INVALID_ENTITY', 'entity must be MEETING or ACTIVITY');
  }
  const config = await EventTypeConfig.findOne({ entity, code, isActive: true })
    .populate({ path: 'fields', match: { isActive: true } });
  if (!config) throw new ApiError(404, 'NOT_FOUND', `Active ${entity.toLowerCase()} type "${code}" not found`);

  const ordered = eventLifecycleService.orderedStatesFor(entity, config);
  ok(res, {
    type: _publicTypeShape(config),
    lifecycle: {
      core: eventLifecycleService.coreStatesFor(entity),
      ordered,
    },
  });
});

// GET /api/events/snapshots/:id
// Returns a frozen snapshot. Used by detail / edit views of EXISTING
// meetings/activities so the labels + validation match what was
// captured at create-time, even after the live config has drifted.
exports.getSnapshot = asyncHandler(async (req, res) => {
  const snap = await EventConfigSnapshot.findById(req.params.id).lean();
  if (!snap) throw new ApiError(404, 'NOT_FOUND', 'Snapshot not found');
  ok(res, snap);
});

// Touch the imports so the service's transitive deps are loaded
// before the first request — keeps cold-start latency down on the
// first /events/types call.
void configSnapshotService;
