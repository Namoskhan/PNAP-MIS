const mongoose = require('mongoose');

// SRS §3.2 — "Permanent Members nominated by higher leadership" who
// sit on a level's committee in addition to its cabinet and
// the elected representatives of subordinate units.
const permanentMembershipSchema = new mongoose.Schema(
  {
    unitLevel: {
      type: String,
      enum: ['AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'],
      required: true,
      index: true,
    },
    unitId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true },
    nominationNote: { type: String, maxlength: 500 },
    nominatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

permanentMembershipSchema.index(
  { unitLevel: 1, unitId: 1, memberId: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model('PermanentMembership', permanentMembershipSchema);
