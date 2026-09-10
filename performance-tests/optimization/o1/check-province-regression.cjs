// Focused O1 candidate sensitivity check, not a replacement baseline.
// The one already-built index is temporarily hidden/unhidden; no indexes are created.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');
const appRoot = path.join(root, 'pnap-mis');
const appRequire = require('node:module').createRequire(path.join(appRoot, 'server/package.json'));
const mongoose = appRequire('mongoose');
const { EJSON } = appRequire('bson');
const env = require(path.join(appRoot, 'server/src/config/env'));
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'recovered/historical-baseline-summary.json'), 'utf8'));
const output = path.join(__dirname, 'validation/province/visibility-check.json');
if (fs.existsSync(output)) throw new Error('Evidence already exists');
const name = 'provinceId_1_createdAt_-1';
const uri = new URL(env.MONGO_URI);
if (uri.hostname !== '127.0.0.1' || uri.pathname !== '/pnap_mis' || env.NODE_ENV !== 'development') throw new Error('Wrong target');
const percentile = (a, p) => { const s = [...a].sort((a, b) => a - b), i = (s.length - 1) * p; return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i % 1); };
let db, server, originalHidden;
async function run() {
  mongoose.set('autoIndex', false); mongoose.set('autoCreate', false); mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URI, { autoIndex: false, autoCreate: false });
  db = mongoose.connection.db;
  const index = (await db.collection('members').indexes()).find((i) => i.name === name);
  if (!index) throw new Error('Candidate is missing');
  originalHidden = Boolean(index.hidden);
  const modelDir = path.join(appRoot, 'server/src/models');
  for (const f of fs.readdirSync(modelDir).filter((f) => f.endsWith('.js'))) require(path.join(modelDir, f));
  const user = await mongoose.model('User').findById('6a75a23069a71f7105a7e5c8');
  const token = require(path.join(appRoot, 'server/src/middleware/auth')).signToken(user);
  const app = require(path.join(appRoot, 'server/src/app'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const analytics = require(path.join(appRoot, 'server/src/services/analyticsService'));
  const results = [];
  for (const [block, hidden] of [false, true, true, false].entries()) {
    await db.command({ collMod: 'members', index: { name, hidden } });
    for (const op of baseline.results.filter((o) => ['members-province', 'dashboard-summary'].includes(o.name))) {
      const samples = [];
      for (let i = 0; i < 22; i++) {
        analytics.invalidateCache();
        const start = performance.now();
        const res = await fetch(`http://127.0.0.1:${server.address().port}` + op.url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) });
        await res.json();
        if (res.status !== 200) throw new Error(`Unexpected HTTP ${res.status}`);
        if (i >= 2) samples.push(performance.now() - start);
      }
      results.push({ block, hidden, name: op.name, samples, p50: percentile(samples, .5), p95: percentile(samples, .95) });
      console.log('CHECK', op.name, hidden ? 'hidden' : 'visible', 'p95', results.at(-1).p95.toFixed(2));
    }
  }
  const pooled = [];
  for (const op of ['members-province', 'dashboard-summary']) for (const hidden of [false, true]) {
    const samples = results.filter((r) => r.name === op && r.hidden === hidden).flatMap((r) => r.samples);
    pooled.push({ name: op, hidden, n: samples.length, p50: percentile(samples, .5), p95: percentile(samples, .95) });
  }
  fs.writeFileSync(output, EJSON.stringify({ label: 'Focused within-candidate visibility sensitivity check; historical O1 baseline preserved', name, results, pooled,
    limitations: '40 measured requests per state per endpoint, same process; hide/unhide and two warmups excluded from timing. No write-cost test.' }, null, 2, { relaxed: false }), { flag: 'wx' });
  console.log('POOLED', JSON.stringify(pooled));
}
run().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(async () => {
  if (originalHidden !== undefined) await db.command({ collMod: 'members', index: { name, hidden: originalHidden } });
  if (server) await new Promise((r) => server.close(r));
  await mongoose.disconnect();
});
