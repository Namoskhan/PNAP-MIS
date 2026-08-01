const mongoose = require('mongoose');

// WorkflowConfig — configurable approval chains per (domain, tier).
// Replaces the implicit "single-call decide → APPROVED|REJECTED"
// gate that lives in each domain controller.
//
// IMPORTANT: this is NOT a general state-machine engine. The
// canonical lifecycle states (PENDING / APPROVED / REJECTED) are
// hard-coded and cannot be removed or renamed via config. What
// admins CAN configure is *who* decides at each stage, *under what
// conditions* (threshold-based skipping), and *how many stages* a
// record must clear before reaching APPROVED.
//
// Resolution order: TIER override → GLOBAL fallback. Most specific
// wins. The unique partial-filter indexes below enforce one row
// per (domain, GLOBAL) and one per (domain, TIER, tierCode).
//
// Each stage is a small predicate:
//   • requirePermission   — user must hold this permission code
//   • requireRoleCode     — additionally, user must hold this role
//   • thresholdField      — payload field to evaluate (e.g. 'amount')
//   • thresholdAmount     — stage applies only when payload[field] ≥ threshold
//   • skipBelowThreshold  — false = stage runs always; true = skip when below
//
// On the record being approved, an `approvalChain[]` accumulates
// one entry per stage with { stageCode, decision, decidedBy, ... }.
// Skipped stages are recorded as `decision: 'SKIPPED'` for forensics.

const DOMAINS = [
  'EXPENSE_APPROVAL',
  'MEMBER_APPROVAL',
  'ROLE_APPROVAL',
  'TRANSFER_APPROVAL',
  'CABINET_APPOINTMENT',
];

const SCOPES = ['GLOBAL', 'TIER'];
const TIER_CODES = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];

const stageSchema = new mongoose.Schema(
  {
    // Machine-readable code, immutable once published. Used as the
    // key on the record's approvalChain entries — renaming would
    // orphan history. Admin can edit `name` freely; `code` is locked.
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    sortOrder: { type: Number, default: 100 },

    // Permission / role gates. requirePermission is the primary
    // check; requireRoleCode further narrows (e.g. "must hold
    // APPROVE_EXPENSE AND be the FINANCE_SECRETARY of this unit").
    // Either, both, or neither — but at least one is recommended,
    // else any authenticated user can decide.
    requirePermission: { type: String, uppercase: true, trim: true },
    requireRoleCode: { type: String, uppercase: true, trim: true },

    // Threshold-based skipping. When set, the stage only applies if
    // payload[thresholdField] ≥ thresholdAmount. Used for "President
    // approval above 50000" semantics.
    thresholdField: { type: String, trim: true },
    thresholdAmount: { type: Number, min: 0 },
    // false (default): if threshold is set and payload is below, the
    //                  stage is RECORDED AS SKIPPED in the chain
    //                  (workflow advances).
    // true:            same behavior — kept as a name knob for clarity.
    skipBelowThreshold: { type: Boolean, default: true },
  },
  { _id: false }
);

const workflowConfigSchema = new mongoose.Schema(
  {
    domain: { type: String, enum: DOMAINS, required: true },
    scope: { type: String, enum: SCOPES, required: true, default: 'GLOBAL' },
    // Required for scope=TIER; null for scope=GLOBAL.
    tierCode: { type: String, enum: TIER_CODES },

    stages: { type: [stageSchema], default: [] },

    // Bumps on every save so records that pin a workflow version at
    // create-time can detect drift. Records carry `workflowVersion`
    // alongside `approvalChain[]`.
    configVersion: { type: Number, default: 1 },

    // Default GLOBAL row per domain is isSystem: true and cannot be
    // deleted. TIER overrides are isSystem: false and freely editable.
    isSystem: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },

    note: String,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One GLOBAL row per domain.
workflowConfigSchema.index(
  { domain: 1, scope: 1 },
  { unique: true, partialFilterExpression: { scope: 'GLOBAL' } }
);
// One TIER row per (domain, tierCode).
workflowConfigSchema.index(
  { domain: 1, scope: 1, tierCode: 1 },
  { unique: true, partialFilterExpression: { scope: 'TIER' } }
);

workflowConfigSchema.statics.DOMAINS = DOMAINS;
workflowConfigSchema.statics.SCOPES = SCOPES;
workflowConfigSchema.statics.TIER_CODES = TIER_CODES;

module.exports = mongoose.model('WorkflowConfig', workflowConfigSchema);
