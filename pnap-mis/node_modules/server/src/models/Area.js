const mongoose = require('mongoose');

const areaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', required: true },
    provinceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Province', required: true },
    isActive: { type: Boolean, default: true },

    // SRS §3.1 — the Elaqayi Committee is auto-formed the moment the
    // District Admin approves the first Area-level cabinet role for
    // this area. Composition (Area Executive + BU Sec/Sr.Mawin +
    // Permanent Members) is derived live; this field just records
    // the formation event so the dashboard can show "Committee
    // formed on …" instead of an ambiguous empty state.
    committee: {
      formedAt: Date,
      formedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: String,
    },

    // ── PR U1 (Hybrid Dynamic Unit Management) ─────────────────────
    // See Province.js — additive customData bag + snapshot pin.
    customData: { type: mongoose.Schema.Types.Mixed, default: {} },
    configSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'UnitTierConfigSnapshot' },
  },
  { timestamps: true }
);

areaSchema.index({ districtId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Area', areaSchema);
