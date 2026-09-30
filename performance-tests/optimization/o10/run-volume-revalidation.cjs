const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const mongoose = require('../../../pnap-mis/node_modules/mongoose');
const { BSON } = require('../../../pnap-mis/node_modules/bson');

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

const KEY_ROLES = {
  BASIC_UNIT: ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY'],
  AREA: ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY'],
};

const OFFICER_PRIORITY = [
  'PRESIDENT', 'CHAIRMAN', 'GENERAL_SECRETARY', 'SECRETARY',
  'SENIOR_MAWIN', 'FINANCE_SECRETARY',
];

const str = (v) => (v == null ? '' : String(v));

const pct = (a, p) => {
  if (a.length === 0) return 0;
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
    nodeCpuPct: (p.user + p.system) / 1000 / (wallMs || 1) * 100,
    hostCpuPct: ((host1.t - host.t) - (host1.i - host.i)) / ((host1.t - host.t) || 1) * 100,
    eventLoopP95Ms: Number(eld.percentile(95)) / 1e6,
    eventLoopMaxMs: Number(eld.max) / 1e6,
    rssStart: rss0,
    rssEnd: process.memoryUsage().rss,
    freeRam: os.freemem(),
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

// Candidate B Direct Officer Query Benchmark Function
async function measureOfficerQuery(db, level, runs = 15) {
  const codes = KEY_ROLES[level];
  const roleFilter = {
    unitLevel: level,
    roleCode: { $in: codes },
    state: 'APPROVED',
    endedAt: { $exists: false },
  };

  const rows = [];
  for (let r = 0; r < runs; r++) {
    const eld = monitorEventLoopDelay({ resolution: 1 });
    eld.enable();
    const cpu0 = process.cpuUsage();
    const t0 = performance.now();

    const assignments = await db.collection('roleassignments').find(
      roleFilter,
      { projection: { unitId: 1, memberId: 1, roleCode: 1 } }
    ).toArray();

    const memberIds = [];
    const seen = new Set();
    for (let i = 0; i < assignments.length; i++) {
      const mid = assignments[i].memberId;
      const midStr = str(mid);
      if (!seen.has(midStr)) {
        seen.add(midStr);
        memberIds.push(mid);
      }
    }

    const members = await db.collection('members').find(
      { _id: { $in: memberIds } },
      { projection: { fullName: 1, memberId: 1, phone: 1, lastActivityAt: 1 } }
    ).toArray();

    const memberMap = new Map();
    for (let i = 0; i < members.length; i++) {
      const m = members[i];
      memberMap.set(str(m._id), m);
    }

    const unitMap = new Map();
    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      const uidStr = str(a.unitId);
      const m = memberMap.get(str(a.memberId));
      if (!m) continue;

      let u = unitMap.get(uidStr);
      if (!u) {
        u = { lastActivityAt: null, officers: [] };
        unitMap.set(uidStr, u);
      }
      const act = m.lastActivityAt || null;
      if (act && (!u.lastActivityAt || act > u.lastActivityAt)) {
        u.lastActivityAt = act;
      }
      u.officers.push({
        roleCode: a.roleCode,
        memberId: m._id,
        memberCode: m.memberId,
        fullName: m.fullName,
        phone: m.phone,
        lastActivityAt: m.lastActivityAt,
      });
    }

    const map = new Map();
    for (const [uidStr, u] of unitMap.entries()) {
      const officers = u.officers;
      const officer = OFFICER_PRIORITY
        .map((code) => officers.find((o) => o.roleCode === code))
        .find(Boolean) || officers[0] || null;
      map.set(uidStr, {
        lastActivityAt: u.lastActivityAt,
        officer,
        officerCount: officers.length,
      });
    }

    const wallMs = performance.now() - t0;
    const cpuDiff = process.cpuUsage(cpu0);
    eld.disable();

    rows.push({
      wallMs,
      nodeCpuPct: (cpuDiff.user + cpuDiff.system) / 1000 / (wallMs || 1) * 100,
      eventLoopP95Ms: Number(eld.percentile(95)) / 1e6,
      unitCount: map.size,
    });
  }

  return {
    runs,
    wallMs: stats(rows.map(x => x.wallMs)),
    nodeCpuPct: stats(rows.map(x => x.nodeCpuPct)),
    eventLoopP95Ms: stats(rows.map(x => x.eventLoopP95Ms)),
    unitCount: rows[0].unitCount,
  };
}

