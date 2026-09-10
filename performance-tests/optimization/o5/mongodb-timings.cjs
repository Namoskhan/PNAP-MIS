const fs = require('node:fs');
const path = require('node:path');
const { start, root, EJSON } = require('../o2/harness.cjs');
const resultDir = path.join(root, 'performance-tests/results/optimization/o5');
const baseline = require('../../results/optimization/o5/baseline.json');

function collect(value, key, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (typeof value[key] === 'number') output.push(value[key]);
  for (const child of Object.values(value)) collect(child, key, output);
  return output;
}

async function explainCommands(harness, commands) {
  const rows = [];
  for (const captured of commands) {
    const command = EJSON.deserialize(captured.command);
    if (command.aggregate && !command.cursor) command.cursor = {};
    try {
      const result = await harness.db.command({ explain: command, verbosity: 'executionStats' });
      const times = collect(result, 'executionTimeMillis');
      const docs = collect(result, 'totalDocsExamined');
      const keys = collect(result, 'totalKeysExamined');
      rows.push({ type: captured.type, collection: captured.collection, executionTimeMs: times.length ? Math.max(...times) : null, docsExamined: docs.length ? Math.max(...docs) : null, keysExamined: keys.length ? Math.max(...keys) : null, returned: result.executionStats?.nReturned ?? null });
    } catch (error) { rows.push({ type: captured.type, collection: captured.collection, error: error.message }); }
  }
  return rows;
}

(async () => {
  const harness = await start();
  try {
    harness.analytics.invalidateCache(); harness.resetLog();
    const membershipResponse = await harness.request('/api/dashboard/membership?days=365&from=2025-09-09T13:09:03.542Z', { cold: false });
    const membershipFinalCommands = harness.getLog().flatMap((row) => row.commands);
    harness.analytics.invalidateCache(); harness.resetLog();
    const inactiveResponse = await harness.request('/api/dashboard/inactive-units?days=365&from=2025-09-09T13:09:03.542Z&level=BASIC_UNIT&page=1&limit=10', { cold: false });
    const inactiveFinalCommands = harness.getLog().flatMap((row) => row.commands);
    const output = {
      note: 'executionStats commands are diagnostic replays. Summed execution time is descriptive, not wall time, because application operations run in parallel.',
      membership: {
        before: await explainCommands(harness, baseline.raw.membership[1].commands),
        after: await explainCommands(harness, membershipFinalCommands),
        afterApiMs: membershipResponse.ms,
      },
      inactiveUnits: {
        before: await explainCommands(harness, baseline.raw.inactiveUnits[1].commands),
        after: await explainCommands(harness, inactiveFinalCommands),
        afterApiMs: inactiveResponse.ms,
      },
    };
    fs.writeFileSync(path.join(resultDir, 'mongodb-timings.json'), JSON.stringify(output, null, 2));
  } finally { await harness.close(); }
})().catch((error) => { console.error(error.stack); process.exit(1); });
