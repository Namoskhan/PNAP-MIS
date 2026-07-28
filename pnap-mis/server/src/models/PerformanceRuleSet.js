const mongoose = require('mongoose');

// PerformanceRuleSet — admin-configurable scoring formula for
// per-member performance. Replaces the implicit "raw counts only"
// approach with a weighted composite score.
//
// SRS §10 metrics are hard-coded in the engine's metric registry —
// admins can't define new metric *kinds* via this collection (that
// would require a code change), but they CAN tune:
//   • which metrics participate (drop a metric by setting weight=0)
//   • each metric's weight in the composite score
//   • per-metric parameters (e.g. "5 activities = full credit")
//
// Why no formula DSL: arbitrary user-supplied formulas are an
// injection / DoS vector and don't survive auditability needs.
// Hardcoded compute functions + admin-tunable params is the
// enterprise-grade compromise.
//
// Resolution: admin can scope a ruleset GLOBAL (applies everywhere
// no override exists) or TIER (e.g. AREA gets a different weight
// mix than CENTRAL). Most specific wins per member.

const SCOPES = ['GLOBAL', 'TIER'];
const TIER_CODES = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];

// Hardcoded list of supported metric codes. Engine's metric
// registry must define a compute function for each. Adding new
// metrics requires code (not config) — the safety guarantee that
// keeps this a controlled extension surface, not a CMS.
const METRIC_CODES = [
  'MEETING_ATTENDANCE',
  'ACTIVITY_PARTICIPATION',
  'RESPONSIBILITY_COMPLETION',
  'DONATION_CONTRIBUTION',
  'STUDY_CONTRIBUTION',
];

const componentSchema = new mongoose.Schema(
  {
    metric: { type: String, enum: METRIC_CODES, required: true },
    // Weight 0–1. Weights across all components in a ruleset MUST
    // sum to 1.0 (validator enforces). Drop a metric by setting
    // weight=0 — it still computes but doesn't contribute.
    weight: { type: Number, required: true, min: 0, max: 1 },
    // Per-metric parameters. Engine's metric functions consume
    // their own knobs (targetCount for ACTIVITY_PARTICIPATION,
    // maxAmount for DONATION_CONTRIBUTION, etc.). Stored as Mixed
    // because the param shape is metric-specific.
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const performanceRuleSetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    scope: { type: String, enum: SCOPES, required: true, default: 'GLOBAL' },
    // Required for scope=TIER; null for scope=GLOBAL.
    tierCode: { type: String, enum: TIER_CODES },

    components: { type: [componentSchema], default: [] },

    // Bumps on every save so future PerformanceScoreSnapshot rows
    // can pin which version they were computed under. Once frozen,
    // editing the ruleset doesn't retroactively mutate history.
    rulesetVersion: { type: Number, default: 1 },

    isSystem: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One GLOBAL row.
performanceRuleSetSchema.index(
  { scope: 1 },
  { unique: true, partialFilterExpression: { scope: 'GLOBAL' } }
);
// One TIER row per tierCode.
performanceRuleSetSchema.index(
  { scope: 1, tierCode: 1 },
  { unique: true, partialFilterExpression: { scope: 'TIER' } }
);

performanceRuleSetSchema.statics.SCOPES = SCOPES;
performanceRuleSetSchema.statics.TIER_CODES = TIER_CODES;
performanceRuleSetSchema.statics.METRIC_CODES = METRIC_CODES;

module.exports = mongoose.model('PerformanceRuleSet', performanceRuleSetSchema);
