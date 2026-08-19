const mongoose = require('mongoose');
const PerformanceRuleSet = require('../models/PerformanceRuleSet');
const Meeting = require('../models/Meeting');
const Activity = require('../models/Activity');
const Donation = require('../models/Donation');
const Responsibility = require('../models/Responsibility');
const Member = require('../models/Member');
const { ApiError } = require('../utils/response');

// performanceEngine — weighted composite scoring for a member over
// a date range. Replaces the implicit "raw counts → frontend does
// the math" approach with a single source of truth.
//
// Design notes:
//   • Metrics are HARDCODED in METRIC_REGISTRY below. Adding a new
//     metric kind requires a code change. Admins tune weights and
//     per-metric params via PerformanceRuleSet.
//   • Each metric's compute() returns a normalized 0–100 value so
//     the weighted sum stays in 0–100 range. Per-metric params
//     define the saturation point ("5 activities = 100%").
//   • computeForMember() is read-only and on-demand. Period freeze
//     / snapshot persistence is reserved for a follow-up PR.
//   • Cache: a small LRU on the resolved ruleset, keyed on (scope,
//     tierCode). Computations themselves are not cached — the
//     underlying counts change as activity happens.

// ─── Metric registry ──────────────────────────────────────────────

const METRIC_REGISTRY = {
  MEETING_ATTENDANCE: {
    label: 'Meeting attendance',
    description: 'Percentage of finalized meetings the member attended (PRESENT or LATE).',
    defaultParams: {},
    async compute(memberId, dateClause, params) {
      const filter = { state: 'FINALIZED', ...(dateClause.startAt ? { startAt: dateClause.startAt } : {}) };
      const [total, present, late] = await Promise.all([
        Meeting.countDocuments({ ...filter, 'attendance.memberId': memberId }),
        Meeting.countDocuments({ ...filter, attendance: { $elemMatch: { memberId, status: 'PRESENT' } } }),
        Meeting.countDocuments({ ...filter, attendance: { $elemMatch: { memberId, status: 'LATE' } } }),
      ]);
      if (total === 0) return { raw: 0, detail: { total: 0, attended: 0 } };
      const attended = present + late;
      return {
        raw: Math.round((attended / total) * 100),
        detail: { total, attended, present, late },
      };
    },
  },

  ACTIVITY_PARTICIPATION: {
    label: 'Activity participation',
    description: 'Count of activities participated in (as participant or lead) — saturates at targetCount.',
    defaultParams: { targetCount: 5 },
    async compute(memberId, dateClause, params) {
      const target = Math.max(1, parseInt(params?.targetCount, 10) || 5);
      const filter = dateClause.startAt ? { startAt: dateClause.startAt } : {};
      const [asPart, asLead] = await Promise.all([
        Activity.countDocuments({ ...filter, participants: memberId }),
        Activity.countDocuments({ ...filter, leadMemberId: memberId }),
      ]);
      const count = asPart + asLead;
      const raw = Math.min(Math.round((count / target) * 100), 100);
      return { raw, detail: { count, target, asPart, asLead } };
    },
  },

  RESPONSIBILITY_COMPLETION: {
    label: 'Responsibility completion',
    description: 'Percentage of assigned responsibilities completed (COMPLETED ÷ all-states).',
    defaultParams: {},
    async compute(memberId, dateClause /* unused: responsibility has no startAt */, params) {
      const [pending, completed, cancelled] = await Promise.all([
        Responsibility.countDocuments({ assignedToMemberId: memberId, state: 'PENDING' }),
        Responsibility.countDocuments({ assignedToMemberId: memberId, state: 'COMPLETED' }),
        Responsibility.countDocuments({ assignedToMemberId: memberId, state: 'CANCELLED' }),
      ]);
      const total = pending + completed + cancelled;
      if (total === 0) return { raw: 0, detail: { total: 0, completed: 0 } };
      return {
        raw: Math.round((completed / total) * 100),
        detail: { total, completed, pending, cancelled },
      };
    },
  },

  DONATION_CONTRIBUTION: {
    label: 'Donation contribution',
    description: 'Total donated amount during the period — saturates at maxAmount.',
    defaultParams: { maxAmount: 50000 },
    async compute(memberId, dateClause, params) {
      const cap = Math.max(1, parseFloat(params?.maxAmount) || 50000);
      const matchClause = dateClause.startAt
        ? { donorMemberId: memberId, receivedAt: dateClause.startAt }
        : { donorMemberId: memberId };
      const agg = await Donation.aggregate([
        { $match: matchClause },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]);
      const total = agg[0]?.total || 0;
      const count = agg[0]?.count || 0;
      const raw = Math.min(Math.round((total / cap) * 100), 100);
      return { raw, detail: { total, count, cap } };
    },
  },

  STUDY_CONTRIBUTION: {
    label: 'Study circle contribution',
    description: 'Count of Study Circle meetings where the member contributed — saturates at targetCount.',
    defaultParams: { targetCount: 4 },
    async compute(memberId, dateClause, params) {
      const target = Math.max(1, parseInt(params?.targetCount, 10) || 4);
      const filter = {
        type: 'STC',
        state: 'FINALIZED',
        'studyContributions.memberId': memberId,
        ...(dateClause.startAt ? { startAt: dateClause.startAt } : {}),
      };
      const count = await Meeting.countDocuments(filter);
      const raw = Math.min(Math.round((count / target) * 100), 100);
      return { raw, detail: { count, target } };
    },
  },
};

