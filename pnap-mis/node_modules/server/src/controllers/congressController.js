const asyncHandler = require('express-async-handler');
const Congress = require('../models/Congress');
const { ok, created, ApiError } = require('../utils/response');
const { audit } = require('../utils/audit');
const analyticsService = require('../services/analyticsService');

// Congress dates define the boundaries of every Congress-to-Congress
// report, so a change here silently invalidates cached analytics.
// Without this the dashboard keeps serving the OLD period definitions
// for up to the cache TTL — an admin corrects a date, reloads, and
// sees the same wrong numbers.
function refreshAnalytics() {
  try {
    analyticsService.invalidateCache();
  } catch (err) {
    console.warn(`[congress] analytics cache invalidation failed: ${err.message}`);
  }
}

// CRUD for the National Congress calendar. Reads are open to any
// authenticated user (the dashboard's period selector needs them);
// writes are Super Admin only, gated at the route.
//
// Thin by design — the period arithmetic lives in
// services/analyticsService.congressPeriods(), so the dashboard and
// this controller can never disagree about where a period starts.

exports.list = asyncHandler(async (req, res) => {
  const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
  const items = await Congress.find(filter).sort({ heldOn: -1 }).lean();
  ok(res, items);
});

function parseBody(body) {
  const label = (body.label || '').trim();
  if (!label) throw new ApiError(400, 'VALIDATION_ERROR', 'label is required');

  const heldOn = body.heldOn ? new Date(body.heldOn) : null;
  if (!heldOn || isNaN(heldOn.getTime())) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'heldOn must be a valid date');
  }
  // A Congress in the future cannot bound a reporting period over data
  // that already exists, and is almost always a typo in the year.
  if (heldOn.getTime() > Date.now()) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'heldOn cannot be in the future');
  }
  return {
    label,
    heldOn,
    venue: (body.venue || '').trim() || undefined,
    notes: (body.notes || '').trim() || undefined,
  };
}

exports.create = asyncHandler(async (req, res) => {
  const data = parseBody(req.body);
  const clash = await Congress.findOne({ heldOn: data.heldOn, isActive: true }).lean();
  if (clash) {
    throw new ApiError(409, 'DUPLICATE_CONGRESS',
      `A Congress is already recorded on that date ("${clash.label}")`);
  }

  const doc = await Congress.create({ ...data, createdBy: req.user._id });
  await audit({
    req,
    action: 'CONGRESS_CREATE',
    targetType: 'Congress',
    targetId: doc._id,
    targetLabel: doc.label,
    after: data,
  });
  refreshAnalytics();
  created(res, doc);
});

exports.update = asyncHandler(async (req, res) => {
  const doc = await Congress.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Congress not found');

  const data = parseBody(req.body);
  const clash = await Congress.findOne({
    heldOn: data.heldOn, isActive: true, _id: { $ne: doc._id },
  }).lean();
  if (clash) {
    throw new ApiError(409, 'DUPLICATE_CONGRESS',
      `A Congress is already recorded on that date ("${clash.label}")`);
  }

  const before = { label: doc.label, heldOn: doc.heldOn, venue: doc.venue, notes: doc.notes };
  Object.assign(doc, data, { updatedBy: req.user._id });
  await doc.save();

  await audit({
    req,
    action: 'CONGRESS_UPDATE',
    targetType: 'Congress',
    targetId: doc._id,
    targetLabel: doc.label,
    before,
    after: data,
  });
  refreshAnalytics();
  ok(res, doc);
});

// Soft delete. Reports that already cited this period keep resolving;
// only future period-building skips it.
exports.remove = asyncHandler(async (req, res) => {
  const doc = await Congress.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Congress not found');

  doc.isActive = false;
  doc.updatedBy = req.user._id;
  await doc.save();

  await audit({
    req,
    action: 'CONGRESS_DEACTIVATE',
    targetType: 'Congress',
    targetId: doc._id,
    targetLabel: doc.label,
  });
  refreshAnalytics();
  ok(res, doc);
});
