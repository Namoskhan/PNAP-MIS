const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Member = require('../models/Member');
const Meeting = require('../models/Meeting');
const Activity = require('../models/Activity');
const Donation = require('../models/Donation');
const Expense = require('../models/Expense');
const RoleAssignment = require('../models/RoleAssignment');
const BasicUnit = require('../models/BasicUnit');
const Area = require('../models/Area');
const District = require('../models/District');
const { ok, ApiError } = require('../utils/response');
const { resolveUnitChain } = require('../utils/unitScope');
const analyticsService = require('../services/analyticsService');

// Member roster filter — uses the denormalized chain id because
// Member records live at BU level only (an Area has no direct
// members of its own; its membership IS the union of its BUs).
function memberScopeFilter(unitLevel, chain) {
  if (unitLevel === 'BASIC_UNIT') return { basicUnitId: chain.basicUnitId };
  if (unitLevel === 'AREA') return { areaId: chain.areaId };
  if (unitLevel === 'DISTRICT') return { districtId: chain.districtId };
  if (unitLevel === 'PROVINCE') return { provinceId: chain.provinceId };
  return {}; // CENTRAL — everyone
}

// Operational records (meetings, activities, donations, expenses)
// carry unitLevel + unitId for the level they were authored at.
// Filter by THAT pair so an Area dashboard shows only what was
// recorded at the Area level, not aggregated up from BUs. Subtree
// roll-ups remain available via the dedicated /finance + /reports
// `scope=subtree` flow.
//
// IMPORTANT: aggregate's $match does NOT auto-cast strings to
// ObjectId the way Mongoose's find does. Cast unitId explicitly
// or the pipeline silently matches nothing.
function ownUnitFilter(unitLevel, unitId) {
  if (unitLevel === 'CENTRAL') return { unitLevel: 'CENTRAL' };
  const oid = unitId instanceof mongoose.Types.ObjectId
    ? unitId
    : new mongoose.Types.ObjectId(String(unitId));
  return { unitLevel, unitId: oid };
}

function subtreeFilter(unitLevel, chain) {
  const oid = (v) => {
    try { return new mongoose.Types.ObjectId(String(v)); } catch { return null; }
  };
  if (unitLevel === 'BASIC_UNIT') return { basicUnitId: oid(chain.basicUnitId) };
  if (unitLevel === 'AREA') return { areaId: oid(chain.areaId) };
  if (unitLevel === 'DISTRICT') return { districtId: oid(chain.districtId) };
  if (unitLevel === 'PROVINCE') return { provinceId: oid(chain.provinceId) };
  return {}; // CENTRAL — whole organization
}

