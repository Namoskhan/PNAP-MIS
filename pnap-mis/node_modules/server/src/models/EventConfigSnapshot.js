const mongoose = require('mongoose');

// EventConfigSnapshot — frozen, append-only copy of an
// EventTypeConfig + its FieldDefinitions at a specific configVersion.
// Every Meeting / Activity document references the snapshot it was
// validated against, and the finalize hash is computed in terms of
// the snapshot's resolved field order. This is what guarantees that
// editing the live catalogue later cannot retroactively invalidate
// or re-shape historical records.
//
// One snapshot per (entity, typeCode, configVersion). Unique index
// makes materialise() idempotent — concurrent creates resolve to the
// same row.

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

const eventConfigSnapshotSchema = new mongoose.Schema(
  {
    entity: { type: String, enum: ['MEETING', 'ACTIVITY'], required: true, index: true },
    typeCode: { type: String, required: true, uppercase: true, trim: true },
    typeLabel: String,
    configVersion: { type: Number, required: true },

    appliesTo: mongoose.Schema.Types.Mixed,
    photoPolicy: mongoose.Schema.Types.Mixed,
    workflow: mongoose.Schema.Types.Mixed,

    resolvedFields: { type: [resolvedFieldSchema], default: [] },

    // sha256 of the canonicalised snapshot itself — useful for
    // verifying that a snapshot row hasn't been tampered with at the
    // DB layer (the meeting hash already includes configSnapshotId,
    // so this is belt-and-braces).
    snapshotHash: { type: String, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

eventConfigSnapshotSchema.index(
  { entity: 1, typeCode: 1, configVersion: 1 },
  { unique: true }
);

module.exports = mongoose.model('EventConfigSnapshot', eventConfigSnapshotSchema);
