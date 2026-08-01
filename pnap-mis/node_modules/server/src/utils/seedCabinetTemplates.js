const CabinetTemplate = require('../models/CabinetTemplate');
const CabinetSlot = require('../models/CabinetSlot');

// seedCabinetTemplates — idempotent seeder for cabinet templates.
// Mirror of the legacy `CabinetSlot.TEMPLATES` map (still exported
// from CabinetSlot for forensic reference). Each row is `isSystem:
// true` so it can't be deleted; admin can edit isMandatory /
// sortOrder / labels / new fields freely.
//
// Run order matters: this seeder must execute BEFORE the cabinet-
// slot reconcile loop in db.js, because the reconcile now reads its
// "what should every unit's slot look like" data from this
// collection.

async function seedCabinetTemplates() {
  const tmpl = CabinetSlot.TEMPLATES || {};
  let inserted = 0;
  let reconciled = 0;

  for (const [tierCode, rows] of Object.entries(tmpl)) {
    for (const row of rows) {
      const existing = await CabinetTemplate.findOne({ tierCode, roleCode: row.code });
      if (!existing) {
        await CabinetTemplate.create({
          tierCode,
          roleCode: row.code,
          isMandatory: !!row.mandatory,
          sortOrder: row.order,
          appliesToBody: 'BOTH',
          termDays: 0,
          allowedAppointerRoles: [],
          allowedDeciderRoles: [],
          visibilityScope: 'TIER_ONLY',
          isSystem: true,
          isActive: true,
        });
        inserted++;
        continue;
      }
      // Re-pin authoritative flags on every boot — admin edits to
      // isMandatory / sortOrder / new fields are preserved; only the
      // load-bearing identity bits get reconciled.
      let dirty = false;
      if (!existing.isSystem) { existing.isSystem = true; dirty = true; }
      if (existing.tierCode !== tierCode) { existing.tierCode = tierCode; dirty = true; }
      if (existing.roleCode !== row.code) { existing.roleCode = row.code; dirty = true; }
      if (dirty) {
        await existing.save();
        reconciled++;
      }
    }
  }

  return { inserted, reconciled };
}

module.exports = { seedCabinetTemplates };
