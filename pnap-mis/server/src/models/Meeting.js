const mongoose = require('mongoose');

// Legacy SRS-defined codes kept here as a STARTING-POINT catalogue —
// they're seeded into EventTypeConfig as built-ins. The type field
// itself no longer enforces this enum (PR 4a cutover): the
// EventTypeConfig collection is the source of truth, and the
// meetingController validates `typeCode` against it on create.
const LEGACY_MEETING_TYPES = ['GBM', 'EXC', 'CMP', 'GENERAL_BODY', 'EXECUTIVE', 'COMMITTEE', 'JRG', 'JIRGA', 'PRT', 'JLS', 'SEM', 'STC', 'OTH'];
const STATES = ['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'PENDING_REPORT', 'FINALIZED', 'CANCELLED'];

const photoSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    capturedAt: Date,
    gps: {
      lat: Number,
      lng: Number,
    },
    sha256: String,
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
    status: { type: String, enum: ['PRESENT', 'ABSENT', 'LATE'], required: true },
  },
  { _id: false }
);

const meetingSchema = new mongoose.Schema(
  {
    unitLevel: {
      type: String,
      enum: ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'],
      required: true,
      index: true,
    },
    unitId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    // Denormalized hierarchy for fast roll-up
    basicUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'BasicUnit', index: true },
    areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', index: true },
    districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', index: true },
    provinceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Province', index: true },

    // Free-form catalogue code (validated by the controller against
    // EventTypeConfig). Kept as a denormalized mirror of `typeCode`
    // so existing reads (exports, performance queries) keep working.
    type: { type: String, required: true, uppercase: true, trim: true, index: true },
    // Meetings can be run by Executive (cabinet only), Committee (executive +
    // office-holders + permanent members), General Body (full basic unit membership),
    // or Jirga (Qomi / Sobayi Jirga assembly).
    body: {
      type: String,
      enum: ['EXECUTIVE', 'COMMITTEE', 'GENERAL_BODY', 'JIRGA'],
      default: 'EXECUTIVE',
      index: true,
    },
    title: { type: String, trim: true },
    // Free-form blurb set at schedule time — the "what this meeting is
    // about" summary. Distinct from `agenda` (the item list) and from
    // `notes` / `decisions`, which are captured at finalize.
    description: { type: String, trim: true },
    venue: { type: String, required: true, trim: true },
    gps: { lat: Number, lng: Number },

    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },

    chairpersonId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
    agenda: { type: String },
    decisions: { type: String },
    actionItems: [{
      task: String,
      assigneeMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
      dueDate: Date,
    }],
    upcomingStrategy: { type: String },
    notes: { type: String },

    attendance: [attendanceSchema],
    guestAttendees: [{ name: String, cnic: String }],
    photos: [photoSchema],

    // SRS §7.2 "Previous report" / §14 document attachments — agendas,
    // minutes, scanned previous-meeting reports, etc.
    documents: [{
      url: String,
      filename: String,
      kind: { type: String, enum: ['AGENDA', 'PREVIOUS_REPORT', 'MINUTES', 'OTHER'], default: 'OTHER' },
      uploadedAt: { type: Date, default: Date.now },
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      sizeBytes: Number,
    }],

    // SRS §10 — what each member contributed in a study circle.
    studyContributions: [{
      memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
      topic: String,
      summary: String,
    }],

    // Forward-link to the previous meeting being reviewed (cleaner
    // than relying on "find latest finalized").
    previousMeetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting' },

    supervisorAttended: { type: Boolean, default: false },
    supervisorMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },

    state: { type: String, enum: STATES, default: 'DRAFT', index: true },
    finalizedAt: Date,
    finalizedHash: String,

    // ── PR 2 (Hybrid Dynamic Modules) ──────────────────────────────
    // Optional during the migration window. After PR 4 cutover,
    // typeCode + configSnapshotId become required; the legacy `type`
    // enum stays around as a denormalized convenience.
    //
    //   typeCode           → mirrors `type`, but free-form so admin
    //                        can add new types via EventTypeConfig
    //   configSnapshotId   → frozen field set this record was
    //                        validated against (see EventConfigSnapshot)
    //   dynamicData        → key/value bag for custom fields; ONLY
    //                        keys present in the snapshot land here
    //   customStatus       → optional overlay status for the workflow
    //                        extras feature (state stays canonical)
    //   finalizedHashLegacy → preserves the pre-cutover hash for
    //                        audit. Populated by the captureLegacyHashes
    //                        migration; never touched after that.
    typeCode: { type: String, uppercase: true, trim: true, index: true },
    configSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'EventConfigSnapshot' },
    dynamicData: { type: mongoose.Schema.Types.Mixed, default: {} },
    customStatus: { type: String, uppercase: true, trim: true },
    finalizedHashLegacy: String,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

meetingSchema.statics.MEETING_TYPES = LEGACY_MEETING_TYPES;
meetingSchema.statics.LEGACY_MEETING_TYPES = LEGACY_MEETING_TYPES;
meetingSchema.statics.STATES = STATES;

module.exports = mongoose.model('Meeting', meetingSchema);
