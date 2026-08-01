const mongoose = require('mongoose');

// SRS §8 "Assigned responsibilities" + §10 individual performance.
// A Senior Mawin assigns a task to a member of their unit; the member
// (or the Snr. Mawin) marks it complete; performance reports count the
// completion rate per member.
const STATES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

const responsibilitySchema = new mongoose.Schema(
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

    title: { type: String, required: true, trim: true },
    description: { type: String },
    dueDate: Date,

    assignedToMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    assignedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    relatedActivityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Activity' },
    relatedMeetingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meeting' },

    state: { type: String, enum: STATES, default: 'PENDING', index: true },
    completionNote: String,
    completedAt: Date,

    // ── PR U5 (Responsibility Templates) ───────────────────────────
    // Populated when the row was auto-created by the hook service
    // (responsibilityHookService) from a ResponsibilityTemplate.
    // Manual responsibilities (created via responsibilityController)
    // leave both fields blank.
    //
    // The compound unique index below uses partialFilterExpression
    // so manual rows (templateId missing) don't collide with each
    // other — only the auto-created stream is constrained to one
    // row per (template, source).
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResponsibilityTemplate' },
    sourceRef: {
      kind: { type: String, enum: ['MEETING', 'ACTIVITY', 'ROLE_ASSIGNMENT'] },
      id: { type: mongoose.Schema.Types.ObjectId },
    },
  },
  { timestamps: true }
);

// Idempotency index for auto-created responsibilities. Manual rows
// (no templateId) bypass the constraint via the partial filter.
responsibilitySchema.index(
  { templateId: 1, 'sourceRef.id': 1 },
  { unique: true, partialFilterExpression: { templateId: { $exists: true } } }
);

responsibilitySchema.statics.STATES = STATES;

module.exports = mongoose.model('Responsibility', responsibilitySchema);
