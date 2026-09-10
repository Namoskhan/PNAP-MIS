const fs = require('node:fs');
const path = require('node:path');
const { start, root, hash } = require('../o2/harness.cjs');
const config = require('../o2/benchmark-config.json');
const targets = config.ops.filter((operation) => ['membership', 'inactive-units'].includes(operation.name));

(async () => {
  const harness = await start();
  try {
    const fingerprintBefore = await harness.fingerprint();
    const rows = [];
    for (const operation of targets) {
      const response = await harness.request(operation.url, { token: null });
      rows.push({ persona: 'unauthenticated', endpoint: operation.name, status: response.status });
    }
    for (const account of config.cases) {
      const user = await harness.User.findById(account.userId);
      const token = harness.signToken(user);
      for (const operation of targets) {
        const normal = await harness.request(operation.url, { token, role: account.role });
        let tampered = null;
        if (!['CENTRAL', 'CENTRAL_ADMIN', 'MEMBER_PERSONA'].includes(account.level)) {
          tampered = await harness.request(`${operation.url}&provinceId=000000000000000000000001&districtId=000000000000000000000002&areaId=000000000000000000000003&basicUnitId=000000000000000000000004`, { token, role: account.role });
        }
        rows.push({ persona: account.level, endpoint: operation.name, status: normal.status, hash: normal.hash, tamperedStatus: tampered?.status, tamperedEqual: tampered ? tampered.hash === normal.hash : null });
      }
    }
    const fingerprintAfter = await harness.fingerprint();
    const failures = rows.filter((row) => (row.persona === 'unauthenticated' && row.status !== 401) || (row.persona === 'MEMBER_PERSONA' && row.status !== 403) || (!['unauthenticated', 'MEMBER_PERSONA'].includes(row.persona) && row.status !== 200) || row.tamperedEqual === false);
    const output = { passed: failures.length === 0 && hash(fingerprintBefore) === hash(fingerprintAfter), databaseUnchanged: hash(fingerprintBefore) === hash(fingerprintAfter), failures, rows };
    fs.writeFileSync(path.join(root, 'performance-tests/results/optimization/o5/security-validation.json'), JSON.stringify(output, null, 2));
    if (!output.passed) throw new Error('O5 security validation failed');
  } finally { await harness.close(); }
})().catch((error) => { console.error(error.stack); process.exit(1); });
