# Phase O3 — Dashboard Latency & Local Contention Analysis

## Executive Summary

The O2 dashboard regression was not reproducible under interleaving. The unchanged retained code produced a final browser P50/P95 of 833.36/993.22 ms versus O2’s regressed 1,727.83/2,201.16 ms. Fixed current/control fan-out was close (current 225.67/281.54 ms; summary-count control 220.18/290.18 ms).

The remaining latency is attributable to cold dashboard fan-out plus host variance. Summary, org-breakdown and inactive-units share an expensive organization snapshot. Concurrent cache misses can each start that build before the pre-existing cache is populated. At Group 3, event-loop P95 rose from ~16 to 24 ms and host CPU averaged 66.6%; full fan-out reached 56.6 ms event-loop P95. No caching behavior was changed. Classification: **ROOT CAUSE IDENTIFIED**.

## O2 Regression Being Investigated

O2 final completion was 1,727.83 ms P50 / 2,201.16 ms P95, despite deterministic reductions to 13 requests, zero duplicates and 80 median DB operations. Several unchanged endpoints regressed simultaneously, suggesting block-order drift.

## Environment

- Local development only: `127.0.0.1`; MongoDB `127.0.0.1:27017/pnap_mis`, dbPath `D:\MongoDB\data`.
- MongoDB 8.2.5; Node v24.11.0; 8 logical CPUs, Intel i5-8365U.
- 8.39 GB RAM; only ~1.13 GB was initially free. Approximately 69.6 GB disk was free.
- Backend/frontend used ephemeral local Express ports and the production Vite build.

## Diagnostic Methodology

All nine APIs received 3 warmups and 30 measurements at 1 VU. State comparisons alternated current/control in one process. Fan-out groups used 15 samples; dashboard current/control used 10 alternating cycles. `monitorEventLoopDelay`, process CPU/RSS, host CPU/free RAM, query signatures/counts, and MongoDB `executionStats` were captured. Database fingerprints were unchanged.

## Interleaved Measurement Design

States changed one variable: S1 restored summary count; S2 hydrated unit-directory results; S3 made its four reads sequential. Date filters were fixed to the O2 baseline window in the authoritative suspect-endpoint comparison. Temporary switches were removed afterward.

## Endpoint Variance

Reproduction P95 was summary 215.42 ms, org-breakdown 202.57 ms, inactive-units 108.58 ms. CVs were 30.5%, 21.4%, and 10.1%. Later interleaved values were lower, confirming significant time-order variance.

## Summary Analysis

Fixed current/control P95 was 177.38/151.64 ms, but means were 118.25/120.62 and medians 109.52/116.34 ms. Dashboard fan-out P95 slightly favored current. The removed count did not cause a consistent regression; its latency effect is inconclusive, while its one-operation reduction is deterministic.

## Org-Breakdown Analysis

Current/control P95 was 143.62/137.56 ms; this endpoint is unaffected by S1 and response semantics matched. Its variation therefore measures residual host/order noise, not an O2 code effect.

## Inactive-Units Analysis

Current/control P95 was 109.46/100.53 ms with identical query shapes and responses. Its larger O2 value did not reproduce; its steady CV was about 10%.

## MongoDB vs Node Time

MongoDB explains showed the shared office-bearer aggregations at up to 90, 64, 20 and 7 ms, while small unit reads were 0–1 ms. Member/activity queries were generally 1–11 ms. MongoDB therefore explains much of the suspect endpoints’ isolated floor; Node scheduling and duplicated cold work amplify it under fan-out.

## Event-Loop Results

Event-loop P95: isolated summary 31.14 ms, org-breakdown 18.76 ms, inactive-units 16.09 ms. Group 1/2 stayed near 16 ms, Group 3 reached 24.02 ms, and full fan-out reached 56.60 ms.

## CPU / Memory Results

Mean Node CPU was 37.94% for isolated summary, 23.36% org-breakdown, and 22.72% inactive-units. Full fan-out averaged 80.42% process CPU and 62.37% host CPU; its P95 host CPU reached 80.71%. Node RSS grew to roughly 320 MB during full fan-out. Low initial free host RAM increased contention risk.

## Isolated vs Concurrent Behavior

Membership, campaigns, reports, meetings, scope and inactive-members were fast alone but slowed during full concurrent browser loading. Summary/org/inactive-units also contend through repeated cold snapshot work.

## Dashboard Fan-Out Experiment

| Group | Completion P50/P95 | Event-loop P95 | Host CPU mean |
|---|---:|---:|---:|
| Summary | 102.42 / 117.65 ms | 16.20 ms | 37.1% |
| + org-breakdown | 142.12 / 162.00 ms | 16.14 ms | 55.7% |
| + inactive-units | 157.82 / 164.74 ms | 24.02 ms | 66.6% |
| Full dashboard | 227.12 / 309.83 ms | 56.60 ms | 62.4% |

Contention becomes visible at Group 3 and materially worsens at full fan-out.

## Promise.all Experiment

Parallel reads beat sequential P95 for membership (19.37 vs 21.41 ms), campaigns (18.84 vs 23.74 ms), and reports (15.06 vs 31.71 ms), with equal responses. **KEEP**.

## .lean() Experiment

Lean beat hydrated P95 for membership (31.74 vs 61.64 ms), campaigns (22.75 vs 24.12 ms), and reports (15.26 vs 17.03 ms), with equal responses. **KEEP**.

## O2 Optimization Attribution

Province dedup, lean, parallel reads and unused-aggregation removal are beneficial. Summary dedup did not cause a consistent regression. No O2 optimization explains the block-wide latency spike.

## Final KEEP / REVERT Decisions

All five retained O2 changes remain. Summary latency magnitude is inconclusive, but the change stays because it removes proven duplicate work without semantic, security, median, mean or dashboard-P95 harm.

## Final Dashboard Performance

Five production-browser captures: 13 requests, zero duplicates, 28,058 response bytes, 36,033 transferred bytes, 80 median DB operations, completion 833.36 ms P50 / 993.22 ms P95. No console/API errors occurred.

## Functional Validation

Baseline response hashes/shapes matched; dashboard DOM/widgets/filters/navigation remained valid; database/O1 state was unchanged.

## Authorization Validation

Unauthenticated, Central, Province, District, Area, Basic Unit, Central Admin, Member and tampered-scope checks passed. No widening occurred.

## Remaining Bottlenecks

Cold concurrent callers duplicate the expensive office-bearer snapshot build before the existing cache is populated. Full dashboard fan-out also creates measurable event-loop and CPU contention. This is the strongest remaining evidence.

## Limitations

Local-host results remain sensitive to background load and limited RAM. MongoDB explains are single executions and do not reproduce concurrency. Browser and API fan-out completion use different timing boundaries. No production or broad load suite was run.

## O3 Classification

**ROOT CAUSE IDENTIFIED** — the O2 regression was variance-dominated; remaining latency is cold shared-work fan-out plus local CPU/event-loop contention, not a retained O2 regression.

## Recommendation for O4

If authorized, isolate request-coalescing/single-flight behavior for the existing organization snapshot and test staged widget scheduling under controlled interleaving. Do not add indexes, new persistent caching, clustering or bundle work without explicit later-phase scope.
