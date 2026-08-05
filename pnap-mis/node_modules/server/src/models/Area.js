const mongoose = require('mongoose');

const areaSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Optional admin-assigned code, same semantics as District.code.
    // Manage Organization has always offered a Code field for every
    // tier, but Area and BasicUnit never declared one — so in Mongoose
    // strict mode the value was silently dropped on create and the
    // list column rendered "—" for a code the admin had just typed.
    // The setter maps a blank submission to "no code" rather than to
    // the empty string: '' is a string, so the partial unique index
    // would treat it as a real code and the SECOND unit created with
    // the field left blank would fail with a duplicate-key error.
    code: {
      type: String,
      uppercase: true,
      trim: true,
      set: (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    },
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

// partialFilterExpression rather than sparse — sparse only skips
// documents where the field is MISSING, not where it is null, and
// every area created before this field existed has no code at all.
// Unique within the parent district, matching District.code's scoping.
areaSchema.index(
  { districtId: 1, code: 1 },
  { unique: true, partialFilterExpression: { code: { $type: 'string' } } }
);
areaSchema.index({ districtId: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Area', areaSchema);
