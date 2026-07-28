const mongoose = require('mongoose');

// SettingsVersion — append-only history of every SystemSettings
// write. Each row carries a full frozen snapshot plus a pre-computed
// diff so the rollback UI can show "what changed" without re-deriving.
//
// Restoring a historical version creates a NEW SettingsVersion row
// whose snapshot equals an old one — the historical record itself is
// never mutated or deleted. `versionNumber` keeps incrementing
// monotonically so the linear history is preserved.
//
// Pairs with the AuditLog collection: AuditLog records the actor
// trail across every admin action; SettingsVersion is the operational
// rollback target for branding only. Both are written on every save.

const diffEntrySchema = new mongoose.Schema(
  {
    path: String,           // dot-path, e.g. 'theme.light.primary'
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const settingsVersionSchema = new mongoose.Schema(
  {
    versionNumber: { type: Number, required: true, unique: true, index: true },
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changedAt: { type: Date, default: Date.now, index: true },
    changeNote: { type: String, trim: true },
    diff: [diffEntrySchema],
    // Why this row was inserted:
    //   'UPDATE' — admin saved a patch
    //   'RESET'  — admin reset to a preset
    //   'IMPORT' — admin imported a JSON bundle
    //   'RESTORE' — admin rolled back to versionNumber=N (note → restoredFrom)
    kind: { type: String, enum: ['UPDATE', 'RESET', 'IMPORT', 'RESTORE'], default: 'UPDATE' },
    restoredFrom: Number,   // populated when kind='RESTORE'
  },
  { timestamps: false }
);

settingsVersionSchema.index({ versionNumber: -1 });

module.exports = mongoose.model('SettingsVersion', settingsVersionSchema);
