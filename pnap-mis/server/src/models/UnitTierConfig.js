const mongoose = require('mongoose');

// UnitTierConfig — one document per hierarchy tier
// (BASIC_UNIT, AREA, DISTRICT, PROVINCE, CENTRAL).
//
// The 5 tier codes themselves are immutable — the hierarchy is
// hard-coded in resolveUnitChain, every denormalized chain index,
// and the sidebar persona logic. This collection makes editable
// everything *about* a tier:
//
//   • display labels (singular + plural)
//   • capabilities (which feature surfaces apply)
//   • bodyPolicy (which bodies — Executive / Committee — are valid)
//   • customFields[] — refs into the shared FieldDefinition library,
//     letting Super Admin attach extra attributes per unit instance
//     (e.g. a "Regional Code" on every Province).
//
// Each row is `isSystem: true` and cannot be deleted — admin can edit
// labels / capabilities / fields / bodyPolicy, but the row itself
// stays canonical so resolveUnitChain always finds it.

const TIER_CODES = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];

const capabilitiesSchema = new mongoose.Schema(
  {
    meetings: { type: Boolean, default: true },
    activities: { type: Boolean, default: true },
    finance: { type: Boolean, default: true },
    cabinet: { type: Boolean, default: true },
    committee: { type: Boolean, default: true },
    transfers: { type: Boolean, default: true },
    performance: { type: Boolean, default: true },
    responsibilities: { type: Boolean, default: true },
  },
  { _id: false }
);

const bodyPolicySchema = new mongoose.Schema(
  {
    executive: { type: Boolean, default: true },
    committee: { type: Boolean, default: true },
  },
  { _id: false }
);

const unitTierConfigSchema = new mongoose.Schema(
  {
    tierCode: { type: String, enum: TIER_CODES, required: true, unique: true, index: true },
    label: { type: String, required: true, trim: true },
    pluralLabel: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    capabilities: { type: capabilitiesSchema, default: () => ({}) },
    bodyPolicy: { type: bodyPolicySchema, default: () => ({}) },

    // Optional custom attributes admins can attach per unit instance.
    // References the shared FieldDefinition library used by
    // EventTypeConfig — one library, two consumers.
    customFields: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FieldDefinition' }],

    // Bumps on every successful save. unitTierConfigService keys its
    // (tierCode, configVersion) snapshot off this so each edit
    // produces a fresh frozen snapshot the next time a unit is
    // created or its customData is edited.
    configVersion: { type: Number, default: 1 },

    // The 5 built-in tiers are seeded as system rows. Custom tiers
    // are explicitly disallowed (the design pushed back on tier
    // add/remove because resolveUnitChain depends on the canonical 5).
    isSystem: { type: Boolean, default: true, index: true },
    isActive: { type: Boolean, default: true, index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

unitTierConfigSchema.statics.TIER_CODES = TIER_CODES;

module.exports = mongoose.model('UnitTierConfig', unitTierConfigSchema);
