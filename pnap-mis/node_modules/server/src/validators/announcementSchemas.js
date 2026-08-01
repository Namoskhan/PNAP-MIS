const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');

exports.announcementCreateSchema = z.object({
  title: z.string().min(3).max(140),
  body: z.string().min(1).max(4000),
  unitLevel: z.enum(['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT']).optional(),
  unitId: objectId.optional(),
  scope: z.enum(['OWN', 'SUBTREE', 'GLOBAL']).default('OWN'),
  pinned: z.boolean().optional(),
  expiresAt: z.string().datetime().optional(),
  // When present, this is a direct message — unitLevel/unitId/scope
  // become metadata-only and the message is shown only to this member.
  targetMemberId: objectId.optional(),
});
