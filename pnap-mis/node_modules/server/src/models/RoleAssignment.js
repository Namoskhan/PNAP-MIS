const mongoose = require('mongoose');

// Cabinet role codes (SRS §3.2). Some are mandatory at every level
// (Secretary / Senior Mawin / Finance Secretary), others are optional.
const ROLE_CODES = [
  'SECRETARY',
  'SENIOR_MAWIN',
  'FINANCE_SECRETARY',
  'PRESS_SECRETARY',
  'CULTURE_SECRETARY',
  'SPORTS_SECRETARY',
  'GENERAL_SECRETARY',
  // SRS §3.4 — central-only "First Secretary" position.
  'FIRST_SECRETARY',
  'PRESIDENT',
  'VICE_PRESIDENT',
  'SR_VICE_PRESIDENT',
  'CHAIRMAN',
  'CO_CHAIRMAN',
  // SRS §3.4 — Central Vice/Sr. Vice Chairman, distinct from
  // Province-level VP/Sr. VP per the spec's naming.
  'VICE_CHAIRMAN',
  'SR_VICE_CHAIRMAN',
  'OTHER',
];

const MANDATORY_ROLES_PER_LEVEL = {
  BASIC_UNIT: ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY'],
  AREA: ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY'],
  DISTRICT: ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY'],
  PROVINCE: ['PRESIDENT', 'GENERAL_SECRETARY', 'FINANCE_SECRETARY'],
  CENTRAL: ['CHAIRMAN', 'CO_CHAIRMAN', 'GENERAL_SECRETARY', 'FINANCE_SECRETARY'],
};

const STATES = ['PROPOSED', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED', 'ENDED'];

const roleAssignmentSchema = new mongoose.Schema(
  {
    unitLevel: {
      type: String,
      enum: ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'],
      required: true,
      index: true,
    },
    unitId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },
    // Built-in SRS codes are listed in ROLE_CODES (kept as the static
    // `BUILTIN` set on the schema for legacy callers), but the field
    // itself is no longer enum-locked — Super Admin can mint custom
    // codes via the Role catalogue and assign them through the
    // Cabinet UI. Trim + uppercase still applied to keep things
    // consistent.
    roleCode: { type: String, required: true, trim: true, uppercase: true },
    customRoleName: { type: String, trim: true },

    state: { type: String, enum: STATES, default: 'PROPOSED', index: true },
    startedAt: { type: Date },
    endedAt: { type: Date },
    endReason: { type: String, enum: ['RESIGNED', 'EXPELLED', 'TERM_ENDED', 'TRANSFERRED', 'DECEASED', 'REPLACED'] },

    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    initiatedAt: { type: Date, default: Date.now },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    decisionNote: { type: String },

    // ── PR F1 (workflow cutover) ──────────────────────────────────
    // Multi-stage approval chain (ROLE_APPROVAL domain). Default
    // single-stage workflow gives one entry on final transition;
    // legacy decidedBy/decidedAt stay populated for backwards compat.
    approvalChain: [{
      stageCode: String,
      stageName: String,
      decision: { type: String, enum: ['APPROVED', 'REJECTED', 'SKIPPED'] },
      decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      decidedAt: Date,
      note: String,
    }],
    workflowConfigId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowConfig' },
    workflowVersion: Number,
  },
  { timestamps: true }
);

// Only one ACTIVE (APPROVED + not ended) holder of a mandatory role per unit.
roleAssignmentSchema.index(
  { unitLevel: 1, unitId: 1, roleCode: 1, state: 1, endedAt: 1 },
);

roleAssignmentSchema.statics.ROLE_CODES = ROLE_CODES;
roleAssignmentSchema.statics.STATES = STATES;
roleAssignmentSchema.statics.MANDATORY_ROLES_PER_LEVEL = MANDATORY_ROLES_PER_LEVEL;

module.exports = mongoose.model('RoleAssignment', roleAssignmentSchema);
