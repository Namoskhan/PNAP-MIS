# Phase O7 — Representative-Volume Snapshot Scalability Validation

## Executive Summary

O7 was completed against four local disposable databases. The classification is **VOLUME BOTTLENECK CONFIRMED**. Cold snapshot P95 rose from 268.914 ms at 500 members to 11699.895 ms at 50,000 synthetic member records. This is data-volume validation, not a concurrent-user capacity claim.

## Why O7 Was Required

O6 had only 325 role assignments and 384 members. O7 tests the retained O6 query shape unchanged at representative synthetic record volumes.

## Safety Validation

The source database was inspected read-only at 127.0.0.1 and retained 3 provinces, 9 districts, 24 areas, 48 basic units, 384 members, and 325 role assignments. The seed and harness abort on `pnap_mis`, require 127.0.0.1, and require an explicit `pnap_mis_o7_*` name. No application source, indexes, aggregation pipelines, authorization, cache technology, or data model were changed.

## Disposable Database

The four retained disposable databases are `pnap_mis_o7_a` through `pnap_mis_o7_d`. They were not dropped. Cleanup, only after explicit authorization: `mongosh mongodb://127.0.0.1:27017/admin --eval "['pnap_mis_o7_a','pnap_mis_o7_b','pnap_mis_o7_c','pnap_mis_o7_d'].forEach(n => db.getSiblingDB(n).dropDatabase())"`.

## Synthetic Dataset Design

The fixed seed `PNAP-O7-FIXED-SEED-2026` deterministically assigns ten members per basic unit, two basic units per area, three areas per district, and three districts per province (ceilings at boundaries). Three approved, unended officer assignments are created per unit at every tested level. Only users, hierarchy, members, and role assignments were seeded because the snapshot and selected dashboard endpoints tolerate empty unrelated activity collections. Names, CNICs, phones, emails, and IDs are synthetic.

## Volume Tiers

| Level | Members | Roles | Province/District/Area/Basic | Data bytes | Index bytes | Storage bytes |
| --- | --- | --- | --- | --- | --- | --- |
| A | 500 | 261 | 3/9/25/50 | 251808 | 716800 | 188416 |
| B | 5000 | 2586 | 28/84/250/500 | 2521173 | 1368064 | 868352 |
| C | 10000 | 5169 | 56/167/500/1000 | 5044135 | 2146304 | 1761280 |
| D | 50000 | 25836 | 278/834/2500/5000 | 25320323 | 8437760 | 8646656 |

## Data Integrity Validation

All four tiers passed reference, unit-level, required-role-code, orphan, and duplicate-identifier checks. See `data-integrity.json`.

## Current Retained Application State

The retained O4 single-flight and staged scheduling, O2 request reductions, O5 membership facet, and all four independent O6 aggregations were exercised unchanged.

## Cold Snapshot Scaling

| Level | Members | P50 ms | P95 ms | P99 ms | Mean DB ops | Node CPU mean % | EL P95 mean ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | 500 | 143.574 | 268.914 | 366.586 | 9 | 31.963 | 17.69 |
| B | 5000 | 2550.842 | 5077.8 | 5804.078 | 13 | 8.877 | 25.929 |
| C | 10000 | 3738.35 | 4355.159 | 4638.733 | 15 | 8.653 | 21.107 |
| D | 50000 | 10295.345 | 11699.895 | 12070.977 | 29 | 9.409 | 16.349 |

## Role Aggregation Scaling

| Level | Tier | Docs Examined | Keys Examined | DB Time ms | nReturned |
| --- | --- | --- | --- | --- | --- |
| A | BASIC_UNIT | 150 | 150 | 117 | 150 |
| A | AREA | 75 | 75 | 42 | 75 |
| A | DISTRICT | 27 | 27 | 17 | 27 |
| A | PROVINCE | 9 | 9 | 7 | 9 |
| B | BASIC_UNIT | 1500 | 1500 | 1985 | 1500 |
| B | AREA | 750 | 750 | 930 | 750 |
| B | DISTRICT | 252 | 252 | 588 | 252 |
| B | PROVINCE | 84 | 84 | 152 | 84 |
| C | BASIC_UNIT | 3000 | 3000 | 1895 | 3000 |
| C | AREA | 1500 | 1500 | 903 | 1500 |
| C | DISTRICT | 501 | 501 | 320 | 501 |
| C | PROVINCE | 168 | 168 | 104 | 168 |
| D | BASIC_UNIT | 15000 | 15000 | 11050 | 15000 |
| D | AREA | 7500 | 7500 | 6570 | 7500 |
| D | DISTRICT | 2502 | 2502 | 1746 | 2502 |
| D | PROVINCE | 834 | 834 | 608 | 834 |

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

| Level | Members | P50 ms | P95 ms | P99 ms | Mean DB ops | Node CPU mean % | EL P95 mean ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | 500 | 208.791 | 245.263 | 251.744 | 19 | 47.758 | 18.382 |
| B | 5000 | 2064.94 | 3392.186 | 4241.31 | 23 | 12.832 | 24.379 |
| C | 10000 | 2071.116 | 2167.804 | 2186.634 | 25 | 11.082 | 16.152 |
| D | 50000 | 10681.864 | 13943.312 | 14865.165 | 40 | 9.164 | 16.798 |

## Full Dashboard Scaling

| Level | Members | P50 ms | P95 ms | P99 ms | Mean DB ops | Node CPU mean % | EL P95 mean ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | 500 | 304.76 | 432.587 | 463.292 | 56 | 58.784 | 33.718 |
| B | 5000 | 1865.675 | 3293.342 | 3930.753 | 66 | 18.919 | 35.961 |
| C | 10000 | 2226.485 | 2272.694 | 2279.417 | 71 | 17.184 | 16.687 |
| D | 50000 | 11806.474 | 12980.364 | 13090.987 | 107 | 17.391 | 17.15 |

## Moderate Concurrency × Volume

The controlled check ran 1/3/5/10 complete retained staged dashboard workflows at 5k, 10k, and 50k, with three repetitions per cell. At 50k, P95 rose from 11186.444 ms for one workflow to 26359.167 ms for ten. Every tested wave returned HTTP 200 and executed exactly four role aggregations, confirming one snapshot build despite rising non-snapshot DB operations and payload processing. Separate same-key snapshot-consumer evidence is also retained in `concurrency-results.json`.

## Event-Loop Scaling

Event-loop P95, Node CPU, RSS, host CPU, and available RAM are recorded per scenario in `event-loop-results.json` and `resource-results.json`. The local short samples are noisy and are not treated as proof of CPU saturation.

## Node Resource Scaling

Node process CPU did not independently establish saturation; the latency and explain evidence instead track the increasing role-assignment lookup/group workload. MongoDB working-set and CPU measurements were not reliably available locally, while database sizes and query execution evidence were captured.

## MongoDB Explain Plans

All 16 explains used IXSCAN on `unitLevel_1`; no COLLSCAN and no blocking SORT appeared. Exact plans and execution statistics are in `explain-by-volume.json`.

## First Meaningful Degradation

Meaningful degradation first appears at level B (5,000 members): cold snapshot P95 increases from 268.914 ms to 5077.8 ms. Level-C values are lower than B for several metrics, demonstrating local run variance; no smooth trend was fabricated. Level D is unambiguously slower at 11699.895 ms cold P95.

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
