const mongoose = require('mongoose');

const provinceSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    isActive: { type: Boolean, default: true },

    // SRS §3.3 — Sobayi Committee. Auto-formed when the Central Admin
    // approves the first Province-level cabinet role. Composition
    // (Provincial Cabinet + District Sec/Sr.Mawins + Permanent
    // Members) is derived live; this just records the formation moment.
    committee: {
      formedAt: Date,
      formedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: String,
    },

    // ── PR U1 (Hybrid Dynamic Unit Management) ─────────────────────
    // Additive surface for per-unit custom attributes. customData is
    // a free-form bag validated against the tier's UnitTierConfig
    // snapshot at write-time (dynamicFormService strips unknown keys
    // and enforces field shapes). configSnapshotId pins the schema
    // version this row was validated against — same self-describing
    // pattern Meeting/Activity uses.
    customData: { type: mongoose.Schema.Types.Mixed, default: {} },
    configSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'UnitTierConfigSnapshot' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Province', provinceSchema);
