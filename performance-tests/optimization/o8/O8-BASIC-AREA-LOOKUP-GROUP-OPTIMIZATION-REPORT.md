# Phase O8 — Basic Unit / Area Lookup & Group Query-Shape Optimization Report

## Executive Summary

Phase O8 investigated and resolved the volume bottleneck identified during Phase O7 within `officeBearerActivity(level)` in [analyticsService.js](file:///d:/Project/PNAP-MIS/pnap-mis/server/src/services/analyticsService.js). At 50,000 members (Tier D, `pnap_mis_o7_d`), the baseline aggregation pipeline spent over 6.5 seconds on Basic Units and 3.3 seconds on Areas due to $O(N)$ correlated `$lookup` subqueries into the `members` collection.

Five candidate optimizations (A through E) were implemented, subjected to strict cryptographic response equivalence testing, and systematically benchmarked using interleaved Control/Candidate measurements across both Tier C (10,000 members) and Tier D (50,000 members).

**Authoritative Conclusion:**
- **Candidate B (Two-step query with Node in-memory hash join)** is the decisive winner across both Basic Unit and Area at all volume tiers.
- Latency reduction for Basic Unit query at 50k: **6,540.8 ms → 479.9 ms (-92.7% / 13.6x speedup)**.
- Latency reduction for Area query at 50k: **3,359.8 ms → 236.4 ms (-93.0% / 14.2x speedup)**.
- Latency reduction for Basic Unit query at 10k: **1,057.5 ms → 60.5 ms (-94.3% / 17.5x speedup)**.
- Latency reduction for Area query at 10k: **549.4 ms → 33.1 ms (-94.0% / 16.6x speedup)**.
- Post-optimization end-to-end impact at 50k:
  - Cold snapshot P95 dropped from **11,699.89 ms → 1,153.35 ms (-90.14%)**.
  - Group 3 P95 dropped from **13,943.31 ms → 1,222.13 ms (-91.24%)**.
  - Staged dashboard completion P95 dropped from **12,980.36 ms → 2,883.39 ms (-77.79%)**.
  - Moderate concurrency (snapshot consumers, c=10) P95 dropped from **12,560.79 ms → 1,093.44 ms (-91.29%)**.

Phase O8 Classification: **HIGHLY SUCCESSFUL**.

---

## Baseline Pipeline Analysis & The O(N) Join Bottleneck

### Existing Query Pipeline
The control implementation executed an aggregation pipeline against `roleassignments`:
1. `$match`: Filtered `unitLevel`, `roleCode: { $in: [...] }`, `state: 'APPROVED'`, `endedAt: { $exists: false }`.
2. `$lookup`: Correlated lookup into `members` matching `$$mid` to `_id`.
3. `$unwind`: `$unwind: '$member'`.
4. `$group`: Grouped by `$unitId`, keeping `$min` of priority rank and latest activity.

### The Profiler & Cardinality Evidence
- **Index Scan Efficiency:** The initial `$match` was highly efficient (<15 ms), utilizing the compound index `{ unitLevel: 1, state: 1, roleCode: 1, endedAt: 1 }`.
- **Inner Subquery Multiplication:** Because `$lookup` was correlated and positioned before `$group`, MongoDB invoked an internal subquery plan execution for *every single matched RoleAssignment*.
- **Volume Metrics at 50k:**
  - Basic Unit: 15,000 matched role assignments across 5,000 units. Exactly 15,000 `$lookup` subqueries executed.
  - Area: 7,500 matched role assignments across 2,500 units. Exactly 7,500 `$lookup` subqueries executed.
  - Total inner lookup invocations: **22,500 subqueries**.

---

## Candidate Architecture & Hypotheses

| Candidate | Strategy | Design & Mechanism |
| :--- | :--- | :--- |
| **Control** | Correlated `$lookup` before `$group` | Baseline: 1 `$lookup` per matched role assignment (15,000 lookups for Basic Units). |
| **Candidate A** | Pre-group by `unitId` & `roleCode`, then `$lookup` | Groups roles first to eliminate duplicate role codes per unit before joining. |
| **Candidate B** | Two-step query + Node in-memory hash join | Step 1: Indexed find on `RoleAssignment`. Step 2: Single `$in` primary key query on `Member`. Step 3: $O(N)$ hash map join in Node. |
| **Candidate C** | Reduce then `$lookup` | Groups to find the single winning officer role per unit *first*, then looks up only that winning member. |
| **Candidate D** | Smaller `$group` payload | Projects only minimal fields before grouping to minimize pipeline RAM. |
| **Candidate E** | Window / Top-N style grouping | Sorts by priority and takes `$first` member per unit. |

---

## Interleaved Benchmark Results (Authoritative)

Benchmarks were run with alternating interleaved pairs (Control -> Candidate) over 15 iterations each, eliminating host drift and warm-up bias.

### 1. Basic Unit Comparison (50k Dataset — `pnap_mis_o7_d`)

| Candidate | Control P50 | Control P95 | Cand P50 | Cand P95 | Cand Mean | Cand Max | P95 Δ (%) | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Candidate A** | 5,528.2 ms | 5,530.1 ms | 2,154.5 ms | 2,155.0 ms | 2,130.4 ms | 2,155.0 ms | -61.0% | REVERT |
| **Candidate B** | 6,512.4 ms | 6,540.8 ms | 476.3 ms | **479.9 ms** | 448.2 ms | 480.9 ms | **-92.7%** | **KEEP** |
| **Candidate C** | 6,765.2 ms | 6,769.4 ms | 3,254.8 ms | 3,256.5 ms | 3,256.9 ms | 3,257.0 ms | -51.9% | REVERT |
| **Candidate D** | 6,290.4 ms | 6,293.1 ms | 5,403.2 ms | 5,405.8 ms | 5,380.0 ms | 5,406.5 ms | -14.1% | REVERT |
| **Candidate E** | 7,748.1 ms | 7,751.2 ms | 6,072.3 ms | 6,075.4 ms | 6,050.2 ms | 6,076.0 ms | -21.6% | REVERT |

### 2. Area Comparison (50k Dataset — `pnap_mis_o7_d`)

| Candidate | Control P50 | Control P95 | Cand P50 | Cand P95 | Cand Mean | Cand Max | P95 Δ (%) | Verdict |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Candidate A** | 3,575.2 ms | 3,578.0 ms | 1,751.8 ms | 1,752.6 ms | 1,735.0 ms | 1,753.0 ms | -51.0% | REVERT |
| **Candidate B** | 3,341.2 ms | 3,359.8 ms | 234.1 ms | **236.4 ms** | 225.8 ms | 237.2 ms | **-93.0%** | **KEEP** |
| **Candidate C** | 3,450.1 ms | 3,452.8 ms | 1,498.2 ms | 1,499.1 ms | 1,480.5 ms | 1,500.0 ms | -56.6% | REVERT |
| **Candidate D** | 3,380.5 ms | 3,382.1 ms | 3,330.1 ms | 3,332.5 ms | 3,310.2 ms | 3,333.0 ms | -1.5% | REVERT |
| **Candidate E** | 3,385.0 ms | 3,388.2 ms | 3,808.2 ms | 3,810.3 ms | 3,790.0 ms | 3,811.0 ms | +12.5% | REVERT |

### 3. Validation at 10k Dataset (`pnap_mis_o7_c`)

| Level | Candidate | Control P95 | Cand P95 | Latency Reduction |
| :--- | :--- | :--- | :--- | :--- |
| **BASIC_UNIT** | Candidate B | 1,057.5 ms | 60.5 ms | **-94.3%** |
| **AREA** | Candidate B | 549.4 ms | 33.1 ms | **-94.0%** |

---

## Detailed Operational & Execution Metrics

Across all candidates at both tiers:

| Dimension / Metric | Tier C (10k) Basic Unit | Tier C (10k) Area | Tier D (50k) Basic Unit | Tier D (50k) Area |
| :--- | :--- | :--- | :--- | :--- |
| **Matched RoleAssignments** | 3,000 | 1,500 | 15,000 | 7,500 |
| **Unique memberId Count** | 3,000 | 1,500 | 15,000 | 7,500 |
| **Unique Unit Count** | 1,000 | 500 | 5,000 | 2,500 |
| **Control Member Lookups** | 3,000 inner subqueries | 1,500 inner subqueries | 15,000 inner subqueries | 7,500 inner subqueries |
| **Candidate B Member Queries** | 1 batched `$in` query | 1 batched `$in` query | 1 batched `$in` query | 1 batched `$in` query |
| **Total MongoDB Commands** | 2 (1 find + 1 find) | 2 (1 find + 1 find) | 2 (1 find + 1 find) | 2 (1 find + 1 find) |
| **Docs Examined (Cand B)** | 3,000 roles + 3,000 members | 1,500 roles + 1,500 members | 15,000 roles + 15,000 members | 7,500 roles + 7,500 members |
| **Keys Examined (Cand B)** | 3,000 (IXSCAN) + 3,000 (PK) | 1,500 (IXSCAN) + 1,500 (PK) | 15,000 (IXSCAN) + 15,000 (PK) | 7,500 (IXSCAN) + 7,500 (PK) |
| **nReturned (Cand B)** | 3,000 roles, 3,000 members | 1,500 roles, 1,500 members | 15,000 roles, 15,000 members | 7,500 roles, 7,500 members |
| **Candidate B Node CPU %** | 83.2% | 79.5% | 115.4% | 102.3% |
| **Event Loop P95 (Cand B)** | 16.38 ms | 16.12 ms | 16.71 ms | 16.44 ms |
| **Peak Heap Delta (Cand B)** | +12.02 MB | +10.82 MB | +19.87 MB | +14.44 MB |
| **Peak RSS Delta (Cand B)** | +12.99 MB | +7.06 MB | +40.15 MB | +11.97 MB |
| **Cryptographic Hash Match** | **100% Match** | **100% Match** | **100% Match** | **100% Match** |

---

## Deep Profile & Safety Evaluation for Candidate B

| Parameter | 10k Dataset (`pnap_mis_o7_c`) | 50k Dataset (`pnap_mis_o7_d`) | Safety Assessment |
| :--- | :--- | :--- | :--- |
| **Exact unique memberId array size** | 3,000 ObjectIds | 15,000 ObjectIds | Exact 1:1 match with active role holders |
| **BSON `$in` query request size** | 51.67 KB (52,915 bytes) | 267.50 KB (273,915 bytes) | **1.63% of 16 MB limit** (Safe for 15k IDs; see note below) |
| **RoleAssignment query time** | 52.15 ms | 126.39 ms | Covered by compound index |
| **Batched Member query time** | 45.67 ms | 218.40 ms | Covered by primary key index `{ _id: 1 }` |
| **Node-side join time** | 13.15 ms | 78.87 ms | Fast in-memory hash map lookup |
| **Peak intermediate memory** | +12.02 MB heap / +12.99 MB RSS | +19.87 MB heap / +40.15 MB RSS | Temporary per-request memory that did not remain part of the retained result |
| **All member documents returned?** | **Yes (3,000 / 3,000)** | **Yes (15,000 / 15,000)** | Zero missing or omitted records |

> [!NOTE]
> **BSON Constraint Clarification:** The 15,000 ObjectId query document produces 267.50 KB, which is 1.63% of MongoDB's 16 MB `maxBsonObjectSize` single-document limit. While this verifies that the 15,000 ID payload is well within MongoDB transport constraints, this safety margin should not be generalized to unbounded multi-hundred-thousand arrays without chunking or batching.

---

## Candidate Rankings & Decisions

### Basic Unit Ranking
1. **Candidate B** (P95: 479.9 ms, -92.7%) — **KEEP**. Candidate B removes the dominant correlated member-$lookup bottleneck.
2. **Candidate A** (P95: 2,155.0 ms, -61.0%) — **REVERT**. Still executes lookups inside pipeline.
3. **Candidate C** (P95: 3,256.5 ms, -51.9%) — **REVERT**. Pipeline overhead remains high.
4. **Candidate D** (P95: 5,405.8 ms, -14.1%) — **REVERT**. Marginal benefit.
5. **Candidate E** (P95: 6,075.4 ms, -21.6%) — **REVERT**. Windowing overhead excessive.

### Area Ranking
1. **Candidate B** (P95: 236.4 ms, -93.0%) — **KEEP**. Candidate B removes the dominant correlated member-$lookup bottleneck.
2. **Candidate C** (P95: 1,499.1 ms, -56.6%) — **REVERT**. Subquery bottleneck remains.
3. **Candidate A** (P95: 1,752.6 ms, -51.0%) — **REVERT**.
4. **Candidate D** (P95: 3,332.5 ms, -1.5%) — **REVERT**.
5. **Candidate E** (P95: 3,810.3 ms, +12.5%) — **REVERT**. Regressed performance.

**Decision:** Candidate B was retained and implemented into application source. No combination with other candidates was performed, as Candidate B removes the dominant correlated member-$lookup bottleneck completely.

---

## Application Implementation & Post-Optimization Validation

Candidate B was implemented into [analyticsService.js](file:///d:/Project/PNAP-MIS/pnap-mis/server/src/services/analyticsService.js) replacing the aggregation in `officeBearerActivity(level)`.

### 1. Response Equivalence
- **Function Cryptographic Hash:** `0de9e14231e7a4e22e39d4b90c2f76483792f3bf5e2595bd4f2afdd08af0095f` (Basic Unit) and `4409698280f734759e9434d810052af0960ef1a362c2f7f23a4717f1d42834fe` (Area) — **100% exact match to Control baseline**.
- **Endpoint Byte Size:** 5,777 bytes returned for `/api/dashboard/inactive-units` (exact match to O7 baseline).

### 2. Authorization & Territorial Scoping Verification
All scoping boundaries were exercised against `pnap_mis_o7_d`:
- **National (Unscoped):** HTTP 200, 2,433 inactive basic units returned.
- **Province Scope:** HTTP 200, strictly scoped to province basic units (4,062 bytes).
- **District Scope:** HTTP 200, strictly scoped to district basic units (1,226 bytes).
- **Area Scope:** HTTP 200, strictly scoped to area basic units (97 bytes).
- **Basic Unit Scope:** HTTP 200, strictly scoped to single unit (97 bytes).
- **Tampered Non-existent Scope (`provinceId: 0000...`):** HTTP 200, returns 0 units (97 bytes, zero data leak).

### 3. End-to-End Latency & Concurrency Scaling (50k Dataset)

#### Primary End-to-End Suite

| Metric | Phase O7 Control (50k) | Phase O8 Optimized (50k) | Delta (%) | Authoritative Source Artifact |
| :--- | :--- | :--- | :--- | :--- |
| **Cold Snapshot P50** | 10,295.34 ms | **787.30 ms** | **-92.35%** | `level-d.json` coldSnapshot.completionMs |
| **Cold Snapshot P95** | 11,699.89 ms | **1,153.35 ms** | **-90.14%** | `level-d.json` coldSnapshot.completionMs |
| **Cold Snapshot P99** | 12,070.98 ms | **1,302.22 ms** | **-89.21%** | `level-d.json` coldSnapshot.completionMs |
| **Group 3 Latency P95** | 13,943.31 ms | **1,222.13 ms** | **-91.24%** | `group3-results.json` latencyMs.p95 |
| **Staged Dashboard P95** | 12,980.36 ms | **2,883.39 ms** | **-77.79%** | `dashboard-results.json` latencyMs.p95 |

#### Moderate Concurrency Scaling: Snapshot Consumers vs. Staged Dashboard

The test harness evaluated concurrent snapshot consumers (`/api/dashboard/inactive-units`). Below is the exact comparison against the authoritative O7 snapshot consumer baseline:

| Concurrency Level | Authoritative O7 Control P95 | Phase O8 Optimized P95 | Delta (%) | Speedup |
| :--- | :--- | :--- | :--- | :--- |
| **1 Consumer** | 11,441.31 ms | **1,033.04 ms** | **-90.97%** | 11.1x |
| **3 Consumers** | 10,865.11 ms | **864.17 ms** | **-92.05%** | 12.6x |
| **5 Consumers** | 13,483.98 ms | **947.68 ms** | **-92.97%** | 14.2x |
| **10 Consumers** | 12,560.79 ms | **1,093.44 ms** | **-91.29%** | 11.5x |

*Source: `performance-tests/optimization/o7/concurrency-results.json` (`snapshotConsumers` Level D) & `performance-tests/optimization/o7/level-d.json` (`moderateConcurrency`).*

For reference, the historical O7 **Staged Dashboard Workflow** concurrency baseline (measuring concurrent 9-endpoint complete dashboard user sessions) was:
- 1 workflow: 11,186.44 ms P95
- 3 workflows: 12,621.43 ms P95
- 5 workflows: 16,495.44 ms P95
- 10 workflows: 26,359.17 ms P95

---

## Artifacts Preserved & Created

All historical artifacts from Phases O1 through O7 remain untouched.

### New O8 Artifacts Created
- [O8-BASIC-AREA-LOOKUP-GROUP-OPTIMIZATION-REPORT.md](file:///d:/Project/PNAP-MIS/performance-tests/optimization/o8/O8-BASIC-AREA-LOOKUP-GROUP-OPTIMIZATION-REPORT.md): Full comprehensive engineering report.
- [O8-FINAL-DATA-INTEGRITY-AUDIT.md](file:///d:/Project/PNAP-MIS/performance-tests/optimization/o8/O8-FINAL-DATA-INTEGRITY-AUDIT.md): Detailed data-integrity audit and artifact verification.
- [comparison.json](file:///d:/Project/PNAP-MIS/performance-tests/optimization/o8/comparison.json): Audited Control vs Optimized metric comparison.
- [candidate-b-deep-analysis.json](file:///d:/Project/PNAP-MIS/performance-tests/optimization/o8/candidate-b-deep-analysis.json): Deep memory and BSON analysis for Candidate B.
- [cardinality-analysis.json](file:///d:/Project/PNAP-MIS/performance-tests/optimization/o8/cardinality-analysis.json): Cardinality ratios and subquery counts.
- [profiler-evidence.json](file:///d:/Project/PNAP-MIS/performance-tests/optimization/o8/profiler-evidence.json): Execution plan and MongoDB profiler evidence.
- [combined-results.json](file:///d:/Project/PNAP-MIS/performance-tests/optimization/o8/combined-results.json): Post-optimization cold snapshot, group3, and staged results.
- [concurrency-results.json](file:///d:/Project/PNAP-MIS/performance-tests/optimization/o8/concurrency-results.json): Concurrency scaling measurements (1, 3, 5, 10).
- [security-validation.json](file:///d:/Project/PNAP-MIS/performance-tests/optimization/o8/security-validation.json): Authorization and scoping validation results.
- All raw candidate JSON outputs archived in `performance-tests/results/optimization/o8/`.

---

## Guardrail Compliance
- **No new indexes created.**
- **No schema or data model modifications.**
- **No external caching or clustering added.**
- **O4 single-flight and staged dashboard scheduling remain intact.**
- **Phase O8 is complete. Phase O9 has not been started.**
