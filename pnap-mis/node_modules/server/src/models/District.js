const mongoose = require('mongoose');

const districtSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Optional now: districts created from public registration do
    // not have an admin-assigned code. The unique index is sparse
    // so multiple null codes coexist.
    code: { type: String, uppercase: true, trim: true },
    provinceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Province', required: true },
    isActive: { type: Boolean, default: true },

    // SRS §3.2 — the Zilla Committee is auto-formed the moment the
    // Province Admin approves the first District-level cabinet role.
    // Composition (District Cabinet + Area Sec/Sr.Mawins + Permanent
    // Members) is derived live; this records the formation moment.
    committee: {
      formedAt: Date,
      formedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: String,
    },

    // ── PR U1 (Hybrid Dynamic Unit Management) ─────────────────────
    // See Province.js for the rationale — additive customData bag +
    // snapshot pin so per-tier custom fields are self-describing.
    customData: { type: mongoose.Schema.Types.Mixed, default: {} },
    configSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'UnitTierConfigSnapshot' },
  },
  { timestamps: true }
);

// Use partialFilterExpression instead of sparse: sparse only skips
// documents where the field is *missing*, not where it's *null*.
// Many districts created via the public registration flow have
// code: null (no admin code), and we don't want them to collide.
districtSchema.index(
  { provinceId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } } }
);
districtSchema.index({ provinceId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('District', districtSchema);
