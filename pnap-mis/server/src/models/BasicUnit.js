const mongoose = require('mongoose');

const basicUnitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Optional admin-assigned code — see Area.code. The Create Basic
    // Unit form has always collected one; without this field Mongoose
    // discarded it silently, so the Code column always showed "—".
    // Blank -> unset, so two code-less units don't collide on the
    // partial unique index. See Area.js.
    code: {
      type: String,
      uppercase: true,
      trim: true,
      set: (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    },
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

// Unique within the parent area. partialFilterExpression, not sparse —
// see Area.js for why null codes must not collide.
basicUnitSchema.index(
  { areaId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } } }
);
basicUnitSchema.index({ areaId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('BasicUnit', basicUnitSchema);
