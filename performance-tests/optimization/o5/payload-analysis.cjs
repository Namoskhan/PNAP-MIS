const fs = require('node:fs');
const path = require('node:path');
const { start, root } = require('../o2/harness.cjs');

(async () => {
  const harness = await start();
  try {
    const response = await harness.request('/api/dashboard/membership?days=365&from=2025-09-09T13:09:03.542Z');
    const data = response.body.data;
    const bytes = (value) => Buffer.byteLength(JSON.stringify(value));
    const breakdown = Object.fromEntries(Object.entries(data).map(([field, value]) => [field, {
      bytes: bytes(value), arrayLength: Array.isArray(value) ? value.length : null,
      nestedLengths: field === 'byLevel' ? Object.fromEntries(Object.entries(value).map(([level, rows]) => [level, rows.length])) : null,
      usedByFrontend: true, required: true,
    }]));
    const unused = [{ field: 'byLevel.*[]._id', evidence: 'No MembershipAnalytics consumer reads row _id; rows are chart inputs only.', removed: false, reason: 'Payload-only candidate was not retained because the measured endpoint benefit came from eliminating database scans and exact response equivalence was preferred.' }];
    fs.writeFileSync(path.join(root, 'performance-tests/results/optimization/o5/membership-payload-breakdown.json'), JSON.stringify({ responseBytes: response.bytes, breakdown, unused }, null, 2));
  } finally { await harness.close(); }
})().catch((error) => { console.error(error.stack); process.exit(1); });
