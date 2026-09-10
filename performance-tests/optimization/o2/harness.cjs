const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AsyncLocalStorage } = require('node:async_hooks');
const root = path.resolve(__dirname, '../../..');
const appRoot = path.join(root, 'pnap-mis');
const appRequire = require('node:module').createRequire(path.join(appRoot, 'server/package.json'));
const mongoose = appRequire('mongoose');
const { EJSON } = appRequire('bson');
const env = require(path.join(appRoot, 'server/src/config/env'));
const hash = (v) => crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');
function normalize(v, key = '') {
  if (Array.isArray(v)) {
    const rows = v.map((x) => normalize(x));
    // Mongo $group has no tie ordering. Only canonicalize the documented
    // byTier count ranking's equal-total rows; preserve every value and rank.
    return key === 'byTier' ? rows.sort((a,b) => b.total-a.total || JSON.stringify(a).localeCompare(JSON.stringify(b))) : rows;
  }
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().filter((k) => k !== 'generatedAt').map((k) => [k, normalize(v[k], k)]));
  return v;
}
function shape(v) {
  if (Array.isArray(v)) return ['array', ...new Set(v.map((x) => JSON.stringify(shape(x))))].sort();
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape(v[k])]));
  return v === null ? 'null' : typeof v;
}
function percentile(a, p) { const s = [...a].sort((a, b) => a - b), i = (s.length - 1) * p; return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i % 1); }
const metrics = (a) => ({ n: a.length, p50: percentile(a, .5), p90: percentile(a, .9), p95: percentile(a, .95), p99: percentile(a, .99), max: Math.max(...a) });
const save = (name, data) => { fs.mkdirSync(path.dirname(name), { recursive: true }); fs.writeFileSync(name, JSON.stringify(data, null, 2), { flag: 'wx' }); };
async function start() {
  const uri = new URL(env.MONGO_URI);
  if (uri.hostname !== '127.0.0.1' || (uri.port && uri.port !== '27017') || uri.pathname !== '/pnap_mis' || env.NODE_ENV !== 'development') throw new Error('STOP: not verified local development database');
  mongoose.set('autoIndex', false); mongoose.set('autoCreate', false); mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGO_URI, { autoIndex: false, autoCreate: false, monitorCommands: true, serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;
  const cmdline = await db.admin().command({ getCmdLineOpts: 1 });
  if (cmdline.parsed.storage.dbPath.toLowerCase() !== 'd:\\mongodb\\data') throw new Error('STOP: unexpected dbPath');
  const modelDir = path.join(appRoot, 'server/src/models');
  for (const f of fs.readdirSync(modelDir).filter((f) => f.endsWith('.js'))) require(path.join(modelDir, f));
  const context = new AsyncLocalStorage();
  let log = [];
  mongoose.connection.getClient().on('commandStarted', (event) => {
    const request = context.getStore();
    if (!request || !['find', 'aggregate', 'count', 'distinct', 'getMore'].includes(event.commandName)) return;
    const keys = ['find', 'aggregate', 'count', 'distinct', 'filter', 'sort', 'projection', 'skip', 'limit', 'pipeline', 'query', 'key'];
    const command = EJSON.serialize(Object.fromEntries(keys.filter((k) => k in event.command).map((k) => [k, event.command[k]])));
    request.commands.push({ type: event.commandName, collection: event.command[event.commandName], command, signature: hash(command) });
  });
  const app = require(path.join(appRoot, 'server/src/app'));
  const outer = appRequire('express')();
  outer.use((req, res, next) => {
    if (!req.url.startsWith('/api/')) return next();
    const request = { url: req.url, method: req.method, commands: [] };
    log.push(request);
    context.run(request, next);
  });
  outer.use(app);
  const server = outer.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const analytics = require(path.join(appRoot, 'server/src/services/analyticsService'));
  const { signToken } = require(path.join(appRoot, 'server/src/middleware/auth'));
  const User = mongoose.model('User');
  const user = await User.findOne({ roles: 'SUPER_ADMIN', isActive: true });
  if (!user) throw new Error('No existing Super Admin');
  const token = signToken(user);
  async function request(url, options = {}) {
    if (options.cold !== false) analytics.invalidateCache();
    const start = performance.now();
    const res = await fetch(base + url, { headers: {
      ...(options.token === null ? {} : { Authorization: `Bearer ${options.token || token}` }),
      ...(options.role ? { 'X-Dashboard-Role': options.role } : {}),
    }, signal: AbortSignal.timeout(60000) });
    const text = await res.text();
    const ms = performance.now() - start;
    const body = JSON.parse(text);
    return { status: res.status, ms, bytes: Buffer.byteLength(text), hash: hash(normalize(body)), shapeHash: hash(shape(body)), body };
  }
  async function fingerprint() {
    const collections = [], indexes = [];
    for (const c of (await db.listCollections({}, { nameOnly: true }).toArray()).sort((a, b) => a.name.localeCompare(b.name))) {
      if (c.name.startsWith('system.')) continue;
      let count = 0; const digest = crypto.createHash('sha256');
      for await (const doc of db.collection(c.name).find({}).sort({ _id: 1 })) { digest.update(EJSON.stringify(doc, { relaxed: false })); count++; }
      collections.push({ name: c.name, count, hash: digest.digest('hex') });
      indexes.push({ collection: c.name, indexes: await db.collection(c.name).indexes() });
    }
    return { collections, indexes };
  }
  return { base, db, user, token, User, signToken, request, fingerprint, analytics,
    resetLog: () => { log = []; }, getLog: () => log,
    environment: async () => ({ backend: base, frontend: base + '/', build: 'Vite production build served by unchanged Express app',
      database: '127.0.0.1:27017/pnap_mis', dbPath: cmdline.parsed.storage.dbPath, nodeEnv: env.NODE_ENV, node: process.version, dbStats: await db.stats() }),
    close: async () => { await new Promise((r) => server.close(r)); await mongoose.disconnect(); },
  };
}
module.exports = { start, root, appRoot, appRequire, mongoose, EJSON, hash, normalize, shape, metrics, save };
