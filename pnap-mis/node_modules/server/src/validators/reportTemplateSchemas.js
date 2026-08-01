const { z } = require('zod');

// Zod validators for ReportTemplate admin endpoints. Section `kind`
// is validated against the renderer registry server-side at create
// time (the controller does this); here we just enforce the shape.

const tierCode = z.enum(['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL']);
const sectionKind = z.string().regex(/^[A-Z][A-Z0-9_]{1,40}$/, 'Invalid section kind');

const sectionSchema = z.object({
  kind: sectionKind,
  sortOrder: z.number().int().min(0).max(9999).optional(),
  title: z.string().max(120).optional(),
  config: z.record(z.any()).optional(),
}).strict();

const reportTemplateCreateSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500).optional(),
  entity: z.enum(['UNIT']).optional(),
  tierScope: z.array(tierCode).max(5).optional(),
  format: z.enum(['PDF', 'XLSX', 'BOTH']).optional(),
  sections: z.array(sectionSchema).min(1).max(20),
  isActive: z.boolean().optional(),
});

const reportTemplateUpdateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(500).optional(),
  tierScope: z.array(tierCode).max(5).optional(),
  format: z.enum(['PDF', 'XLSX', 'BOTH']).optional(),
  sections: z.array(sectionSchema).min(1).max(20).optional(),
  isActive: z.boolean().optional(),
});

module.exports = {
  reportTemplateCreateSchema,
  reportTemplateUpdateSchema,
};
