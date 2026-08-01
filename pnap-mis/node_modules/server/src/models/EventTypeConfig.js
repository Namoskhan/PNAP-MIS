const mongoose = require('mongoose');

// EventTypeConfig — one document per meeting/activity type. Replaces
// the hardcoded `MEETING_TYPES` / `ACTIVITY_TYPES` enums on the
// Meeting and Activity models with a Super-Admin-editable catalogue.
//
// Built-in types (the original 8 meeting + 7 activity codes) get
// `isSystem: true` and cannot be deleted; admins can rename / reorder
// / deactivate them but their `code` stays canonical so historical
// records keep resolving.
//
// `fields` is an ordered list of FieldDefinition references. The
// resolved set (with each field's full validation / labels) is
// materialised into an EventConfigSnapshot at create + finalize time
// so meeting documents are self-describing forever, even after the
// catalogue is later edited.

const ENTITIES = ['MEETING', 'ACTIVITY'];

const photoPolicySchema = new mongoose.Schema(
  {
    required: { type: Boolean, default: false },
    minCount: { type: Number, default: 0, min: 0 },
    requireGps: { type: Boolean, default: true },
    requireExif: { type: Boolean, default: true },
  },
  { _id: false }
);

const extraStateSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    label: { type: String, required: true, trim: true },
    // Which core state this extra state slots in *after*. Validated
    // against the canonical lifecycle in eventLifecycleService.
    after: { type: String, required: true, uppercase: true, trim: true },
  },
  { _id: false }
);

const workflowSchema = new mongoose.Schema(
  {
    extraStates: { type: [extraStateSchema], default: [] },
    finalizeRequiresPhotos: { type: Boolean, default: true },
  },
  { _id: false }
);

const eventTypeConfigSchema = new mongoose.Schema(
  {
    entity: { type: String, enum: ENTITIES, required: true, index: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, trim: true },

    isSystem: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 100 },

    // Body applicability — both flags can be true; an admin may
    // restrict a type to Executive-only (or Committee-only) by
    // toggling these.
    appliesTo: {
      executive: { type: Boolean, default: true },
      committee: { type: Boolean, default: true },
    },

    photoPolicy: { type: photoPolicySchema, default: () => ({}) },
    workflow: { type: workflowSchema, default: () => ({}) },

    fields: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FieldDefinition' }],

    // Bumps on every successful save. configSnapshotService keys its
    // (entity, typeCode, configVersion) snapshot cache off this so
    // every edit produces a fresh frozen snapshot the moment a
    // meeting/activity actually consumes it.
    configVersion: { type: Number, default: 1 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

eventTypeConfigSchema.index({ entity: 1, code: 1 }, { unique: true });

eventTypeConfigSchema.statics.ENTITIES = ENTITIES;

module.exports = mongoose.model('EventTypeConfig', eventTypeConfigSchema);
