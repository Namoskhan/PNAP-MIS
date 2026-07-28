const mongoose = require('mongoose');

const basicUnitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: true },
    districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', required: true },
    provinceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Province', required: true },
    isActive: { type: Boolean, default: true },

    // ── PR U1 (Hybrid Dynamic Unit Management) ─────────────────────
    // See Province.js — additive customData bag + snapshot pin.
    customData: { type: mongoose.Schema.Types.Mixed, default: {} },
    configSnapshotId: { type: mongoose.Schema.Types.ObjectId, ref: 'UnitTierConfigSnapshot' },
  },
  { timestamps: true }
);

basicUnitSchema.index({ areaId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('BasicUnit', basicUnitSchema);
