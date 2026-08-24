const fs = require('fs');
const asyncHandler = require('express-async-handler');
const Activity = require('../models/Activity');
const { ok, created, ApiError } = require('../utils/response');
const { canManageMeetings, resolveUnitChain } = require('../utils/unitScope');
const { inspectPhoto } = require('../utils/photoMetadata');
const dynamicFormService = require('../services/dynamicFormService');
const configSnapshotService = require('../services/configSnapshotService');
const responsibilityHookService = require('../services/responsibilityHookService');
const activityService = require('../services/activityService');

// Mirror of the helper in meetingController — resolves typeCode,
// materialises the snapshot, validates dynamicData, enforces body
// applicability. Kept local so each controller is self-contained.
async function resolveEventConfig(d, entity) {
  const rawCode = (d.typeCode || d.type || '').toString().toUpperCase();
  if (!rawCode) throw new ApiError(400, 'TYPE_REQUIRED', 'type or typeCode is required');

  const { snapshot, config } = await configSnapshotService.materialise(entity, rawCode);

  const requestedBody = (d.body === 'COMMITTEE') ? 'COMMITTEE' : 'EXECUTIVE';
  const appliesTo = config.appliesTo || {};
  if (requestedBody === 'EXECUTIVE' && appliesTo.executive === false) {
    throw new ApiError(400, 'BODY_NOT_ALLOWED', `Type "${rawCode}" cannot be run by the Executive body`);
  }
  if (requestedBody === 'COMMITTEE' && appliesTo.committee === false) {
    throw new ApiError(400, 'BODY_NOT_ALLOWED', `Type "${rawCode}" cannot be run by the Committee body`);
  }

  const dynamicData = dynamicFormService.validate(d.dynamicData || {}, snapshot.resolvedFields);
  return { snapshot, config, typeCode: rawCode, dynamicData, body: requestedBody };
}

exports.list = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, type, state, scope, body } = req.query;
  const filter = {};
  if (unitLevel && unitId) {
    if (scope === 'subtree') {
      const chain = await resolveUnitChain(unitLevel, unitId);
      if (!chain) throw new ApiError(400, 'INVALID_UNIT', 'Unit not found');
      if (unitLevel === 'BASIC_UNIT') filter.basicUnitId = chain.basicUnitId;
      else if (unitLevel === 'AREA') filter.areaId = chain.areaId;
      else if (unitLevel === 'DISTRICT') filter.districtId = chain.districtId;
      else if (unitLevel === 'PROVINCE') filter.provinceId = chain.provinceId;
    } else {
      filter.unitLevel = unitLevel;
      filter.unitId = unitId;
    }
  }
  if (type) filter.type = type;
  if (state) filter.state = state;
  if (body === 'EXECUTIVE' || body === 'NON_COMMITTEE') {
    filter.$or = [{ body: 'EXECUTIVE' }, { body: { $exists: false } }, { body: null }];
  } else if (body === 'COMMITTEE') {
    filter.body = 'COMMITTEE';
  }

  const items = await Activity.find(filter)
    .sort({ startAt: -1 })
    .limit(200)
    .populate('leadMemberId', 'fullName memberId')
    .populate('basicUnitId', 'name')
    .populate('areaId', 'name')
    .populate('districtId', 'name code')
    .populate('provinceId', 'name code');
  ok(res, items);
});

exports.create = asyncHandler(async (req, res) => {
  if (!canManageMeetings(req.user)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only Senior Mawin / Admin may record activities');
  }
  const d = req.body;
  const chain = await resolveUnitChain(d.unitLevel, d.unitId);
  if (!chain) throw new ApiError(400, 'INVALID_UNIT', 'Unit not found');

  // Resolve EventTypeConfig + snapshot, validate dynamic fields,
  // confirm body applicability.
  const { snapshot, typeCode, dynamicData, body } = await resolveEventConfig(d, 'ACTIVITY');

  // Legacy CAMPAIGN sub-document — kept as-is for now since the
  // export controller still reads activity.campaign.*. PR 4 polish
  // could migrate these into dynamicData via FieldDefinitions.
  const campaign = (typeCode === 'CAMPAIGN') ? {
    householdsVisited: d.campaign_householdsVisited,
    peopleContacted: d.campaign_peopleContacted,
    pamphletsDistributed: d.campaign_pamphletsDistributed,
    expectedJoiners: d.campaign_expectedJoiners,
    actualJoiners: d.campaign_actualJoiners,
    volunteerHours: d.campaign_volunteerHours,
  } : undefined;

  const a = await Activity.create({
    unitLevel: d.unitLevel,
    unitId: d.unitId,
    ...chain,
    body,
    type: typeCode,
    typeCode,
    configSnapshotId: snapshot._id,
    dynamicData,
    title: d.title,
    description: d.description,
    startAt: d.startAt,
    endAt: d.endAt,
    venue: d.venue,
    leadMemberId: d.leadMemberId,
    externalAttendanceEstimate: d.externalAttendanceEstimate,
    state: d.state || 'PLANNED',
    outcomeNotes: d.outcomeNotes,
    campaign,
    createdBy: req.user._id,
  });

  // Organizer + named lead both did party work here.
  const common = {
    req,
    chain,
    unitLevel: d.unitLevel,
    unitId: d.unitId,
    targetType: 'Activity',
    targetId: a._id,
    targetLabel: a.title,
  };
  activityService.record({ ...common, action: 'ACTIVITY_CREATED' }).catch(() => {});
  if (a.leadMemberId && String(a.leadMemberId) !== String(req.user.memberId || '')) {
    activityService.record({
      ...common,
      action: 'ACTIVITY_PARTICIPATION',
      memberId: a.leadMemberId,
    }).catch(() => {});
  }

  created(res, a);
});

