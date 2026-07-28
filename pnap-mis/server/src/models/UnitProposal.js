const mongoose = require('mongoose');

// SRS §5.2 — A unit is proposed by the next-lower authorized admin
// and approved by the level above. While PENDING, the unit does
// not exist yet; on APPROVED the actual unit document is created.
const STATES = ['PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED'];
const TARGET_LEVELS = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE'];

const unitProposalSchema = new mongoose.Schema(
  {
    targetLevel: { type: String, enum: TARGET_LEVELS, required: true, index: true },
    name: { type: String, required: true, trim: true },
    code: { type: String, uppercase: true, trim: true },

    // Parent reference, polymorphic: only the appropriate one is set.
    parentBasicUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'BasicUnit' },
    parentAreaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area' },
    parentDistrictId: { type: mongoose.Schema.Types.ObjectId, ref: 'District' },
    parentProvinceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Province' },

    // Optional Secretary nominee (must be ACTIVE member of the area)
    proposedSecretaryMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },

    boundaryDescription: { type: String, maxlength: 500 },
    note: { type: String, maxlength: 500 },

    state: { type: String, enum: STATES, default: 'PENDING', index: true },
    proposedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    decisionNote: { type: String },

    // Once approved, link to the created unit document so the
    // proposal can be traced.
    createdUnitId: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

unitProposalSchema.statics.STATES = STATES;
unitProposalSchema.statics.TARGET_LEVELS = TARGET_LEVELS;

module.exports = mongoose.model('UnitProposal', unitProposalSchema);