// ─── Unit-level counterparts ──────────────────────────────────────
//
// The same five metrics, asked of a UNIT instead of a member, so a
// province score and a member score are computed from one ruleset and
// one set of weights and remain comparable.
//
// They are kept in this file, beside the member versions, rather than
// in a parallel "unit performance" service — the moment the two live
// apart they start to disagree about what "attendance" means.
//
// Where a member metric is inherently per-person, the unit analogue is
// stated explicitly below. These are interpretations, and they are
// written down rather than buried:
//
//   MEETING_ATTENDANCE        seats filled ÷ seats on roster, across
//                             every finalized meeting in the subtree
//   ACTIVITY_PARTICIPATION    share of members who took part in at
//                             least one activity
//   RESPONSIBILITY_COMPLETION completed ÷ all assigned in the subtree
//   DONATION_CONTRIBUTION     average donation PER MEMBER against the
//                             per-member cap, so a large unit is not
//                             flattered by its size
//   STUDY_CONTRIBUTION        share of members who contributed to a
//                             study circle
//
// Every one is a single aggregation over the subtree — never a loop
// over members, which is what makes a province scoreable at all.

const UNIT_METRICS = {
  async MEETING_ATTENDANCE(scope, dateClause) {
    const match = { ...scope, state: 'FINALIZED', ...(dateClause.startAt ? { startAt: dateClause.startAt } : {}) };
    const agg = await Meeting.aggregate([
      { $match: match },
      {
        $project: {
          roster: { $size: { $ifNull: ['$attendance', []] } },
          attended: {
            $size: {
              $filter: {
                input: { $ifNull: ['$attendance', []] },
                cond: { $in: ['$$this.status', ['PRESENT', 'LATE']] },
              },
            },
          },
        },
      },
      { $group: { _id: null, meetings: { $sum: 1 }, roster: { $sum: '$roster' }, attended: { $sum: '$attended' } } },
    ]);
    const r = agg[0] || { meetings: 0, roster: 0, attended: 0 };
    if (!r.roster) return { raw: 0, detail: { meetings: r.meetings, roster: 0, attended: 0 } };
    return {
      raw: Math.round((r.attended / r.roster) * 100),
      detail: { meetings: r.meetings, roster: r.roster, attended: r.attended },
    };
  },

  async ACTIVITY_PARTICIPATION(scope, dateClause, params, memberCount) {
    const match = { ...scope, ...(dateClause.startAt ? { startAt: dateClause.startAt } : {}) };
    const agg = await Activity.aggregate([
      { $match: match },
      // Lead and participants are both taking part; union them so a
      // member who only ever leads still counts as participating.
      { $project: { people: { $setUnion: [{ $ifNull: ['$participants', []] }, [{ $ifNull: ['$leadMemberId', null] }]] } } },
      { $unwind: '$people' },
      { $match: { people: { $ne: null } } },
      { $group: { _id: '$people' } },
      { $count: 'n' },
    ]);
    const engaged = agg[0]?.n || 0;
    if (!memberCount) return { raw: 0, detail: { engaged, members: 0 } };
    return {
      raw: Math.min(100, Math.round((engaged / memberCount) * 100)),
      detail: { engaged, members: memberCount },
    };
  },

  async RESPONSIBILITY_COMPLETION(scope) {
    const agg = await Responsibility.aggregate([
      { $match: scope },
      { $group: { _id: '$state', n: { $sum: 1 } } },
    ]);
    const by = Object.fromEntries(agg.map((r) => [r._id, r.n]));
    const completed = by.COMPLETED || 0;
    const total = (by.PENDING || 0) + completed + (by.CANCELLED || 0) + (by.IN_PROGRESS || 0);
    if (!total) return { raw: 0, detail: { total: 0, completed: 0 } };
    return {
      raw: Math.round((completed / total) * 100),
      detail: { total, completed, pending: by.PENDING || 0, inProgress: by.IN_PROGRESS || 0 },
    };
  },

  async DONATION_CONTRIBUTION(scope, dateClause, params, memberCount) {
    const cap = Math.max(1, parseFloat(params?.maxAmount) || 50000);
    const match = { ...scope, ...(dateClause.startAt ? { receivedAt: dateClause.startAt } : {}) };
    const agg = await Donation.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const total = agg[0]?.total || 0;
    const count = agg[0]?.count || 0;
    if (!memberCount) return { raw: 0, detail: { total, count, perMember: 0, cap } };
    const perMember = total / memberCount;
    return {
      raw: Math.min(100, Math.round((perMember / cap) * 100)),
      detail: { total, count, perMember: Math.round(perMember), cap, members: memberCount },
    };
  },

  async STUDY_CONTRIBUTION(scope, dateClause, params, memberCount) {
    const match = {
      ...scope,
      type: 'STC',
      state: 'FINALIZED',
      ...(dateClause.startAt ? { startAt: dateClause.startAt } : {}),
    };
    const agg = await Meeting.aggregate([
      { $match: match },
      { $unwind: { path: '$studyContributions', preserveNullAndEmptyArrays: false } },
      { $group: { _id: '$studyContributions.memberId' } },
      { $count: 'n' },
    ]);
    const contributors = agg[0]?.n || 0;
    if (!memberCount) return { raw: 0, detail: { contributors, members: 0 } };
    return {
      raw: Math.min(100, Math.round((contributors / memberCount) * 100)),
      detail: { contributors, members: memberCount },
    };
  },
};

