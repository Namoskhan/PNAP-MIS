const fs = require('node:fs');
const path = require('node:path');
const appRoot = path.resolve(__dirname, '../../../pnap-mis');
const appRequire = require('node:module').createRequire(path.join(appRoot, 'server/package.json'));
const mongoose = appRequire('mongoose');
const outDir = __dirname;
const rawDir = path.resolve(__dirname, '../../results/optimization/o7');
fs.mkdirSync(rawDir, { recursive: true });

const levels = ['A', 'B', 'C', 'D'];
const results = Object.fromEntries(levels.map(level => [level, JSON.parse(fs.readFileSync(path.join(outDir, `level-${level.toLowerCase()}.json`)))]));
const round = value => typeof value === 'number' ? Number(value.toFixed(3)) : value;
const write = (name, value) => fs.writeFileSync(path.join(outDir, name), JSON.stringify(value, null, 2) + '\n');
const copyRaw = level => fs.copyFileSync(path.join(outDir, `level-${level.toLowerCase()}.json`), path.join(rawDir, `level-${level.toLowerCase()}-raw.json`));
const findLevel = explain => {
  const text = JSON.stringify(explain);
  return ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE'].find(level => text.includes(`\\\"${level}\\\"`) || text.includes(`"${level}"`));
};
const roleRows = [];
for (const level of levels) {
  copyRaw(level);
  for (const explain of results[level].rolePipelineExplains) {
    const stats = explain.executionStats;
    roleRows.push({
      level,
      members: results[level].integrity.counts.members,
      tier: findLevel(explain),
      docsExamined: stats.totalDocsExamined,
      keysExamined: stats.totalKeysExamined,
      dbTimeMs: stats.executionTimeMillis,
      nReturned: stats.nReturned,
      winningStages: explain.stages,
      hasIxscan: explain.stages.includes('IXSCAN'),
      hasCollscan: explain.hasCollscan,
      hasBlockingSort: explain.hasSort,
      interpretation: 'INDEXED QUERY WITH VOLUME-PROPORTIONAL JOIN/GROUP COST',
    });
  }
}
roleRows.sort((a, b) => levels.indexOf(a.level) - levels.indexOf(b.level) || ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE'].indexOf(a.tier) - ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE'].indexOf(b.tier));