exports.complete = asyncHandler(async (req, res) => {
  if (!canManageMeetings(req.user)) throw new ApiError(403, 'FORBIDDEN', 'Forbidden');
  const a = await Activity.findById(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', 'Activity not found');

  // ACT-002: photo gate now driven by EventTypeConfig.photoPolicy.
  // Falls back to the historical "≥2 for PROTEST/JALSA/CAMPAIGN"
  // rule for records that pre-date the snapshot backfill — which
  // shouldn't happen post-PR-2, but we keep the safety net.
  let minCount = 0;
  if (a.configSnapshotId) {
    const snapshot = await configSnapshotService.getById(a.configSnapshotId);
    const policy = snapshot?.photoPolicy || {};
    if (policy.required) minCount = Math.max(0, parseInt(policy.minCount, 10) || 0);
  } else if (['PROTEST', 'JALSA', 'CAMPAIGN'].includes(a.type)) {
    minCount = 2;
  }
  if (minCount > 0 && (a.photos || []).length < minCount) {
    throw new ApiError(
      400,
      'PHOTO_REQUIRED',
      `At least ${minCount} photo${minCount === 1 ? '' : 's'} required to complete this activity`,
    );
  }
  a.state = 'COMPLETED';
  a.outcomeNotes = req.body.outcomeNotes ?? a.outcomeNotes;
  await a.save();

  // PR U5 — fire-and-forget responsibility hook. Same pattern as
  // meeting finalize: walks templates with trigger.event=
  // ACTIVITY_COMPLETED, idempotent on (templateId, activity._id).
  responsibilityHookService.onActivityCompleted(a, req.user).catch(() => {});

  // Completion credits the officer, and every listed participant —
  // taking part in a party activity is exactly the kind of work the
  // active/inactive rule is meant to see.
  const chain = {
    basicUnitId: a.basicUnitId,
    areaId: a.areaId,
    districtId: a.districtId,
    provinceId: a.provinceId,
  };
  const common = {
    req,
    chain,
    unitLevel: a.unitLevel,
    unitId: a.unitId,
    targetType: 'Activity',
    targetId: a._id,
    targetLabel: a.title,
  };
  activityService.record({ ...common, action: 'ACTIVITY_COMPLETED' }).catch(() => {});
  activityService.recordMany(
    [...(a.participants || []), a.leadMemberId].filter(Boolean),
    { ...common, action: 'ACTIVITY_PARTICIPATION' },
  ).catch(() => {});

  ok(res, a);
});

exports.uploadPhotos = asyncHandler(async (req, res) => {
  if (!canManageMeetings(req.user)) throw new ApiError(403, 'FORBIDDEN', 'Forbidden');
  const a = await Activity.findById(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', 'Activity not found');

  // PR F1 — photo policy from snapshot. Same pattern as
  // meetingController.uploadPhotos.
  let policyReqGps = true;
  let policyReqExif = true;
  if (a.configSnapshotId) {
    const snap = await configSnapshotService.getById(a.configSnapshotId);
    if (snap?.photoPolicy) {
      policyReqGps = snap.photoPolicy.requireGps !== false;
      policyReqExif = snap.photoPolicy.requireExif !== false;
    }
  }

  const files = req.files || [];
  const accepted = [];
  const rejected = [];
  const existingHashes = new Set((a.photos || []).map((p) => p.sha256).filter(Boolean));

  for (const f of files) {
    const verdict = await inspectPhoto(f.path, {
      eventStart: a.startAt,
      requireGps: policyReqGps,
      requireExif: policyReqExif,
    });
    if (!verdict.ok) {
      rejected.push({ filename: f.originalname, reason: verdict.reason });
      try { await fs.promises.unlink(f.path); } catch { /* ignore */ }
      continue;
    }
    if (existingHashes.has(verdict.sha256)) {
      rejected.push({ filename: f.originalname, reason: 'Duplicate of an already-uploaded photo for this activity.' });
      try { await fs.promises.unlink(f.path); } catch { /* ignore */ }
      continue;
    }
    existingHashes.add(verdict.sha256);
    a.photos.push({
      url: `/uploads/${f.filename}`,
      capturedAt: verdict.capturedAt,
      gps: verdict.gps,
      sha256: verdict.sha256,
    });
    accepted.push(f.originalname);
  }

  if (accepted.length === 0 && rejected.length > 0) {
    throw new ApiError(400, 'PHOTO_REJECTED', `All photos rejected. ${rejected.map((r) => `${r.filename}: ${r.reason}`).join(' | ')}`);
  }

  await a.save();
  ok(res, { activity: a, accepted, rejected });
});

exports.cancel = asyncHandler(async (req, res) => {
  if (!canManageMeetings(req.user)) throw new ApiError(403, 'FORBIDDEN', 'Forbidden');
  const a = await Activity.findById(req.params.id);
  if (!a) throw new ApiError(404, 'NOT_FOUND', 'Activity not found');
  if (a.state === 'COMPLETED') throw new ApiError(400, 'INVALID_STATE', 'Cannot cancel completed activity');
  a.state = 'CANCELLED';
  a.outcomeNotes = (a.outcomeNotes || '') + (req.body.reason ? `\n[CANCELLED] ${req.body.reason}` : '\n[CANCELLED]');
  await a.save();
  ok(res, a);
});
