const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid ObjectId');
const unitLevel = z.enum(['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL']);

// Role code accepts any SCREAMING_SNAKE_CASE token up to 60 chars —
// matches the SRS-defined built-ins AND custom codes minted via the
// Role Management catalogue (e.g. CUSTOM_YOUTH_COORDINATOR). The
// catalogue is the source of truth for which codes are valid; this
// schema only enforces the shape so a stray client can't slip
// non-uppercase or oversized codes through.
const proposeRoleSchema = z.object({
  unitLevel,
  unitId: objectId,
  memberId: objectId,
  roleCode: z.string().regex(/^[A-Z][A-Z0-9_]{1,59}$/, 'Invalid role code'),
  customRoleName: z.string().max(80).optional(),
});

const decideRoleSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED', 'REVISION_REQUESTED']),
  decisionNote: z.string().max(500).optional(),
});

const endRoleSchema = z.object({
  endReason: z.enum(['RESIGNED', 'EXPELLED', 'TERM_ENDED', 'TRANSFERRED', 'DECEASED', 'REPLACED']),
  decisionNote: z.string().max(500).optional(),
});

// Type / typeCode are validated against EventTypeConfig in the
// controller (PR 4a cutover) — this regex only enforces the *shape*
// of the code so a stray client can't slip in a non-uppercase or
// oversized value. Either `type` (legacy) or `typeCode` is accepted.
const eventTypeCodePattern = z.string().regex(/^[A-Z][A-Z0-9_]{1,29}$/, 'Invalid type code');

const meetingCreateSchema = z.object({
  unitLevel,
  unitId: objectId,
  type: eventTypeCodePattern.optional(),
  typeCode: eventTypeCodePattern.optional(),
  body: z.enum(['EXECUTIVE', 'COMMITTEE', 'GENERAL_BODY', 'JIRGA', 'CONGRESS']).optional(),
  title: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  venue: z.string().min(2).max(200),
  startAt: z.coerce.date(),
  endAt: z.coerce.date(),
  agenda: z.string().max(5000).optional(),
  chairpersonId: objectId.optional(),
  gpsLat: z.coerce.number().min(-90).max(90).optional(),
  gpsLng: z.coerce.number().min(-180).max(180).optional(),
  gps: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  }).optional(),
  // Custom-field bag. Strict shape validation (per the snapshot's
  // resolved fields) happens in dynamicFormService inside the
  // controller; here we just ensure it's a plain object.
  dynamicData: z.record(z.any()).optional(),
}).refine((d) => d.type || d.typeCode, { message: 'type or typeCode is required', path: ['typeCode'] })
  .refine((d) => d.endAt > d.startAt, { message: 'endAt must be after startAt', path: ['endAt'] })
  .refine(
    (d) => (d.gpsLat != null && !isNaN(d.gpsLat) && d.gpsLng != null && !isNaN(d.gpsLng)) ||
           (d.gps?.lat != null && !isNaN(d.gps.lat) && d.gps?.lng != null && !isNaN(d.gps.lng)),
    { message: 'Venue GPS coordinates (latitude and longitude) are mandatory for creating meetings', path: ['gpsLat'] }
  );

const meetingFinalizeSchema = z.object({
  decisions: z.string().max(10000),
  attendance: z.array(z.object({
    memberId: objectId,
    status: z.enum(['PRESENT', 'ABSENT', 'LATE']),
  })).default([]),
  guestAttendees: z.array(z.object({
    name: z.string().min(2).max(100),
    cnic: z.string().optional(),
  })).optional(),
  upcomingStrategy: z.string().max(5000).optional(),
  notes: z.string().max(5000).optional(),
  supervisorAttended: z.coerce.boolean().default(false),
  supervisorMemberId: objectId.optional(),
  studyContributions: z.array(z.object({
    memberId: objectId,
    topic: z.string().max(200),
    summary: z.string().max(2000).optional(),
  })).optional(),
});

const meetingUpdateSchema = z.object({
  title: z.string().max(200).optional(),
  description: z.string().max(5000).optional(),
  venue: z.string().min(2).max(200).optional(),
  type: eventTypeCodePattern.optional(),
  typeCode: eventTypeCodePattern.optional(),
  startAt: z.coerce.date().optional(),
  endAt: z.coerce.date().optional(),
  agenda: z.string().max(5000).optional(),
  chairpersonId: objectId.optional(),
  upcomingStrategy: z.string().max(5000).optional(),
  notes: z.string().max(5000).optional(),
  previousMeetingId: objectId.optional(),
  gpsLat: z.coerce.number().min(-90).max(90).optional(),
  gpsLng: z.coerce.number().min(-180).max(180).optional(),
  gps: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  }).optional(),
  dynamicData: z.record(z.any()).optional(),
});

