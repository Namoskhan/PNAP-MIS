#!/usr/bin/env node
// Member identity migration — makes email + CNIC genuinely unique.
//
//   node server/scripts/dedupe-identity.js          # dry run, changes nothing
//   node server/scripts/dedupe-identity.js --fix    # apply, then build indexes
//
// Why this exists: the unique index on Member.email cannot be built
// while duplicate addresses are still in the collection — MongoDB
// rejects the build outright. And because config/db.js sets
// `autoIndex: false` in production and skips syncIndexes() there, the
// new constraint does NOT appear on a production database just because
// the code shipped. This script is that deliberate migration step.
//
// Three phases, in order — each is idempotent and safe to re-run:
//
//   1. Normalize  '' / whitespace-only emails to ABSENT. The schema
//      setter does this for new writes; existing rows need the sweep.
//      Without it every member who skipped the optional email field
//      shares email='' and the unique build fails on them alone.
//   2. Resolve    duplicate emails. The address is kept on ONE member —
//      ACTIVE first, then oldest by createdAt, matching the tie-break
//      in accountService.pickMemberByEmail — and unset on the rest.
//      Nobody is deleted; the losers simply lose the email field.
//   3. Report     duplicate CNICs, and STOP if any exist. A repeated
//      CNIC means two records claim the same legal identity, which is
//      a data problem a human must adjudicate (merge or reject) — this
//      script will not guess which one is real.
//
// Only then are the indexes built.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis';
const apply = process.argv.includes('--fix');

// ACTIVE outranks every other status; within the same rank the oldest
// record wins. Returns the member that KEEPS the contested address.
function pickKeeper(docs) {
  const sorted = [...docs].sort((a, b) => {
    const aActive = a.status === 'ACTIVE' ? 0 : 1;
    const bActive = b.status === 'ACTIVE' ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
  });
  return sorted[0];
}

(async () => {
  console.log('[dedupe] connecting to', MONGO_URI);
  await mongoose.connect(MONGO_URI, { autoIndex: false });
  const members = mongoose.connection.db.collection('members');

  if (!apply) console.log('[dedupe] DRY RUN — no writes will be made.\n');

  // ── Phase 1: blank emails → absent ─────────────────────────────────
  // `$exists: true` is load-bearing: a bare `{email: null}` query also
  // matches documents with NO email field at all, which would make the
  // dry run report rows it is not going to touch (the $unset below is a
  // no-op on them). The report must state only real changes.
  const blankFilter = { email: { $exists: true, $in: ['', null] } };
  const blankCount = await members.countDocuments(blankFilter);
  if (blankCount === 0) {
    console.log('[1/3] blank emails: none to normalize.');
  } else if (apply) {
    const r = await members.updateMany(blankFilter, { $unset: { email: '' } });
    console.log(`[1/3] blank emails: unset on ${r.modifiedCount} member(s).`);
  } else {
    console.log(`[1/3] blank emails: ${blankCount} member(s) would have email unset.`);
  }

  // ── Phase 2: duplicate emails ──────────────────────────────────────
  const dupEmails = await members.aggregate([
    { $match: { email: { $type: 'string', $ne: '' } } },
    { $group: { _id: '$email', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ]).toArray();

  if (dupEmails.length === 0) {
    console.log('[2/3] duplicate emails: none.');
  } else {
    const affected = dupEmails.reduce((n, g) => n + g.count, 0);
    console.log(`[2/3] duplicate emails: ${dupEmails.length} address(es) shared by ${affected} member(s).`);
    for (const group of dupEmails) {
      const docs = await members
        .find({ _id: { $in: group.ids } })
        .project({ fullName: 1, cnic: 1, status: 1, createdAt: 1 })
        .toArray();
      const keeper = pickKeeper(docs);
      const losers = docs.filter((d) => String(d._id) !== String(keeper._id));

      console.log(`\n  ${group._id}`);
      console.log(`    KEEP  ${keeper.fullName} (${keeper.cnic}, ${keeper.status})`);
      for (const l of losers) {
        console.log(`    CLEAR ${l.fullName} (${l.cnic}, ${l.status})`);
      }
      if (apply) {
        await members.updateMany(
          { _id: { $in: losers.map((l) => l._id) } },
          { $unset: { email: '' } }
        );
      }
    }
    console.log(apply ? '\n  → email cleared on the CLEAR rows above.' : '\n  → re-run with --fix to apply.');
  }

  // ── Phase 3: duplicate CNICs (report only) ─────────────────────────
  const dupCnics = await members.aggregate([
    { $match: { cnic: { $type: 'string' } } },
    { $group: { _id: '$cnic', ids: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();

  if (dupCnics.length === 0) {
    console.log('\n[3/3] duplicate CNICs: none.');
  } else {
    console.log(`\n[3/3] duplicate CNICs: ${dupCnics.length} — MANUAL RESOLUTION REQUIRED.`);
    for (const group of dupCnics) {
      const docs = await members
        .find({ _id: { $in: group.ids } })
        .project({ fullName: 1, status: 1, createdAt: 1 })
        .toArray();
      console.log(`\n  ${group._id}`);
      for (const d of docs) {
        console.log(`    ${String(d._id)}  ${d.fullName} (${d.status})`);
      }
    }
    console.log('\n  Two records claim the same legal identity. Merge or remove the');
    console.log('  wrong one by hand, then re-run. Indexes were NOT built.');
    await mongoose.disconnect();
    process.exit(2);
  }

  // ── Build the indexes ──────────────────────────────────────────────
  if (!apply) {
    console.log('\n[dedupe] DRY RUN complete. Re-run with --fix to apply and build indexes.');
    await mongoose.disconnect();
    process.exit(dupEmails.length > 0 || blankCount > 0 ? 2 : 0);
  }

  console.log('\n[dedupe] building indexes…');
  const Member = require('../src/models/Member');
  const dropped = await Member.syncIndexes();
  if (dropped && dropped.length) console.log(`[dedupe] dropped stale index(es): ${dropped.join(', ')}`);

  const built = await members.indexes();
  const show = built.filter((i) => i.key.email || i.key.cnic);
  for (const i of show) {
    console.log(`  ${i.name.padEnd(10)} unique=${!!i.unique}${i.partialFilterExpression ? ' partial' : ''}`);
  }

  console.log('\n[dedupe] done — email and CNIC are now uniquely constrained.');
  await mongoose.disconnect();
})().catch((err) => {
  console.error('[dedupe] FAILED:', err.message);
  if (err.code === 11000) {
    console.error('  A duplicate survived the sweep. Re-run the dry run to inspect.');
  }
  process.exit(1);
});
