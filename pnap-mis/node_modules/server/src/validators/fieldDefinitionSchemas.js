const { z } = require('zod');

// Zod schemas for FieldDefinition admin endpoints. The `key` field is
// only accepted on CREATE — the update schema deliberately omits it
// because field keys are immutable after publication (see §9 guard
// rails). Validation rules live in `validation`; they are themselves
// optional so simple TEXT fields with no constraints are valid.

const FIELD_TYPES = [
  'TEXT', 'TEXTAREA',
  'NUMBER', 'INT', 'CURRENCY',
  'DATE', 'BOOL',
  'SELECT', 'MULTISELECT',
  'MEMBER_REF',
];

const optionSchema = z.object({
  value: z.string().min(1).max(120),
  label: z.string().min(1).max(120),
}).strict();

const validationSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().int().min(0).optional(),
  maxLength: z.number().int().min(0).optional(),
  regex: z.string().max(500).optional(),
  options: z.array(optionSchema).max(100).optional(),
}).strict().optional();

const visibilitySchema = z.object({
  showOnCreate: z.boolean().optional(),
  showOnDetail: z.boolean().optional(),
  showOnList: z.boolean().optional(),
}).strict().optional();

const reportingSchema = z.object({
  includeInExport: z.boolean().optional(),
  exportLabel: z.string().max(120).optional(),
  exportOrder: z.number().int().min(0).max(9999).optional(),
}).strict().optional();

const fieldDefCreateSchema = z.object({
  key: z.string().regex(/^[a-z][a-zA-Z0-9_]{0,49}$/, 'Field key must start lowercase, ≤50 chars'),
  label: z.string().min(2).max(120),
  helpText: z.string().max(500).optional(),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().optional(),
  validation: validationSchema,
  visibility: visibilitySchema,
  reporting: reportingSchema,
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

const fieldDefUpdateSchema = z.object({
  label: z.string().min(2).max(120).optional(),
  helpText: z.string().max(500).optional(),
  // Type CAN be edited but the controller will reject changes that
  // would break existing data (e.g. NUMBER → SELECT). For now allow
  // the request shape; the controller layer enforces compatibility.
  type: z.enum(FIELD_TYPES).optional(),
  required: z.boolean().optional(),
  validation: validationSchema,
  visibility: visibilitySchema,
  reporting: reportingSchema,
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

module.exports = {
  fieldDefCreateSchema,
  fieldDefUpdateSchema,
  FIELD_TYPES,
};
