const fs = require('node:fs');
const path = require('node:path');
const appRequire = require('node:module').createRequire(path.resolve(__dirname, '../../../pnap-mis/server/package.json'));
const { EJSON } = appRequire('bson');
const { MongoClient } = appRequire('mongodb');
const id = process.argv[2];
if (!['global', 'province'].includes(id)) throw new Error('Unknown candidate');
const dir = path.join(__dirname, 'validation', id);
const read = (name) => EJSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const result = read('benchmark-after-build.json');
// Explain bounds can contain MongoDB dates outside JavaScript's Date range.
// Keep the raw artifact intact and deserialize only the portable summaries.
const plans = JSON.parse(fs.readFileSync(path.join(dir, 'explain-after-build.json'), 'utf8'))
  .map(({ raw, ...summary }) => EJSON.deserialize(summary));
const selected = plans.filter((p) => p.collection === 'members' &&
  ['members-list', 'member-first-page', 'member-deep-page', 'member-search', 'members-province'].includes(p.operation));
console.log(JSON.stringify({ name: result.name, dataUnchanged: result.dataUnchanged,
  authorizationUnchanged: result.authorizationUnchanged, mismatches: result.mismatches,
  indexBytes: result.indexBytes,
  plans: selected.map(({ raw, ...summary }) => summary),
  targets: result.results.filter((r) => result.targets.includes(r.name)).map(({ samples, statuses, ...metrics }) => metrics),
}, null, 2));
async function decide() {
  const decision = process.argv[3];
  if (!decision) return;
  if (!['KEEP', 'REVERT'].includes(decision) || !process.argv[4]) throw new Error('Decision and reason required');
  if (fs.existsSync(path.join(dir, 'decision.json'))) throw new Error('Decision already recorded');
  if (decision === 'KEEP' && (!result.dataUnchanged || !result.authorizationUnchanged || result.mismatches.length)) throw new Error('Cannot keep a failing candidate');
  const client = new MongoClient('mongodb://127.0.0.1:27017/pnap_mis', { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db();
    const opts = await db.admin().command({ getCmdLineOpts: 1 });
    if (opts.parsed.storage.dbPath.toLowerCase() !== 'd:\\mongodb\\data') throw new Error('Wrong dbPath');
    const members = db.collection('members');
    const index = (await members.indexes()).find((i) => i.name === result.name);
    if (!index || JSON.stringify(index.key) !== JSON.stringify(result.key)) throw new Error('Index differs from validated candidate');
    if (decision === 'REVERT') await members.dropIndex(result.name);
    const remaining = await members.indexes();
    const record = { candidate: id, name: result.name, decision, reason: process.argv[4], at: new Date(),
      indexPresent: remaining.some((i) => i.name === result.name),
      memberCount: await members.countDocuments(), memberStats: await db.command({ collStats: 'members' }),
      indexes: remaining };
    fs.writeFileSync(path.join(dir, 'decision.json'), EJSON.stringify(record, null, 2, { relaxed: false }), { flag: 'wx' });
    console.log('O1 DECISION', decision, result.name, 'present:', record.indexPresent);
  } finally { await client.close(); }
}
decide().catch((e) => { console.error(e.message); process.exitCode = 1; });