// Subtree filter for the hierarchy-denormalized collections. Scoping
// to a district picks up its areas and basic units too, which is what
// "district performance" has to mean.
//
// The id MUST be cast: every unit metric above runs through
// aggregate(), and aggregate's $match does not coerce a string to an
// ObjectId the way find() does — it silently matches nothing and the
// unit scores a confident zero. Same trap dashboardController's
// ownUnitFilter() documents.
function unitScopeFilter(unitLevel, unitId) {
  const key = {
    PROVINCE: 'provinceId', DISTRICT: 'districtId',
    AREA: 'areaId', BASIC_UNIT: 'basicUnitId',
  }[unitLevel];
  if (!key) return {}; // CENTRAL — the whole organization
  const oid = unitId instanceof mongoose.Types.ObjectId
    ? unitId
    : new mongoose.Types.ObjectId(String(unitId));
  return { [key]: oid };
}

/**
 * computeForUnit — the unit analogue of computeForMember.
 *
 * Same ruleset, same weights, same 0–100 normalization, so a unit's
 * score sits on the same scale as the scores of the members inside it.
 *
 * @param {string} unitLevel  PROVINCE | DISTRICT | AREA | BASIC_UNIT | CENTRAL
 * @param {*}      unitId
 * @param {object} period     { from, to }
 * @param {object} [options]  { tierCode, ruleset }
 */
async function computeForUnit(unitLevel, unitId, period, options = {}) {
  const ruleset = options.ruleset || await resolveRulesetFor(options.tierCode || unitLevel);
  if (!ruleset) throw new ApiError(404, 'NO_RULESET', 'No active performance ruleset found');

  const scope = unitScopeFilter(unitLevel, unitId);
  const dateClause = {};
  const dateFilter = {};
  if (period?.from) dateFilter.$gte = new Date(period.from);
  if (period?.to) dateFilter.$lte = new Date(period.to);
  if (Object.keys(dateFilter).length) dateClause.startAt = dateFilter;

  // Several unit metrics are expressed per member, so the roster size
  // is resolved once and shared rather than counted per metric.
  const memberCount = await Member.countDocuments({ ...scope, status: 'ACTIVE' });

  const components = [];
  let total = 0;
  for (const c of ruleset.components || []) {
    const fn = UNIT_METRICS[c.metric];
    const reg = METRIC_REGISTRY[c.metric];
    if (!fn) {
      // A metric with no unit analogue contributes nothing rather than
      // silently scoring zero as if the unit had failed it.
      components.push({
        metric: c.metric, weight: c.weight, raw: null, weighted: 0,
        error: 'NO_UNIT_EQUIVALENT',
      });
      continue;
    }
    const params = { ...(reg?.defaultParams || {}), ...(c.params || {}) };
    const result = await fn(scope, dateClause, params, memberCount);
    const weighted = (result.raw || 0) * (c.weight || 0);
    total += weighted;
    components.push({
      metric: c.metric,
      label: reg?.label || c.metric,
      weight: c.weight,
      raw: result.raw,
      weighted: Math.round(weighted * 100) / 100,
      params,
      detail: result.detail,
    });
  }

  return {
    ruleset: { _id: ruleset._id, name: ruleset.name, version: ruleset.rulesetVersion },
    period: { from: period?.from || null, to: period?.to || null },
    memberCount,
    components,
    totalScore: Math.round(total * 100) / 100,
  };
}

