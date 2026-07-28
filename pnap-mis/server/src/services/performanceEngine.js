const PerformanceRuleSet = require('../models/PerformanceRuleSet');
const Meeting = require('../models/Meeting');
const Activity = require('../models/Activity');
const Donation = require('../models/Donation');
const Responsibility = require('../models/Responsibility');
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
  listMetrics,
  resolveRulesetFor,
  computeForMember,
  invalidate,
};
