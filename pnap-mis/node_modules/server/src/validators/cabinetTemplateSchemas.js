const { z } = require('zod');

// Zod validators for CabinetTemplate admin endpoints. The 5 tier
// codes are enum-locked (matching the hierarchy invariant); roleCode
// is a free-form catalogue code validated server-side against the
// Role catalogue at write-time.

const tierCode = z.enum(['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL']);
const roleCode = z.string().regex(/^[A-Z][A-Z0-9_]{1,59}$/, 'Invalid role code');
const appliesToBody = z.enum(['EXECUTIVE', 'COMMITTEE', 'BOTH']);
const visibilityScope = z.enum(['TIER_AND_DOWN', 'TIER_ONLY', 'GLOBAL']);

const cabinetTemplateCreateSchema = z.object({
  tierCode,
  roleCode,
  isMandatory: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  appliesToBody: appliesToBody.optional(),
  termDays: z.number().int().min(0).max(36500).optional(),
  allowedAppointerRoles: z.array(roleCode).max(20).optional(),
  allowedDeciderRoles: z.array(roleCode).max(20).optional(),
  visibilityScope: visibilityScope.optional(),
  // Optional flag — when true, on successful create the controller
  // immediately rolls the new slot out to every existing unit at
  // this tier (idempotent CabinetSlot.updateOne with $setOnInsert).
  rolloutToExistingUnits: z.boolean().optional(),
});

const cabinetTemplateUpdateSchema = z.object({
  isMandatory: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  appliesToBody: appliesToBody.optional(),
  termDays: z.number().int().min(0).max(36500).optional(),
  allowedAppointerRoles: z.array(roleCode).max(20).optional(),
  allowedDeciderRoles: z.array(roleCode).max(20).optional(),
  visibilityScope: visibilityScope.optional(),
  isActive: z.boolean().optional(),
});

module.exports = {
  cabinetTemplateCreateSchema,
  cabinetTemplateUpdateSchema,
};
