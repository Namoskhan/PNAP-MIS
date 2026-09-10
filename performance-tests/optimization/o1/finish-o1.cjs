const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const appRequire = require('node:module').createRequire(path.resolve(__dirname, '../../../pnap-mis/server/package.json'));
const { EJSON } = appRequire('bson');
const { MongoClient } = appRequire('mongodb');
const read = (p) => EJSON.parse(fs.readFileSync(path.join(__dirname, p), 'utf8'));
const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'recovered/historical-baseline-summary.json'), 'utf8'));
const globalResult = read('validation/global/benchmark-after-build.json');
const provinceResult = read('validation/province/benchmark-after-build.json');
const decisions = ['global', 'province'].map((id) => read(`validation/${id}/decision.json`));
const visibility = read('validation/province/visibility-check.json');
const initial = read('validation/global/prebuild-integrity.json');
function save(name, value) { fs.writeFileSync(path.join(__dirname, name), typeof value === 'string' ? value : JSON.stringify(value, null, 2), { flag: 'wx' }); }
async function main() {
  const client = new MongoClient('mongodb://127.0.0.1:27017/pnap_mis', { serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db();
    const opts = await db.admin().command({ getCmdLineOpts: 1 });
    const collections = [];
    for (const c of (await db.listCollections({}, { nameOnly: true }).toArray()).sort((a, b) => a.name.localeCompare(b.name))) {
      if (c.name.startsWith('system.')) continue;
      const digest = crypto.createHash('sha256'); let count = 0;
      for await (const doc of db.collection(c.name).find({}).sort({ _id: 1 })) { digest.update(EJSON.stringify(doc, { relaxed: false })); count++; }
      collections.push({ collection: c.name, count, sha256: digest.digest('hex') });
    }
    const indexes = await db.collection('members').indexes();
    const dataUnchanged = JSON.stringify(collections) === JSON.stringify(initial.collections);
    const indexesRestored = JSON.stringify(indexes) === JSON.stringify(initial.indexes);
    const log = fs.readFileSync(path.join(__dirname, 'before-run.log'));
    const baselineLogIntact = crypto.createHash('sha256').update(log).digest('hex') === baseline.sourceLogSha256;
    const stats = await db.stats();
    const verification = { at: new Date().toISOString(), target: '127.0.0.1:27017/pnap_mis', dbPath: opts.parsed.storage.dbPath,
      freeBytes: stats.fsTotalSize - stats.fsUsedSize, stats, collections, indexes, dataUnchanged, indexesRestored, baselineLogIntact };
    save('resume-final-verification.json', verification);
    if (!dataUnchanged || !indexesRestored || !baselineLogIntact) throw new Error('Final integrity verification failed');
    const comparison = baseline.results.map((old) => ({ name: old.name, historicalP95: old.p95,
      globalCandidateP95: globalResult.results.find((r) => r.name === old.name).p95,
      provinceCandidateP95: provinceResult.results.find((r) => r.name === old.name).p95,
      note: 'Both candidates reverted; candidate results are not final-state latency measurements.' }));
    save('resume-comparison.json', { classification: 'NO_VALIDATED_LATENCY_IMPROVEMENT_BOTH_CANDIDATES_REVERTED', decisions, comparison, visibility: visibility.pooled,
      rawBaselineIntact: false, historicalBaselineRerun: false, limitations: baseline.limitations });
    const table = comparison.map((r) => `| ${r.name} | ${r.historicalP95.toFixed(2)} | ${r.globalCandidateP95.toFixed(2)} | ${r.provinceCandidateP95.toFixed(2)} |`).join('\n');
    save('O1-MONGODB-QUERY-INDEX-OPTIMIZATION-REPORT.md', `# Phase O1 — resumed index validation

## Outcome

The two previously proposed member indexes were built and validated **one at a time**. Both were **REVERTED**. No candidate index or application source change remains. No repeat pre-optimization benchmark was run. Phase O2 was not started.

Classification: **no validated, repeatable API latency improvement; original index configuration restored**. Better query plans alone did not satisfy KEEP. This is a local small-data result, not evidence that these indexes would be unsuitable at larger scale.

## Required verification

- Running MongoDB getCmdLineOpts confirms storage.dbPath = D:\\MongoDB\\data; bindIp = 127.0.0.1, port = 27017.
- Target database: 127.0.0.1:27017/pnap_mis, development configuration verified. No production target was used.
- D: had approximately 66 GiB free; final server-reported free space is ${(verification.freeBytes / 1024 ** 3).toFixed(2)} GiB. Database allocated storage including indexes is approximately ${(stats.totalSize / 1024 ** 2).toFixed(2)} MiB. More than 2 GiB headroom was required before each build. Windows C: had about 1.77 GiB free; MongoDB now stores data and logs on D:.
- Artifact verification was **partial**, not a full pass. Only the original 71,866-byte before-run.log remained in the expected folders. Its SHA-256 is ${baseline.sourceLogSha256}; it still ends with DONE before 135 explains.
- Historical runner source, candidate rationale, printed P50/P95 values for all 16 operations, exact operation URLs and selected explain summaries were recovered from the earlier session, without executing the runner or fabricating missing raw evidence. See recovered/.
- Original baseline-before.json sample arrays, benchmark-config.json, full explain-before.json, functional-before.json hashes, and the original complete index/stat inventory could not be restored. The recovered summaries are explicitly labelled partial. They do not replace those missing raw files.

## Data continuity

The current count and BSON size match the five historical log entries: members 384 / 277,938 bytes; meetings 17 / 18,884; activities 3 / 2,875; responsibilities 4 / 1,363; roleassignments 325 / 168,775. This is evidence of continuity, not a historical content checksum.

New integrity-only snapshots covered all ${collections.length} collections before and after candidate validation. Every document hash and collection count remained unchanged through the resume. These snapshots do not recreate the historical performance baseline. Final member index definitions exactly match the initial resume inventory, including names, keys and options. The surviving original log is unchanged.

## Procedure and functional checks

The existing 16 operation URLs, fixed date cutoff, existing Super Admin identity, 1 VU, 2 warmups and 20 timed requests per operation were retained. Existing analytics cache invalidation runs outside request timing, as in the historical runner. Normal application startup, autoIndex, autoCreate, index synchronization, backfills and seeders were avoided; the Express app was served on a temporary loopback port.

Each candidate: untimed functional/query capture → create exactly one index → 135 executionStats explains → 16 × 20 timed requests → review → REVERT. No second candidate was built until the first decision and drop had completed. Query capture and functional reads were not used as a new latency baseline.

All 640 measured requests across the two candidate runs returned HTTP 200. Before/after status, response shape and canonical content/order hashes matched for all 16 operations. Five unauthenticated and two existing scoped-user checks also matched per run. These are fresh within-candidate comparisons, not comparisons against the missing historical hashes. Document hashes across all collections remained unchanged.

## Candidate decisions

| Candidate | Plan effect | Initial target P95 | Storage / build | Decision |
|---|---|---|---|---|
| members {createdAt:-1} | First-page SORT + COLLSCAN removed; 384 → 25 documents and 25 keys. Default list 384 → 20 docs. Deep page fetches 25 docs but still examines 375 keys due to SKIP. | First page 34.78 → 55.90 ms; default list 32.66 → 36.67; deep page 30.32 → 40.91. | 20 KiB; ${read('validation/global/build.json').durationMs.toFixed(2)} ms | REVERT: all three target P95 values worse than historical; no demonstrated latency benefit. |
| members {provinceId:1,createdAt:-1} | Province-list SORT removed; 192 → 25 documents and keys. | 25.95 → 21.22 ms (18.2% lower) in initial run. | 20 KiB; ${read('validation/province/build.json').durationMs.toFixed(2)} ms | REVERT: initial improvement did not reproduce reliably in the visibility check. |

## Focused province-index regression check

The initial province-candidate run also measured dashboard-summary P95 at 150.34 ms versus historical 109.00 ms. A same-process visibility check investigated this unresolved result without re-running/replacing the historical O1 baseline. It temporarily hid/unhid only the already-built candidate, used visible/hidden/hidden/visible blocks, and restored visibility before the final decision. No additional index was created.

Each block used two untimed warmups plus 20 measured requests for each of two endpoints; pooled sample count was 40 per visibility state per endpoint. All 160 timed requests returned 200.

| Endpoint | Index visible P50 / P95 | Index hidden P50 / P95 |
|---|---|---|
| Province member list | 22.91 / 36.28 ms | 23.77 / 30.20 ms |
| Dashboard summary | 107.56 / 135.83 ms | 106.69 / 134.32 ms |

The dashboard-summary difference was small within this control, and its captured winning plans did not use the candidate index. The province-list tail benefit was inconsistent despite fewer document reads. Rather than attribute cross-run noise to an index or claim a successful optimization, the candidate was reverted. No application queries, hints or sorting semantics were changed.

## Preserved historical baseline versus candidate runs

Values are P95 milliseconds. Historical values were recovered from output rounded to two decimal places. Both candidate columns describe temporary configurations that have since been reverted; no final-state latency rerun is claimed.

| Operation | Historical before | Global candidate | Province candidate |
|---|---:|---:|---:|
${table}

## Final state and limitations

- Kept: none. Reverted: createdAt_-1 and provinceId_1_createdAt_-1. Final net candidate index count/storage: zero. Existing indexes were not dropped.
- Write cost: NOT MEASURED. Only index build time and allocated index bytes were recorded; no synthetic writes were introduced.
- Full-population dashboard scans, substring-search limitations and skip-pagination costs remain. No speculative indexes were added to the tiny meetings/activities/responsibilities collections.
- Historical raw evidence is partially missing; historical-to-current exact response equality cannot be established. Count/size agreement cannot exclude same-size historical edits.
- Small dataset, low concurrency, 20-sample initial runs, storage migration and changing machine load limit attribution/generalization. MongoDB executionStats integers at this scale have limited timing precision.
- Some raw explain bounds deserialize as out-of-range JavaScript Dates, represented by NaN in Extended JSON date markers. Portable plan/counter summaries are separately readable; these raw bounds must not be treated as an exact recoverable BSON date. No query counters were replaced.
- All validation changes are scripts/reports/evidence under performance-tests. No application source edits, new historical baseline, seeding, schema changes, or O2 work.

## Evidence

- recovered/historical-baseline-summary.json — surviving old measurements and provenance.
- recovered/historical-measurement-output.txt — original printed measurements and selected explain summaries.
- validation/global/ and validation/province/ — build, query, explain, 20-sample benchmark, functional, integrity and decision artifacts.
- validation/province/visibility-check.json — focused regression investigation.
- resume-comparison.json — machine-readable candidate comparisons and decisions.
- resume-final-verification.json — final database, document hashes, disk headroom and restored indexes.
`);
    console.log(JSON.stringify({ dataUnchanged, indexesRestored, baselineLogIntact, collections: collections.length, decisions: decisions.map((d) => ({ name: d.name, decision: d.decision })) }));
  } finally { await client.close(); }
}
main().catch((e) => { console.error(e.message); process.exitCode = 1; });
