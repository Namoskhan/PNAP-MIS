const Central = require('../models/Central');

// Idempotently return the Central singleton document. Created on
// first call (or backfilled at server startup), then reused for the
// lifetime of the database.
async function ensureCentralSingleton() {
  let doc = await Central.findOne();
  if (doc) {
    // Migration — rename legacy "PNAP Central" to "PKNAP Central".
    if (doc.name === 'PNAP Central') {
      doc.name = 'PKNAP Central';
      await doc.save();
      console.log(`[central-unit] renamed legacy "PNAP Central" → "PKNAP Central"`);
    }
    return doc;
  }
  doc = await Central.create({ name: 'PKNAP Central' });
  console.log(`[central-unit] auto-created Central singleton _id=${doc._id}`);
  return doc;
}

module.exports = { ensureCentralSingleton };
