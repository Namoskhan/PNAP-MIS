const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');
const { start, root } = require('../o2/harness.cjs');
const config = require('../o2/benchmark-config.json');

const urls = Object.fromEntries(config.ops.map((operation) => [operation.name, operation.url]));
const resultDir = path.join(root, 'performance-tests/results/optimization/o5');
const stats = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p) => { const i = (sorted.length - 1) * p; return sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i % 1); };
  return { n: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length, p50: percentile(0.5), p90: percentile(0.9), p95: percentile(0.95), p99: percentile(0.99), max: Math.max(...values) };
};
const ticks = () => os.cpus().reduce((sum, cpu) => { for (const [key, value] of Object.entries(cpu.times)) { sum.total += value; if (key === 'idle') sum.idle += value; } return sum; }, { total: 0, idle: 0 });

async function measured(harness, names, staged = false) {
  harness.analytics.invalidateCache();
  harness.resetLog();
  const delay = monitorEventLoopDelay({ resolution: 1 });
  delay.enable();
  const processStart = process.cpuUsage();
  const hostStart = ticks();
  const started = performance.now();
  let responses;
  let primaryMs = null;
  if (staged) {
    const primary = await Promise.all(['summary', 'scope', 'org-breakdown'].map((name) => harness.request(urls[name], { cold: false })));
    primaryMs = performance.now() - started;
    const secondary = await Promise.all(['membership', 'campaigns', 'meetings', 'reports', 'inactive-units', 'inactive-members'].map((name) => harness.request(urls[name], { cold: false })));
    responses = [...primary, ...secondary];
  } else {
    responses = await Promise.all(names.map((name) => harness.request(urls[name], { cold: false })));
  }
  const wallMs = performance.now() - started;
  const processUsed = process.cpuUsage(processStart);
  const hostEnd = ticks();
  delay.disable();
  const commands = harness.getLog().flatMap((request) => request.commands);
  return {
    wallMs, primaryMs, status: responses.map((response) => response.status), hashes: responses.map((response) => response.hash),
    responseBytes: responses.reduce((sum, response) => sum + response.bytes, 0), dbOperations: commands.length,
    commands, processCpuPct: (processUsed.user + processUsed.system) / 1000 / wallMs * 100,
    hostCpuPct: ((hostEnd.total - hostStart.total) - (hostEnd.idle - hostStart.idle)) / (hostEnd.total - hostStart.total) * 100,
    eventLoopP95Ms: Number(delay.percentile(95)) / 1e6, eventLoopMaxMs: Number(delay.max) / 1e6,
  };
}

const summarize = (rows) => ({
  latencyMs: stats(rows.map((row) => row.wallMs)), errorRate: rows.flatMap((row) => row.status).filter((status) => status >= 400).length / rows.flatMap((row) => row.status).length,
  responseBytes: stats(rows.map((row) => row.responseBytes)), dbOperations: stats(rows.map((row) => row.dbOperations)),
  processCpuPct: stats(rows.map((row) => row.processCpuPct)), hostCpuPct: stats(rows.map((row) => row.hostCpuPct)),
  eventLoopP95Ms: stats(rows.map((row) => row.eventLoopP95Ms)),
  ...(rows[0].primaryMs !== null ? { primaryUsableMs: stats(rows.map((row) => row.primaryMs)) } : {}),
});

(async () => {
  fs.mkdirSync(resultDir, { recursive: true });
  const harness = await start();
  try {
    const environment = await harness.environment();
    const membership = [];
    const inactiveUnits = [];
    const stagedDashboard = [];
    for (let i = 0; i < 30; i += 1) membership.push(await measured(harness, ['membership']));
    for (let i = 0; i < 30; i += 1) inactiveUnits.push(await measured(harness, ['inactive-units']));
    for (let i = 0; i < 15; i += 1) stagedDashboard.push(await measured(harness, [], true));
    const finalRun = process.env.O5_FINAL === '1';
    const output = { label: finalRun ? 'O5 FINAL RETAINED STATE' : 'O5 LOCAL PRE-OPTIMIZATION BASELINE', environment, membership: summarize(membership), inactiveUnits: summarize(inactiveUnits), stagedDashboard: summarize(stagedDashboard), raw: { membership, inactiveUnits, stagedDashboard } };
    fs.writeFileSync(path.join(resultDir, finalRun ? 'final.json' : 'baseline.json'), JSON.stringify(output, null, 2));
  } finally {
    await harness.close();
  }
})().catch((error) => { console.error(error.stack); process.exit(1); });
