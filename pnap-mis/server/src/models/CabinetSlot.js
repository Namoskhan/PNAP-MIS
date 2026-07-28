const mongoose = require('mongoose');

// SRS §3.2 — Each unit has a defined cabinet structure. We
// materialize a CabinetSlot per role per unit so the Area Admin /
// Secretary sees every expected position (filled or vacant) on the
// cabinet page and can assign members one-click.

const slotSchema = new mongoose.Schema(
  {
    unitLevel: {
      type: String,
      enum: ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'],
      required: true,
    },
    unitId: { type: mongoose.Schema.Types.ObjectId, required: true },
    roleCode: { type: String, required: true },
    isMandatory: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 100 },

    filledByAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'RoleAssignment' },
    filledMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
  },
  { timestamps: true }
);

slotSchema.index({ unitLevel: 1, unitId: 1, roleCode: 1 }, { unique: true });
slotSchema.index({ unitLevel: 1, unitId: 1 });

// SRS §3.2 cabinet templates per unit level.
const TEMPLATES = {
  BASIC_UNIT: [
    { code: 'SECRETARY', mandatory: true, order: 10 },
    { code: 'SENIOR_MAWIN', mandatory: true, order: 20 },
    { code: 'FINANCE_SECRETARY', mandatory: true, order: 30 },
    { code: 'PRESS_SECRETARY', mandatory: false, order: 40 },
    { code: 'CULTURE_SECRETARY', mandatory: false, order: 50 },
    { code: 'SPORTS_SECRETARY', mandatory: false, order: 60 },
  ],
  AREA: [
    { code: 'SECRETARY', mandatory: true, order: 10 },
    { code: 'SENIOR_MAWIN', mandatory: true, order: 20 },
    { code: 'FINANCE_SECRETARY', mandatory: true, order: 30 },
    { code: 'PRESS_SECRETARY', mandatory: false, order: 40 },
    { code: 'CULTURE_SECRETARY', mandatory: false, order: 50 },
    { code: 'SPORTS_SECRETARY', mandatory: false, order: 60 },
  ],
  // SRS §3.2 — "Same structure as Basic Unit". Full template so the
  // Province Admin can assign every SRS-defined district cabinet role.
  DISTRICT: [
    { code: 'SECRETARY', mandatory: true, order: 10 },
    { code: 'SENIOR_MAWIN', mandatory: true, order: 20 },
    { code: 'FINANCE_SECRETARY', mandatory: true, order: 30 },
    { code: 'PRESS_SECRETARY', mandatory: false, order: 40 },
    { code: 'CULTURE_SECRETARY', mandatory: false, order: 50 },
    { code: 'SPORTS_SECRETARY', mandatory: false, order: 60 },
  ],
  // SRS §3.3 — Province Cabinet positions.
  PROVINCE: [
    { code: 'PRESIDENT', mandatory: true, order: 10 },
    { code: 'SR_VICE_PRESIDENT', mandatory: true, order: 15 },
    { code: 'VICE_PRESIDENT', mandatory: true, order: 20 },
    { code: 'GENERAL_SECRETARY', mandatory: true, order: 25 },
    { code: 'FINANCE_SECRETARY', mandatory: true, order: 30 },
    { code: 'PRESS_SECRETARY', mandatory: false, order: 40 },
    { code: 'CULTURE_SECRETARY', mandatory: false, order: 50 },
    { code: 'SPORTS_SECRETARY', mandatory: false, order: 60 },
  ],
  // SRS §3.4 — Central Cabinet. Note the Chairman variants (Sr. Vice
  // Chairman / Vice Chairman) per the spec, distinct from the Province-
  // level Vice President naming.
  CENTRAL: [
    { code: 'CHAIRMAN', mandatory: true, order: 10 },
    { code: 'CO_CHAIRMAN', mandatory: true, order: 15 },
    { code: 'SR_VICE_CHAIRMAN', mandatory: false, order: 20 },
    { code: 'VICE_CHAIRMAN', mandatory: false, order: 25 },
    { code: 'GENERAL_SECRETARY', mandatory: true, order: 30 },
    { code: 'FIRST_SECRETARY', mandatory: false, order: 35 },
    { code: 'FINANCE_SECRETARY', mandatory: true, order: 40 },
    { code: 'PRESS_SECRETARY', mandatory: false, order: 50 },
    { code: 'CULTURE_SECRETARY', mandatory: false, order: 60 },
    { code: 'SPORTS_SECRETARY', mandatory: false, order: 70 },
  ],
};

// LEGACY hardcoded templates — preserved here for two reasons:
//   1. PR U2's seeder copies these into the CabinetTemplate
//      collection on first boot, so this stays the source-of-record
//      for the SRS-defined defaults.
//   2. Last-resort fallback if seedFor() is called before the
//      CabinetTemplate seeder has finished (e.g. during early boot).
//
// All NEW reads must go through CabinetTemplate, not this map. Admin
// edits land on CabinetTemplate, not here.
slotSchema.statics.TEMPLATES = TEMPLATES;
slotSchema.statics.LEGACY_TEMPLATES = TEMPLATES;

// Seed CabinetSlot rows for a freshly-created unit. Reads the
// authoritative slot list from CabinetTemplate; falls back to the
// legacy TEMPLATES map only if the collection is empty (which would
// indicate the seeder hasn't run yet — extremely unlikely outside of
// the very first ms of boot).
slotSchema.statics.seedFor = async function (unitLevel, unitId) {
  const CabinetTemplate = require('./CabinetTemplate');
  let rows = await CabinetTemplate.find({ tierCode: unitLevel, isActive: true })
    .sort({ sortOrder: 1 })
    .lean();
  if (rows.length === 0) {
    // Fallback path — emergency safety net. Should never fire in
    // normal operation because the boot seeder populates the
    // collection idempotently.
    rows = (TEMPLATES[unitLevel] || []).map((r) => ({
      tierCode: unitLevel,
      roleCode: r.code,
      isMandatory: r.mandatory,
      sortOrder: r.order,
    }));
  }
  await Promise.all(rows.map((row) =>
    this.updateOne(
      { unitLevel, unitId, roleCode: row.roleCode },
      { $setOnInsert: {
          unitLevel, unitId,
          roleCode: row.roleCode,
          isMandatory: !!row.isMandatory,
          sortOrder: row.sortOrder,
        } },
      { upsert: true }
    )
  ));
};

module.exports = mongoose.model('CabinetSlot', slotSchema);
