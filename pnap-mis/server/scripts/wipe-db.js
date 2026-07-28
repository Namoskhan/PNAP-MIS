#!/usr/bin/env node
// One-shot database wipe — drops every collection in the configured
// MongoDB database. Indexes are preserved (Mongoose recreates them on
// next syncIndexes). Designed to be run from the repo root with:
//
//   node server/scripts/wipe-db.js --yes
//
// The --yes flag is required as a sanity guard. Without it the script
// prints what it WOULD delete and exits without touching anything.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis';
const confirmed = process.argv.includes('--yes');

(async () => {
  console.log('[wipe-db] connecting to', MONGO_URI);
  await mongoose.connect(MONGO_URI, { autoIndex: false });
  const db = mongoose.connection.db;

  const collections = await db.listCollections().toArray();
  if (collections.length === 0) {
    console.log('[wipe-db] database is already empty.');
    await mongoose.disconnect();
    return;
  }

  console.log(`[wipe-db] ${collections.length} collection(s) found:`);
  for (const c of collections) {
    const count = await db.collection(c.name).countDocuments();
    console.log(`  - ${c.name.padEnd(28)} ${count} doc(s)`);
  }

  if (!confirmed) {
    console.log('\n[wipe-db] DRY RUN. To actually delete, re-run with --yes:');
    console.log('  node server/scripts/wipe-db.js --yes');
    await mongoose.disconnect();
    process.exit(2);
  }

  console.log('\n[wipe-db] dropping all collections…');
  let dropped = 0;
  for (const c of collections) {
    try {
      await db.collection(c.name).drop();
      console.log(`  ✓ dropped ${c.name}`);
      dropped++;
    } catch (err) {
      console.warn(`  ! failed to drop ${c.name}: ${err.message}`);
    }
  }

  console.log(`\n[wipe-db] done. ${dropped}/${collections.length} collections dropped.`);
  console.log('[wipe-db] restart the API; the seeders will recreate the Super Admin (super/123456) and National Admin (central/123456).');
  await mongoose.disconnect();
})().catch((err) => {
  console.error('[wipe-db] fatal:', err);
  process.exit(1);
});
