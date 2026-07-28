const { z } = require('zod');

// Zod validators for UnitPolicy admin endpoints. Each section is
// optional; within a section every field is optional too — admins
// only set the rules they want to enforce, and the engine treats
// missing fields as no-ops.

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');
const tierCode = z.enum(['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL']);

const memberSliceSchema = z.object({
  requireApprovalAtTier: tierCode.optional(),
  minimumProfileFields: z.array(z.string().min(1).max(40)).max(20).optional(),
}).strict().optional();

const meetingSliceSchema = z.object({
  quorumMin: z.number().int().min(0).max(10000).optional(),
  quorumWarn: z.number().int().min(0).max(10000).optional(),
  minAttendancePercent: z.number().min(0).max(100).optional(),
  requirePreviousReport: z.boolean().optional(),
}).strict().optional();

const financeSliceSchema = z.object({
  expenseAutoApproveBelow: z.number().min(0).optional(),
  expenseRequireSecondApproverAbove: z.number().min(0).optional(),
  donationCnicRequiredAbove: z.number().min(0).optional(),
}).strict().optional();

const transferSliceSchema = z.object({
  allowedDirections: z.array(z.enum(['UP', 'DOWN', 'SAME_TIER'])).max(3).optional(),
  requirePresidentApprovalAbove: z.number().min(0).optional(),
}).strict().optional();

// Refinement: if scope is TIER, tierCode is required.
//             if scope is UNIT, both tierCode and unitId are required.
//             scope GLOBAL must have neither (only one GLOBAL row exists).
const unitPolicyCreateSchema = z.object({
  scope: z.enum(['GLOBAL', 'TIER', 'UNIT']),
  tierCode: tierCode.optional(),
  unitId: objectId.optional(),
  member: memberSliceSchema,
  meeting: meetingSliceSchema,
  finance: financeSliceSchema,
  transfer: transferSliceSchema,
  isActive: z.boolean().optional(),
  note: z.string().max(500).optional(),
}).refine((d) => {
  if (d.scope === 'GLOBAL') return !d.tierCode && !d.unitId;
  if (d.scope === 'TIER')   return !!d.tierCode && !d.unitId;
  if (d.scope === 'UNIT')   return !!d.tierCode && !!d.unitId;
  return false;
}, {
  message: 'scope-key mismatch: GLOBAL takes neither, TIER requires tierCode, UNIT requires both',
  path: ['scope'],
});

const unitPolicyUpdateSchema = z.object({
  member: memberSliceSchema,
  meeting: meetingSliceSchema,
  finance: financeSliceSchema,
  transfer: transferSliceSchema,
  isActive: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

module.exports = {
  unitPolicyCreateSchema,
  unitPolicyUpdateSchema,
};
