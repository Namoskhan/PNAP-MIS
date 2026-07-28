const Meeting = require('../models/Meeting');
const Activity = require('../models/Activity');
const EventTypeConfig = require('../models/EventTypeConfig');
const EventConfigSnapshot = require('../models/EventConfigSnapshot');
const snapshotSvc = require('../services/configSnapshotService');

// backfillEventConfigs — second-phase migration that wires every
// existing Meeting and Activity record to a baseline EventTypeConfig
// + EventConfigSnapshot.
//
// Phases per record:
//   1. typeCode <- type   (free-form string mirror of the legacy enum)
//   2. configSnapshotId <- snapshotSvc.materialise(entity, typeCode)
//
// Idempotent — only touches records that lack one of the fields.
// Safe to run on every boot; subsequent runs are zero-ops.
//
// IMPORTANT: This DOES NOT touch finalizedHash. The legacy hash on
// each finalized record stays exactly as the original controller
// computed it. The captureLegacyHashes migration writes
// finalizedHashLegacy as a parallel checkpoint.

async function _ensureSnapshotForEachType(entity) {
  const types = await EventTypeConfig.find({ entity }).select('_id code').lean();
  const map = new Map(); // code → snapshotId
  for (const t of types) {
    try {
      const { snapshot } = await snapshotSvc.materialise(entity, t.code);
      map.set(t.code, snapshot._id);
    } catch (err) {
      // A deactivated or partially-seeded type — skip; the records
      // referencing it will simply stay un-snapshotted until the
      // type is enabled.
      console.warn(`[backfill] could not materialise snapshot for ${entity}:${t.code}: ${err.message}`);
    }
  }
  return map;
}

async function _backfillEntity(Model, entity) {
  const snapshotByCode = await _ensureSnapshotForEachType(entity);
  if (snapshotByCode.size === 0) return { typeCodeFilled: 0, snapshotIdFilled: 0, missingType: 0 };

  // typeCode mirror — populate from the legacy `type` field for any
  // record missing it. Bulk update keeps Mongo round-trips down.
  let typeCodeFilled = 0;
  const missingTypeCode = await Model.find({
    typeCode: { $in: [null, undefined] },
    type: { $exists: true, $ne: null },
  }).select('_id type').lean();
  if (missingTypeCode.length > 0) {
    const ops = missingTypeCode.map((d) => ({
      updateOne: {
        filter: { _id: d._id },
        update: { $set: { typeCode: String(d.type).toUpperCase() } },
      },
    }));
    const r = await Model.bulkWrite(ops, { ordered: false });
    typeCodeFilled = r.modifiedCount || 0;
  }

  // configSnapshotId — fill in for any record whose typeCode resolves
  // to a known type and that doesn't already have a snapshot.
  let snapshotIdFilled = 0;
  let missingType = 0;
  const needSnap = await Model.find({
    configSnapshotId: { $in: [null, undefined] },
    typeCode: { $exists: true, $ne: null },
  }).select('_id typeCode').lean();

  // Group by typeCode so we issue one bulk update per type.
  const grouped = new Map();
  for (const d of needSnap) {
    const code = String(d.typeCode || '').toUpperCase();
    if (!snapshotByCode.has(code)) { missingType++; continue; }
    if (!grouped.has(code)) grouped.set(code, []);
    grouped.get(code).push(d._id);
  }
  if (grouped.size > 0) {
    const ops = [];
    for (const [code, ids] of grouped) {
      ops.push({
        updateMany: {
          filter: { _id: { $in: ids } },
          update: { $set: { configSnapshotId: snapshotByCode.get(code) } },
        },
      });
    }
    const r = await Model.bulkWrite(ops, { ordered: false });
    snapshotIdFilled = r.modifiedCount || 0;
  }

  return { typeCodeFilled, snapshotIdFilled, missingType };
}

async function backfillEventConfigs() {
  const meetings = await _backfillEntity(Meeting, 'MEETING');
  const activities = await _backfillEntity(Activity, 'ACTIVITY');
  return {
    meetings,
    activities,
    totalSnapshots: await EventConfigSnapshot.estimatedDocumentCount(),
  };
}

module.exports = { backfillEventConfigs };
