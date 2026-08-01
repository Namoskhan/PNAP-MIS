const { z } = require('zod');

// Zod validator for UnitTierConfig admin endpoints. Only PATCH is
// supported — the 5 tiers are seeded as system rows and can't be
// added or deleted (per the design's hard pushback on tier
// add/remove). The route layer gates on MANAGE_UNIT_CONFIG.

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

const capabilitiesSchema = z.object({
  meetings: z.boolean().optional(),
  activities: z.boolean().optional(),
  finance: z.boolean().optional(),
  cabinet: z.boolean().optional(),
  committee: z.boolean().optional(),
  transfers: z.boolean().optional(),
  performance: z.boolean().optional(),
  responsibilities: z.boolean().optional(),
}).strict().optional();

const bodyPolicySchema = z.object({
  executive: z.boolean().optional(),
  committee: z.boolean().optional(),
}).strict().optional();

const tierConfigUpdateSchema = z.object({
  label: z.string().min(2).max(80).optional(),
  pluralLabel: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional(),
  capabilities: capabilitiesSchema,
  bodyPolicy: bodyPolicySchema,
  customFields: z.array(objectId).max(50).optional(),
  isActive: z.boolean().optional(),
});

module.exports = {
  tierConfigUpdateSchema,
};
