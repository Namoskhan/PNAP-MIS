const mongoose = require('mongoose');

// National Congress is the supreme representative assembly of the party
// at the CENTRAL level.
// Members of the National Congress are assigned by the Central General Secretary
// (or higher leadership / central administrators).
const congressMemberSchema = new mongoose.Schema(
  {
    unitLevel: {
      type: String,
      enum: ['CENTRAL'],
      default: 'CENTRAL',
      required: true,
      index: true,
    },
    unitId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', required: true, index: true },

    // Snapshot of role at time of nomination (for historical tracking)
    assignedRoleSnapshot: {
      roleCode: { type: String, trim: true },
      customRoleName: { type: String, trim: true },
      unitLevel: { type: String },
      unitId: { type: mongoose.Schema.Types.ObjectId },
      unitName: { type: String },
    },

    nominationNote: { type: String, maxlength: 1000, trim: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedAt: { type: Date, default: Date.now },

    isActive: { type: Boolean, default: true, index: true },
    removedAt: { type: Date },
    removedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    removalReason: { type: String, maxlength: 500, trim: true },
  },
  { timestamps: true }
);

// A member can be active in the National Congress at most once
congressMemberSchema.index(
  { unitLevel: 1, unitId: 1, memberId: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model('CongressMember', congressMemberSchema);
