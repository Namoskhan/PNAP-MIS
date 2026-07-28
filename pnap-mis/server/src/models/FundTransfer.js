const mongoose = require('mongoose');

// SRS §9.3 — Inter-level fund transfers travel upward only
// (Basic Unit → Area → District → Province → Central). The amount
// stays in the sender's books until the receiver acknowledges it.
const STATES = ['PENDING_ACK', 'ACKNOWLEDGED', 'REJECTED', 'CANCELLED'];

const fundTransferSchema = new mongoose.Schema(
  {
    sourceLevel: {
      type: String,
      enum: ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE'],
      required: true,
      index: true,
    },
    sourceUnitId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    destinationLevel: {
      type: String,
      enum: ['AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'],
      required: true,
      index: true,
    },
    destinationUnitId: { type: mongoose.Schema.Types.ObjectId, index: true },

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

module.exports = mongoose.model('FundTransfer', fundTransferSchema);