const responsibilityCreateSchema = z.object({
  unitLevel,
  unitId: objectId,
  title: z.string().min(3).max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.coerce.date().optional(),
  assignedToMemberId: objectId,
  relatedActivityId: objectId.optional(),
  relatedMeetingId: objectId.optional(),
});

const responsibilityUpdateSchema = z.object({
  state: z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional(),
  completionNote: z.string().max(2000).optional(),
  title: z.string().min(3).max(200).optional(),
  description: z.string().max(2000).optional(),
  dueDate: z.coerce.date().nullable().optional(),
});

const activityCreateSchema = z.object({
  unitLevel,
  unitId: objectId,
  body: z.enum(['EXECUTIVE', 'COMMITTEE', 'JIRGA', 'CONGRESS']).optional(),
  type: eventTypeCodePattern.optional(),
  typeCode: eventTypeCodePattern.optional(),
  dynamicData: z.record(z.any()).optional(),
  title: z.string().min(3).max(200),
  description: z.string().max(5000).optional(),
  startAt: z.coerce.date(),
  endAt: z.coerce.date().optional(),
  venue: z.string().max(200).optional(),
  leadMemberId: objectId.optional(),
  externalAttendanceEstimate: z.coerce.number().int().min(0).optional(),
  state: z.enum(['PLANNED', 'COMPLETED', 'CANCELLED']).optional(),
  outcomeNotes: z.string().max(5000).optional(),
  campaign_householdsVisited: z.coerce.number().int().min(0).optional(),
  campaign_peopleContacted: z.coerce.number().int().min(0).optional(),
  campaign_pamphletsDistributed: z.coerce.number().int().min(0).optional(),
  campaign_expectedJoiners: z.coerce.number().int().min(0).optional(),
  campaign_actualJoiners: z.coerce.number().int().min(0).optional(),
  campaign_volunteerHours: z.coerce.number().min(0).optional(),
}).refine((d) => d.type || d.typeCode, { message: 'type or typeCode is required', path: ['typeCode'] });

const donationCreateSchema = z.object({
  unitLevel,
  unitId: objectId,
  // SRS §3.1 — optional body tag, same shape as meeting/activity.
  // Must be declared here: validate() replaces req.body with the
  // parsed result, and zod strips undeclared keys, so an undeclared
  // `body` would silently never reach the controller.
  body: z.enum(['EXECUTIVE', 'COMMITTEE', 'JIRGA', 'CONGRESS']).optional(),
  amount: z.coerce.number().positive(),
  donorType: z.enum(['MEMBER', 'NON_MEMBER', 'CORPORATE', 'ANONYMOUS']),
  donorMemberId: objectId.optional(),
  donorName: z.string().max(120).optional(),
  // Accept any short string to stay forgiving — strict-format check is
  // applied only in the controller for the high-value non-member case
  // (SRS §9.1 / FIN-004), where CNIC is genuinely required.
  donorCnic: z.string().max(20).optional(),
  donorAddress: z.string().max(300).optional(),
  paymentMode: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_WALLET', 'CHEQUE']),
  receivedAt: z.coerce.date(),
  note: z.string().max(500).optional(),
});

const expenseCreateSchema = z.object({
  unitLevel,
  unitId: objectId,
  // See donationCreateSchema — declared so validate() doesn't strip it.
  body: z.enum(['EXECUTIVE', 'COMMITTEE', 'JIRGA', 'CONGRESS']).optional(),
  category: z.enum([
    'OFFICE', 'TRANSPORT', 'PRINTING', 'REFRESHMENTS', 'STAGE_EQUIPMENT',
    'COMMUNICATION', 'DONATIONS_OUT', 'SALARIES_STIPENDS', 'MISC',
  ]),
  description: z.string().min(3).max(400),
  amount: z.coerce.number().positive(),
  incurredAt: z.coerce.date(),
  vendor: z.string().max(120).optional(),
  paymentMode: z.enum(['CASH', 'BANK_TRANSFER', 'MOBILE_WALLET', 'CHEQUE']),
  paidByMemberId: objectId.optional(),
});

const expenseDecideSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  note: z.string().max(500).optional(),
});

module.exports = {
  proposeRoleSchema,
  decideRoleSchema,
  endRoleSchema,
  meetingCreateSchema,
  meetingFinalizeSchema,
  meetingUpdateSchema,
  activityCreateSchema,
  donationCreateSchema,
  expenseCreateSchema,
  expenseDecideSchema,
  responsibilityCreateSchema,
  responsibilityUpdateSchema,
};
