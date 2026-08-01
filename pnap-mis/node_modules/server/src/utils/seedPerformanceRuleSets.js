const PerformanceRuleSet = require('../models/PerformanceRuleSet');

// seedPerformanceRuleSets — idempotent seeder for the default
// GLOBAL ruleset. Weights match SRS §10's emphasis: meeting
// attendance is the dominant signal; donation contribution is
// deliberately small (members shouldn't be incentivized to donate
// for a higher score).
//
// Component weights:
//   MEETING_ATTENDANCE         40%   — primary engagement metric
//   RESPONSIBILITY_COMPLETION  25%   — assigned-task follow-through
//   ACTIVITY_PARTICIPATION     20%   — broader involvement
//   STUDY_CONTRIBUTION         10%   — intellectual / educational
//   DONATION_CONTRIBUTION       5%   — minor weight for fairness
//                                      (sums to 1.0)
//
// `isActive: true` so the engine resolves it. Currently no
// controller automatically enforces a score, so behavior is
// unchanged — the live /performance/score endpoint is opt-in.
//
// Idempotent: only inserts on first boot. Once admin tweaks the
// weights or params, the seeder NEVER overwrites.

async function seedPerformanceRuleSets() {
  const existing = await PerformanceRuleSet.findOne({ scope: 'GLOBAL' });
  if (existing) {
    let dirty = false;
    if (!existing.isSystem) { existing.isSystem = true; dirty = true; }
    if (existing.isActive !== true) { existing.isActive = true; dirty = true; }
    if (dirty) await existing.save();
    return { inserted: 0, reconciled: dirty ? 1 : 0 };
  }

  await PerformanceRuleSet.create({
    name: 'Default Performance Ruleset',
    description: 'SRS §10 baseline weights. Edit components to tune scoring across the org.',
    scope: 'GLOBAL',
    components: [
      { metric: 'MEETING_ATTENDANCE',         weight: 0.40, params: {} },
      { metric: 'RESPONSIBILITY_COMPLETION',  weight: 0.25, params: {} },
      { metric: 'ACTIVITY_PARTICIPATION',     weight: 0.20, params: { targetCount: 5 } },
      { metric: 'STUDY_CONTRIBUTION',         weight: 0.10, params: { targetCount: 4 } },
      { metric: 'DONATION_CONTRIBUTION',      weight: 0.05, params: { maxAmount: 50000 } },
    ],
    isSystem: true,
    isActive: true,
    rulesetVersion: 1,
  });

  return { inserted: 1, reconciled: 0 };
}

module.exports = { seedPerformanceRuleSets };