// Deep analysis of Candidate B breakdown
async function deepCandidateB(db, level) {
  const codes = KEY_ROLES[level];
  const roleFilter = {
    unitLevel: level,
    roleCode: { $in: codes },
    state: 'APPROVED',
    endedAt: { $exists: false },
  };

  const mem0 = process.memoryUsage();
  const t0 = performance.now();
  const assignments = await db.collection('roleassignments').find(
    roleFilter,
    { projection: { unitId: 1, memberId: 1, roleCode: 1 } }
  ).toArray();
  const t1 = performance.now();
  const roleQueryMs = t1 - t0;

  const t2 = performance.now();
  const memberIds = [];
  const seen = new Set();
  for (let i = 0; i < assignments.length; i++) {
    const mid = assignments[i].memberId;
    const midStr = str(mid);
    if (!seen.has(midStr)) {
      seen.add(midStr);
      memberIds.push(mid);
    }
  }
  const t3 = performance.now();
  const extractUniqueMemberIdsMs = t3 - t2;

  const memberQueryDoc = { _id: { $in: memberIds } };
  const bsonBytes = BSON.serialize(memberQueryDoc).byteLength;

  const t4 = performance.now();
  const members = await db.collection('members').find(
    memberQueryDoc,
    { projection: { fullName: 1, memberId: 1, phone: 1, lastActivityAt: 1 } }
  ).toArray();
  const t5 = performance.now();
  const memberQueryMs = t5 - t4;

  const memPeak = process.memoryUsage();
  const t6 = performance.now();
  const memberMap = new Map();
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    memberMap.set(str(m._id), m);
  }

  const unitMap = new Map();
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    const uidStr = str(a.unitId);
    const m = memberMap.get(str(a.memberId));
    if (!m) continue;

    let u = unitMap.get(uidStr);
    if (!u) {
      u = { lastActivityAt: null, officers: [] };
      unitMap.set(uidStr, u);
    }
    const act = m.lastActivityAt || null;
    if (act && (!u.lastActivityAt || act > u.lastActivityAt)) {
      u.lastActivityAt = act;
    }
    u.officers.push({
      roleCode: a.roleCode,
      memberId: m._id,
      memberCode: m.memberId,
      fullName: m.fullName,
      phone: m.phone,
      lastActivityAt: m.lastActivityAt,
    });
  }

  const map = new Map();
  for (const [uidStr, u] of unitMap.entries()) {
    const officers = u.officers;
    const officer = OFFICER_PRIORITY
      .map((code) => officers.find((o) => o.roleCode === code))
      .find(Boolean) || officers[0] || null;
    map.set(uidStr, {
      lastActivityAt: u.lastActivityAt,
      officer,
      officerCount: officers.length,
    });
  }
  const t7 = performance.now();
  const nodeJoinMs = t7 - t6;
  const totalMs = roleQueryMs + extractUniqueMemberIdsMs + memberQueryMs + nodeJoinMs;

  return {
    assignmentsCount: assignments.length,
    uniqueMemberIdsCount: memberIds.length,
    bsonInQueryBytes: bsonBytes,
    bsonInQueryKb: (bsonBytes / 1024).toFixed(2),
    bsonMaxAllowedBytes: 16777216,
    bsonPctOfLimit: ((bsonBytes / 16777216) * 100).toFixed(4) + '%',
    membersFoundCount: members.length,
    unitCount: map.size,
    timingsMs: {
      roleQueryMs,
      extractUniqueMemberIdsMs,
      memberQueryMs,
      nodeJoinMs,
      totalMs,
    },
    memory: {
      heapUsedBeforeBytes: mem0.heapUsed,
      heapUsedPeakBytes: memPeak.heapUsed,
      heapDeltaMb: ((memPeak.heapUsed - mem0.heapUsed) / (1024 * 1024)).toFixed(2),
      rssBeforeBytes: mem0.rss,
      rssPeakBytes: memPeak.rss,
      rssDeltaMb: ((memPeak.rss - mem0.rss) / (1024 * 1024)).toFixed(2),
    },
  };
}

