const mongoose = require('mongoose');

// See Meeting.js for the rationale — the `type` enum is relaxed in
// PR 4a; EventTypeConfig is the canonical catalogue. The legacy
// list stays here purely as a starting-point seed reference.
const LEGACY_ACTIVITY_TYPES = ['PROTEST', 'JALSA', 'CAMPAIGN', 'SEMINAR', 'STUDY_CIRCLE', 'TASK', 'COMMUNITY_SERVICE'];
const STATES = ['PLANNED', 'COMPLETED', 'CANCELLED'];

const activitySchema = new mongoose.Schema(
  {
    unitLevel: {
      type: String,
      enum: ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'],
      required: true,
      index: true,
    },
    unitId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    basicUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'BasicUnit', index: true },
    areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', index: true },
    districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', index: true },
    provinceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Province', index: true },

    type: { type: String, required: true, uppercase: true, trim: true, index: true },
    // SRS §3.1 — at Area+ levels the body running an activity can be
    // either the Executive, the full Committee, or Jirga. Same field as on
    // Meeting so the streams stay separable.
    body: {
      type: String,
      enum: ['EXECUTIVE', 'COMMITTEE', 'JIRGA'],
      default: 'EXECUTIVE',
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String },

    startAt: { type: Date, required: true },
    endAt: { type: Date },

    venue: { type: String },
    gps: { lat: Number, lng: Number },

    leadMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Member' }],
    externalAttendanceEstimate: { type: Number, default: 0 },

    photos: [{ url: String, capturedAt: Date, gps: { lat: Number, lng: Number }, sha256: String }],
    pressLinks: [{ type: String }],

    // Campaign-specific (§8.3)
    campaign: {
      householdsVisited: Number,
      peopleContacted: Number,
      pamphletsDistributed: Number,
      expectedJoiners: Number,
      actualJoiners: Number,
      volunteerHours: Number,
    },

    outcomeNotes: { type: String },
    state: { type: String, enum: STATES, default: 'PLANNED', index: true },

    // ── PR 2 (Hybrid Dynamic Modules) ──────────────────────────────
    // Optional during the migration window. See Meeting.js for the
    // field-by-field rationale; activities don't carry a finalized
    // hash so there's no `finalizedHashLegacy` here.
    typeCode: { type: String, uppercase: true, trim: true, index: true },
    configSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventConfigSnapshot' },
    dynamicData: { type: mongoose.Schema.Types.Mixed, default: {} },
    customStatus: { type: String, uppercase: true, trim: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

activitySchema.statics.ACTIVITY_TYPES = LEGACY_ACTIVITY_TYPES;
activitySchema.statics.LEGACY_ACTIVITY_TYPES = LEGACY_ACTIVITY_TYPES;
activitySchema.statics.STATES = STATES;

module.exports = mongoose.model('Activity', activitySchema);
