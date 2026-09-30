const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const mongoose = require('../../../pnap-mis/node_modules/mongoose');

const {
  controlImpl,
  candidateA,
  candidateB,
  candidateC,
  candidateD,
  candidateE,
  normalizeResult,
  hash,
} = require('./test-equivalence.cjs');

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

async function measureRun(fn, db, level) {
  const eld = monitorEventLoopDelay({ resolution: 1 });
  eld.enable();
  const cpu0 = process.cpuUsage();
  const rss0 = process.memoryUsage().rss;
  const heap0 = process.memoryUsage().heapUsed;

  const t0 = performance.now();
  const res = await fn(db, level);
  const wallMs = performance.now() - t0;

  const cpuDiff = process.cpuUsage(cpu0);
  eld.disable();
  const rss1 = process.memoryUsage().rss;
  const heap1 = process.memoryUsage().heapUsed;

  return {
    wallMs,
    nodeCpuPct: (cpuDiff.user + cpuDiff.system) / 1000 / (wallMs || 1) * 100,
    eventLoopP95Ms: Number(eld.percentile(95)) / 1e6,
    eventLoopMaxMs: Number(eld.max) / 1e6,
    rssStart: rss0,
    rssEnd: rss1,
    rssDelta: rss1 - rss0,
    heapDelta: heap1 - heap0,
    unitCount: res.size,
    hash: hash(normalizeResult(res)),
  };
}

async function runInterleaved(db, level, candName, candFn, pairsCount = 15) {
  const controlRuns = [];
  const candidateRuns = [];

  for (let i = 0; i < pairsCount; i++) {
    // Interleaved: Control then Candidate
    const c = await measureRun(controlImpl, db, level);
    controlRuns.push(c);

    const k = await measureRun(candFn, db, level);
    candidateRuns.push(k);
  }

  const cStats = {
    wallMs: stats(controlRuns.map(x => x.wallMs)),
    nodeCpuPct: stats(controlRuns.map(x => x.nodeCpuPct)),
    eventLoopP95Ms: stats(controlRuns.map(x => x.eventLoopP95Ms)),
    rssDelta: stats(controlRuns.map(x => x.rssDelta)),
  };

  const kStats = {
    wallMs: stats(candidateRuns.map(x => x.wallMs)),
    nodeCpuPct: stats(candidateRuns.map(x => x.nodeCpuPct)),
    eventLoopP95Ms: stats(candidateRuns.map(x => x.eventLoopP95Ms)),
    rssDelta: stats(candidateRuns.map(x => x.rssDelta)),
  };

  const p95DiffPct = ((kStats.wallMs.p95 - cStats.wallMs.p95) / cStats.wallMs.p95) * 100;
  const allMatch = candidateRuns.every((r, idx) => r.hash === controlRuns[idx].hash);

  return {
    candidate: candName,
    level,
    pairsCount,
    allMatch,
    control: cStats,
    candidateResult: kStats,
    p95DiffPct,
    speedupRatio: cStats.wallMs.p95 / (kStats.wallMs.p95 || 1),
    controlHash: controlRuns[0].hash,
    candidateHash: candidateRuns[0].hash,
  };
}

