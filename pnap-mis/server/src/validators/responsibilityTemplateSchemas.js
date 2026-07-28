const { z } = require('zod');

// Zod validators for ResponsibilityTemplate admin endpoints.

const TRIGGER_EVENTS = [
  'MEETING_FINALIZED',
  'MEETING_CREATED',
  'ACTIVITY_COMPLETED',
  'ROLE_APPROVED',
  'CABINET_APPOINTED',
];

const TARGETS = ['CREATOR', 'CHAIRPERSON', 'LEAD', 'CABINET_ROLE'];
const tierCode = z.enum(['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL']);
const upperCode = z.string().regex(/^[A-Z][A-Z0-9_]{1,59}$/, 'Invalid code');

const triggerSchema = z.object({
  event: z.enum(TRIGGER_EVENTS),
  conditions: z.object({
    tierCode: tierCode.optional(),
    typeCode: upperCode.optional(),
    body: z.enum(['EXECUTIVE', 'COMMITTEE']).optional(),
  }).strict().optional(),
}).strict();

const assignmentSchema = z.object({
  target: z.enum(TARGETS),
  roleCode: upperCode.optional(),
}).strict().refine(
  (a) => a.target !== 'CABINET_ROLE' || !!a.roleCode,
  { message: 'roleCode is required when target is CABINET_ROLE', path: ['roleCode'] },
);

const responsibilityTemplateCreateSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  trigger: triggerSchema,
  assignment: assignmentSchema,
  titleTemplate: z.string().max(200).optional(),
  descriptionTemplate: z.string().max(2000).optional(),
  dueDateOffsetDays: z.number().int().min(0).max(3650).optional(),
  isActive: z.boolean().optional(),
});

const responsibilityTemplateUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  trigger: triggerSchema.optional(),
  assignment: assignmentSchema.optional(),
  titleTemplate: z.string().max(200).optional(),
  descriptionTemplate: z.string().max(2000).optional(),
  dueDateOffsetDays: z.number().int().min(0).max(3650).optional(),
  isActive: z.boolean().optional(),
});

module.exports = {
  responsibilityTemplateCreateSchema,
  responsibilityTemplateUpdateSchema,
};
