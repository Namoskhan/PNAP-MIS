const mongoose = require('mongoose');

// ResponsibilityTemplate — admin-defined rule that auto-instantiates
// a Responsibility document whenever a matching lifecycle event
// fires (meeting finalized, activity completed, etc.).
//
// The system starts with ZERO templates seeded. Behavior is
// unchanged until admin explicitly creates a template via the
// admin endpoints. Admin opts in to automation rather than opting
// out — safest cutover path.
//
// Trigger model: each template names ONE event code. The hook
// service walks active templates whose event matches, evaluates
// optional conditions (tier / type / body), resolves an assignee,
// and creates a Responsibility with the idempotency key
// (templateId, sourceRef.id) so re-firing produces no duplicates.
//
// Assignment targets:
//   CREATOR        — user who created the source record (their
//                    linked memberId, if any)
//   CHAIRPERSON    — meeting.chairpersonId (meetings only)
//   LEAD           — activity.leadMemberId (activities only)
//   CABINET_ROLE   — current holder of `assignment.roleCode` in the
//                    source unit (looked up live via RoleAssignment)
//
// PR U5 ships hooks for MEETING_FINALIZED + ACTIVITY_COMPLETED.
// Other events (MEETING_CREATED, ROLE_APPROVED, CABINET_APPOINTED)
// are reserved for follow-up cutovers.

const TRIGGER_EVENTS = [
  'MEETING_FINALIZED',
  'MEETING_CREATED',
  'ACTIVITY_COMPLETED',
  'ROLE_APPROVED',
  'CABINET_APPOINTED',
];

const TARGETS = ['CREATOR', 'CHAIRPERSON', 'LEAD', 'CABINET_ROLE'];

const triggerSchema = new mongoose.Schema(
  {
    event: { type: String, enum: TRIGGER_EVENTS, required: true },
    // All conditions are optional — empty conditions = "fire on every
    // event of this type." Each condition narrows further: e.g.
    // { tierCode: 'AREA', typeCode: 'GBM' } = "fire only on AREA
    // GBM meetings."
    conditions: {
      tierCode: { type: String, enum: ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'] },
      typeCode: { type: String, uppercase: true, trim: true },
      body: { type: String, enum: ['EXECUTIVE', 'COMMITTEE'] },
    },
  },
  { _id: false }
);

const assignmentSchema = new mongoose.Schema(
  {
    target: { type: String, enum: TARGETS, required: true },
    // Required when target === 'CABINET_ROLE'. Validated against the
    // Role catalogue in the controller before save.
    roleCode: { type: String, uppercase: true, trim: true },
  },
  { _id: false }
);

const responsibilityTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    trigger: { type: triggerSchema, required: true },
    assignment: { type: assignmentSchema, required: true },

    // Default title applied to every responsibility this template
    // creates. Falls back to the template's `name` if missing.
    titleTemplate: { type: String, trim: true },
    descriptionTemplate: { type: String, trim: true },

    // Days from the trigger fire to set as the responsibility's
    // dueDate. 0 = no due date (it's left null).
    dueDateOffsetDays: { type: Number, default: 0, min: 0 },

    isActive: { type: Boolean, default: true, index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Helpful read indexes — the hook service queries by event + active.
responsibilityTemplateSchema.index({ 'trigger.event': 1, isActive: 1 });

responsibilityTemplateSchema.statics.TRIGGER_EVENTS = TRIGGER_EVENTS;
responsibilityTemplateSchema.statics.TARGETS = TARGETS;

module.exports = mongoose.model('ResponsibilityTemplate', responsibilityTemplateSchema);
