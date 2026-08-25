const mongoose = require('mongoose');

const EXPENSE_CATEGORIES = [
  'OFFICE',
  'TRANSPORT',
  'PRINTING',
  'REFRESHMENTS',
  'STAGE_EQUIPMENT',
  'COMMUNICATION',
  'DONATIONS_OUT',
  'SALARIES_STIPENDS',
  'MISC',
];

const STATES = ['PENDING', 'APPROVED', 'REJECTED', 'REVERSED'];

const expenseSchema = new mongoose.Schema(
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

    // SRS §3.1 — which body's books this expense belongs to. Same
    // field, enum and default as Meeting.js / Activity.js: a tag
    // applied from whichever UI hub the record was created in, not an
    // eligibility check on the recorder (a Finance Secretary sits on
    // both the Executive and the Committee by construction). Records
    // written before this field existed carry no value and are read
    // back as EXECUTIVE by the `$exists: false` fallback in every
    // filter that uses it.
    body: {
      type: String,
      enum: ['EXECUTIVE', 'COMMITTEE', 'JIRGA'],
      default: 'EXECUTIVE',
      index: true,
    },

    category: { type: String, enum: EXPENSE_CATEGORIES, required: true },
    description: { type: String, required: true, trim: true, maxlength: 400 },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'PKR' },

    incurredAt: { type: Date, required: true },
    vendor: { type: String, trim: true },
    paymentMode: { type: String, enum: ['CASH', 'BANK_TRANSFER', 'MOBILE_WALLET', 'CHEQUE'], required: true },
    paidByMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },

    evidenceUrl: { type: String, required: true },

    state: { type: String, enum: STATES, default: 'PENDING', index: true },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    reversalNote: { type: String },

    // ── PR U4 (Hybrid Dynamic Workflows) ───────────────────────────
    // Append-only audit trail of stage decisions. The legacy
    // approvedBy / approvedAt / rejectedBy / rejectedAt fields stay
    // populated for backwards compatibility (downstream readers
    // continue to work). approvalChain[] adds the multi-stage
    // dimension when admin configures more than one stage.
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

    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

expenseSchema.statics.EXPENSE_CATEGORIES = EXPENSE_CATEGORIES;
expenseSchema.statics.STATES = STATES;

module.exports = mongoose.model('Expense', expenseSchema);
