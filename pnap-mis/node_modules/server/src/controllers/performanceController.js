const asyncHandler = require('express-async-handler');
const Member = require('../models/Member');
const Meeting = require('../models/Meeting');
const Activity = require('../models/Activity');
const Donation = require('../models/Donation');
const Responsibility = require('../models/Responsibility');
const RoleAssignment = require('../models/RoleAssignment');
const { ok, ApiError } = require('../utils/response');
const { memberWithinAreaAdminScope } = require('../utils/unitScope');
const performanceEngine = require('../services/performanceEngine');

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
