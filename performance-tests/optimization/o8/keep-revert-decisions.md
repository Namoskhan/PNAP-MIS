# Phase O8 Keep / Revert Decisions

## Summary of Decisions

| Candidate | Category | Basic Unit 50k P95 | Area 50k P95 | Response Equivalence | Decision | Rationale |
|---|---|---|---|---|---|---|
| **Candidate B** | Two-step query (Node join) | **479.9 ms** (-92.7%) | **236.4 ms** (-93.0%) | 100% Exact Match | **KEEP** | Decisive winner. Reduces DB round-trip pipeline complexity from 15,000 lookup subqueries to 1 indexed scan + 1 batched primary-key `$in` seek. Fast, bounded memory, zero regressions. |
| **Candidate A** | Pre-group before lookup | **2,155.0 ms** (-61.0%) | **1,752.6 ms** (-51.0%) | 100% Exact Match | **REVERT** | Reduces lookup calls from 15,000 to 5,000 units, but still relies on expensive server-side aggregation pipelines and is 4.5x slower than Candidate B. |
| **Candidate C** | Lookup after reducing cardinality | **3,256.5 ms** (-51.9%) | **1,499.1 ms** (-56.1%) | 100% Exact Match | **REVERT** | Adds sorting and priority calculation stages before lookup; outperformed by Candidate A and vastly outperformed by Candidate B. |
| **Candidate D** | Smaller group payload | **5,405.8 ms** (-14.1%) | **3,332.5 ms** (-8.1%) | 100% Exact Match | **REVERT** | Minor savings. The primary bottleneck is the 15,000 correlated lookup subqueries, not accumulator payload size. |
| **Candidate E** | Window / Top-N style ($top) | **6,075.4 ms** (-21.6%) | **3,810.3 ms** (+12.5% regression) | 100% Exact Match | **REVERT** | Causes regressions at 10k (+12.3%) and 50k Area (+12.5%) due to `$addFields` and `$top` operator sorting overhead. |
| **Candidate F** | Narrow lookup projection | N/A | N/A | Exact | **SKIPPED** | Verified that current projection `{ fullName: 1, memberId: 1, phone: 1, lastActivityAt: 1 }` is already minimal. |

## Detailed Candidate Evaluation

### Candidate B (Two-Step Query with Node Join) — KEEP
- **Mechanism**:
  1. `RoleAssignment.find({ unitLevel, roleCode: { $in: codes }, state: 'APPROVED', endedAt: { $exists: false } }).select('unitId memberId roleCode').lean()`
  2. Extract unique `memberId` array in Node.
  3. `Member.find({ _id: { $in: memberIds } }).select('fullName memberId phone lastActivityAt').lean()`
  4. Perform in-memory hash join in Node to group by unit and select responsible officer based on `OFFICER_PRIORITY`.
- **Results**:
  - 10k Basic Unit: 1,057.5 ms -> 60.5 ms (-94.3%)
  - 10k Area: 549.4 ms -> 33.1 ms (-94.0%)
  - 50k Basic Unit: 6,540.8 ms -> 479.9 ms (-92.7%)
  - 50k Area: 3,359.8 ms -> 236.4 ms (-93.0%)
- **Safety**:
  - 50k Basic Unit BSON `$in` query size is 267.5 KB (1.63% of the 16 MB MongoDB limit).
  - Peak heap delta is ~19.87 MB during join and immediately collected.
  - 100% of required member documents returned.
  - Event loop delay is completely unimpacted (~14-16 ms).

### Implementation Plan
Implement Candidate B directly inside `officeBearerActivity(level)` in `pnap-mis/server/src/services/analyticsService.js`.
No other candidate will be combined since Candidate B completely replaces the aggregation pipeline and provides the maximum possible query optimization without data model changes.
