# Phase O6 — Role-Assignment Snapshot Aggregation Optimization

## Executive Summary

O6 is **NO MATERIAL IMPROVEMENT**. The four pipelines have high structural overlap, but the retained implementation already applies its match before lookup, projects only required joined member fields, uses indexes without blocking sorts, and executes independent tiers in parallel. Early projection did not reduce DB operations and regressed tails. One-command shared-base consolidation reduced snapshot DB operations 9→6, role aggregations 4→1, and CPU, but materially regressed cold snapshot and Group-3 latency; it was reverted. Final application source remains the O5-retained state.

## Environment

Local development only: Node v24.11.0, MongoDB 8.2.5, `127.0.0.1:27017/pnap_mis`, dbPath `D:\MongoDB\data`, database disk D:, 8 logical processors, 8 GiB RAM. Normal ports are backend 5000/frontend 5173; tests used ephemeral localhost Express ports serving the production Vite build.

## O5 Retained State

O5’s combined membership facet remains retained. O4 single-flight and critical-first dashboard scheduling were not altered. Existing O2/O4/O5 worktree changes were preserved.

## O6 Baseline

Thirty cold snapshot samples, 30 Group-3 samples, and 15 staged-dashboard samples formed the O6 local baseline. Cold snapshot P50/P95/P99 was 108.91/189.65/380.75 ms, nine request-level DB operations and four role aggregations. Group-3 P50/P95 was 151.75/245.60 ms with 19 operations. Dashboard P50/P95 was 262.66/344.76 ms with 56 operations and 23,135 bytes. Error rate was zero.

## Snapshot Aggregation Map

The snapshot runs four parallel projected lean unit reads, followed by four parallel role-assignment aggregations for Basic Unit, Area, District, and Province. Each role pipeline is `$match` → member `$lookup` with inner match/project → `$unwind` → `$group`. Node chooses the highest-priority officer and decorates the corresponding unit list.

## Role-Assignment Aggregation Evidence

Current diagnostic executionStats replays were: Basic Unit 61 ms/46 groups, Area 42 ms/24 groups, District 12 ms/8 groups, Province 4 ms/2 groups. Basic Unit remained slowest. The four pipelines examined 262 documents and 298 keys in total.

## Explain-Plan Findings

All source plans showed `IXSCAN` plus `FETCH`/simple projection, no `COLLSCAN`, and no `SORT`. Docs/keys examined were Basic Unit 139/139, Area 73/105, District 43/43, Province 7/11. The dominant work is the per-assignment member lookup and grouped officer construction, proportional to tier size; stage-level milliseconds were not exposed separately by this explain form.

## Aggregation Overlap

Overlap is high for collection, approved/unended predicate, lookup collection/fields, unwind, and group payload. Unit-level predicates are disjoint. Three tiers share the secretary role set; Province uses president/general/finance. This makes combination semantically possible but not automatically faster.

## Candidate Optimizations

Candidate A inserted an early source projection after the already-first match. Candidate B evaluated moving matches earlier and found no legal earlier position. Candidate C combined the disjoint level/role predicates into one `$or` aggregation grouped by `{level, unitId}`. Existing `Promise.all` parallelism was retained as the control.

## Candidate A Results

Exact responses matched. DB operations stayed 9 and role aggregations stayed 4. Snapshot P50 improved 119.68→105.98 ms, but P95 regressed 203.28→256.68 ms. Group-3 P50/P95 regressed 106.76/155.78→108.37/177.92 ms. Although dashboard P95 improved in that block, the core cold paths regressed with no work reduction. **REVERT.**

## Candidate B Results

Both the outer RoleAssignment match and inner member-ID match are already first in their pipelines. No change was implemented; the existing match placement is retained.

## Candidate C Results

Exact responses matched. Snapshot operations fell 9→6 and role aggregations 4→1; Node CPU mean fell 27.45%→13.72%. However snapshot P50/P95 regressed 82.61/117.18→152.00/204.43 ms, and Group-3 P50/P95 regressed 106.31/199.93→168.89/270.15 ms. Dashboard P50 also regressed 222.81→306.51 ms. **REVERT.**

## MongoDB Work Before/After

The retained state remains nine cold request-level operations, including four role aggregations. Separate explains examined 262 documents/298 keys. The rejected combined command examined 241 documents/299 keys in 97 ms and returned 80 groups. Its modest document reduction did not compensate for losing parallelism.

## Node/Event-Loop Before/After

Combined snapshot CPU fell by roughly half, but event-loop P95 rose 16.05→19.91 ms and latency materially regressed. Early projection reduced some CPU/event-loop samples but had unstable tail regressions. Since neither candidate was retained, final causal before/after is unchanged.

## Cold Snapshot Before/After

No candidate was retained. The initial block measured 108.91/189.65/380.75 ms P50/P95/P99; the final identical-code block measured 55.83/70.04/147.06 ms. This large improvement is time-order/host variance, not an O6 code benefit.

## Group-3 Before/After

Initial/final identical-code blocks measured 151.75/245.60 ms and 75.10/126.55 ms P50/P95. Candidate decisions instead use paired controls: both projection and consolidation worsened Group-3 P95.

## Full Dashboard Before/After

Initial/final identical-code blocks measured 262.66/344.76 ms and 173.10/295.69 ms P50/P95, with the same 56 operations, four role aggregations, nine dashboard requests, and 23,135 response bytes. No O6 improvement is claimed from block drift.

## Functional Equivalence

Every candidate snapshot, Group-3, and dashboard response hash/shape matched its paired control. After reversion, the production Vite build passed and no O6 diagnostic hook remained in application source.

## Authorization Validation

Central, Province, District, Area, Basic Unit, Central Admin, Member, unauthenticated, tampered-scope, and concurrent different-scope tests passed. Database fingerprints were unchanged.

## KEEP / REVERT Decisions

Early project: REVERT. Existing early match: KEEP unchanged. Shared-base aggregation: REVERT. Existing four-way `Promise.all`: KEEP unchanged.

## Remaining Bottlenecks

Basic-unit and Area member lookups/grouping remain the largest snapshot operations. Their cost scales with active key-role assignments and joined members.

## Large-Volume Limitations

The local database contains only 325 role assignments and 384 members (3 provinces, 9 districts, 24 areas, 48 basic units). It is insufficient for production scaling conclusions. No disposable high-volume fixture was available and permanent data was not altered. **LARGE-VOLUME VALIDATION PENDING.** Potential index questions are deferred; no index was added or tested in O6.

## O6 Classification

**NO MATERIAL IMPROVEMENT.** Two safe candidates were measured and correctly reverted because reduced command/CPU work did not translate into acceptable cold-path latency.

## Recommendation for O7

If separately authorized, O7 should build a disposable representative-volume dataset and validate lookup/group behavior and concurrency there before considering query-shape, index, or data-model work. O7 was not started.
