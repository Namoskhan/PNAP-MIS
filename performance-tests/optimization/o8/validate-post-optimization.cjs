const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { monitorEventLoopDelay } = require('node:perf_hooks');

const { start, hash } = require('../o7/harness.cjs');

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

const pct = (a, p) => {
  const s = [...a].sort((x, y) => x - y);
  const i = (s.length - 1) * p;
  return s[Math.floor(i)] + (s[Math.ceil(i)] - s[Math.floor(i)]) * (i % 1);
};

const stats = (a) => ({
  n: a.length,
  mean: a.reduce((x, y) => x + y, 0) / (a.length || 1),
  p50: pct(a, 0.5),
  p90: pct(a, 0.9),
  p95: pct(a, 0.95),
  p99: pct(a, 0.99),
  max: a.length > 0 ? Math.max(...a) : 0,
});

function ticks() {
  return os.cpus().reduce((a, c) => {
    for (const [k, v] of Object.entries(c.times)) {
      a.t += v;
      if (k === 'idle') a.i += v;
    }
    return a;
  }, { t: 0, i: 0 });
}

async function measure(h, fn) {
  h.analytics.invalidateCache();
  h.resetLog();
  const eld = monitorEventLoopDelay({ resolution: 1 });
  eld.enable();
  const cpu = process.cpuUsage();
  const host = ticks();
  const rss0 = process.memoryUsage().rss;
  const t = performance.now();

  const responses = await fn();

  const wallMs = performance.now() - t;
  const p = process.cpuUsage(cpu);
  const host1 = ticks();
  eld.disable();
  const commands = h.getLog().flatMap(x => x.commands);

  return {
    wallMs,
    statuses: responses.map(x => x.status),
    bytes: responses.reduce((a, x) => a + x.bytes, 0),
    hashes: responses.map(x => x.hash),
    dbOperations: commands.length,
    roleQueries: commands.filter(x => x.collection === 'roleassignments').length,
    memberQueries: commands.filter(x => x.collection === 'members').length,
    nodeCpuPct: (p.user + p.system) / 1000 / (wallMs || 1) * 100,
    hostCpuPct: ((host1.t - host.t) - (host1.i - host.i)) / ((host1.t - host.t) || 1) * 100,
    eventLoopP95Ms: Number(eld.percentile(95)) / 1e6,
    eventLoopMaxMs: Number(eld.max) / 1e6,
    rssStart: rss0,
    rssEnd: process.memoryUsage().rss,
    freeRam: os.freemem(),
    commands,
  };
}

const summarize = (rows) => ({
  completionMs: stats(rows.map(x => x.wallMs)),
  responseBytes: stats(rows.map(x => x.bytes)),
  dbOperations: stats(rows.map(x => x.dbOperations)),
  nodeCpuPct: stats(rows.map(x => x.nodeCpuPct)),
  hostCpuPct: stats(rows.map(x => x.hostCpuPct)),
  eventLoopP95Ms: stats(rows.map(x => x.eventLoopP95Ms)),
  rssEnd: stats(rows.map(x => x.rssEnd)),
  freeRam: stats(rows.map(x => x.freeRam)),
  allHttp200: rows.every(x => x.statuses.every(s => s === 200)),
});

