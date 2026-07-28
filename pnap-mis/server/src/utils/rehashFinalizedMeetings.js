const Meeting = require('../models/Meeting');
const eventHashService = require('../services/eventHashService');

// rehashFinalizedMeetings — PR 4a final-step migration.
//
// Recomputes finalizedHash for every FINALIZED meeting using the
// new canonical algorithm (eventHashService.compute). The original
// pre-cutover hash is already preserved in finalizedHashLegacy by
// PR 2's captureLegacyHashes utility, so this step is purely about
// pulling every record onto the new hashing scheme.
//
// Idempotent: a record is only rewritten when the recomputed hash
// differs from the stored one. After the first successful run the
// next boot is a zero-op.
//
// Safety:
//   • Only touches state==='FINALIZED' rows.
//   • Skips rows that lack configSnapshotId (they need PR 2 to have
//     run first; the warning comes from the backfill migration).
//   • Never overwrites finalizedHashLegacy.

async function rehashFinalizedMeetings() {
  const candidates = await Meeting.find({
    state: 'FINALIZED',
    configSnapshotId: { $exists: true, $ne: null },
  }).lean();

  let recomputed = 0;
  let alreadyOk = 0;
  let skipped = 0;

  for (const m of candidates) {
    try {
      const fresh = await eventHashService.compute('MEETING', m);
      if (m.finalizedHash === fresh) { alreadyOk++; continue; }
      await Meeting.updateOne(
        { _id: m._id },
        { $set: { finalizedHash: fresh } }
      );
      recomputed++;
    } catch (err) {
      console.warn(`[rehash] meeting ${m._id} skipped: ${err.message}`);
      skipped++;
    }
  }

  return { total: candidates.length, recomputed, alreadyOk, skipped };
}

module.exports = { rehashFinalizedMeetings };
