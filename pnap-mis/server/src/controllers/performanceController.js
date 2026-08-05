const asyncHandler = require('express-async-handler');
const Member = require('../models/Member');
const Meeting = require('../models/Meeting');
const Activity = require('../models/Activity');
const Donation = require('../models/Donation');
const Responsibility = require('../models/Responsibility');
const RoleAssignment = require('../models/RoleAssignment');
const { ok, ApiError } = require('../utils/response');
const { memberWithinAreaAdminScope, unitWithinAreaAdminScope } = require('../utils/unitScope');
const performanceEngine = require('../services/performanceEngine');

// Name + code for the unit being reported on, so the report has a
// heading rather than an id. CENTRAL is the singleton national body.
async function describeUnit(unitLevel, unitId) {
  if (unitLevel === 'CENTRAL') return { level: 'CENTRAL', _id: null, name: 'Central (National)' };
  const Model = {
    PROVINCE: require('../models/Province'),
    DISTRICT: require('../models/District'),
    AREA: require('../models/Area'),
    BASIC_UNIT: require('../models/BasicUnit'),
  }[unitLevel];
  if (!Model) throw new ApiError(400, 'VALIDATION_ERROR', `Unknown unitLevel ${unitLevel}`);
  const doc = await Model.findById(unitId).select('name code').lean();
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Unit not found');
  return { level: unitLevel, _id: doc._id, name: doc.name, code: doc.code };
}

// SRS §10 — per-member performance:
//   • meetings attended (PRESENT or LATE)
//   • activities participated
//   • donations collected (donations where this member is the donor)
//   • responsibilities assigned vs completed
//   • study contributions (Study-Circle meetings where they spoke)
exports.memberPerformance = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { from, to } = req.query;
  const m = await Member.findById(id).lean();
  if (!m) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
  if (!memberWithinAreaAdminScope(req.user, m)) {
    throw new ApiError(403, 'FORBIDDEN', 'Member is outside your scope');
  }

  const dateFilter = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to) dateFilter.$lte = new Date(to);
  const dateClause = (Object.keys(dateFilter).length) ? { startAt: dateFilter } : {};

  const [
    meetingsTotal, meetingsPresent, meetingsLate,
    activitiesAsParticipant, activitiesAsLead,
    donAgg, respPending, respCompleted, respCancelled,
    studyContribs,
  ] = await Promise.all([
    Meeting.countDocuments({ 'attendance.memberId': m._id, state: 'FINALIZED', ...dateClause }),
    Meeting.countDocuments({ attendance: { $elemMatch: { memberId: m._id, status: 'PRESENT' } }, state: 'FINALIZED', ...dateClause }),
    Meeting.countDocuments({ attendance: { $elemMatch: { memberId: m._id, status: 'LATE' } }, state: 'FINALIZED', ...dateClause }),
    Activity.countDocuments({ participants: m._id, ...dateClause }),
    Activity.countDocuments({ leadMemberId: m._id, ...dateClause }),
    Donation.aggregate([
      { $match: { donorMemberId: m._id, ...(Object.keys(dateFilter).length ? { receivedAt: dateFilter } : {}) } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Responsibility.countDocuments({ assignedToMemberId: m._id, state: 'PENDING' }),
    Responsibility.countDocuments({ assignedToMemberId: m._id, state: 'COMPLETED' }),
    Responsibility.countDocuments({ assignedToMemberId: m._id, state: 'CANCELLED' }),
    Meeting.find({
      'studyContributions.memberId': m._id,
      type: 'STC',
      state: 'FINALIZED',
      ...dateClause,
    }).select('title startAt studyContributions').lean(),
  ]);

  const respTotal = respPending + respCompleted + respCancelled;
  const studyEntries = (studyContribs || []).flatMap((mt) =>
    (mt.studyContributions || [])
      .filter((s) => String(s.memberId) === String(m._id))
      .map((s) => ({ meetingTitle: mt.title, meetingDate: mt.startAt, topic: s.topic, summary: s.summary }))
  );

  const roles = await RoleAssignment.find({ memberId: m._id, state: 'APPROVED', endedAt: null })
    .select('roleCode customRoleName unitLevel unitId').lean();

  ok(res, {
    member: {
      _id: m._id, fullName: m.fullName, memberId: m.memberId,
      cnic: m.cnic, phone: m.phone, photoUrl: m.photoUrl,
    },
    range: { from: from || null, to: to || null },
    roles,
    meetings: { totalRoster: meetingsTotal, present: meetingsPresent, late: meetingsLate, absent: Math.max(0, meetingsTotal - meetingsPresent - meetingsLate), attendanceRate: meetingsTotal ? Math.round(((meetingsPresent + meetingsLate) / meetingsTotal) * 100) : null },
    activities: { participated: activitiesAsParticipant, led: activitiesAsLead },
    donations: { total: donAgg[0]?.total || 0, count: donAgg[0]?.count || 0 },
    responsibilities: { pending: respPending, completed: respCompleted, cancelled: respCancelled, total: respTotal, completionRate: respTotal ? Math.round((respCompleted / respTotal) * 100) : null },
    studyContributions: studyEntries,
  });
});

// PR U6 — live weighted score for a member. Resolves the active
// PerformanceRuleSet (TIER override → GLOBAL fallback), runs every
// configured metric, returns the composite score plus per-component
// breakdown. Read-only and on-demand; period-snapshot persistence
// is reserved for a follow-up PR.
exports.memberScore = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { from, to, tierCode } = req.query;
  const m = await Member.findById(id).lean();
  if (!m) throw new ApiError(404, 'NOT_FOUND', 'Member not found');
  if (!memberWithinAreaAdminScope(req.user, m)) {
    throw new ApiError(403, 'FORBIDDEN', 'Member is outside your scope');
  }

  // tierCode hint lets a caller force a specific tier's override
  // (e.g. "score this central member as if AREA"). Defaults to the
  // member's own basic-unit tier so AREA-tier rulesets pick up
  // members at a basic unit they oversee.
  const result = await performanceEngine.computeForMember(m._id, { from, to }, {
    tierCode: tierCode || (m.basicUnitId ? 'BASIC_UNIT' : undefined),
  });

  ok(res, {
    member: {
      _id: m._id, fullName: m.fullName, memberId: m.memberId,
    },
    ...result,
  });
});