async function runAll() {
  const tiers = [
    { code: 'a', name: 'pnap_mis_o7_a', members: 500, label: '500' },
    { code: 'b', name: 'pnap_mis_o7_b', members: 5000, label: '5k' },
    { code: 'c', name: 'pnap_mis_o7_c', members: 10000, label: '10k' },
    { code: 'd', name: 'pnap_mis_o7_d', members: 50000, label: '50k' },
  ];

  const volumeResults = {};
  const deepBreakdowns = {};

  for (const tier of tiers) {
    console.log(`\n======================================================`);
    console.log(`BENCHMARKING TIER ${tier.label} (${tier.name}, ${tier.members} members)`);
    console.log(`======================================================`);

    process.env.O7_MONGO_URI = `mongodb://127.0.0.1:27017/${tier.name}`;
    const h = await start();

    try {
      // 1. Officer queries (Basic Unit & Area)
      console.log(`Running Basic Unit & Area officer query benchmarks (15 runs each)...`);
      const buOfficer = await measureOfficerQuery(h.db, 'BASIC_UNIT', 15);
      const arOfficer = await measureOfficerQuery(h.db, 'AREA', 15);
      console.log(`  Basic Unit P95: ${buOfficer.wallMs.p95.toFixed(2)} ms (P50: ${buOfficer.wallMs.p50.toFixed(2)} ms, P99: ${buOfficer.wallMs.p99.toFixed(2)} ms)`);
      console.log(`  Area P95:       ${arOfficer.wallMs.p95.toFixed(2)} ms (P50: ${arOfficer.wallMs.p50.toFixed(2)} ms, P99: ${arOfficer.wallMs.p99.toFixed(2)} ms)`);

      // Deep Candidate B analysis for 10k & 50k
      if (tier.code === 'c' || tier.code === 'd') {
        console.log(`Running deep Candidate B component breakdown for ${tier.label}...`);
        deepBreakdowns[tier.label] = {
          BASIC_UNIT: await deepCandidateB(h.db, 'BASIC_UNIT'),
          AREA: await deepCandidateB(h.db, 'AREA'),
        };
      }

      // 2. Cold Snapshot (10 runs)
      console.log(`Running Cold Snapshot (10 runs)...`);
      const coldRows = [];
      for (let i = 0; i < 10; i++) {
        coldRows.push(await measure(h, () => Promise.all([h.request(urls.inactiveUnits, { cold: false })])));
      }
      const coldSummary = summarize(coldRows);
      console.log(`  Cold Snapshot P95: ${coldSummary.completionMs.p95.toFixed(2)} ms (P50: ${coldSummary.completionMs.p50.toFixed(2)} ms, P99: ${coldSummary.completionMs.p99.toFixed(2)} ms)`);

      // 3. Group 3 (5 runs)
      console.log(`Running Group 3 (5 runs)...`);
      const g3Rows = [];
      for (let i = 0; i < 5; i++) {
        g3Rows.push(await measure(h, () => Promise.all([urls.summary, urls.org, urls.inactiveUnits].map(u => h.request(u, { cold: false })))));
      }
      const g3Summary = summarize(g3Rows);
      console.log(`  Group 3 P95:       ${g3Summary.completionMs.p95.toFixed(2)} ms (P50: ${g3Summary.completionMs.p50.toFixed(2)} ms, P99: ${g3Summary.completionMs.p99.toFixed(2)} ms)`);

      // 4. Staged Dashboard (5 runs)
      console.log(`Running Staged Dashboard (5 runs)...`);
      const stagedRows = [];
      for (let i = 0; i < 5; i++) {
        stagedRows.push(await measure(h, async () => {
          const a = await Promise.all([urls.summary, urls.scope, urls.org].map(u => h.request(u, { cold: false })));
          const b = await Promise.all([urls.membership, urls.campaigns, urls.meetings, urls.reports, urls.inactiveUnits, urls.inactiveMembers].map(u => h.request(u, { cold: false })));
          return [...a, ...b];
        }));
      }
      const stagedSummary = summarize(stagedRows);
      console.log(`  Staged Dashboard P95: ${stagedSummary.completionMs.p95.toFixed(2)} ms (P50: ${stagedSummary.completionMs.p50.toFixed(2)} ms, P99: ${stagedSummary.completionMs.p99.toFixed(2)} ms)`);

      volumeResults[tier.label] = {
        tier: tier.label,
        database: tier.name,
        members: tier.members,
        basicUnitOfficer: buOfficer,
        areaOfficer: arOfficer,
        coldSnapshot: coldSummary,
        group3: g3Summary,
        stagedDashboard: stagedSummary,
      };
    } finally {
      await h.close();
    }
  }

  // Step 17: Final 50k Moderate Concurrency (Separate Classes A & B)
  console.log(`\n======================================================`);
  console.log(`BENCHMARKING 50K MODERATE CONCURRENCY (pnap_mis_o7_d)`);
  console.log(`======================================================`);

  process.env.O7_MONGO_URI = 'mongodb://127.0.0.1:27017/pnap_mis_o7_d';
  const h50k = await start();

  const concurrencyA = {}; // Snapshot consumers (c=1, 3, 5, 10)
  const concurrencyB = {}; // Full staged workflows (c=1, 3, 5, 10)

  try {
    // Class A: Snapshot Consumers
    console.log(`Class A: Snapshot Consumers (1, 3, 5, 10)...`);
    for (const c of [1, 3, 5, 10]) {
      const rows = [];
      for (let wave = 0; wave < 3; wave++) {
        rows.push(await measure(h50k, () => Promise.all(
          Array.from({ length: c }, () => h50k.request(urls.inactiveUnits, { cold: false }))
        )));
      }
      concurrencyA[c] = summarize(rows);
      console.log(`  Class A Concurrency c=${c}: P95=${concurrencyA[c].completionMs.p95.toFixed(2)} ms, P50=${concurrencyA[c].completionMs.p50.toFixed(2)} ms, EL P95=${concurrencyA[c].eventLoopP95Ms.p95.toFixed(2)} ms`);
    }

    // Class B: Full Staged Dashboard Workflows
    console.log(`Class B: Full Staged Dashboard Workflows (1, 3, 5, 10)...`);
    for (const c of [1, 3, 5, 10]) {
      const rows = [];
      for (let wave = 0; wave < 3; wave++) {
        rows.push(await measure(h50k, async () => {
          // c concurrent users each executing staged workflow
          const userWorkflows = Array.from({ length: c }, async () => {
            const stage1 = await Promise.all([urls.summary, urls.scope, urls.org].map(u => h50k.request(u, { cold: false })));
            const stage2 = await Promise.all([urls.membership, urls.campaigns, urls.meetings, urls.reports, urls.inactiveUnits, urls.inactiveMembers].map(u => h50k.request(u, { cold: false })));
            return [...stage1, ...stage2];
          });
          const allUserResponses = await Promise.all(userWorkflows);
          return allUserResponses.flat();
        }));
      }
      concurrencyB[c] = summarize(rows);
      console.log(`  Class B Concurrency c=${c}: P95=${concurrencyB[c].completionMs.p95.toFixed(2)} ms, P50=${concurrencyB[c].completionMs.p50.toFixed(2)} ms, EL P95=${concurrencyB[c].eventLoopP95Ms.p95.toFixed(2)} ms`);
    }
  } finally {
    await h50k.close();
  }

  // Save volume-revalidation-results.json
  const finalVolumeData = {
    timestamp: new Date().toISOString(),
    tiers: volumeResults,
    deepBreakdowns,
  };
  fs.writeFileSync(
    path.join(__dirname, 'volume-revalidation-results.json'),
    JSON.stringify(finalVolumeData, null, 2)
  );

  // Save concurrency-results.json
  const finalConcurrencyData = {
    timestamp: new Date().toISOString(),
    database: 'pnap_mis_o7_d',
    datasetMembers: 50000,
    classA_snapshotConsumers: concurrencyA,
    classB_fullStagedWorkflows: concurrencyB,
  };
  fs.writeFileSync(
    path.join(__dirname, 'concurrency-results.json'),
    JSON.stringify(finalConcurrencyData, null, 2)
  );

  // Save volume-growth-curve.json
  const growthCurve = {
    timestamp: new Date().toISOString(),
    growthTable: [
      {
        tier: '500',
        members: 500,
        basicUnitP95Ms: volumeResults['500'].basicUnitOfficer.wallMs.p95,
        areaP95Ms: volumeResults['500'].areaOfficer.wallMs.p95,
        coldSnapshotP95Ms: volumeResults['500'].coldSnapshot.completionMs.p95,
        group3P95Ms: volumeResults['500'].group3.completionMs.p95,
        dashboardP95Ms: volumeResults['500'].stagedDashboard.completionMs.p95,
      },
      {
        tier: '5k',
        members: 5000,
        basicUnitP95Ms: volumeResults['5k'].basicUnitOfficer.wallMs.p95,
        areaP95Ms: volumeResults['5k'].areaOfficer.wallMs.p95,
        coldSnapshotP95Ms: volumeResults['5k'].coldSnapshot.completionMs.p95,
        group3P95Ms: volumeResults['5k'].group3.completionMs.p95,
        dashboardP95Ms: volumeResults['5k'].stagedDashboard.completionMs.p95,
      },
      {
        tier: '10k',
        members: 10000,
        basicUnitP95Ms: volumeResults['10k'].basicUnitOfficer.wallMs.p95,
        areaP95Ms: volumeResults['10k'].areaOfficer.wallMs.p95,
        coldSnapshotP95Ms: volumeResults['10k'].coldSnapshot.completionMs.p95,
        group3P95Ms: volumeResults['10k'].group3.completionMs.p95,
        dashboardP95Ms: volumeResults['10k'].stagedDashboard.completionMs.p95,
      },
      {
        tier: '50k',
        members: 50000,
        basicUnitP95Ms: volumeResults['50k'].basicUnitOfficer.wallMs.p95,
        areaP95Ms: volumeResults['50k'].areaOfficer.wallMs.p95,
        coldSnapshotP95Ms: volumeResults['50k'].coldSnapshot.completionMs.p95,
        group3P95Ms: volumeResults['50k'].group3.completionMs.p95,
        dashboardP95Ms: volumeResults['50k'].stagedDashboard.completionMs.p95,
      },
    ],
  };
  fs.writeFileSync(
    path.join(__dirname, 'volume-growth-curve.json'),
    JSON.stringify(growthCurve, null, 2)
  );

  console.log('\nAll volume revalidation and concurrency benchmarks completed successfully!');
}

runAll().catch(err => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
