const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const serverRequire = require('node:module').createRequire(path.resolve(__dirname, '../../pnap-mis/server/package.json'));
const { MongoClient } = serverRequire('mongodb');

async function main() {
  const root = path.resolve(__dirname, '..');
  const logPath = path.join(root, 'optimization/o1/before-run.log');
  const logBytes = fs.readFileSync(logPath);
  const log = logBytes.toString(logBytes[0] === 0xff && logBytes[1] === 0xfe ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
  const line = log.split(/\r?\n/).find((s) => s.startsWith('COUNTS '));
  const baseline = JSON.parse(line.slice(7));
  const client = new MongoClient('mongodb://127.0.0.1:27017/pnap_mis', { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db('pnap_mis');
    const opts = await db.admin().command({ getCmdLineOpts: 1 });
    const stats = await db.stats();
    const collections = [];
    for (const old of baseline) {
      const current = await db.command({ collStats: old.collection });
      collections.push({ collection: old.collection, previousCount: old.count, count: current.count,
        previousDataSize: old.size, dataSize: current.size,
        countAndSizeMatch: current.count === old.count && current.size === old.size,
        indexes: await db.collection(old.collection).listIndexes().toArray() });
    }
    console.log(JSON.stringify({ verifiedAt: new Date().toISOString(),
      target: '127.0.0.1:27017/pnap_mis', dbPath: opts.parsed.storage.dbPath,
      net: opts.parsed.net, stats,
      existingLog: { path: logPath, bytes: logBytes.length, sha256: crypto.createHash('sha256').update(logBytes).digest('hex'),
        completed: log.includes('DONE before 135 explains') }, collections,
      note: 'Count and size agreement is not a content checksum. This does not recreate or replace the O1 baseline.'
    }, null, 2));
  } finally { await client.close(); }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