function listMetrics() {
  return Object.entries(METRIC_REGISTRY).map(([code, m]) => ({
    code,
    label: m.label,
    description: m.description,
    defaultParams: m.defaultParams || {},
  }));
}

// ─── Ruleset resolution ───────────────────────────────────────────

const _cache = new Map();
const _MAX = 32;

function _cacheGet(key) {
  const v = _cache.get(key);
  if (v) {
    _cache.delete(key);
    _cache.set(key, v);
  }
  return v;
}

function _cachePut(key, value) {
  _cache.set(key, value);
  if (_cache.size > _MAX) _cache.delete(_cache.keys().next().value);
}

function invalidate() {
  _cache.clear();
}

// resolveRulesetFor — find the most specific active ruleset for a
// given tierCode. TIER override → GLOBAL fallback. Returns null if
// neither exists (no active scoring).
async function resolveRulesetFor(tierCode) {
  const code = tierCode ? String(tierCode).toUpperCase() : null;
  const key = code || 'GLOBAL';
  const cached = _cacheGet(key);
  if (cached !== undefined) return cached;

  let cfg = null;
  if (code) {
    cfg = await PerformanceRuleSet.findOne({
      scope: 'TIER', tierCode: code, isActive: true,
    });
  }
  if (!cfg) {
    cfg = await PerformanceRuleSet.findOne({
      scope: 'GLOBAL', isActive: true,
    });
  }
  _cachePut(key, cfg || null);
  return cfg || null;
}

// ─── Core compute ─────────────────────────────────────────────────

// computeForMember — returns a structured score for a member over
// the given date range, against either the supplied ruleset or the
// resolved-active one.
//
// Returns:
//   {
//     ruleset: { _id, name, version },
//     period: { from, to },
//     components: [{ metric, weight, raw, weighted, params, detail }],
//     totalScore: number  // 0-100
//   }
async function computeForMember(memberOrId, period, options) {
  const memberId = memberOrId._id || memberOrId;
  const tierCode = options?.tierCode;
  const ruleset = options?.ruleset || await resolveRulesetFor(tierCode);
  if (!ruleset) {
    throw new ApiError(404, 'NO_RULESET', 'No active performance ruleset found');
  }

  // Normalize the date range into a $gte/$lte clause the metric
  // functions can pass to find queries.
  const dateClause = {};
  const dateFilter = {};
  if (period?.from) dateFilter.$gte = new Date(period.from);
  if (period?.to) dateFilter.$lte = new Date(period.to);
  if (Object.keys(dateFilter).length) dateClause.startAt = dateFilter;

  const components = [];
  let total = 0;
  for (const c of ruleset.components || []) {
    const reg = METRIC_REGISTRY[c.metric];
    if (!reg) {
      // Unknown metric — skip with a warning entry. Shouldn't fire
      // because the validator restricts metric to known codes.
      components.push({ metric: c.metric, weight: c.weight, raw: 0, weighted: 0, error: 'UNKNOWN_METRIC' });
      continue;
    }
    const params = { ...(reg.defaultParams || {}), ...(c.params || {}) };
    const result = await reg.compute(memberId, dateClause, params);
    const weighted = (result.raw || 0) * (c.weight || 0);
    total += weighted;
    components.push({
      metric: c.metric,
      weight: c.weight,
      raw: result.raw,
      weighted: Math.round(weighted * 100) / 100,
      params,
      detail: result.detail,
    });
  }

  return {
    ruleset: { _id: ruleset._id, name: ruleset.name, version: ruleset.rulesetVersion },
    period: { from: period?.from || null, to: period?.to || null },
    components,
    totalScore: Math.round(total * 100) / 100,
  };
}

module.exports = {
  METRIC_REGISTRY,
  UNIT_METRICS,
  listMetrics,
  resolveRulesetFor,
  computeForMember,
  computeForUnit,
  unitScopeFilter,
  invalidate,
};
