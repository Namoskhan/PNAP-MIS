const mongoose = require('mongoose');

// SRS §3.3 / §3.4 — Jirga is the grand representative assembly of the
// party at the PROVINCIAL level (Sobayi Jirga) and CENTRAL level (Qomi Jirga).
// Members of the Jirga are assigned by the General Secretary of that unit
// (or higher leadership / territorial admins).
const jirgaMemberSchema = new mongoose.Schema(
  {
    unitLevel: {
      type: String,
      enum: ['PROVINCE', 'CENTRAL'],
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

// A member can be active in a given Jirga at most once
jirgaMemberSchema.index(
  { unitLevel: 1, unitId: 1, memberId: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model('JirgaMember', jirgaMemberSchema);
