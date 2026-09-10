const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { monitorEventLoopDelay, performance } = require('node:perf_hooks');
const { start, root } = require('../o2/harness.cjs');
const config = require('../o2/benchmark-config.json');
const urls = Object.fromEntries(config.ops.map((operation) => [operation.name, operation.url]));
const out = path.join(root, 'performance-tests/results/optimization/o5/candidate-results.json');
const ticks = () => os.cpus().reduce((sum, cpu) => { for (const [key, value] of Object.entries(cpu.times)) { sum.total += value; if (key === 'idle') sum.idle += value; } return sum; }, { total: 0, idle: 0 });
const stats = (values) => { const sorted = [...values].sort((a, b) => a - b); const p = (q) => { const i = (sorted.length - 1) * q; return sorted[Math.floor(i)] + (sorted[Math.ceil(i)] - sorted[Math.floor(i)]) * (i % 1); }; return { n: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length, p50: p(.5), p90: p(.9), p95: p(.95), p99: p(.99), max: Math.max(...values) }; };

async function run(harness, candidate, full = false) {
  process.env.O5_MEMBERSHIP_COMBINED_FACET = candidate ? '1' : '0';
  harness.analytics.invalidateCache(); harness.resetLog();
  const eld = monitorEventLoopDelay({ resolution: 1 }); eld.enable();
  const cpuStart = process.cpuUsage(), hostStart = ticks(), started = performance.now();
  let responses;
  if (full) {
    const first = await Promise.all(['summary', 'scope', 'org-breakdown'].map((name) => harness.request(urls[name], { cold: false })));
    const second = await Promise.all(['membership', 'campaigns', 'meetings', 'reports', 'inactive-units', 'inactive-members'].map((name) => harness.request(urls[name], { cold: false })));
    responses = [...first, ...second];
  } else responses = [await harness.request(urls.membership, { cold: false })];
  const wallMs = performance.now() - started, cpu = process.cpuUsage(cpuStart), hostEnd = ticks(); eld.disable();
  return { wallMs, statuses: responses.map((row) => row.status), hashes: responses.map((row) => row.hash), shapes: responses.map((row) => row.shapeHash), responseBytes: responses.reduce((sum, row) => sum + row.bytes, 0), dbOperations: harness.getLog().flatMap((row) => row.commands).length, processCpuPct: (cpu.user + cpu.system) / 1000 / wallMs * 100, hostCpuPct: hostEnd.total === hostStart.total ? null : ((hostEnd.total - hostStart.total) - (hostEnd.idle - hostStart.idle)) / (hostEnd.total - hostStart.total) * 100, eventLoopP95Ms: Number(eld.percentile(95)) / 1e6 };
}
const summary = (rows) => ({ latencyMs: stats(rows.map((row) => row.wallMs)), responseBytes: stats(rows.map((row) => row.responseBytes)), dbOperations: stats(rows.map((row) => row.dbOperations)), processCpuPct: stats(rows.map((row) => row.processCpuPct)), hostCpuPct: stats(rows.map((row) => row.hostCpuPct).filter((value) => value !== null)), eventLoopP95Ms: stats(rows.map((row) => row.eventLoopP95Ms)) });

(async () => {
  const harness = await start();
  try {
    const membership = { control: [], candidate: [] }, full = { control: [], candidate: [] };
    for (let i = 0; i < 30; i += 1) { membership.control.push(await run(harness, false)); membership.candidate.push(await run(harness, true)); }
    for (let i = 0; i < 15; i += 1) { full.control.push(await run(harness, false, true)); full.candidate.push(await run(harness, true, true)); }
    const output = { membership: { control: summary(membership.control), candidate: summary(membership.candidate), equivalent: membership.control.every((row, i) => row.hashes[0] === membership.candidate[i].hashes[0] && row.shapes[0] === membership.candidate[i].shapes[0]) }, fullDashboard: { control: summary(full.control), candidate: summary(full.candidate), equivalent: full.control.every((row, i) => row.hashes.every((hash, j) => hash === full.candidate[i].hashes[j])) }, raw: { membership, full } };
    fs.writeFileSync(out, JSON.stringify(output, null, 2));
  } finally { delete process.env.O5_MEMBERSHIP_COMBINED_FACET; await harness.close(); }
})().catch((error) => { console.error(error.stack); process.exit(1); });
