const { z } = require('zod');

// Zod validators for WorkflowConfig admin endpoints. Stage codes
// are uppercase machine names; permission/role codes follow the
// same UPPER_SNAKE convention as the rest of the catalogue.

const domain = z.enum([
  'EXPENSE_APPROVAL',
  'MEMBER_APPROVAL',
  'ROLE_APPROVAL',
  'TRANSFER_APPROVAL',
  'CABINET_APPOINTMENT',
]);
const scope = z.enum(['GLOBAL', 'TIER']);
const tierCode = z.enum(['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL']);
const upperCode = z.string().regex(/^[A-Z][A-Z0-9_]{1,59}$/, 'Invalid code');

const stageSchema = z.object({
  code: upperCode,
  name: z.string().min(2).max(80),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  requirePermission: upperCode.optional(),
  requireRoleCode: upperCode.optional(),
  thresholdField: z.string().min(1).max(40).optional(),
  thresholdAmount: z.number().min(0).optional(),
  skipBelowThreshold: z.boolean().optional(),
}).strict();

const workflowCreateSchema = z.object({
  domain,
  scope,
  tierCode: tierCode.optional(),
  stages: z.array(stageSchema).min(1).max(10),
  isActive: z.boolean().optional(),
  note: z.string().max(500).optional(),
}).refine((d) => {
  if (d.scope === 'GLOBAL') return !d.tierCode;
  if (d.scope === 'TIER')   return !!d.tierCode;
  return false;
}, {
  message: 'scope-key mismatch: GLOBAL takes no tierCode; TIER requires tierCode',
  path: ['scope'],
});

const workflowUpdateSchema = z.object({
  stages: z.array(stageSchema).min(1).max(10).optional(),
  isActive: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

module.exports = {
  workflowCreateSchema,
  workflowUpdateSchema,
};
