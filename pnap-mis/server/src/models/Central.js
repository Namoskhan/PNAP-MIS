const mongoose = require('mongoose');

// SRS §3.4 — the Central body is a singleton. There is exactly one
// PKNAP Central, distinct from all provinces/districts/areas/BUs.
// Its real Mongo ObjectId becomes the unitId for Central-level
// CabinetSlots, RoleAssignments, Meetings, Activities, and
// PermanentMembership rows — same shape as Province/District/Area.
const centralSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'PKNAP Central', trim: true },
    isActive: { type: Boolean, default: true },

    // Auto-formed when the first Central-level cabinet role is
    // APPROVED. Composition (Central Executive + Provincial
    // Presidents/GS + Permanent Members) is derived live; this
    // records the formation moment so the dashboard can show it.
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

module.exports = mongoose.model('Central', centralSchema);
