const UnitTierConfig = require('../models/UnitTierConfig');

// seedUnitTierConfigs — idempotent seeder for the 5 built-in tier
// configs. Each row matches the BEHAVIOUR currently encoded across
// the codebase:
//
//   • BASIC_UNIT      — no committee body (only EXECUTIVE)
//   • AREA / DISTRICT / PROVINCE / CENTRAL — both bodies allowed
//   • CENTRAL has no transfers capability (it's the apex — no parent
//     to transfer up to). Everything else is on by default.
//
// Idempotent: only inserts missing rows; never overwrites admin
// edits to label / pluralLabel / description on existing rows. The
// `tierCode` and `isSystem: true` flags are kept canonical on every
// boot so the load-bearing tier identity can't be tampered with.

const BUILTIN_TIERS = [
  {
    tierCode: 'CENTRAL',
    label: 'Central',
    pluralLabel: 'Central',
    description: 'Apex tier (singleton) — PKNAP Central body.',
    capabilities: {
      meetings: true, activities: true, finance: true, cabinet: true,
      committee: true, transfers: false, performance: true, responsibilities: true,
    },
    bodyPolicy: { executive: true, committee: true },
  },
  {
    tierCode: 'PROVINCE',
    label: 'Province',
    pluralLabel: 'Provinces',
    description: 'Sobayi tier — Sobayi Committee + provincial cabinet.',
    capabilities: {
      meetings: true, activities: true, finance: true, cabinet: true,
      committee: true, transfers: true, performance: true, responsibilities: true,
    },
    bodyPolicy: { executive: true, committee: true },
  },
  {
    tierCode: 'DISTRICT',
    label: 'District',
    pluralLabel: 'Districts',
    description: 'Zilla tier — Zilla Committee + district cabinet.',
    capabilities: {
      meetings: true, activities: true, finance: true, cabinet: true,
      committee: true, transfers: true, performance: true, responsibilities: true,
    },
    bodyPolicy: { executive: true, committee: true },
  },
  {
    tierCode: 'AREA',
    label: 'Area',
    pluralLabel: 'Areas',
    description: 'Elaqayi tier — Elaqayi Committee + area cabinet.',
    capabilities: {
      meetings: true, activities: true, finance: true, cabinet: true,
      committee: true, transfers: true, performance: true, responsibilities: true,
    },
    bodyPolicy: { executive: true, committee: true },
  },
  {
    tierCode: 'BASIC_UNIT',
    label: 'Basic Unit',
    pluralLabel: 'Basic Units',
    description: 'Leaf tier — every member belongs to exactly one Basic Unit.',
    capabilities: {
      // BU has no committee body (single-body tier per SRS §3.1) —
      // the existing code hides the body toggle below Area level.
      meetings: true, activities: true, finance: true, cabinet: true,
      committee: false, transfers: true, performance: true, responsibilities: true,
    },
    bodyPolicy: { executive: true, committee: false },
  },
];

async function seedUnitTierConfigs() {
  let inserted = 0;
  let reconciled = 0;
  for (const t of BUILTIN_TIERS) {
    const existing = await UnitTierConfig.findOne({ tierCode: t.tierCode });
    if (!existing) {
      await UnitTierConfig.create({
        ...t,
        isSystem: true,
        isActive: true,
        configVersion: 1,
        customFields: [],
      });
      inserted++;
      continue;
    }
    // Re-pin authoritative flags on every boot. Tier code and
    // isSystem are the load-bearing bits — admin edits to label /
    // capabilities / fields are preserved.
    let dirty = false;
    if (!existing.isSystem) { existing.isSystem = true; dirty = true; }
    if (existing.tierCode !== t.tierCode) { existing.tierCode = t.tierCode; dirty = true; }
    if (existing.isActive !== true) { existing.isActive = true; dirty = true; }
    if (dirty) {
      await existing.save();
      reconciled++;
    }
  }
  return { inserted, reconciled, total: BUILTIN_TIERS.length };
}

module.exports = { seedUnitTierConfigs, BUILTIN_TIERS };
