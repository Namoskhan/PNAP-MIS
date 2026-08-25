const mongoose = require('mongoose');

const PAYMENT_MODES = ['CASH', 'BANK_TRANSFER', 'MOBILE_WALLET', 'CHEQUE'];
const DONOR_TYPES = ['MEMBER', 'NON_MEMBER', 'CORPORATE', 'ANONYMOUS'];

const donationSchema = new mongoose.Schema(
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

    // SRS §3.1 — which body's books this donation belongs to. Same
    // field, enum and default as Meeting.js / Activity.js: a tag
    // applied from whichever UI hub the record was created in, not an
    // eligibility check on the recorder (a Finance Secretary sits on
    // both the Executive and the Committee by construction). Records
    // written before this field existed carry no value and are read
    // back as EXECUTIVE by the `$exists: false` fallback in every
    // filter that uses it.
    body: {
      type: String,
      enum: ['EXECUTIVE', 'COMMITTEE', 'JIRGA', 'CONGRESS'],
      default: 'EXECUTIVE',
      index: true,
    },

    receiptNo: { type: String, required: true, index: true },
    fiscalYear: { type: Number, required: true, index: true },

    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'PKR' },

    donorType: { type: String, enum: DONOR_TYPES, required: true },
    donorMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
    donorName: { type: String, trim: true },
    donorCnic: { type: String, trim: true },
    donorAddress: { type: String, trim: true },

    paymentMode: { type: String, enum: PAYMENT_MODES, required: true },
    receivedAt: { type: Date, required: true },
    receiptImageUrl: { type: String },
    note: { type: String },

    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

donationSchema.index({ unitId: 1, fiscalYear: 1, receiptNo: 1 }, { unique: true });

donationSchema.statics.PAYMENT_MODES = PAYMENT_MODES;
donationSchema.statics.DONOR_TYPES = DONOR_TYPES;

module.exports = mongoose.model('Donation', donationSchema);
