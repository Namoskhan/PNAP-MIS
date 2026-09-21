const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const { start } = require('./harness.cjs');

const level = (process.env.O7_LEVEL || '').toUpperCase();
if (!['B', 'C', 'D'].includes(level)) throw new Error('O7_LEVEL must be B, C, or D');
const q = '?days=365&from=2025-09-09T13:09:03.542Z';
const urls = {
  summary: '/api/dashboard/summary' + q,
  scope: '/api/dashboard/scope' + q,
  org: '/api/dashboard/org-breakdown' + q,
  membership: '/api/dashboard/membership' + q,
  campaigns: '/api/dashboard/campaigns' + q,
  meetings: '/api/dashboard/meetings' + q + '&yearBasis=CALENDAR&years=5',
  reports: '/api/dashboard/reports' + q,
  inactiveUnits: '/api/dashboard/inactive-units' + q + '&level=BASIC_UNIT&page=1&limit=10',
  inactiveMembers: '/api/dashboard/inactive-members' + q + '&page=1&limit=10',
};
const percentile = (values, p) => { const a = [...values].sort((x, y) => x - y); const i = (a.length - 1) * p; return a[Math.floor(i)] + (a[Math.ceil(i)] - a[Math.floor(i)]) * (i % 1); };
const summary = values => ({ n: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length, p50: percentile(values, .5), p95: percentile(values, .95), p99: percentile(values, .99), max: Math.max(...values) });
const hostTicks = () => os.cpus().reduce((a, cpu) => { for (const [key, value] of Object.entries(cpu.times)) { a.total += value; if (key === 'idle') a.idle += value; } return a; }, { total: 0, idle: 0 });

(async () => {
  const h = await start();
  try {
    async function workflow() {
      const group1 = await Promise.all([urls.summary, urls.scope, urls.org].map(url => h.request(url, { cold: false })));
      const group2 = await Promise.all([urls.membership, urls.campaigns, urls.meetings, urls.reports, urls.inactiveUnits, urls.inactiveMembers].map(url => h.request(url, { cold: false })));
      return [...group1, ...group2];
    }
    const output = { level, database: h.dbName, kind: 'complete-retained-staged-dashboard-workflows', repetitionsPerConcurrency: 3, concurrency: {} };
    for (const active of [1, 3, 5, 10]) {
      const rows = [];
      for (let repetition = 0; repetition < 3; repetition++) {
        h.analytics.invalidateCache(); h.resetLog();
        const eventLoop = monitorEventLoopDelay({ resolution: 1 }); eventLoop.enable();
        const cpu0 = process.cpuUsage(), host0 = hostTicks(), started = performance.now();
        const responses = (await Promise.all(Array.from({ length: active }, workflow))).flat();
        const wallMs = performance.now() - started, cpu = process.cpuUsage(cpu0), host1 = hostTicks(); eventLoop.disable();
        const commands = h.getLog().flatMap(entry => entry.commands);
        rows.push({ wallMs, statuses: responses.map(x => x.status), bytes: responses.reduce((a, x) => a + x.bytes, 0), requestCount: responses.length, dbOperations: commands.length, roleAggregations: commands.filter(x => x.collection === 'roleassignments' && x.type === 'aggregate').length, nodeCpuPct: (cpu.user + cpu.system) / 1000 / wallMs * 100, hostCpuPct: ((host1.total - host0.total) - (host1.idle - host0.idle)) / (host1.total - host0.total) * 100, eventLoopP95Ms: Number(eventLoop.percentile(95)) / 1e6, eventLoopP99Ms: Number(eventLoop.percentile(99)) / 1e6, eventLoopMaxMs: Number(eventLoop.max) / 1e6, rssBytes: process.memoryUsage().rss, availableRamBytes: os.freemem() });
      }
      output.concurrency[active] = { completionMs: summary(rows.map(x => x.wallMs)), nodeCpuPct: summary(rows.map(x => x.nodeCpuPct)), hostCpuPct: summary(rows.map(x => x.hostCpuPct)), eventLoopP95Ms: summary(rows.map(x => x.eventLoopP95Ms)), rssBytes: summary(rows.map(x => x.rssBytes)), dbOperations: summary(rows.map(x => x.dbOperations)), requestCount: summary(rows.map(x => x.requestCount)), payloadBytes: summary(rows.map(x => x.bytes)), singleFlightVerified: rows.every(x => x.roleAggregations === 4), allHttp200: rows.every(x => x.statuses.every(status => status === 200)), rows };
    }
    fs.writeFileSync(path.join(__dirname, `dashboard-concurrency-level-${level.toLowerCase()}.json`), JSON.stringify(output, null, 2) + '\n');
    console.log(JSON.stringify({ level, concurrency: Object.fromEntries(Object.entries(output.concurrency).map(([n, x]) => [n, { p95Ms: x.completionMs.p95, dbOperationsMean: x.dbOperations.mean, singleFlightVerified: x.singleFlightVerified }])) }, null, 2));
  } finally { await h.close(); }
})().catch(error => { console.error(error.stack); process.exit(1); });