// ─── Unit performance ─────────────────────────────────────────────
// The unit analogue of memberScore: the same PerformanceRuleSet and
// weights applied to a whole Province / District / Area / Basic Unit,
// so its score sits on the same 0–100 scale as its members'.
exports.unitPerformance = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, from, to } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel is required');
  if (unitLevel !== 'CENTRAL' && !unitId) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'unitId is required for non-CENTRAL units');
  }
  if (!(await unitWithinAreaAdminScope(req.user, unitLevel, unitId))) {
    throw new ApiError(403, 'FORBIDDEN', 'Unit is outside your scope');
  }

  const unit = await describeUnit(unitLevel, unitId);
  const result = await performanceEngine.computeForUnit(unitLevel, unitId, { from, to });
  ok(res, { unit, ...result });
});

// Per-member leaderboard for a unit.
//
// Scores are computed one member at a time by the engine, so this is
// PAGINATED and hard-capped rather than scoring an entire province in
// one request — a 2,000-member province would otherwise mean 10,000
// metric queries in a single call.
exports.unitMemberScores = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, from, to } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel is required');
  if (!(await unitWithinAreaAdminScope(req.user, unitLevel, unitId))) {
    throw new ApiError(403, 'FORBIDDEN', 'Unit is outside your scope');
  }

  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(25, Math.max(1, parseInt(req.query.limit, 10) || 10));
  const scope = performanceEngine.unitScopeFilter(unitLevel, unitId);
  const filter = { ...scope, status: 'ACTIVE' };

  const [total, members] = await Promise.all([
    Member.countDocuments(filter),
    Member.find(filter)
      .sort({ fullName: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('fullName memberId phone basicUnitId')
      .lean(),
  ]);

  // Sequential rather than Promise.all: each score is already five
  // queries, and firing 25 x 5 at once just moves the contention into
  // the driver's connection pool.
  const rows = [];
  for (const m of members) {
    try {
      const r = await performanceEngine.computeForMember(m._id, { from, to }, { tierCode: 'BASIC_UNIT' });
      rows.push({
        _id: m._id,
        fullName: m.fullName,
        memberCode: m.memberId,
        phone: m.phone,
        totalScore: r.totalScore,
        components: r.components.map((c) => ({ metric: c.metric, raw: c.raw, weight: c.weight })),
      });
    } catch (err) {
      // No ruleset, or a metric blew up — the member still belongs in
      // the list, just without a score.
      rows.push({
        _id: m._id, fullName: m.fullName, memberCode: m.memberId,
        phone: m.phone, totalScore: null, error: err.code || 'SCORE_FAILED',
      });
    }
  }

  rows.sort((a, b) => (b.totalScore ?? -1) - (a.totalScore ?? -1));

  ok(res, {
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
    // Scores are page-local: the sort ranks this page, not the whole
    // unit. Said plainly so nobody reads page 2 as "ranks 11-20".
    rankingScope: 'PAGE',
    items: rows,
  });
});