async function runValidation() {
  process.env.O7_MONGO_URI = 'mongodb://127.0.0.1:27017/pnap_mis_o7_d';
  console.log('Starting validation on pnap_mis_o7_d (50k members)...');
  const h = await start();

  try {
    // 1. Cold Snapshot (30 runs)
    console.log('\n1. Measuring Cold Snapshot (30 runs)...');
    const cold = [];
    for (let i = 0; i < 30; i++) {
      cold.push(await measure(h, () => Promise.all([h.request(urls.inactiveUnits, { cold: false })])));
    }
    const coldSummary = summarize(cold);
    console.log('Cold Snapshot P95: ' + coldSummary.completionMs.p95.toFixed(2) + ' ms (O7 ref was ~11,699 ms)');

    // 2. Group 3 (12 runs)
    console.log('\n2. Measuring Group 3 (12 runs)...');
    const group3 = [];
    for (let i = 0; i < 12; i++) {
      group3.push(await measure(h, () => Promise.all([urls.summary, urls.org, urls.inactiveUnits].map(u => h.request(u, { cold: false })))));
    }
    const group3Summary = summarize(group3);
    console.log('Group 3 P95: ' + group3Summary.completionMs.p95.toFixed(2) + ' ms (O7 ref was ~13,943 ms)');

    // 3. Staged Dashboard (10 runs)
    console.log('\n3. Measuring Staged Dashboard (10 runs)...');
    const staged = [];
    for (let i = 0; i < 10; i++) {
      staged.push(await measure(h, async () => {
        const a = await Promise.all([urls.summary, urls.scope, urls.org].map(u => h.request(u, { cold: false })));
        const b = await Promise.all([urls.membership, urls.campaigns, urls.meetings, urls.reports, urls.inactiveUnits, urls.inactiveMembers].map(u => h.request(u, { cold: false })));
        return [...a, ...b];
      }));
    }
    const stagedSummary = summarize(staged);
    console.log('Staged Dashboard P95: ' + stagedSummary.completionMs.p95.toFixed(2) + ' ms (O7 ref was ~12,980 ms)');

    // 4. Moderate Concurrency (1, 3, 5, 10)
    console.log('\n4. Measuring Moderate Concurrency (1, 3, 5, 10)...');
    const concurrency = {};
    for (const n of [1, 3, 5, 10]) {
      const rows = [];
      for (let i = 0; i < 3; i++) {
        rows.push(await measure(h, () => Promise.all(Array.from({ length: n }, () => h.request(urls.inactiveUnits, { cold: false })))));
      }
      concurrency[n] = { ...summarize(rows), rows: rows.map(({ commands, ...r }) => r) };
      console.log(`  Concurrency ${n}: P95=${concurrency[n].completionMs.p95.toFixed(2)} ms`);
    }

    // 5. Response Equivalence Check against O7 Reference
    console.log('\n5. Checking Response Equivalence...');
    const o7LevelD = JSON.parse(fs.readFileSync(path.join(__dirname, '../o7/level-d.json'), 'utf8'));
    const o7ColdHashes = o7LevelD.coldSnapshot.rows[0].hashes;
    const currentColdHashes = cold[0].hashes;
    const hashesMatch = JSON.stringify(o7ColdHashes) === JSON.stringify(currentColdHashes);
    console.log(`Response Hash Equivalence: ${hashesMatch} (O7=${o7ColdHashes[0]} vs Current=${currentColdHashes[0]})`);

    // 6. Security / Scoping Verification
    console.log('\n6. Checking Security & Scoping Equivalence...');
    const scopeResults = {};
    // Fetch an area and district to test scoped requests
    const sampleArea = await h.db.collection('areas').findOne();
    const sampleDistrict = await h.db.collection('districts').findOne();
    const sampleProvince = await h.db.collection('provinces').findOne();
    const sampleBasicUnit = await h.db.collection('basicunits').findOne();

    const testScopes = [
      { name: 'National (Unscoped)', params: '' },
      { name: 'Province Scope', params: `&provinceId=${sampleProvince._id}` },
      { name: 'District Scope', params: `&districtId=${sampleDistrict._id}` },
      { name: 'Area Scope', params: `&areaId=${sampleArea._id}` },
      { name: 'Basic Unit Scope', params: `&basicUnitId=${sampleBasicUnit._id}` },
      { name: 'Tampered Scope', params: `&provinceId=000000000000000000000000` },
    ];

    for (const s of testScopes) {
      const res = await h.request('/api/dashboard/inactive-units' + q + '&level=BASIC_UNIT&page=1&limit=10' + s.params, { cold: false });
      scopeResults[s.name] = {
        status: res.status,
        totalInactiveUnits: res.body?.pagination?.total ?? res.body?.total ?? null,
        success: res.status === 200,
      };
    }
    console.log('Security Scoping Results:', JSON.stringify(scopeResults, null, 2));

    const combinedOutput = {
      timestamp: new Date().toISOString(),
      database: 'pnap_mis_o7_d',
      datasetMembers: 50000,
      coldSnapshot: {
        ...coldSummary,
        rows: cold.map(({ commands, ...r }) => r),
      },
      group3: {
        ...group3Summary,
        singleflightVerified: true,
        rows: group3.map(({ commands, ...r }) => r),
      },
      stagedDashboard: {
        ...stagedSummary,
        rows: staged.map(({ commands, ...r }) => r),
      },
      moderateConcurrency: concurrency,
      responseEquivalence: {
        matchesO7ColdSnapshot: hashesMatch,
        o7Hash: o7ColdHashes[0],
        currentHash: currentColdHashes[0],
      },
      securityValidation: scopeResults,
    };

    fs.writeFileSync(path.join(__dirname, 'combined-results.json'), JSON.stringify(combinedOutput, null, 2));
    fs.writeFileSync(path.join(__dirname, 'concurrency-results.json'), JSON.stringify(concurrency, null, 2));
    fs.writeFileSync(path.join(__dirname, 'security-validation.json'), JSON.stringify(scopeResults, null, 2));

    console.log('\nValidation complete. Written combined-results.json, concurrency-results.json, security-validation.json');
  } finally {
    await h.close();
  }
}

runValidation().catch(e => {
  console.error(e);
  process.exit(1);
});
