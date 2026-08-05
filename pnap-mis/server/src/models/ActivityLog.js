const mongoose = require('mongoose');

// Append-only stream of MEANINGFUL ORGANIZATIONAL ACTIVITY.
//
// Deliberately distinct from AuditLog:
//   • AuditLog answers "who changed the system configuration" — its
//     actor is a User, it has no unit chain, and it is surfaced
//     verbatim on the Super Admin audit page. Pouring every meeting
//     attendance row into it would drown that page.
//   • ActivityLog answers "is this member / unit still doing party
//     work" — its subject is a MEMBER, it carries the denormalized
//     hierarchy so province-wide roll-ups are a single indexed
//     pipeline, and it is never shown raw.
//
// The two coexist: utils/audit.js mirrors every audited admin action
// into here through activityService, so administrative work counts
// towards activity without a second call site.
//
// Nothing writes to this collection directly — activityService.record()
// is the only entry point (see services/activityService.js).

// Canonical action codes. Mirrors the organizational-activity
// taxonomy; `category` groups them for the trend chart legend.
const ACTIONS = {
  ATTENDANCE_MARKED: 'ATTENDANCE',
  MEETING_PARTICIPATION: 'MEETING',
  MEETING_CREATED: 'MEETING',
  MEETING_FINALIZED: 'MEETING',
  ACTIVITY_CREATED: 'ACTIVITY',
  ACTIVITY_COMPLETED: 'ACTIVITY',
  ACTIVITY_PARTICIPATION: 'ACTIVITY',
  FUND_TRANSFER_INITIATED: 'FINANCE',
  FUND_TRANSFER_APPROVED: 'FINANCE',
  FUND_TRANSFER_ACKNOWLEDGED: 'FINANCE',
  REPORT_SUBMITTED: 'REPORT',
  REPORT_APPROVED: 'REPORT',
  MEMBER_REGISTERED: 'MEMBER',
  MEMBER_APPROVED: 'MEMBER',
  MEMBER_UPDATED: 'MEMBER',
  CABINET_ROLE_ASSIGNED: 'ROLE',
  ANNOUNCEMENT_CREATED: 'COMMUNICATION',
  NOTIFICATION_BROADCAST: 'COMMUNICATION',
  PROVINCE_MANAGED: 'ORGANIZATION',
  DISTRICT_MANAGED: 'ORGANIZATION',
  AREA_MANAGED: 'ORGANIZATION',
  BASIC_UNIT_MANAGED: 'ORGANIZATION',
  ADMIN_ACTION: 'ADMIN',
};

const activityLogSchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    category: { type: String, required: true },

    // The member credited with the work. This — not the User — is what
    // the active/inactive rule is evaluated against, because office
    // bearers are Members and some actions (attendance, participation)
    // have no login behind them at all.
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
    // The login that performed it, when there was one. Kept for
    // traceability; never used by the activity rules.
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Where the work happened. unitLevel/unitId name the authoring
    // tier; the four ids below are the denormalized chain, matching
    // the pattern Meeting/Activity/Donation already use so roll-ups
    // never need a $graphLookup.
    unitLevel: { type: String, enum: ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'] },
    unitId: { type: mongoose.Schema.Types.ObjectId },
    basicUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'BasicUnit' },
    areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area' },
    districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District' },
    provinceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Province' },

    targetType: { type: String },
    targetId: { type: mongoose.Schema.Types.ObjectId },
    targetLabel: { type: String },

    // When the work happened — NOT when the row was written. The
    // backfill derives this from the source record's own timestamp so
    // history lands on the right day of the trend chart.
    occurredAt: { type: Date, required: true },

    // Idempotency handle for the backfill: "<source>:<id>:<action>:<member>".
    // Unique + sparse, so re-running the backfill is a no-op and live
    // writes (which pass no key) are unaffected.
    dedupeKey: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Primary read path: "did this member do anything since <cutoff>".
activityLogSchema.index({ memberId: 1, occurredAt: -1 });
// Trend + recent-feed scans.
activityLogSchema.index({ occurredAt: -1 });
// Province-scoped trend / recent activity.
activityLogSchema.index({ provinceId: 1, occurredAt: -1 });
activityLogSchema.index({ districtId: 1, occurredAt: -1 });
activityLogSchema.index({ areaId: 1, occurredAt: -1 });
// Backfill idempotency. partialFilterExpression rather than sparse so
// live rows (dedupeKey absent) can never collide with each other.
activityLogSchema.index(
  { dedupeKey: 1 },
  { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
);

activityLogSchema.statics.ACTIONS = ACTIONS;

module.exports = mongoose.model('ActivityLog', activityLogSchema);
