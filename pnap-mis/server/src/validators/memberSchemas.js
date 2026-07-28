const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');
const cnic = z.string().regex(/^\d{5}-\d{7}-\d$/, 'CNIC must be XXXXX-XXXXXXX-X');
const phone = z.string().regex(/^(\+92|0)?3\d{2}[- ]?\d{7}$/, 'Invalid Pakistan mobile number');

const memberCreateSchema = z.object({
  fullName: z.string().min(3).max(80),
  fatherOrHusbandName: z.string().min(3).max(80),
  cnic,
  phone,
  email: z.string().email().optional().or(z.literal('')),
  dateOfBirth: z.coerce.date().refine((d) => d <= new Date(), {
    message: 'Date of birth must be in the past',
  }),
  gender: z.enum(['MALE', 'FEMALE', 'PREFER_NOT_TO_SAY']),
  address: z.string().min(5).max(200),
  basicUnitId: objectId,

  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  education: z.string().max(200).optional(),
  occupation: z.string().max(120).optional(),
  languagesSpoken: z.array(z.string()).optional(),
  dateJoined: z.coerce.date().optional(),
  skills: z.array(z.string()).optional(),
  emergencyContact: z
    .object({ name: z.string().optional(), phone: z.string().optional() })
    .optional(),
});

const memberUpdateSchema = memberCreateSchema.partial();

// Public self-registration. The applicant picks an EXISTING Basic
// Unit from the cascading dropdowns (Province → District → Area →
// Basic Unit are all admin-curated under the new SRS-aligned flow);
// the chain is derived server-side from basicUnitId. Password is
// optional — applicants are pending until a Secretary approves them
// and may set a password later.
const publicRegisterSchema = z.object({
  fullName: z.string().min(3).max(80),
  fatherOrHusbandName: z.string().min(3).max(80),
  cnic,
  phone,
  gender: z.enum(['MALE', 'FEMALE', 'PREFER_NOT_TO_SAY']),

  basicUnitId: objectId,

  // Login password the citizen sets at registration time. They use
  // this with their CNIC to sign in once approved.
  password: z.string().min(6, 'Password must be at least 6 characters').max(100),

  // Optional fields
  email: z.string().email().optional().or(z.literal('')),
  dateOfBirth: z.coerce.date().optional(),
  address: z.string().max(200).optional(),
  bloodGroup: z.enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']).optional(),
  education: z.string().max(200).optional(),
  occupation: z.string().max(120).optional(),
  languagesSpoken: z.array(z.string()).optional(),
  dateJoined: z.coerce.date().optional(),
  skills: z.array(z.string()).optional(),
});

const memberRejectSchema = z.object({
  reason: z.string().min(3).max(500),
});

const listQuerySchema = z.object({
  status: z.string().optional(),
  basicUnitId: objectId.optional(),
  areaId: objectId.optional(),
  districtId: objectId.optional(),
  provinceId: objectId.optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(1000).default(20),
});

module.exports = {
  memberCreateSchema,
  memberUpdateSchema,
  publicRegisterSchema,
  memberRejectSchema,
  listQuerySchema,
};
