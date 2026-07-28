const { z } = require('zod');

// Zod validators for PerformanceRuleSet admin endpoints.
// The weight-sum refinement enforces components.weight === 1.0
// so the composite score stays in 0–100.

const METRIC_CODES = [
  'MEETING_ATTENDANCE',
  'ACTIVITY_PARTICIPATION',
  'RESPONSIBILITY_COMPLETION',
  'DONATION_CONTRIBUTION',
  'STUDY_CONTRIBUTION',
];

const tierCode = z.enum(['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL']);
const scope = z.enum(['GLOBAL', 'TIER']);

const componentSchema = z.object({
  metric: z.enum(METRIC_CODES),
  weight: z.number().min(0).max(1),
  // Per-metric params — accepted as plain object; engine validates
  // shape against its metric registry. We don't enforce the param
  // shape here because metric authors own that contract.
  params: z.record(z.any()).optional(),
}).strict();

// Floating-point weight sums — accept anything within ±0.01 of 1.0
// so admins can use round numbers like 0.4 + 0.25 + 0.2 + 0.1 + 0.05
// = 1.0 without ε errors blocking them.
function weightSumOk(components) {
  const sum = (components || []).reduce((s, c) => s + (c.weight || 0), 0);
  return Math.abs(sum - 1) < 0.01;
}

// Each metric appears at most once per ruleset.
function metricsUnique(components) {
  const seen = new Set();
  for (const c of components || []) {
    if (seen.has(c.metric)) return false;
    seen.add(c.metric);
  }
  return true;
}

const performanceRuleSetCreateSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  scope,
  tierCode: tierCode.optional(),
  components: z.array(componentSchema).min(1).max(METRIC_CODES.length),
  isActive: z.boolean().optional(),
}).refine((d) => d.scope === 'GLOBAL' ? !d.tierCode : !!d.tierCode, {
  message: 'scope-key mismatch: GLOBAL takes no tierCode; TIER requires tierCode',
  path: ['scope'],
}).refine((d) => weightSumOk(d.components), {
  message: 'component weights must sum to 1.0 (±0.01)',
  path: ['components'],
}).refine((d) => metricsUnique(d.components), {
  message: 'each metric may appear at most once per ruleset',
  path: ['components'],
});

const performanceRuleSetUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  components: z.array(componentSchema).min(1).max(METRIC_CODES.length).optional(),
  isActive: z.boolean().optional(),
}).refine((d) => !d.components || weightSumOk(d.components), {
  message: 'component weights must sum to 1.0 (±0.01)',
  path: ['components'],
}).refine((d) => !d.components || metricsUnique(d.components), {
  message: 'each metric may appear at most once per ruleset',
  path: ['components'],
});

module.exports = {
  performanceRuleSetCreateSchema,
  performanceRuleSetUpdateSchema,
};
