// O1 continuation: one candidate only. Never creates a pre-optimization baseline.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../../..');
const appRoot = path.join(root, 'pnap-mis');
const appRequire = require('node:module').createRequire(path.join(appRoot, 'server/package.json'));
const mongoose = appRequire('mongoose');
const { EJSON } = appRequire('bson');
const env = require(path.join(appRoot, 'server/src/config/env'));
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'recovered/historical-baseline-summary.json'), 'utf8'));
const candidates = {
  global: { name: 'createdAt_-1', key: { createdAt: -1 }, targets: ['members-list', 'member-first-page', 'member-deep-page'] },
  province: { name: 'provinceId_1_createdAt_-1', key: { provinceId: 1, createdAt: -1 }, targets: ['members-province'] },
};
const candidateId = process.argv[2];
const candidate = candidates[candidateId];
if (!candidate) throw new Error('Specify global or province; exactly one candidate per invocation');
const uri = new URL(env.MONGO_URI);
if (uri.hostname !== '127.0.0.1' || (uri.port && uri.port !== '27017') || uri.pathname !== '/pnap_mis' || env.NODE_ENV !== 'development') throw new Error('Wrong database or environment');
const output = path.join(__dirname, 'validation', candidateId);
if (fs.existsSync(output)) throw new Error('Evidence already exists; do not overwrite or rerun');
for (const id of Object.keys(candidates)) {
  const dir = path.join(__dirname, 'validation', id);
  if (fs.existsSync(dir) && !fs.existsSync(path.join(dir, 'decision.json'))) throw new Error('Resolve the previous candidate before building another');
}
fs.mkdirSync(output, { recursive: true });
const save = (name, value) => fs.writeFileSync(path.join(output, name), EJSON.stringify(value, null, 2, { relaxed: false }), { flag: 'wx' });
const hash = (v) => crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().filter((k) => k !== 'generatedAt').map((k) => [k, canonical(v[k])]));
  return v;
}
function shape(v) {
  if (Array.isArray(v)) return ['array', ...new Set(v.map((x) => JSON.stringify(shape(x))))].sort();
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k])]));
  return v === null ? 'null' : typeof v;
}
function percentile(a, p) {
  const s = [...a].sort((a, b) => a - b), i = (s.length - 1) * p;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i % 1);
}
function planSummary(raw) {
  const c = raw.stages?.find((x) => x.$cursor)?.$cursor || raw;
  const stages = new Set(), indexes = new Set();
  function walk(x) {
    if (!x || typeof x !== 'object') return;
    if (x.stage) stages.add(x.stage);
    if (x.indexName) indexes.add(x.indexName);
    Object.values(x).forEach((v) => Array.isArray(v) ? v.forEach(walk) : walk(v));
  }
  walk(c.queryPlanner?.winningPlan);
  if (raw.stages?.some((s) => s.$sort)) stages.add('SORT');
  const e = c.executionStats || {};
  return { stages: [...stages], indexes: [...indexes], nReturned: e.nReturned,
    docsExamined: e.totalDocsExamined, keysExamined: e.totalKeysExamined, executionTimeMillis: e.executionTimeMillis };
}
let server, built = false, db;
async function fingerprint() {
  const result = [];
  for (const c of (await db.listCollections({}, { nameOnly: true }).toArray()).sort((a, b) => a.name.localeCompare(b.name))) {
    if (c.name.startsWith('system.')) continue;
    const digest = crypto.createHash('sha256');
    let count = 0;
    for await (const doc of db.collection(c.name).find({}).sort({ _id: 1 })) {
      digest.update(EJSON.stringify(doc, { relaxed: false })); count++;
    }
    result.push({ collection: c.name, count, sha256: digest.digest('hex') });
  }
  return result;
}
async function main() {
  mongoose.set('autoIndex', false); mongoose.set('autoCreate', false); mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URI, { autoIndex: false, autoCreate: false, monitorCommands: true, serverSelectionTimeoutMS: 5000 });
  db = mongoose.connection.db;
  const opts = await db.admin().command({ getCmdLineOpts: 1 });
  if (opts.parsed.storage.dbPath.replace(/\//g, '\\').toLowerCase() !== 'd:\\mongodb\\data') throw new Error('Wrong dbPath');
  const stats = await db.stats();
  if (stats.fsTotalSize - stats.fsUsedSize < 2 * 1024 ** 3) throw new Error('Insufficient disk headroom');
  const logBytes = fs.readFileSync(path.join(__dirname, 'before-run.log'));
  if (crypto.createHash('sha256').update(logBytes).digest('hex') !== baseline.sourceLogSha256) throw new Error('Historical log changed');
  const log = logBytes.toString(logBytes[0] === 255 ? 'utf16le' : 'utf8').replace(/^\uFEFF/, '');
  const oldStats = JSON.parse(log.split(/\r?\n/).find((s) => s.startsWith('COUNTS ')).slice(7));
  for (const old of oldStats) {
    const s = await db.command({ collStats: old.collection });
    if (s.count !== old.count || s.size !== old.size) throw new Error(`Database content indicators changed: ${old.collection}`);
  }
  const members = db.collection('members');
  const indexesBefore = await members.indexes();
  if (indexesBefore.some((i) => i.name === candidate.name || JSON.stringify(i.key) === JSON.stringify(candidate.key))) throw new Error('Candidate already exists');
  const preFingerprint = await fingerprint();
  save('prebuild-integrity.json', { capturedAt: new Date(), dbStats: stats, indexes: indexesBefore, collections: preFingerprint,
    note: 'Fresh integrity snapshot only, not a replacement historical performance baseline.' });
  const modelDir = path.join(appRoot, 'server/src/models');
  for (const f of fs.readdirSync(modelDir).filter((f) => f.endsWith('.js'))) require(path.join(modelDir, f));
  const User = mongoose.model('User');
  const user = await User.findById('6a75a23069a71f7105a7e5c8');
  if (!user?.isActive || !user.roles.includes('SUPER_ADMIN')) throw new Error('Historical benchmark user unavailable');
  const { signToken } = require(path.join(appRoot, 'server/src/middleware/auth'));
  const token = signToken(user);
  const app = require(path.join(appRoot, 'server/src/app'));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const analytics = require(path.join(appRoot, 'server/src/services/analyticsService'));
  let commands = null;
  mongoose.connection.getClient().on('commandStarted', (event) => {
    if (!commands || !['find', 'aggregate', 'count', 'distinct'].includes(event.commandName)) return;
    const c = event.command;
    const keys = ['find', 'aggregate', 'count', 'distinct', 'filter', 'sort', 'projection', 'skip', 'limit', 'pipeline', 'cursor', 'query', 'key', 'collation', 'allowDiskUse'];
    commands.push(EJSON.parse(EJSON.stringify(Object.fromEntries(keys.filter((k) => k in c).map((k) => [k, c[k]])), { relaxed: false })));
  });
  async function request(url, bearer = token, timed = false) {
    analytics.invalidateCache();
    const start = timed ? performance.now() : null;
    const res = await fetch(base + url, { headers: bearer ? { Authorization: `Bearer ${bearer}` } : {}, signal: AbortSignal.timeout(60000) });
    const body = await res.json();
    return { status: res.status, ...(timed ? { ms: performance.now() - start } : {}),
      responseHash: hash(canonical(body)), shapeHash: hash(shape(body)), recordCount: Array.isArray(body.data) ? body.data.length : null };
  }
  const traces = [], checks = [];
  // One untimed read per operation for exact functional comparison and query capture.
  for (const op of baseline.results) {
    commands = [];
    const result = await request(op.url);
    traces.push({ name: op.name, commands }); commands = null;
    if (result.status !== 200) throw new Error(`Functional precheck failed: ${op.name} ${result.status}`);
    checks.push({ name: op.name, ...result });
  }
  const authOps = ['/api/members?scope=all', '/api/dashboard/summary', '/api/meetings', '/api/activities', '/api/responsibilities'];
  const authBefore = [];
  for (const url of authOps) authBefore.push({ url, ...await request(url, null) });
  const scopedUser = await User.findOne({ isActive: true, roles: { $nin: ['SUPER_ADMIN', 'CENTRAL_ADMIN'] }, 'scope.areaId': { $exists: true } });
  const scopedToken = scopedUser ? signToken(scopedUser) : null;
  const scopedUrls = ['/api/members?scope=all', '/api/dashboard/summary'];
  const scopedBefore = [];
  if (scopedToken) for (const url of scopedUrls) scopedBefore.push({ url, ...await request(url, scopedToken) });
  save('functional-prebuild.json', { checks, unauthenticated: authBefore, scoped: scopedBefore });
  save('commands.json', traces);
  const buildStart = performance.now();
  const name = await members.createIndex(candidate.key, { name: candidate.name, maxTimeMS: 60000 });
  built = true;
  save('build.json', { name, key: candidate.key, durationMs: performance.now() - buildStart, createdAt: new Date(), database: db.databaseName });
  console.log('O1 BUILT', name);
  const explanations = [];
  for (const trace of traces) for (let i = 0; i < trace.commands.length; i++) {
    const command = trace.commands[i];
    const raw = await db.command({ explain: command, verbosity: 'executionStats' });
    explanations.push({ id: `${trace.name}:${i}`, operation: trace.name, collection: command.find || command.aggregate || command.count || command.distinct,
      ...planSummary(raw), raw });
  }
  save('explain-after-build.json', explanations);
  console.log('O1 EXPLAIN', explanations.length);
  const results = [], mismatches = [];
  for (const op of baseline.results) {
    const expected = checks.find((c) => c.name === op.name);
    const warmups = [];
    for (let i = 0; i < baseline.warmups; i++) warmups.push(await request(op.url));
    const samples = [];
    for (let i = 0; i < baseline.iterations; i++) samples.push(await request(op.url, token, true));
    if ([...warmups, ...samples].some((r) => r.status !== expected.status || r.responseHash !== expected.responseHash || r.shapeHash !== expected.shapeHash)) mismatches.push(op.name);
    const times = samples.map((s) => s.ms);
    const p95 = percentile(times, .95);
    results.push({ name: op.name, url: op.url, samples: times, statuses: samples.map((s) => s.status),
      p50: percentile(times, .5), p90: percentile(times, .9), p95, p99: percentile(times, .99), max: Math.max(...times),
      historicalP95: op.p95, changePct: (p95 / op.p95 - 1) * 100, errorRate: samples.filter((s) => s.status !== 200).length / samples.length });
    console.log('O1 BENCH', op.name, 'p95', p95.toFixed(2), 'historical', op.p95, 'change%', results.at(-1).changePct.toFixed(1));
  }
  const authAfter = [];
  for (const url of authOps) authAfter.push({ url, ...await request(url, null) });
  const scopedAfter = [];
  if (scopedToken) for (const url of scopedUrls) scopedAfter.push({ url, ...await request(url, scopedToken) });
  const postFingerprint = await fingerprint();
  const dataUnchanged = hash(preFingerprint) === hash(postFingerprint);
  const authorizationUnchanged = hash(authBefore) === hash(authAfter) && hash(scopedBefore) === hash(scopedAfter);
  const memberStats = await db.command({ collStats: 'members' });
  const result = { candidate: candidateId, name, key: candidate.key, targets: candidate.targets, capturedAt: new Date(),
    baselineSource: 'recovered/historical-baseline-summary.json', iterations: 20, warmups: 2, vus: 1,
    decision: 'PENDING_REVIEW', results, mismatches, dataUnchanged, authorizationUnchanged,
    indexBytes: memberStats.indexSizes[name], memberIndexBytes: memberStats.totalIndexSize,
    writeCostImpact: 'NOT MEASURED', limitations: baseline.limitations };
  save('benchmark-after-build.json', result);
  save('postbuild-integrity.json', { collections: postFingerprint, memberStats, indexes: await members.indexes() });
  console.log('O1 RESULT', JSON.stringify({ mismatches, dataUnchanged, authorizationUnchanged, indexBytes: result.indexBytes }));
  if (mismatches.length || !dataUnchanged || !authorizationUnchanged) throw new Error('Functional or data-integrity regression; revert candidate');
}
main().catch(async (error) => {
  let reverted = false;
  if (built) { await db.collection('members').dropIndex(candidate.name); reverted = true; }
  save('failure.json', { error: error.message, built, reverted, at: new Date() });
  save('decision.json', { decision: built ? 'REVERT' : 'NOT_BUILT', reason: error.message, reverted, at: new Date() });
  console.error(error.message); process.exitCode = 1;
}).finally(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
});