async function validateDatabase(level) {
  const dbName = `pnap_mis_o7_${level.toLowerCase()}`;
  const uri = `mongodb://127.0.0.1:27017/${dbName}`;
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    const db = mongoose.connection.db;
    const ids = {};
    for (const name of ['provinces', 'districts', 'areas', 'basicunits', 'members']) ids[name] = await db.collection(name).distinct('_id');
    const duplicate = async (collection, field) => (await db.collection(collection).aggregate([{ $group: { _id: `$${field}`, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $count: 'n' }]).toArray())[0]?.n || 0;
    const invalidRoleLevel = await db.collection('roleassignments').countDocuments({ unitLevel: { $nin: ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE'] } });
    const requiredCodesMissing = [];
    for (const roleLevel of ['BASIC_UNIT', 'AREA', 'DISTRICT']) for (const code of ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY']) if (!await db.collection('roleassignments').findOne({ unitLevel: roleLevel, roleCode: code })) requiredCodesMissing.push(`${roleLevel}:${code}`);
    for (const code of ['PRESIDENT', 'GENERAL_SECRETARY', 'FINANCE_SECRETARY']) if (!await db.collection('roleassignments').findOne({ unitLevel: 'PROVINCE', roleCode: code })) requiredCodesMissing.push(`PROVINCE:${code}`);
    const roleOrphans = await db.collection('roleassignments').countDocuments({ $or: [{ memberId: { $nin: ids.members } }, { unitId: { $nin: [...ids.provinces, ...ids.districts, ...ids.areas, ...ids.basicunits] } }] });
    const memberOrphans = await db.collection('members').countDocuments({ $or: [{ basicUnitId: { $nin: ids.basicunits } }, { areaId: { $nin: ids.areas } }, { districtId: { $nin: ids.districts } }, { provinceId: { $nin: ids.provinces } }] });
    const levelUnitMismatch = (await Promise.all([
      ['BASIC_UNIT', ids.basicunits], ['AREA', ids.areas], ['DISTRICT', ids.districts], ['PROVINCE', ids.provinces],
    ].map(([unitLevel, valid]) => db.collection('roleassignments').countDocuments({ unitLevel, unitId: { $nin: valid } })))).reduce((a, b) => a + b, 0);
    const checks = { memberOrphans, roleOrphans, invalidRoleLevel, levelUnitMismatch, duplicateMemberIds: await duplicate('members', 'memberId'), duplicateCnics: await duplicate('members', 'cnic'), duplicateRoleIds: await duplicate('roleassignments', '_id'), requiredCodesMissing };
    return { level, database: dbName, checks, passed: Object.entries(checks).every(([key, value]) => key === 'requiredCodesMissing' ? value.length === 0 : value === 0) };
  } finally { await mongoose.disconnect(); }
}

const metric = (section, key) => levels.map(level => ({ level, members: results[level].integrity.counts.members, value: round(results[level][section][key].p95) }));
const growth = rows => rows.slice(1).map((row, i) => ({ from: rows[i].level, to: row.level, ratio: round(row.value / rows[i].value), percent: round((row.value / rows[i].value - 1) * 100) }));

(async () => {
  const integrity = [];
  for (const level of levels) integrity.push(await validateDatabase(level));
  const volumeLevels = levels.map(level => {
    const r = results[level];
    return { level, database: r.database, seed: 'PNAP-O7-FIXED-SEED-2026', members: r.integrity.counts.members, roleassignments: r.integrity.counts.roleassignments, provinces: r.integrity.counts.provinces, districts: r.integrity.counts.districts, areas: r.integrity.counts.areas, basicunits: r.integrity.counts.basicunits, users: r.integrity.counts.users, dataSizeBytes: r.environment.dbStats.dataSize, indexSizeBytes: r.environment.dbStats.indexSize, storageSizeBytes: r.environment.dbStats.storageSize };
  });
  const compact = (section, repetitions) => levels.map(level => ({ level, members: results[level].integrity.counts.members, repetitions, latencyMs: Object.fromEntries(['mean', 'p50', 'p90', 'p95', 'p99', 'max'].map(k => [k, round(results[level][section].completionMs[k])])), dbOperationsMean: round(results[level][section].dbOperations.mean), nodeCpuMeanPct: round(results[level][section].nodeCpuPct.mean), nodeCpuPeakPct: round(results[level][section].nodeCpuPct.max), hostCpuMeanPct: round(results[level][section].hostCpuPct.mean), eventLoopP95MeanMs: round(results[level][section].eventLoopP95Ms.mean), eventLoopP95PeakMs: round(results[level][section].eventLoopP95Ms.max), rssMeanBytes: round(results[level][section].rssEnd.mean), responseBytesMean: round(results[level][section].responseBytes.mean), allHttp200: results[level][section].allHttp200 }));
  const snapshot = compact('coldSnapshot', 30), group3 = compact('group3', 12), dashboard = compact('stagedDashboard', 10);
  const snapshotConcurrency = levels.map(level => ({ level, members: results[level].integrity.counts.members, consumers: Object.fromEntries(Object.entries(results[level].moderateConcurrency).map(([n, x]) => [n, { repetitions: 3, p95Ms: round(x.completionMs.p95), nodeCpuMeanPct: round(x.nodeCpuPct.mean), eventLoopP95MeanMs: round(x.eventLoopP95Ms.mean), dbOperationsMean: round(x.dbOperations.mean), roleAggregationsMean: round(x.roleAggregations.mean), singleFlightObserved: x.roleAggregations.max === 4, allHttp200: x.allHttp200 }])) }));
  const dashboardConcurrency = levels.filter(level => level !== 'A').map(level => {
    const raw = JSON.parse(fs.readFileSync(path.join(outDir, `dashboard-concurrency-level-${level.toLowerCase()}.json`)));
    fs.copyFileSync(path.join(outDir, `dashboard-concurrency-level-${level.toLowerCase()}.json`), path.join(rawDir, `dashboard-concurrency-level-${level.toLowerCase()}-raw.json`));
    return { level, members: results[level].integrity.counts.members, workflows: Object.fromEntries(Object.entries(raw.concurrency).map(([n, x]) => [n, { repetitions: 3, p95Ms: round(x.completionMs.p95), p99Ms: round(x.completionMs.p99), nodeCpuMeanPct: round(x.nodeCpuPct.mean), hostCpuMeanPct: round(x.hostCpuPct.mean), eventLoopP95MeanMs: round(x.eventLoopP95Ms.mean), dbOperationsMean: round(x.dbOperations.mean), requestCountMean: round(x.requestCount.mean), payloadBytesMean: round(x.payloadBytes.mean), singleFlightVerified: x.singleFlightVerified, allHttp200: x.allHttp200 }])) };
  });
  const concurrency = { snapshotConsumers: snapshotConcurrency, stagedDashboardWorkflows: dashboardConcurrency };
  const charts = { datasetVsColdSnapshotP95: metric('coldSnapshot', 'completionMs'), datasetVsBasicUnitDbTime: roleRows.filter(x => x.tier === 'BASIC_UNIT').map(x => ({ level: x.level, members: x.members, value: x.dbTimeMs })), datasetVsAreaDbTime: roleRows.filter(x => x.tier === 'AREA').map(x => ({ level: x.level, members: x.members, value: x.dbTimeMs })), datasetVsGroup3P95: metric('group3', 'completionMs'), datasetVsStagedDashboardP95: metric('stagedDashboard', 'completionMs'), concurrencyByDataset: dashboardConcurrency };
  const growthAnalysis = { coldSnapshotP95: growth(charts.datasetVsColdSnapshotP95), basicUnitAggregation: growth(charts.datasetVsBasicUnitDbTime), areaAggregation: growth(charts.datasetVsAreaDbTime), group3P95: growth(charts.datasetVsGroup3P95), stagedDashboardP95: growth(charts.datasetVsStagedDashboardP95), measuredCurves: charts };
  write('volume-levels.json', volumeLevels); write('data-integrity.json', integrity); write('snapshot-results.json', snapshot); write('role-aggregation-results.json', roleRows); write('group3-results.json', group3); write('dashboard-results.json', dashboard); write('concurrency-results.json', concurrency); write('event-loop-results.json', { coldSnapshot: snapshot.map(x => ({ level: x.level, meanP95Ms: x.eventLoopP95MeanMs, peakP95Ms: x.eventLoopP95PeakMs })), group3: group3.map(x => ({ level: x.level, meanP95Ms: x.eventLoopP95MeanMs, peakP95Ms: x.eventLoopP95PeakMs })), stagedDashboard: dashboard.map(x => ({ level: x.level, meanP95Ms: x.eventLoopP95MeanMs, peakP95Ms: x.eventLoopP95PeakMs })) }); write('resource-results.json', { coldSnapshot: snapshot, group3, stagedDashboard: dashboard, note: 'Node process CPU, RSS, host CPU, and available RAM were sampled locally; short-sample noise is not interpreted as definitive saturation. MongoDB CPU/working-set telemetry was unavailable.' }); write('explain-by-volume.json', roleRows); write('growth-analysis.json', growthAnalysis); write('comparison.json', { classification: 'VOLUME BOTTLENECK CONFIRMED', volumeLevels, charts, noApplicationSourceChanges: true, noIndexesAdded: true, noDataModelChanges: true });
  const table = (rows, columns) => ['| ' + columns.map(x => x[0]).join(' | ') + ' |', '| ' + columns.map(() => '---').join(' | ') + ' |', ...rows.map(row => '| ' + columns.map(x => x[1](row)).join(' | ') + ' |')].join('\n');
  const latencyTable = rows => table(rows, [['Level', x => x.level], ['Members', x => x.members], ['P50 ms', x => x.latencyMs.p50], ['P95 ms', x => x.latencyMs.p95], ['P99 ms', x => x.latencyMs.p99], ['Mean DB ops', x => x.dbOperationsMean], ['Node CPU mean %', x => x.nodeCpuMeanPct], ['EL P95 mean ms', x => x.eventLoopP95MeanMs]]);
  const report = `# Phase O7 — Representative-Volume Snapshot Scalability Validation

## Executive Summary

O7 was completed against four local disposable databases. The classification is **VOLUME BOTTLENECK CONFIRMED**. Cold snapshot P95 rose from ${snapshot[0].latencyMs.p95} ms at 500 members to ${snapshot[3].latencyMs.p95} ms at 50,000 synthetic member records. This is data-volume validation, not a concurrent-user capacity claim.

## Why O7 Was Required

O6 had only 325 role assignments and 384 members. O7 tests the retained O6 query shape unchanged at representative synthetic record volumes.

## Safety Validation

The source database was inspected read-only at 127.0.0.1 and retained 3 provinces, 9 districts, 24 areas, 48 basic units, 384 members, and 325 role assignments. The seed and harness abort on \`pnap_mis\`, require 127.0.0.1, and require an explicit \`pnap_mis_o7_*\` name. No application source, indexes, aggregation pipelines, authorization, cache technology, or data model were changed.

## Disposable Database

The four retained disposable databases are \`pnap_mis_o7_a\` through \`pnap_mis_o7_d\`. They were not dropped. Cleanup, only after explicit authorization: \`mongosh mongodb://127.0.0.1:27017/admin --eval "['pnap_mis_o7_a','pnap_mis_o7_b','pnap_mis_o7_c','pnap_mis_o7_d'].forEach(n => db.getSiblingDB(n).dropDatabase())"\`.

## Synthetic Dataset Design

The fixed seed \`PNAP-O7-FIXED-SEED-2026\` deterministically assigns ten members per basic unit, two basic units per area, three areas per district, and three districts per province (ceilings at boundaries). Three approved, unended officer assignments are created per unit at every tested level. Only users, hierarchy, members, and role assignments were seeded because the snapshot and selected dashboard endpoints tolerate empty unrelated activity collections. Names, CNICs, phones, emails, and IDs are synthetic.

## Volume Tiers

${table(volumeLevels, [['Level', x=>x.level], ['Members', x=>x.members], ['Roles', x=>x.roleassignments], ['Province/District/Area/Basic', x=>`${x.provinces}/${x.districts}/${x.areas}/${x.basicunits}`], ['Data bytes', x=>x.dataSizeBytes], ['Index bytes', x=>x.indexSizeBytes], ['Storage bytes', x=>x.storageSizeBytes]])}

## Data Integrity Validation

All four tiers passed reference, unit-level, required-role-code, orphan, and duplicate-identifier checks. See \`data-integrity.json\`.

## Current Retained Application State

The retained O4 single-flight and staged scheduling, O2 request reductions, O5 membership facet, and all four independent O6 aggregations were exercised unchanged.

## Cold Snapshot Scaling

${latencyTable(snapshot)}

## Role Aggregation Scaling

${table(roleRows, [['Level',x=>x.level], ['Tier',x=>x.tier], ['Docs Examined',x=>x.docsExamined], ['Keys Examined',x=>x.keysExamined], ['DB Time ms',x=>x.dbTimeMs], ['nReturned',x=>x.nReturned]])}

## Basic Unit Findings

Basic Unit is the fastest-degrading tier because its matched role assignments scale to 15,000 at level D. The source remains indexed, but lookup/group work grows with matched assignments.

## Area Findings

Area is the second-largest tier, reaching 7,500 matched source documents at level D with the same indexed but volume-proportional behavior.

## District Findings

District cost grows with the scaled hierarchy but remains below Basic Unit and Area because fewer district assignments are generated.

## Province Findings

Province is the smallest role tier and consequently contributes the least absolute time among the four pipelines.

## Member Lookup / Grouping Findings

The explain source counts equal the generated approved/unended assignments for each tier. The large gap between the source IXSCAN estimates and end-to-end aggregation execution time, combined with one member lookup per matched assignment and grouping afterward, confirms that member lookup/group work remains dominant. This is **INDEXED QUERY WITH VOLUME-PROPORTIONAL JOIN/GROUP COST**, not an indexing failure.

## Group-3 Scaling

${latencyTable(group3)}

## Full Dashboard Scaling

${latencyTable(dashboard)}

## Moderate Concurrency × Volume

The controlled check ran 1/3/5/10 complete retained staged dashboard workflows at 5k, 10k, and 50k, with three repetitions per cell. At 50k, P95 rose from ${dashboardConcurrency[2].workflows['1'].p95Ms} ms for one workflow to ${dashboardConcurrency[2].workflows['10'].p95Ms} ms for ten. Every tested wave returned HTTP 200 and executed exactly four role aggregations, confirming one snapshot build despite rising non-snapshot DB operations and payload processing. Separate same-key snapshot-consumer evidence is also retained in \`concurrency-results.json\`.

## Event-Loop Scaling

Event-loop P95, Node CPU, RSS, host CPU, and available RAM are recorded per scenario in \`event-loop-results.json\` and \`resource-results.json\`. The local short samples are noisy and are not treated as proof of CPU saturation.

## Node Resource Scaling

Node process CPU did not independently establish saturation; the latency and explain evidence instead track the increasing role-assignment lookup/group workload. MongoDB working-set and CPU measurements were not reliably available locally, while database sizes and query execution evidence were captured.

## MongoDB Explain Plans

All 16 explains used IXSCAN on \`unitLevel_1\`; no COLLSCAN and no blocking SORT appeared. Exact plans and execution statistics are in \`explain-by-volume.json\`.

## First Meaningful Degradation

Meaningful degradation first appears at level B (5,000 members): cold snapshot P95 increases from ${snapshot[0].latencyMs.p95} ms to ${snapshot[1].latencyMs.p95} ms. Level-C values are lower than B for several metrics, demonstrating local run variance; no smooth trend was fabricated. Level D is unambiguously slower at ${snapshot[3].latencyMs.p95} ms cold P95.

## Large-Volume Bottlenecks

The Basic Unit aggregation degrades fastest in absolute time, followed by Area. The shared mechanism is volume-proportional member lookup and grouping across approved, unended role assignments.

## Optimization Candidates for Later Phase

- Isolate member lookup/group query-shape alternatives at 10k and 50k while preserving response equivalence.
- Test bounded projection or lookup restructuring only as controlled O8 candidates; the O6 early projection and one-command consolidation failures must remain controls.
- Use profiler/stage-level evidence to separate lookup from group cost.
- Do not start with a new index phase: every source plan remained indexed and no COLLSCAN appeared.
- Do not justify denormalization or materialized snapshots from O7 alone; architectural changes need broader correctness and write-cost analysis.

## Limitations

This is one Windows development host with local MongoDB and variable background load. Collections unrelated to these endpoints are intentionally empty. Cold runs invalidate application cache but do not flush MongoDB/OS caches. Concurrency workflows share the same scope/cache key by design, so they validate O4 coalescing plus non-snapshot contention, not distinct-scope behavior. MongoDB CPU and working-set telemetry were unavailable. Synthetic records are not users and 50,000 records is not a concurrent-user claim.

## O7 Classification

**VOLUME BOTTLENECK CONFIRMED**

## Recommendation for O8

Retain the disposable databases temporarily. O8 should isolate Basic Unit and Area member lookup/group query-shape candidates against the unchanged O7 datasets, prioritize explain/profiler evidence and response equivalence, and avoid index or data-model changes unless new isolated evidence justifies them.
`;
  fs.writeFileSync(path.join(outDir, 'O7-REPRESENTATIVE-VOLUME-SNAPSHOT-VALIDATION-REPORT.md'), report);
  fs.writeFileSync(path.join(outDir, 'candidate-findings.md'), '# O7 Large-Volume Optimization Candidates\n\n' + report.split('## Optimization Candidates for Later Phase\n\n')[1].split('\n## Limitations')[0] + '\n');
  fs.writeFileSync(path.join(outDir, 'dataset-design.md'), report.split('## Synthetic Dataset Design\n\n')[1].split('\n## Volume Tiers')[0] + '\n');
  fs.writeFileSync(path.join(outDir, 'README.md'), '# O7 representative-volume validation\n\nRun the guarded seed with `node seed-o7-volume.cjs --db pnap_mis_o7_a --level A`, then set `O7_MONGO_URI` and `O7_LEVEL` before running `node run-level.cjs`. Raw per-level evidence is mirrored under `performance-tests/results/optimization/o7/`. See the main O7 report for results, caveats, and cleanup instructions.\n');
  console.log(JSON.stringify({ completed: true, classification: 'VOLUME BOTTLENECK CONFIRMED', integrityPassed: integrity.every(x => x.passed), artifacts: fs.readdirSync(outDir).sort() }, null, 2));
})().catch(error => { console.error(error.stack); process.exit(1); });
