const mongoose = require('mongoose');

// SRS §9.3 — Inter-level fund transfers. Under the revised finance
// policy the sending Finance Secretary names the recipient explicitly:
// any active unit in the organization, at any tier, in any branch. A
// Basic Unit may pay another Basic Unit, a District may pay one of its
// Areas, KPK may pay Punjab. The unit named is the sole recipient and
// the sole acknowledging authority — there are no intermediate hops
// and no intermediate approvals.
//
// The amount stays in the sender's books until that receiver
// acknowledges it.
const STATES = ['PENDING_ACK', 'ACKNOWLEDGED', 'REJECTED', 'CANCELLED'];

// Which way the money moved, derived server-side from the two tiers.
// Every transfer used to be UP by construction; arbitrary destinations
// make DOWN and SAME_TIER ordinary, and UnitPolicy.transfer
// .allowedDirections is enforced against this value.
const DIRECTIONS = ['UP', 'DOWN', 'SAME_TIER'];

const fundTransferSchema = new mongoose.Schema(
  {
    sourceLevel: {
      type: String,
      enum: ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE'],
      required: true,
      index: true,
    },
    sourceUnitId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    // BASIC_UNIT joined this enum with the revised policy — a unit at
    // any tier can now be a recipient. Widening an enum is backward
    // compatible: every stored value stays valid and no migration is
    // needed.
    destinationLevel: {
      type: String,
      enum: ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'],
      required: true,
      index: true,
    },
    destinationUnitId: { type: mongoose.Schema.Types.ObjectId, index: true },

    // Denormalized display names, captured at create time from the
    // resolved units. Destinations are no longer predictable from the
    // sender's own hierarchy, so neither party can name the other by
    // looking at its own tree — the history table would otherwise show
    // a bare tier label. Snapshot semantics: a later rename does not
    // rewrite what the transfer was addressed to.
    sourceName: { type: String, trim: true },
    destinationName: { type: String, trim: true },

    // Server-derived from the two tiers; never accepted from a client.
    direction: { type: String, enum: DIRECTIONS, index: true },

    // Denormalized hierarchy of the source for roll-up
    basicUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'BasicUnit' },
    areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area' },
    districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District' },
    provinceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Province' },

    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'PKR' },
    mode: { type: String, enum: ['CASH', 'BANK_TRANSFER', 'MOBILE_WALLET', 'CHEQUE'], required: true },
    reference: { type: String, trim: true },
    note: { type: String, maxlength: 500 },

    // Proof of payment uploaded by the sending Finance Secretary so
    // the receiving FS can verify before acknowledging.
    receiptImageUrl: { type: String },

    state: { type: String, enum: STATES, default: 'PENDING_ACK', index: true },
    initiatedAt: { type: Date, default: Date.now },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    acknowledgedAt: { type: Date },
    acknowledgedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decisionNote: { type: String },

    // ── PR F1 (workflow cutover) ──────────────────────────────────
    // Multi-stage approval chain (TRANSFER_APPROVAL domain). The
    // existing authorizeAck() check (must be Finance Sec of the
    // destination unit) stays as a complementary scope guard —
    // workflowEngine only handles permission/role gating.
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

fundTransferSchema.statics.STATES = STATES;
fundTransferSchema.statics.DIRECTIONS = DIRECTIONS;

module.exports = mongoose.model('FundTransfer', fundTransferSchema);
