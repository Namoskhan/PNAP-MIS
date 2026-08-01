const mongoose = require('mongoose');

// FieldDefinition — one document per custom field that an
// EventTypeConfig can pull into its form. The `key` is the machine
// name and is IMMUTABLE after the field has been published; the
// label / helpText / validation can be edited freely. Soft-deleted
// only (isActive=false) so historical records stay readable.
//
// `reporting.includeInExport` flags fields that should land in the
// per-unit XLSX/PDF exports. The label and ordering get pinned into
// EventConfigSnapshot.resolvedFields at finalize time, so changing a
// field later does not retroactively shift existing exports.

const FIELD_TYPES = [
  'TEXT', 'TEXTAREA',
  'NUMBER', 'INT', 'CURRENCY',
  'DATE', 'BOOL',
  'SELECT', 'MULTISELECT',
  'MEMBER_REF',
];

const validationSchema = new mongoose.Schema(
  {
    min: Number,
    max: Number,
    minLength: Number,
    maxLength: Number,
    regex: String,
    options: [{
      value: { type: String, required: true },
      label: { type: String, required: true },
    }],
  },
  { _id: false }
);

const visibilitySchema = new mongoose.Schema(
  {
    showOnCreate: { type: Boolean, default: true },
    showOnDetail: { type: Boolean, default: true },
    showOnList: { type: Boolean, default: false },
  },
  { _id: false }
);

const reportingSchema = new mongoose.Schema(
  {
    includeInExport: { type: Boolean, default: false },
    exportLabel: { type: String, trim: true },
    exportOrder: { type: Number, default: 100 },
  },
  { _id: false }
);

const fieldDefinitionSchema = new mongoose.Schema(
  {
    // Machine name. Lowercase camelCase, unique across the catalogue.
    // Cannot be changed after creation — rename = new field.
    key: {
      type: String,
      required: true,
      trim: true,
      match: /^[a-z][a-zA-Z0-9_]{0,49}$/,
    },
    label: { type: String, required: true, trim: true },
    helpText: { type: String, trim: true },

    type: { type: String, enum: FIELD_TYPES, required: true },
    required: { type: Boolean, default: false },

    validation: { type: validationSchema, default: () => ({}) },
    visibility: { type: visibilitySchema, default: () => ({}) },
    reporting: { type: reportingSchema, default: () => ({}) },

    isSystem: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 100 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

fieldDefinitionSchema.index({ key: 1 }, { unique: true });

fieldDefinitionSchema.statics.FIELD_TYPES = FIELD_TYPES;

module.exports = mongoose.model('FieldDefinition', fieldDefinitionSchema);
