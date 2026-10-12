const mongoose = require('mongoose');

const proformaReportSchema = new mongoose.Schema(
  {
    formType: {
      type: String,
      enum: ['form1', 'form2', 'form3', 'form4', 'form5'],
      required: true,
      index: true,
    },
    unitLevel: {
      type: String,
      enum: ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'],
      required: true,
      index: true,
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    unitName: {
      type: String,
      trim: true,
      default: '',
    },
    areaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Area',
      index: true,
    },
    districtId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'District',
      index: true,
    },
    provinceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Province',
      index: true,
    },
    year: {
      type: Number,
      required: true,
      index: true,
    },
    month: {
      type: Number,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['DRAFT', 'SUBMITTED', 'APPROVED'],
      default: 'SUBMITTED',
      index: true,
    },
    // Complete structured report payload (upper summary metrics, rows, notes, etc.)
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    submittedByMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Member',
    },
    submittedByName: {
      type: String,
      trim: true,
      default: '',
    },
    submittedByRole: {
      type: String,
      trim: true,
      default: '',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

// One stored report per form type per unit per year/month
proformaReportSchema.index(
  { formType: 1, unitId: 1, year: 1, month: 1 },
  { unique: true }
);

module.exports = mongoose.model('ProformaReport', proformaReportSchema);
