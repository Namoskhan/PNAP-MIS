const mongoose = require('mongoose');

// ReportTemplate — admin-composed report definition. The "section
// picker" approach (NOT a WYSIWYG layout designer): admin chooses
// which pre-built sections appear, in what order, with section-
// specific config knobs. Section renderers themselves are
// code-locked in services/reportSections/ — admins can compose,
// never define new section kinds.
//
// Why no free-form layout: arbitrary PDF designers are a several-
// month feature on their own and the maintenance burden never ends.
// This approach gives 90% of the practical value with 10% of the
// risk. New section kinds = one new file in services/reportSections/
// + one entry in registry.js + a follow-up PR.
//
// Currently scoped to entity=UNIT (per-unit reports). Future kinds
// (MEMBER, MEETING, FINANCE-only) can extend the enum without
// schema changes since `tierScope` already supports filtering.

const ENTITIES = ['UNIT'];
const FORMATS = ['PDF', 'XLSX', 'BOTH'];
const TIER_CODES = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];

const sectionSchema = new mongoose.Schema(
  {
    // Section "kind" — must match a key in the renderer registry.
    // Admin can't invent new kinds; the registry is the gatekeeper.
    kind: { type: String, required: true, uppercase: true, trim: true },
    sortOrder: { type: Number, default: 100 },
    // Override the section's default title. Falls back to the
    // renderer's `defaultTitle` when blank.
    title: { type: String, trim: true },
    // Section-specific knobs. Each renderer documents its own
    // config shape (e.g. MEETINGS_LIST takes { limit, includeAttendance }).
    // We store as Mixed so renderers own the contract.
    config: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false }
);

const reportTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    entity: { type: String, enum: ENTITIES, default: 'UNIT', required: true },
    // Empty list = applies to every tier. Otherwise the template
    // only renders for the listed tiers (admin-side hint; not
    // strictly enforced server-side because the render endpoint
    // already takes a unitLevel/unitId pair).
    tierScope: [{ type: String, enum: TIER_CODES }],
    format: { type: String, enum: FORMATS, default: 'PDF' },

    sections: { type: [sectionSchema], default: [] },

    // Bumps on every save. Future PRs that snapshot rendered
    // reports will pin the version this run was generated under.
    templateVersion: { type: Number, default: 1 },

    isSystem: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

reportTemplateSchema.index({ entity: 1, isActive: 1 });

reportTemplateSchema.statics.ENTITIES = ENTITIES;
reportTemplateSchema.statics.FORMATS = FORMATS;
reportTemplateSchema.statics.TIER_CODES = TIER_CODES;

module.exports = mongoose.model('ReportTemplate', reportTemplateSchema);
