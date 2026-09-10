const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { start, root, mongoose, hash, normalize, metrics, save } = require('./harness.cjs');
const { launch, capture } = require('./browser.cjs');
const phase = process.argv[2];
if (!/^(before|candidate-[a-z]|after)$/.test(phase)) throw new Error('Specify before, candidate-a/b/c, or after');
const rawDir = path.join(root, 'performance-tests/results/optimization/o2', phase);
if (fs.existsSync(rawDir)) throw new Error('Run evidence already exists; refuse overwrite');
const configPath = path.join(__dirname, 'benchmark-config.json');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const dashboardNames = ['summary', 'scope', 'org-breakdown', 'membership', 'campaigns', 'meetings', 'reports', 'inactive-units', 'inactive-members'];
function fileHashes(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? fileHashes(path.join(dir, e.name))
    : [{ path: path.relative(root, path.join(dir, e.name)), hash: hash(fs.readFileSync(path.join(dir, e.name)).toString('base64')) }]);
}
let h, browser;
async function main() {
  fs.mkdirSync(rawDir, { recursive: true });
  save(path.join(rawDir, 'git-start.json'), { status: cp.execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }), head: cp.execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() });
  h = await start();
  const integrityBefore = await h.fingerprint();
  const o1Hashes = fileHashes(path.join(root, 'performance-tests/optimization/o1'));
  save(path.join(rawDir, 'environment.json'), await h.environment());
  save(path.join(rawDir, 'integrity-before.json'), integrityBefore);
  let config;
  if (phase === 'before') {
    const from = new Date(Date.now() - 365 * 86400000).toISOString();
    const cases = [];
    const assignments = await mongoose.model('RoleAssignment').find({ state: 'APPROVED', endedAt: { $exists: false } }).select('memberId unitLevel unitId roleCode').lean();
    for (const level of ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT']) {
      const roles = level === 'CENTRAL' ? ['GENERAL_SECRETARY', 'FINANCE_SECRETARY', 'CHAIRMAN'] : level === 'PROVINCE'
        ? ['PRESIDENT', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY', 'FINANCE_SECRETARY'] : ['FINANCE_SECRETARY', 'SECRETARY', 'SENIOR_MAWIN'];
      for (const a of assignments.filter((a) => a.unitLevel === level && roles.includes(a.roleCode))) {
        const user = await h.User.findOne({ memberId: a.memberId, roles: a.roleCode, isActive: true });
        if (user) {
          const probe = await h.request('/api/dashboard/scope?days=365', {token:h.signToken(user),role:a.roleCode});
          if (probe.status === 200) { cases.push({ level, userId: String(user._id), role: a.roleCode, unitId: String(a.unitId) }); break; }
          console.log('Unavailable assignment excluded from positive scope case', level, String(user._id), probe.status);
        }
      }
    }
    const centralAdmin = await h.User.findOne({ roles: 'CENTRAL_ADMIN', isActive: true });
    if (centralAdmin) cases.push({ level: 'CENTRAL_ADMIN', role: 'CENTRAL_ADMIN', userId: String(centralAdmin._id) });
    const member = await h.User.findOne({ roles: 'MEMBER', isActive: true });
    if (member) cases.push({ level: 'MEMBER_PERSONA', role: 'MEMBER', userId: String(member._id) });
    const ops = dashboardNames.map((name) => ({ name, url: `/api/dashboard/${name}?days=365&from=${from}`
      + (name === 'meetings' ? '&yearBasis=CALENDAR&years=5' : name === 'inactive-units' ? '&level=BASIC_UNIT&page=1&limit=10' : name === 'inactive-members' ? '&page=1&limit=10' : '') }));
    ops.push({ name: 'provinces', url: '/api/org/provinces' }, { name: 'unread-count', url: '/api/notifications/unread-count' }, { name: 'auth-me', url: '/api/auth/me' });
    config = { label: 'O2 LOCAL PRE-OPTIMIZATION BASELINE', createdAt: new Date().toISOString(), from, vus: 1, iterations: 20, warmups: 2, networkRuns: 5,
      ops, cases, beforeFingerprintHash: hash(integrityBefore), o1Hashes,
      methodology: 'Existing active identities; unchanged signToken/authenticate. Cold analytics cache via existing invalidation before each independent API request and each browser navigation, excluded from timing. Production Vite build, headless Chrome, browser HTTP cache disabled, 1440x1000, fresh session state per navigation. No startup index sync/backfills. Network completion is first API request to last API response; 1-second idle is detection only and not included.' };
    save(configPath, config);
  } else {
    config = read(configPath);
    if (hash(integrityBefore) !== config.beforeFingerprintHash) throw new Error('STOP: documents or indexes differ from O2 baseline');
    if (hash(o1Hashes) !== hash(config.o1Hashes)) throw new Error('STOP: O1 evidence changed');
  }
  // Independent API baseline includes the payload and per-request DB operation trace.
  const api = [], functional = [], queryCounts = [];
  for (const op of config.ops) {
    h.resetLog();
    const first = await h.request(op.url);
    functional.push({ name: op.name, status: first.status, hash: first.hash, shapeHash: first.shapeHash, data: op.name === 'auth-me' ? undefined : normalize(first.body) });
    const trace = h.getLog();
    queryCounts.push({ name: op.name, url: op.url, operations: trace.flatMap((r) => r.commands), dbOperations: trace.reduce((a, r) => a + r.commands.length, 0) });
    if (first.status !== 200) throw new Error(`${op.name} failed: ${first.status}`);
    for (let i = 0; i < config.warmups; i++) await h.request(op.url);
    const samples = [], statuses = [], bytes = [];
    for (let i = 0; i < config.iterations; i++) {
      const r = await h.request(op.url);
      samples.push(r.ms); statuses.push(r.status); bytes.push(r.bytes);
      if (r.hash !== first.hash || r.shapeHash !== first.shapeHash || r.status !== first.status) throw new Error(`Unstable API response ${op.name}`);
    }
    api.push({ name: op.name, url: op.url, ...metrics(samples), samples, statuses, responseBytes: bytes, errorRate: statuses.filter((s) => s !== 200).length / statuses.length });
    console.log('O2 API', phase, op.name, 'p95', api.at(-1).p95.toFixed(2), 'db', queryCounts.at(-1).dbOperations);
  }
  save(path.join(__dirname, `api-${phase}.json`), { phase, label: phase === 'before' ? config.label : 'O2 LOCAL POST-CHANGE MEASUREMENT', results: api });
  save(path.join(__dirname, `query-count-${phase}.json`), queryCounts);
  const security = [];
  for (const op of config.ops.filter((o) => dashboardNames.includes(o.name))) {
    const r = await h.request(op.url, { token: null });
    security.push({ case: 'unauthenticated', op: op.name, status: r.status, hash: r.hash });
    if (r.status !== 401) throw new Error('Unauthenticated dashboard access changed');
  }
  for (const account of config.cases) {
    const user = await h.User.findById(account.userId), token = h.signToken(user);
    for (const name of ['summary', 'org-breakdown', 'membership', 'reports', 'inactive-units']) {
      const op = config.ops.find((o) => o.name === name);
      const normal = await h.request(op.url, { token, role: account.role });
      security.push({ case: account.level, op: name, role: account.role, status: normal.status, hash: normal.hash, shapeHash: normal.shapeHash });
      if (['CENTRAL', 'CENTRAL_ADMIN', 'MEMBER_PERSONA'].includes(account.level)) continue;
      const tampered = await h.request(op.url + '&provinceId=000000000000000000000001&districtId=000000000000000000000002&areaId=000000000000000000000003&basicUnitId=000000000000000000000004', { token, role: account.role });
      security.push({ case: account.level + ':tampered', op: name, status: tampered.status, hash: tampered.hash, shapeHash: tampered.shapeHash });
      if (normal.status !== 200 || tampered.hash !== normal.hash) throw new Error(`Scope isolation failed ${account.level}/${name}`);
    }
  }
  // Historical dates and filter combinations exercise inactive/active counting semantics.
  for (const suffix of ['&memberStatus=ACTIVE', '&memberStatus=REJECTED', '&to=2026-08-01', '&orgStatus=ACTIVE']) {
    for (const name of ['summary', 'membership', 'inactive-units']) {
      const r = await h.request(config.ops.find((o) => o.name === name).url + suffix);
      security.push({ case: 'filter:' + suffix, op: name, status: r.status, hash: r.hash, shapeHash: r.shapeHash });
    }
  }
  save(path.join(__dirname, `security-${phase}.json`), security);
  const userProfile = await h.request('/api/auth/me');
  browser = await launch(path.join(rawDir, 'chrome-profile'));
  const network = [];
  for (let i = 0; i < config.networkRuns; i++) {
    const result = await capture(browser, h, userProfile.body.data, h.token);
    network.push(result);
    console.log('O2 NETWORK', phase, i, result.requestCount, result.uniqueEndpoints, result.responseBytes, result.completionMs.toFixed(2), 'errors', result.errors.length, result.apiErrors.length);
  }
  save(path.join(__dirname, `network-${phase}.json`), network);
  const dashboard = { phase, measuredRuns: network.length, requests: metrics(network.map((n) => n.requestCount)), uniqueEndpoints: metrics(network.map((n) => n.uniqueEndpoints)), duplicates: metrics(network.map((n) => n.duplicateRequests)),
    responseBytes: metrics(network.map((n) => n.responseBytes)), transferBytes: metrics(network.map((n) => n.transferBytes)), completionMs: metrics(network.map((n) => n.completionMs)),
    totalDbOperations: metrics(network.map((n) => n.dbRequests.reduce((a, r) => a + r.commands.length, 0))),
    errors: network.flatMap((n) => n.errors), apiErrors: network.flatMap((n) => n.apiErrors), dom: network[0].dom };
  save(path.join(__dirname, `dashboard-${phase}.json`), dashboard);
  const screenshot = await browser.cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.writeFileSync(path.join(rawDir, 'dashboard.png'), Buffer.from(screenshot.data, 'base64'));
  save(path.join(__dirname, `functional-${phase}.json`), functional);
  const endIntegrity = await h.fingerprint();
  save(path.join(rawDir, 'integrity-after.json'), endIntegrity);
  if (hash(endIntegrity) !== hash(integrityBefore)) throw new Error('STOP: database documents/indexes changed');
  if (hash(fileHashes(path.join(root, 'performance-tests/optimization/o1'))) !== hash(config.o1Hashes)) throw new Error('O1 artifacts changed');
  if (phase !== 'before') {
    const oldFunctional = read(path.join(__dirname, 'functional-before.json'));
    const oldSecurity = read(path.join(__dirname, 'security-before.json'));
    const functionDiffs = functional.filter((r, i) => r.hash !== oldFunctional[i].hash || r.shapeHash !== oldFunctional[i].shapeHash || r.status !== oldFunctional[i].status).map((r) => r.name);
    const securityDiffs = security.filter((r, i) => JSON.stringify(r) !== JSON.stringify(oldSecurity[i]));
    const oldDashboard = read(path.join(__dirname, 'dashboard-before.json'));
    const domEqual = hash(dashboard.dom) === hash(oldDashboard.dom);
    save(path.join(rawDir, 'regression.json'), { functionDiffs, securityDiffs, domEqual, databaseUnchanged: true, o1Unchanged: true, consoleErrors: dashboard.errors, apiErrors: dashboard.apiErrors });
    if (functionDiffs.length || securityDiffs.length || !domEqual || dashboard.errors.length || dashboard.apiErrors.length) throw new Error('Regression check failed; inspect raw evidence before KEEP');
  }
  console.log('O2 DONE', phase, 'cases', config.cases.map((c) => c.level).join(','));
}
main().catch((e) => { console.error(e.stack); process.exitCode = 1; }).finally(async () => { if (browser) browser.close(); if (h) await h.close(); });
