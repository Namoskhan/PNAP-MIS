const fs = require('node:fs');
const path = require('node:path');
const { start, root, hash, normalize } = require('../o2/harness.cjs');
const { launch, capture } = require('../o2/browser.cjs');

const config = JSON.parse(fs.readFileSync(path.join(root, 'performance-tests/optimization/o2/benchmark-config.json')));
const before = JSON.parse(fs.readFileSync(path.join(root, 'performance-tests/optimization/o2/functional-before.json')));
const out = path.join(root, 'performance-tests/results/optimization/o4');
const dashboardNames = ['summary', 'scope', 'org-breakdown', 'membership', 'campaigns', 'meetings', 'reports', 'inactive-units', 'inactive-members'];
const critical = ['/api/dashboard/summary', '/api/dashboard/scope', '/api/dashboard/org-breakdown'];
const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  return sorted[Math.floor(index)] + (sorted[Math.ceil(index)] - sorted[Math.floor(index)]) * (index % 1);
};
const stats = (values) => ({ n: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95), max: Math.max(...values) });

(async () => {
  let harness;
  let browser;
  try {
    harness = await start();
    const integrity = await harness.fingerprint();
    const functional = [];
    for (const operation of config.ops) {
      const response = await harness.request(operation.url);
      functional.push({ name: operation.name, status: response.status, hash: response.hash, shapeHash: response.shapeHash });
    }
    const functionDiffs = functional.filter((row, index) => row.status !== before[index].status || row.hash !== before[index].hash || row.shapeHash !== before[index].shapeHash).map((row) => row.name);

    const security = [];
    for (const operation of config.ops.filter((row) => dashboardNames.includes(row.name))) {
      const response = await harness.request(operation.url, { token: null });
      security.push({ case: 'unauthenticated', op: operation.name, status: response.status });
    }
    for (const account of config.cases) {
      const user = await harness.User.findById(account.userId);
      const token = harness.signToken(user);
      for (const name of ['summary', 'org-breakdown', 'membership', 'reports', 'inactive-units']) {
        const operation = config.ops.find((row) => row.name === name);
        const normal = await harness.request(operation.url, { token, role: account.role });
        let tampered = null;
        if (!['CENTRAL', 'CENTRAL_ADMIN', 'MEMBER_PERSONA'].includes(account.level)) {
          tampered = await harness.request(`${operation.url}&provinceId=000000000000000000000001&districtId=000000000000000000000002&areaId=000000000000000000000003&basicUnitId=000000000000000000000004`, { token, role: account.role });
        }
        security.push({ case: account.level, op: name, status: normal.status, hash: normal.hash, tamperedStatus: tampered?.status, tamperedEqual: tampered ? tampered.hash === normal.hash : null });
      }
    }

    const me = await harness.request('/api/auth/me');
    browser = await launch(path.join(out, `final-chrome-profile-${Date.now()}`));
    const rows = [];
    for (let index = 0; index < 10; index += 1) {
      const row = await capture(browser, harness, me.body.data, harness.token);
      const dashboard = row.requests.filter((request) => request.url.startsWith('/api/dashboard/'));
      const firstDashboardStart = Math.min(...dashboard.map((request) => request.start));
      const criticalRows = dashboard.filter((request) => critical.some((url) => request.url.startsWith(url)));
      row.primaryUsableMs = (Math.max(...criticalRows.map((request) => request.end)) - firstDashboardStart) * 1000;
      row.dashboardApiCompletionMs = (Math.max(...dashboard.map((request) => request.end)) - firstDashboardStart) * 1000;
      row.dashboardApiPeak = Math.max(...dashboard.flatMap((request) => [request.start, request.end]).map((time) => dashboard.filter((candidate) => candidate.start <= time && candidate.end >= time).length));
      rows.push(row);
    }
    const network = {
      requests: stats(rows.map((row) => row.requestCount)), duplicates: stats(rows.map((row) => row.duplicateRequests)),
      responseBytes: stats(rows.map((row) => row.responseBytes)), transferBytes: stats(rows.map((row) => row.transferBytes)),
      browserCompletionMs: stats(rows.map((row) => row.completionMs)), primaryUsableMs: stats(rows.map((row) => row.primaryUsableMs)),
      dashboardApiCompletionMs: stats(rows.map((row) => row.dashboardApiCompletionMs)), dashboardApiPeak: stats(rows.map((row) => row.dashboardApiPeak)),
      dbOperations: stats(rows.map((row) => row.dbRequests.reduce((sum, request) => sum + request.commands.length, 0))),
      errors: rows.flatMap((row) => row.errors), apiErrors: rows.flatMap((row) => row.apiErrors), domHash: hash(rows[0].dom),
    };
    const end = await harness.fingerprint();
    const securityFailures = security.filter((row) => (row.case === 'unauthenticated' && row.status !== 401) || (row.case !== 'unauthenticated' && row.case !== 'MEMBER_PERSONA' && row.status !== 200) || row.tamperedEqual === false);
    const validation = { functionDiffs, securityFailures, databaseUnchanged: hash(integrity) === hash(end), network, security };
    fs.writeFileSync(path.join(out, 'final-validation.json'), JSON.stringify(validation, null, 2));
    fs.writeFileSync(path.join(out, 'network-final.json'), JSON.stringify(rows, null, 2));
    if (functionDiffs.length || securityFailures.length || !validation.databaseUnchanged || network.errors.length || network.apiErrors.length) throw new Error('Final validation failed');
  } finally {
    if (browser) browser.close();
    if (harness) await harness.close();
  }
})().catch((error) => { console.error(error.stack); process.exit(1); });
