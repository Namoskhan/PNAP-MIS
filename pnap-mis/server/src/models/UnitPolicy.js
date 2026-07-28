const mongoose = require('mongoose');

// UnitPolicy — configurable thresholds, quorum, and routing rules
// applied at three levels of specificity:
//
//   GLOBAL  → one row, applies everywhere unless overridden
//   TIER    → one row per tierCode, overrides GLOBAL for that tier
//   UNIT    → one row per (tierCode, unitId), overrides TIER + GLOBAL
//
// policyEngine.resolveFor(tierCode, unitId) walks the three levels
// and produces a deep-merged "ResolvedPolicy" — most specific wins
// per leaf field. Missing fields fall through.
//
// Each section is OPTIONAL inside the document. A nested field that
// is undefined means "no rule" — the engine treats it as a no-op,
// matching pre-PR-U3 behavior (no enforcement).
//
// Sections:
//   member    — registration / approval rules
//   meeting   — quorum / attendance / report-chaining
//   finance   — donation + expense thresholds
//   transfer  — directional routing rules
//
// The default GLOBAL row seeded by seedUnitPolicies preserves the
// system's current hardcoded behavior (e.g. expense second-approver
// at >10000) so deploying PR U3 changes nothing for end users.

const SCOPES = ['GLOBAL', 'TIER', 'UNIT'];
const TIER_CODES = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];
const TRANSFER_DIRECTIONS = ['UP', 'DOWN', 'SAME_TIER'];

const memberPolicySchema = new mongoose.Schema(
  {
    requireApprovalAtTier: { type: String, enum: TIER_CODES },
    minimumProfileFields: [{ type: String }],
  },
  { _id: false }
);

const meetingPolicySchema = new mongoose.Schema(
  {
    quorumMin: { type: Number, min: 0 },              // hard fail at finalize below this
    quorumWarn: { type: Number, min: 0 },             // soft warning surfaced via warnings()
    minAttendancePercent: { type: Number, min: 0, max: 100 },
    requirePreviousReport: { type: Boolean },
  },
  { _id: false }
);

const financePolicySchema = new mongoose.Schema(
  {
    expenseAutoApproveBelow: { type: Number, min: 0 },
    expenseRequireSecondApproverAbove: { type: Number, min: 0 },
    donationCnicRequiredAbove: { type: Number, min: 0 },
  },
  { _id: false }
);

const transferPolicySchema = new mongoose.Schema(
  {
    allowedDirections: [{ type: String, enum: TRANSFER_DIRECTIONS }],
    requirePresidentApprovalAbove: { type: Number, min: 0 },
  },
  { _id: false }
);

const unitPolicySchema = new mongoose.Schema(
  {
    // scope / tierCode / unitId — all participate in the partial-
    // filter unique indexes declared below. We don't add field-level
    // `index: true` here because that creates redundant single-field
    // indexes on top of the compound ones (Mongoose warns about it).
    scope: { type: String, enum: SCOPES, required: true },
    // tierCode is required for TIER + UNIT scope; ignored on GLOBAL.
    tierCode: { type: String, enum: TIER_CODES },
    // unitId is required for UNIT scope; null for GLOBAL/TIER.
    unitId: { type: mongoose.Schema.Types.ObjectId },

    member: { type: memberPolicySchema, default: () => ({}) },
    meeting: { type: meetingPolicySchema, default: () => ({}) },
    finance: { type: financePolicySchema, default: () => ({}) },
    transfer: { type: transferPolicySchema, default: () => ({}) },

    // Bumps on every save. Records that snapshot the resolved policy
    // (Meeting / Expense / FundTransfer) embed a slice tagged with
    // the policyVersion that was active at the time, so audit can
    // reconstruct what rules applied even after admin edits.
    policyVersion: { type: Number, default: 1 },

    // Default GLOBAL row is isSystem: true so it can't be deleted —
    // seeded once at boot to preserve current behavior. TIER/UNIT
    // overrides created by admin are isSystem: false and removable.
    isSystem: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },

    note: String,

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Uniqueness rules — at most one policy row per scope key:
//   GLOBAL: exactly one row, identified by scope='GLOBAL' alone.
//   TIER:   one per tierCode.
//   UNIT:   one per (tierCode, unitId).
// Implemented as three partial-filter unique indexes so each scope
// can keep its own constraint without blocking the others.
unitPolicySchema.index(
  { scope: 1 },
  { unique: true, partialFilterExpression: { scope: 'GLOBAL' } }
);
unitPolicySchema.index(
  { scope: 1, tierCode: 1 },
  { unique: true, partialFilterExpression: { scope: 'TIER' } }
);
unitPolicySchema.index(
  { scope: 1, tierCode: 1, unitId: 1 },
  { unique: true, partialFilterExpression: { scope: 'UNIT' } }
);

unitPolicySchema.statics.SCOPES = SCOPES;
unitPolicySchema.statics.TIER_CODES = TIER_CODES;
unitPolicySchema.statics.TRANSFER_DIRECTIONS = TRANSFER_DIRECTIONS;

module.exports = mongoose.model('UnitPolicy', unitPolicySchema);
