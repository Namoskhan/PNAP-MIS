const mongoose = require('mongoose');

// UnitTierConfigSnapshot — frozen, append-only copy of a
// UnitTierConfig + its referenced FieldDefinitions at a specific
// configVersion. Every Province / District / Area / BasicUnit /
// Central document references the snapshot it was created against,
// so the labels and validation match what was in effect at write-
// time even after the live tier config drifts.
//
// One snapshot per (tierCode, configVersion). Unique index makes
// materialise() idempotent under concurrency — the loser of a race
// resolves to the same snapshot row.

const resolvedFieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: String,
    helpText: String,
    type: String,
    required: Boolean,
    validation: mongoose.Schema.Types.Mixed,
    visibility: mongoose.Schema.Types.Mixed,
    reporting: mongoose.Schema.Types.Mixed,
    sortOrder: Number,
  },
  { _id: false }
);

const unitTierConfigSnapshotSchema = new mongoose.Schema(
  {
    tierCode: {
      type: String,
      enum: ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'],
      required: true,
      index: true,
    },
    configVersion: { type: Number, required: true },

    label: String,
    pluralLabel: String,
    capabilities: mongoose.Schema.Types.Mixed,
    bodyPolicy: mongoose.Schema.Types.Mixed,

    resolvedFields: { type: [resolvedFieldSchema], default: [] },

    // sha256 of the canonicalised snapshot itself — belt-and-braces
    // for tamper detection at the DB layer (the unit document also
    // holds configSnapshotId, so the audit trail is doubly anchored).
    snapshotHash: { type: String, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

unitTierConfigSnapshotSchema.index(
  { tierCode: 1, configVersion: 1 },
  { unique: true }
);

module.exports = mongoose.model('UnitTierConfigSnapshot', unitTierConfigSnapshotSchema);