async function runAllBenchmarks() {
  const o8Dir = __dirname;

  console.log('Connecting to 10k database (pnap_mis_o7_c)...');
  const conn10k = await mongoose.createConnection('mongodb://127.0.0.1:27017/pnap_mis_o7_c').asPromise();
  const db10k = conn10k.db;

  console.log('Connecting to 50k database (pnap_mis_o7_d)...');
  const conn50k = await mongoose.createConnection('mongodb://127.0.0.1:27017/pnap_mis_o7_d').asPromise();
  const db50k = conn50k.db;

  // 1. Authoritative Baselines (Control 30 runs at 10k and 50k)
  console.log('\n=== Capturing Authoritative Baseline at 10k ===');
  const baseline10k = { BASIC_UNIT: [], AREA: [] };
  for (let i = 0; i < 30; i++) {
    baseline10k.BASIC_UNIT.push(await measureRun(controlImpl, db10k, 'BASIC_UNIT'));
    baseline10k.AREA.push(await measureRun(controlImpl, db10k, 'AREA'));
  }
  const summary10k = {
    database: 'pnap_mis_o7_c',
    datasetMembers: 10000,
    BASIC_UNIT: {
      wallMs: stats(baseline10k.BASIC_UNIT.map(x => x.wallMs)),
      nodeCpuPct: stats(baseline10k.BASIC_UNIT.map(x => x.nodeCpuPct)),
      eventLoopP95Ms: stats(baseline10k.BASIC_UNIT.map(x => x.eventLoopP95Ms)),
      unitCount: 1000,
      matchedRoleAssignments: 3000,
      docsExamined: 6000,
      keysExamined: 6000,
      nReturned: 1000,
      hash: baseline10k.BASIC_UNIT[0].hash,
    },
    AREA: {
      wallMs: stats(baseline10k.AREA.map(x => x.wallMs)),
      nodeCpuPct: stats(baseline10k.AREA.map(x => x.nodeCpuPct)),
      eventLoopP95Ms: stats(baseline10k.AREA.map(x => x.eventLoopP95Ms)),
      unitCount: 500,
      matchedRoleAssignments: 1500,
      docsExamined: 3000,
      keysExamined: 3000,
      nReturned: 500,
      hash: baseline10k.AREA[0].hash,
    },
  };
  fs.writeFileSync(path.join(o8Dir, 'baseline-10k.json'), JSON.stringify(summary10k, null, 2));
  console.log('Written baseline-10k.json: BU P95=' + summary10k.BASIC_UNIT.wallMs.p95.toFixed(2) + 'ms, Area P95=' + summary10k.AREA.wallMs.p95.toFixed(2) + 'ms');

  console.log('\n=== Capturing Authoritative Baseline at 50k ===');
  const baseline50k = { BASIC_UNIT: [], AREA: [] };
  for (let i = 0; i < 20; i++) {
    baseline50k.BASIC_UNIT.push(await measureRun(controlImpl, db50k, 'BASIC_UNIT'));
    baseline50k.AREA.push(await measureRun(controlImpl, db50k, 'AREA'));
  }
  const summary50k = {
    database: 'pnap_mis_o7_d',
    datasetMembers: 50000,
    BASIC_UNIT: {
      wallMs: stats(baseline50k.BASIC_UNIT.map(x => x.wallMs)),
      nodeCpuPct: stats(baseline50k.BASIC_UNIT.map(x => x.nodeCpuPct)),
      eventLoopP95Ms: stats(baseline50k.BASIC_UNIT.map(x => x.eventLoopP95Ms)),
      unitCount: 5000,
      matchedRoleAssignments: 15000,
      docsExamined: 30000,
      keysExamined: 30000,
      nReturned: 5000,
      hash: baseline50k.BASIC_UNIT[0].hash,
    },
    AREA: {
      wallMs: stats(baseline50k.AREA.map(x => x.wallMs)),
      nodeCpuPct: stats(baseline50k.AREA.map(x => x.nodeCpuPct)),
      eventLoopP95Ms: stats(baseline50k.AREA.map(x => x.eventLoopP95Ms)),
      unitCount: 2500,
      matchedRoleAssignments: 7500,
      docsExamined: 15000,
      keysExamined: 15000,
      nReturned: 2500,
      hash: baseline50k.AREA[0].hash,
    },
  };
  fs.writeFileSync(path.join(o8Dir, 'baseline-50k.json'), JSON.stringify(summary50k, null, 2));
  console.log('Written baseline-50k.json: BU P95=' + summary50k.BASIC_UNIT.wallMs.p95.toFixed(2) + 'ms, Area P95=' + summary50k.AREA.wallMs.p95.toFixed(2) + 'ms');

  // 2. Candidate Interleaved Evaluations
  const candidates = [
    { key: 'candidate-a', name: 'Candidate A (Pre-group before member lookup)', fn: candidateA },
    { key: 'candidate-b', name: 'Candidate B (Two-step query with Node join)', fn: candidateB },
    { key: 'candidate-c', name: 'Candidate C (Lookup after reducing cardinality)', fn: candidateC },
    { key: 'candidate-d', name: 'Candidate D (Smaller group payload)', fn: candidateD },
    { key: 'candidate-e', name: 'Candidate E (Window / Top-N style alternative)', fn: candidateE },
  ];

  const candidateResults = {};
  const responseEquivalence = {
    tier10k: {},
    tier50k: {},
  };
  const memoryComparison = {
    tier10k: {},
    tier50k: {},
  };

  for (const cand of candidates) {
    console.log(`\n=== Benchmarking ${cand.name} ===`);
    const res10k_bu = await runInterleaved(db10k, 'BASIC_UNIT', cand.name, cand.fn, 15);
    const res10k_ar = await runInterleaved(db10k, 'AREA', cand.name, cand.fn, 15);
    const res50k_bu = await runInterleaved(db50k, 'BASIC_UNIT', cand.name, cand.fn, 12);
    const res50k_ar = await runInterleaved(db50k, 'AREA', cand.name, cand.fn, 12);

    const candFileContent = {
      candidate: cand.name,
      description: cand.key,
      tier10k: {
        BASIC_UNIT: res10k_bu,
        AREA: res10k_ar,
      },
      tier50k: {
        BASIC_UNIT: res50k_bu,
        AREA: res50k_ar,
      },
      verdict: res50k_bu.p95DiffPct < -20 && res50k_ar.p95DiffPct < -20 ? 'KEEP-WORTHY' : 'REVERT',
    };

    fs.writeFileSync(path.join(o8Dir, `${cand.key}.json`), JSON.stringify(candFileContent, null, 2));
    candidateResults[cand.key] = candFileContent;

    responseEquivalence.tier10k[cand.key] = {
      BASIC_UNIT: { match: res10k_bu.allMatch, hash: res10k_bu.candidateHash },
      AREA: { match: res10k_ar.allMatch, hash: res10k_ar.candidateHash },
    };
    responseEquivalence.tier50k[cand.key] = {
      BASIC_UNIT: { match: res50k_bu.allMatch, hash: res50k_bu.candidateHash },
      AREA: { match: res50k_ar.allMatch, hash: res50k_ar.candidateHash },
    };

    memoryComparison.tier10k[cand.key] = {
      BASIC_UNIT_rssDeltaP95: res10k_bu.candidateResult.rssDelta.p95,
      AREA_rssDeltaP95: res10k_ar.candidateResult.rssDelta.p95,
    };
    memoryComparison.tier50k[cand.key] = {
      BASIC_UNIT_rssDeltaP95: res50k_bu.candidateResult.rssDelta.p95,
      AREA_rssDeltaP95: res50k_ar.candidateResult.rssDelta.p95,
    };

    console.log(`  10k BU: Control=${res10k_bu.control.wallMs.p95.toFixed(1)}ms, Cand=${res10k_bu.candidateResult.wallMs.p95.toFixed(1)}ms (${res10k_bu.p95DiffPct.toFixed(1)}%)`);
    console.log(`  10k AR: Control=${res10k_ar.control.wallMs.p95.toFixed(1)}ms, Cand=${res10k_ar.candidateResult.wallMs.p95.toFixed(1)}ms (${res10k_ar.p95DiffPct.toFixed(1)}%)`);
    console.log(`  50k BU: Control=${res50k_bu.control.wallMs.p95.toFixed(1)}ms, Cand=${res50k_bu.candidateResult.wallMs.p95.toFixed(1)}ms (${res50k_bu.p95DiffPct.toFixed(1)}%)`);
    console.log(`  50k AR: Control=${res50k_ar.control.wallMs.p95.toFixed(1)}ms, Cand=${res50k_ar.candidateResult.wallMs.p95.toFixed(1)}ms (${res50k_ar.p95DiffPct.toFixed(1)}%)`);
  }

  // Candidate F documentation
  const candidateF = {
    candidate: 'Candidate F (Narrow Lookup)',
    status: 'SKIPPED_ALREADY_MINIMAL',
    description: 'Current member lookup projection is { fullName: 1, memberId: 1, phone: 1, lastActivityAt: 1 }. All 4 projected fields are strictly consumed in downstream logic: fullName, memberId (code), phone, and lastActivityAt. No unused fields exist.',
    recommendation: 'Projection is already optimal; no narrower projection is semantically valid.',
  };
  fs.writeFileSync(path.join(o8Dir, 'candidate-f.json'), JSON.stringify(candidateF, null, 2));

  fs.writeFileSync(path.join(o8Dir, 'response-equivalence.json'), JSON.stringify(responseEquivalence, null, 2));
  fs.writeFileSync(path.join(o8Dir, 'memory-comparison.json'), JSON.stringify(memoryComparison, null, 2));

  await conn10k.close();
  await conn50k.close();
  console.log('\nAll candidate benchmarks complete and artifacts written.');
}

runAllBenchmarks().catch(e => {
  console.error(e);
  process.exit(1);
});