exports.unitDashboard = asyncHandler(async (req, res) => {
  const { unitLevel, unitId } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');

  let chain = {};
  if (unitLevel !== 'CENTRAL') {
    if (!unitId) throw new ApiError(400, 'VALIDATION_ERROR', 'unitId required');
    chain = await resolveUnitChain(unitLevel, unitId);
    if (!chain) throw new ApiError(400, 'INVALID_UNIT', 'Unit not found');
  }
  const memberFilter = memberScopeFilter(unitLevel, chain);
  const ownFilter = ownUnitFilter(unitLevel, unitId);
  const subFilter = unitLevel === 'BASIC_UNIT' ? ownFilter : subtreeFilter(unitLevel, chain);

  const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [
    members, activeMembers, pending, meetings30, finalizedMeetings, supSum,
    activities30, donAgg, expAgg, subordinateUnits,
    rollupMeetings30, rollupActivities30, rollupDonAgg, rollupExpAgg,
  ] = await Promise.all([
    Member.countDocuments(memberFilter),
    Member.countDocuments({ ...memberFilter, status: 'ACTIVE' }),
    Member.countDocuments({ ...memberFilter, status: 'PENDING_APPROVAL' }),
    Meeting.countDocuments({ ...ownFilter, startAt: { $gte: since30 } }),
    Meeting.aggregate([
      { $match: { ...ownFilter, state: 'FINALIZED' } },
      { $group: { _id: null, total: { $sum: 1 }, withSupervisor: { $sum: { $cond: ['$supervisorAttended', 1, 0] } } } },
    ]),
    Promise.resolve(null),
    Activity.countDocuments({ ...ownFilter, startAt: { $gte: since30 } }),
    Donation.aggregate([{ $match: ownFilter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Expense.aggregate([{ $match: { ...ownFilter, state: 'APPROVED' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    countSubordinateUnits(unitLevel, chain),
    // Subtree rollups (all subordinate units + own unit)
    unitLevel === 'BASIC_UNIT' ? Promise.resolve(null) : Meeting.countDocuments({ ...subFilter, startAt: { $gte: since30 } }),
    unitLevel === 'BASIC_UNIT' ? Promise.resolve(null) : Activity.countDocuments({ ...subFilter, startAt: { $gte: since30 } }),
    unitLevel === 'BASIC_UNIT' ? Promise.resolve(null) : Donation.aggregate([{ $match: subFilter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    unitLevel === 'BASIC_UNIT' ? Promise.resolve(null) : Expense.aggregate([{ $match: { ...subFilter, state: 'APPROVED' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);

  const fm = finalizedMeetings[0] || { total: 0, withSupervisor: 0 };
  const supervisoryComplianceRate = fm.total ? Math.round((fm.withSupervisor / fm.total) * 100) : null;

  const rollup = unitLevel === 'BASIC_UNIT' ? null : {
    totalUnits: Object.values(subordinateUnits || {}).reduce((a, b) => a + b, 0),
    totalMembers: activeMembers,
    meetings30: rollupMeetings30 ?? meetings30,
    activities30: rollupActivities30 ?? activities30,
    donations: (rollupDonAgg && rollupDonAgg[0]?.total) || 0,
    expenses: (rollupExpAgg && rollupExpAgg[0]?.total) || 0,
    balance: ((rollupDonAgg && rollupDonAgg[0]?.total) || 0) - ((rollupExpAgg && rollupExpAgg[0]?.total) || 0),
  };

  // ─── Analytics derived from meetings + activities (SRS §7-8) ─────
  // Computed in parallel for the same own-unit scope used above.
  const since6mo = new Date();
  since6mo.setMonth(since6mo.getMonth() - 5);  // last 6 months
  since6mo.setDate(1);
  since6mo.setHours(0, 0, 0, 0);

  const [
    meetingsByType, activitiesByType,
    meetingQuality, campaignAgg,
    meetingsTrend, activitiesTrend,
  ] = await Promise.all([
    // Meeting counts grouped by type (last 30 days at this unit).
    Meeting.aggregate([
      { $match: { ...ownFilter, startAt: { $gte: since30 } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
    // Activity counts grouped by type (last 30 days at this unit).
    Activity.aggregate([
      { $match: { ...ownFilter, startAt: { $gte: since30 } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
    // Engagement quality across finalized meetings (all-time at this
    // unit): attendance rate, photo coverage, GPS-tagged %.
    Meeting.aggregate([
      { $match: { ...ownFilter, state: 'FINALIZED' } },
      {
        $project: {
          attendanceTotal: { $size: { $ifNull: ['$attendance', []] } },
          attendancePresent: {
            $size: {
              $filter: {
                input: { $ifNull: ['$attendance', []] },
                cond: { $in: ['$$this.status', ['PRESENT', 'LATE']] },
              },
            },
          },
          photoCount: { $size: { $ifNull: ['$photos', []] } },
          hasGps: { $cond: [{ $and: [{ $ne: ['$gpsLat', null] }, { $ne: ['$gpsLng', null] }] }, 1, 0] },
        },
      },
      {
        $group: {
          _id: null,
          finalizedTotal: { $sum: 1 },
          rosterSum: { $sum: '$attendanceTotal' },
          presentSum: { $sum: '$attendancePresent' },
          photosSum: { $sum: '$photoCount' },
          gpsTaggedSum: { $sum: '$hasGps' },
          meetingsWithPhotos: { $sum: { $cond: [{ $gt: ['$photoCount', 0] }, 1, 0] } },
        },
      },
    ]),
    // Campaign metrics — aggregated across all activity types that
    // expose campaign attributes (people contacted, expected vs
    // actual joiners, volunteer hours).
    Activity.aggregate([
      { $match: { ...ownFilter, 'campaign.expectedJoiners': { $exists: true, $ne: null } } },
      {
        $group: {
          _id: null,
          campaigns: { $sum: 1 },
          peopleContacted: { $sum: { $ifNull: ['$campaign.peopleContacted', 0] } },
          expectedJoiners: { $sum: { $ifNull: ['$campaign.expectedJoiners', 0] } },
          actualJoiners: { $sum: { $ifNull: ['$campaign.actualJoiners', 0] } },
          householdsVisited: { $sum: { $ifNull: ['$campaign.householdsVisited', 0] } },
          pamphletsDistributed: { $sum: { $ifNull: ['$campaign.pamphletsDistributed', 0] } },
          volunteerHours: { $sum: { $ifNull: ['$campaign.volunteerHours', 0] } },
        },
      },
    ]),
    // Monthly meeting count for trend chart (last 6 months).
    Meeting.aggregate([
      { $match: { ...ownFilter, startAt: { $gte: since6mo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$startAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    // Monthly activity count for trend chart (last 6 months).
    Activity.aggregate([
      { $match: { ...ownFilter, startAt: { $gte: since6mo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$startAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const mq = meetingQuality[0] || { finalizedTotal: 0, rosterSum: 0, presentSum: 0, photosSum: 0, gpsTaggedSum: 0, meetingsWithPhotos: 0 };
  const cm = campaignAgg[0] || null;

  // Backfill last-6-months bucket so the trend chart has even spacing
  // even when a month has no entries.
  const trendBuckets = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const m = meetingsTrend.find((r) => r._id === key)?.count || 0;
    const a = activitiesTrend.find((r) => r._id === key)?.count || 0;
    trendBuckets.push({ month: key, meetings: m, activities: a });
  }

  const analytics = {
    meetingsByType: meetingsByType.map((r) => ({ type: r._id, count: r.count })),
    activitiesByType: activitiesByType.map((r) => ({ type: r._id, count: r.count })),
    quality: {
      finalizedTotal: mq.finalizedTotal,
      attendanceRate: mq.rosterSum ? Math.round((mq.presentSum / mq.rosterSum) * 100) : null,
      photosUploaded: mq.photosSum,
      meetingsWithPhotos: mq.meetingsWithPhotos,
      photoCoveragePct: mq.finalizedTotal ? Math.round((mq.meetingsWithPhotos / mq.finalizedTotal) * 100) : null,
      gpsTaggedPct: mq.finalizedTotal ? Math.round((mq.gpsTaggedSum / mq.finalizedTotal) * 100) : null,
    },
    campaigns: cm ? {
      total: cm.campaigns,
      peopleContacted: cm.peopleContacted,
      expectedJoiners: cm.expectedJoiners,
      actualJoiners: cm.actualJoiners,
      conversionPct: cm.expectedJoiners ? Math.round((cm.actualJoiners / cm.expectedJoiners) * 100) : null,
      householdsVisited: cm.householdsVisited,
      pamphletsDistributed: cm.pamphletsDistributed,
      volunteerHours: cm.volunteerHours,
    } : null,
    trend: trendBuckets,
  };

  // SRS §3.1 / §3.2 — committee dashboard panel. We surface it at
  // AREA (Elaqayi Committee) and DISTRICT (Zilla Committee) levels.
  let committee = null;
  if (unitLevel === 'AREA') {
    const Area = require('../models/Area');
    const RoleAssignment = require('../models/RoleAssignment');
    const PermanentMembership = require('../models/PermanentMembership');
    const area = await Area.findById(unitId).lean();
    if (area) {
      // RoleAssignment doesn't denormalize areaId; resolve BU IDs first.
      const buIds = await BasicUnit.find({ areaId: area._id, isActive: true }).distinct('_id');
      const [executiveCount, subordinateCount, permanentCount] = await Promise.all([
        RoleAssignment.countDocuments({ unitLevel: 'AREA', unitId: area._id, state: 'APPROVED', endedAt: { $exists: false } }),
        RoleAssignment.countDocuments({
          unitLevel: 'BASIC_UNIT',
          unitId: { $in: buIds },
          roleCode: { $in: ['SECRETARY', 'SENIOR_MAWIN'] },
          state: 'APPROVED',
          endedAt: { $exists: false },
        }),
        PermanentMembership.countDocuments({ unitLevel: 'AREA', unitId: area._id, isActive: true }),
      ]);
      const [committeeMeetings30, committeeActivities30] = await Promise.all([
        Meeting.countDocuments({ ...ownFilter, body: 'COMMITTEE', startAt: { $gte: since30 } }),
        Activity.countDocuments({ ...ownFilter, body: 'COMMITTEE', startAt: { $gte: since30 } }),
      ]);
      committee = {
        kind: 'ELAQAYI',
        name: area.committee?.name || `${area.name} Elaqayi Committee`,
        formedAt: area.committee?.formedAt || null,
        executiveCount,
        subordinateCount,
        subordinateLabel: 'BU Office-Holders',
        permanentCount,
        totalMembers: executiveCount + subordinateCount + permanentCount,
        meetings30: committeeMeetings30,
        activities30: committeeActivities30,
      };
    }
  } else if (unitLevel === 'DISTRICT') {
    const District = require('../models/District');
    const Area = require('../models/Area');
    const RoleAssignment = require('../models/RoleAssignment');
    const PermanentMembership = require('../models/PermanentMembership');
    const district = await District.findById(unitId).lean();
    if (district) {
      const areaIds = await Area.find({ districtId: district._id, isActive: true }).distinct('_id');
      const [executiveCount, subordinateCount, permanentCount] = await Promise.all([
        RoleAssignment.countDocuments({ unitLevel: 'DISTRICT', unitId: district._id, state: 'APPROVED', endedAt: { $exists: false } }),
        RoleAssignment.countDocuments({
          unitLevel: 'AREA',
          unitId: { $in: areaIds },
          roleCode: { $in: ['SECRETARY', 'SENIOR_MAWIN'] },
          state: 'APPROVED',
          endedAt: { $exists: false },
        }),
        PermanentMembership.countDocuments({ unitLevel: 'DISTRICT', unitId: district._id, isActive: true }),
      ]);
      const [committeeMeetings30, committeeActivities30] = await Promise.all([
        Meeting.countDocuments({ ...ownFilter, body: 'COMMITTEE', startAt: { $gte: since30 } }),
        Activity.countDocuments({ ...ownFilter, body: 'COMMITTEE', startAt: { $gte: since30 } }),
      ]);
      committee = {
        kind: 'ZILLA',
        name: district.committee?.name || `${district.name} Zilla Committee`,
        formedAt: district.committee?.formedAt || null,
        executiveCount,
        subordinateCount,
        subordinateLabel: 'Area Office-Holders',
        permanentCount,
        totalMembers: executiveCount + subordinateCount + permanentCount,
        meetings30: committeeMeetings30,
        activities30: committeeActivities30,
      };
    }
  } else if (unitLevel === 'CENTRAL') {
    const Central = require('../models/Central');
    const Province = require('../models/Province');
    const RoleAssignment = require('../models/RoleAssignment');
    const PermanentMembership = require('../models/PermanentMembership');
    const central = await Central.findById(unitId).lean();
    if (central) {
      const provinceIds = await Province.find({ isActive: true }).distinct('_id');
      const [executiveCount, subordinateCount, permanentCount] = await Promise.all([
        RoleAssignment.countDocuments({ unitLevel: 'CENTRAL', unitId: central._id, state: 'APPROVED', endedAt: { $exists: false } }),
        RoleAssignment.countDocuments({
          unitLevel: 'PROVINCE',
          unitId: { $in: provinceIds },
          roleCode: { $in: ['PRESIDENT', 'GENERAL_SECRETARY', 'FIRST_SECRETARY'] },
          state: 'APPROVED',
          endedAt: { $exists: false },
        }),
        PermanentMembership.countDocuments({ unitLevel: 'CENTRAL', unitId: central._id, isActive: true }),
      ]);
      const [committeeMeetings30, committeeActivities30] = await Promise.all([
        Meeting.countDocuments({ unitLevel: 'CENTRAL', body: 'COMMITTEE', startAt: { $gte: since30 } }),
        Activity.countDocuments({ unitLevel: 'CENTRAL', body: 'COMMITTEE', startAt: { $gte: since30 } }),
      ]);
      committee = {
        kind: 'CENTRAL',
        name: central.committee?.name || 'Central Committee',
        formedAt: central.committee?.formedAt || null,
        executiveCount,
        subordinateCount,
        subordinateLabel: 'Provincial Presidents & GS',
        permanentCount,
        totalMembers: executiveCount + subordinateCount + permanentCount,
        meetings30: committeeMeetings30,
        activities30: committeeActivities30,
      };
    }
  } else if (unitLevel === 'PROVINCE') {
    const Province = require('../models/Province');
    const RoleAssignment = require('../models/RoleAssignment');
    const PermanentMembership = require('../models/PermanentMembership');
    const province = await Province.findById(unitId).lean();
    if (province) {
      const districtIds = await District.find({ provinceId: province._id, isActive: true }).distinct('_id');
      const [executiveCount, subordinateCount, permanentCount] = await Promise.all([
        RoleAssignment.countDocuments({ unitLevel: 'PROVINCE', unitId: province._id, state: 'APPROVED', endedAt: { $exists: false } }),
        RoleAssignment.countDocuments({
          unitLevel: 'DISTRICT',
          unitId: { $in: districtIds },
          roleCode: { $in: ['SECRETARY', 'SENIOR_MAWIN'] },
          state: 'APPROVED',
          endedAt: { $exists: false },
        }),
        PermanentMembership.countDocuments({ unitLevel: 'PROVINCE', unitId: province._id, isActive: true }),
      ]);
      const [committeeMeetings30, committeeActivities30] = await Promise.all([
        Meeting.countDocuments({ ...ownFilter, body: 'COMMITTEE', startAt: { $gte: since30 } }),
        Activity.countDocuments({ ...ownFilter, body: 'COMMITTEE', startAt: { $gte: since30 } }),
      ]);
      committee = {
        kind: 'SOBAYI',
        name: province.committee?.name || `${province.name} Sobayi Committee`,
        formedAt: province.committee?.formedAt || null,
        executiveCount,
        subordinateCount,
        subordinateLabel: 'District Office-Holders',
        permanentCount,
        totalMembers: executiveCount + subordinateCount + permanentCount,
        meetings30: committeeMeetings30,
        activities30: committeeActivities30,
      };
    }
  }

  ok(res, {
    members: { total: members, active: activeMembers, pending },
    meetings: { last30Days: meetings30, finalizedTotal: fm.total, supervisoryComplianceRate },
    activities: { last30Days: activities30 },
    finance: {
      donations: donAgg[0]?.total || 0,
      expenses: expAgg[0]?.total || 0,
      balance: (donAgg[0]?.total || 0) - (expAgg[0]?.total || 0),
    },
    subordinateUnits,
    rollup,
    committee,
    analytics,
  });
});

async function countSubordinateUnits(unitLevel, chain) {
  if (unitLevel === 'AREA') {
    return { basicUnits: await BasicUnit.countDocuments({ areaId: chain.areaId, isActive: true }) };
  }
  if (unitLevel === 'DISTRICT') {
    return {
      areas: await Area.countDocuments({ districtId: chain.districtId, isActive: true }),
      basicUnits: await BasicUnit.countDocuments({ districtId: chain.districtId, isActive: true }),
    };
  }
  if (unitLevel === 'PROVINCE') {
    return {
      districts: await District.countDocuments({ provinceId: chain.provinceId, isActive: true }),
      areas: await Area.countDocuments({ provinceId: chain.provinceId, isActive: true }),
      basicUnits: await BasicUnit.countDocuments({ provinceId: chain.provinceId, isActive: true }),
    };
  }
  if (unitLevel === 'CENTRAL') {
    return {
      provinces: await mongoose.model('Province').countDocuments({ isActive: true }),
      districts: await District.countDocuments({ isActive: true }),
      areas: await Area.countDocuments({ isActive: true }),
      basicUnits: await BasicUnit.countDocuments({ isActive: true }),
    };
  }
  return {};
}

// ─── Executive analytics (Super Admin) ─────────────────────────────
//
// Thin by design: parse the query into a filter, delegate to
// analyticsService, respond. No aggregation lives in this file — see
// services/analyticsService.js for every pipeline behind these six
// endpoints. Authorization is the route's job (dashboardRoutes gates
// all of them on SUPER_ADMIN).

exports.executiveSummary = asyncHandler(async (req, res) => {
  const f = analyticsService.parseFilters(req.query);
  ok(res, await analyticsService.summary(f));
});

// Kept at its original path and original response shape (a bare
// province array) so anything already calling it is unaffected.
exports.provinceBreakdown = asyncHandler(async (req, res) => {
  const f = analyticsService.parseFilters(req.query);
  ok(res, await analyticsService.provinceBreakdown(f));
});

// Drill-down sibling of the above: returns the children of whatever
// scope the filters describe, so one endpoint serves every level of
// the Pakistan → Province → District → Area → Basic Unit walk.
exports.orgBreakdown = asyncHandler(async (req, res) => {
  const f = analyticsService.parseFilters(req.query);
  ok(res, await analyticsService.orgBreakdown(f));
});

exports.scope = asyncHandler(async (req, res) => {
  const f = analyticsService.parseFilters(req.query);
  ok(res, await analyticsService.scopePath(f));
});

exports.membership = asyncHandler(async (req, res) => {
  const f = analyticsService.parseFilters(req.query);
  ok(res, await analyticsService.membershipAnalytics(f));
});

exports.meetings = asyncHandler(async (req, res) => {
  const f = analyticsService.parseFilters(req.query);
  ok(res, await analyticsService.meetingsAnalytics(f, {
    // Calendar vs the project's existing Pakistani fiscal year.
    yearBasis: req.query.yearBasis,
    years: req.query.years,
  }));
});

exports.campaigns = asyncHandler(async (req, res) => {
  const f = analyticsService.parseFilters(req.query);
  ok(res, await analyticsService.campaignsAnalytics(f));
});

exports.reports = asyncHandler(async (req, res) => {
  const f = analyticsService.parseFilters(req.query);
  ok(res, await analyticsService.reportsAnalytics(f));
});

exports.activityFeed = asyncHandler(async (req, res) => {
  const f = analyticsService.parseFilters(req.query);
  ok(res, await analyticsService.recentActivity(f, req.query.limit));
});

exports.activityTrend = asyncHandler(async (req, res) => {
  const f = analyticsService.parseFilters(req.query);
  ok(res, await analyticsService.activityTrend(f, req.query.months));
});

exports.inactiveMembers = asyncHandler(async (req, res) => {
  const f = analyticsService.parseFilters(req.query);
  ok(res, await analyticsService.inactiveMembers(f, {
    page: req.query.page,
    limit: req.query.limit,
  }));
});

exports.inactiveUnits = asyncHandler(async (req, res) => {
  const f = analyticsService.parseFilters(req.query);
  ok(res, await analyticsService.inactiveUnits(f, {
    level: req.query.level,
    page: req.query.page,
    limit: req.query.limit,
  }));
});

exports.subordinateBreakdown = asyncHandler(async (req, res) => {
  const { unitLevel, unitId } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');

  // Returns one row per immediate child unit so the parent dashboard
  // can show a comparison table or heatmap (§11.3 / §11.4 / §11.5).
  let children = [];
  if (unitLevel === 'AREA') {
    children = await BasicUnit.find({ areaId: unitId, isActive: true }).select('name').lean();
    return ok(res, await rowsFor(children, 'basicUnitId'));
  }
  if (unitLevel === 'DISTRICT') {
    children = await Area.find({ districtId: unitId, isActive: true }).select('name').lean();
    return ok(res, await rowsFor(children, 'areaId'));
  }
  if (unitLevel === 'PROVINCE') {
    children = await District.find({ provinceId: unitId, isActive: true }).select('name code').lean();
    return ok(res, await rowsFor(children, 'districtId'));
  }
  if (unitLevel === 'CENTRAL') {
    children = await mongoose.model('Province').find({ isActive: true }).select('name code').lean();
    return ok(res, await rowsFor(children, 'provinceId'));
  }
  ok(res, []);
});

async function rowsFor(children, fkField) {
  return Promise.all(children.map(async (c) => {
    const f = { [fkField]: c._id };
    const since30 = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const [members, meetings30, activities30, donAgg, expAgg, fm] = await Promise.all([
      Member.countDocuments({ ...f, status: 'ACTIVE' }),
      Meeting.countDocuments({ ...f, startAt: { $gte: since30 } }),
      Activity.countDocuments({ ...f, startAt: { $gte: since30 } }),
      Donation.aggregate([{ $match: f }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Expense.aggregate([{ $match: { ...f, state: 'APPROVED' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Meeting.aggregate([
        { $match: { ...f, state: 'FINALIZED' } },
        { $group: { _id: null, total: { $sum: 1 }, withSupervisor: { $sum: { $cond: ['$supervisorAttended', 1, 0] } } } },
      ]),
    ]);
    const fmRow = fm[0] || { total: 0, withSupervisor: 0 };
    return {
      _id: c._id,
      name: c.name,
      code: c.code,
      members,
      meetings30,
      activities30,
      donations: donAgg[0]?.total || 0,
      expenses: expAgg[0]?.total || 0,
      balance: (donAgg[0]?.total || 0) - (expAgg[0]?.total || 0),
      supervisoryComplianceRate: fmRow.total ? Math.round((fmRow.withSupervisor / fmRow.total) * 100) : null,
    };
  }));
}
