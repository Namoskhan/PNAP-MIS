const Meeting = require('../models/Meeting');

// captureLegacyHashes — preserve every existing finalizedHash into
// finalizedHashLegacy as an audit checkpoint, BEFORE PR 4 cuts the
// hashing controller over to the new canonical algorithm.
//
// Why split this from the actual rehash:
// PR 4 (controller cutover) will recompute finalizedHash with
// eventHashService.compute(). If we recomputed now while the
// controller still writes the old algorithm, new finalizations
// during PR 2-3 would land in `finalizedHash` under the OLD shape
// and old (already-finalized) records would be in `finalizedHash`
// under the NEW shape — inconsistent state. Capturing legacy first
// is reversible; recomputation isn't.
//
// Idempotent: only writes finalizedHashLegacy on records where it
// is currently absent AND where finalizedHash exists. Records that
// were sealed AFTER PR 2 ran are picked up on the next boot.

async function captureLegacyHashes() {
  const candidates = await Meeting.find({
    state: 'FINALIZED',
    finalizedHash: { $exists: true, $ne: null },
    $or: [
      { finalizedHashLegacy: { $exists: false } },
      { finalizedHashLegacy: null },
    ],
  }).select('_id finalizedHash').lean();

  if (candidates.length === 0) return { captured: 0 };

  const ops = candidates.map((m) => ({
    updateOne: {
      filter: { _id: m._id },
      update: { $set: { finalizedHashLegacy: m.finalizedHash } },
    },
  }));
  const r = await Meeting.bulkWrite(ops, { ordered: false });
  return { captured: r.modifiedCount || 0 };
}

module.exports = { captureLegacyHashes };
