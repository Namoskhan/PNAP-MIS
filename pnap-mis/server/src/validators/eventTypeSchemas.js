const { z } = require('zod');

// Zod schemas for the EventTypeConfig admin endpoints. Field keys
// reference FieldDefinition._id (ObjectId). The shape here is
// intentionally permissive on optional fields so the same controller
// can handle both create and PATCH.

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');
const upperCode = z.string().regex(/^[A-Z][A-Z0-9_]{1,29}$/, 'Code must be 2-30 uppercase chars');

const photoPolicySchema = z.object({
  required: z.boolean().optional(),
  minCount: z.number().int().min(0).max(20).optional(),
  requireGps: z.boolean().optional(),
  requireExif: z.boolean().optional(),
}).strict().optional();

const extraStateSchema = z.object({
  code: upperCode,
  label: z.string().min(2).max(80),
  after: upperCode,
}).strict();

const workflowSchema = z.object({
  extraStates: z.array(extraStateSchema).max(8).optional(),
  finalizeRequiresPhotos: z.boolean().optional(),
}).strict().optional();

const appliesToSchema = z.object({
  executive: z.boolean().optional(),
  committee: z.boolean().optional(),
}).strict().optional();

const eventTypeCreateSchema = z.object({
  entity: z.enum(['MEETING', 'ACTIVITY']),
  code: upperCode,
  label: z.string().min(2).max(80),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  appliesTo: appliesToSchema,
  photoPolicy: photoPolicySchema,
  workflow: workflowSchema,
  fields: z.array(objectId).max(100).optional(),
});

const eventTypeUpdateSchema = z.object({
  label: z.string().min(2).max(80).optional(),
  description: z.string().max(500).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  appliesTo: appliesToSchema,
  photoPolicy: photoPolicySchema,
  workflow: workflowSchema,
  fields: z.array(objectId).max(100).optional(),
});

module.exports = {
  eventTypeCreateSchema,
  eventTypeUpdateSchema,
};
