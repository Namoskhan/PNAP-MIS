const mongoose = require('mongoose');

// CabinetTemplate — one document per (tierCode, roleCode) cabinet
// slot. Replaces the hardcoded `CabinetSlot.TEMPLATES` map. The
// existing CabinetSlot model is unchanged — it remains the
// PER-UNIT INSTANCE row that points at the filled member /
// assignment. This template collection is the source of truth for
// "which slots should every unit at tier X have."
//
// Cutover strategy: CabinetSlot.seedFor() now queries this
// collection. The 8 existing call sites (orgController,
// publicController, roleController, unitProposalController, etc.)
// keep their current API and behavior.
//
// Forward-compatible fields (not yet enforced; future PRs):
//   appliesToBody          — body-separation per slot (PR U1 + PR future)
//   termDays               — auto-end after N days (PR U4 cabinet-term job)
//   allowedAppointerRoles  — propose/decide gating (PR U4 workflows)
//   allowedDeciderRoles    —     "
//   visibilityScope        — UI filtering (later)
//
// These are persisted now so admin edits on day 1 carry forward
// when the consumers land.

const TIER_CODES = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];
const APPLIES_TO_BODY = ['EXECUTIVE', 'COMMITTEE', 'BOTH'];
const VISIBILITY_SCOPES = ['TIER_AND_DOWN', 'TIER_ONLY', 'GLOBAL'];

const cabinetTemplateSchema = new mongoose.Schema(
  {
    tierCode: { type: String, enum: TIER_CODES, required: true, index: true },
    // Free-form catalogue code — validated against the Role catalogue
    // at write-time, not enforced at the schema level. Built-ins use
    // the SRS-defined codes (SECRETARY, PRESIDENT, etc.); admins can
    // add custom CUSTOM_* slots via the Role + CabinetTemplate flow.
    roleCode: { type: String, required: true, uppercase: true, trim: true, index: true },

    isMandatory: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 100 },

    // Forward-compat (see header comment)
    appliesToBody: { type: String, enum: APPLIES_TO_BODY, default: 'BOTH' },
    termDays: { type: Number, default: 0, min: 0 }, // 0 = indefinite
    allowedAppointerRoles: [{ type: String, uppercase: true, trim: true }],
    allowedDeciderRoles: [{ type: String, uppercase: true, trim: true }],
    visibilityScope: { type: String, enum: VISIBILITY_SCOPES, default: 'TIER_ONLY' },

    isSystem: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

cabinetTemplateSchema.index({ tierCode: 1, roleCode: 1 }, { unique: true });

cabinetTemplateSchema.statics.TIER_CODES = TIER_CODES;
cabinetTemplateSchema.statics.APPLIES_TO_BODY = APPLIES_TO_BODY;
cabinetTemplateSchema.statics.VISIBILITY_SCOPES = VISIBILITY_SCOPES;

module.exports = mongoose.model('CabinetTemplate', cabinetTemplateSchema);
