# Phase O4 — Snapshot Request Coalescing & Dashboard Scheduling

## Executive Summary

O4 is **HIGHLY SUCCESSFUL**. A cold same-key burst reproducibly started three organization snapshot builds. A process-local in-flight Promise map reduced that to one, reduced Group-3 DB operations from 35 to 19 and office-bearer aggregations from 12 to 4, with equivalent responses, correct scope separation, successful failure recovery, and zero retained entries. Independently, critical-first widget scheduling reduced primary-usable P50/P95 from 227.93/433.53 ms to 133.02/207.57 ms without removing requests or increasing full completion.

## O3 Root Cause

O3 correctly identified a cold-cache race: summary, org-breakdown, and inactive-units could enter `orgSnapshot` before the completed-value cache was populated. Each then performed the same unit reads and four office-bearer aggregations.

## Current Snapshot Architecture

`orgSnapshot` is in `pnap-mis/server/src/services/analyticsService.js`. Its completed values remain in the existing process-local `cache` Map for 45 seconds, capped at 40 entries. The key is `org|from|to-or-now|provinceId|districtId|areaId|basicUnitId|memberStatus`. `invalidateCache()` still clears only the completed cache. Actual snapshot consumers are summary, org-breakdown (including province compatibility), and inactive-units. Membership, campaigns, and reports use the O2 `unitDirectory`; scope, meetings, and inactive-members do not use this snapshot.

## Before Cold-Miss Behavior

Fifteen cold trials each launched summary, org-breakdown, and inactive-units concurrently. Every trial started exactly three builds with maximum same-key concurrency three. Baseline P50/P95 was 156.25/335.75 ms in the initial proof and 183.95/297.66 ms in the authoritative interleaved control. The burst performed 35 DB operations and 12 office-bearer aggregations.

## Duplicate Build Evidence

The measured build count was 3, not an inference from latency. Temporary request/build instrumentation captured start/end, key, concurrency, cache behavior, and database commands, then was removed.

## Single-Flight Design

An `orgSnapshotInFlight` Map is checked with the complete existing snapshot key. The first caller stores the build Promise; matching callers await it. A `finally` block deletes the entry only when it still refers to that same Promise. Completed-value cache behavior remains inside the existing `cached()` function.

## Single-Flight Functional Validation

Normalized summary, org-breakdown, and inactive-units responses were equivalent across all current/control pairs. Success runs ended with map size zero.

## Cross-Scope Security Validation

Concurrent Province and District requests produced two builds and two distinct keys; their response hashes matched isolated requests. Central, Province, District, Area, Basic Unit, Central Admin, Member, unauthenticated, and tampered-scope behavior was exercised. No leakage or authorization regression was found.

## Failure Recovery

A controlled temporary diagnostic failure caused all three waiting callers to fail consistently. The entry was removed, and a subsequent healthy request rebuilt successfully. The failure hook and diagnostic exports were removed from application source.

## Cold Fan-Out Before/After

| Metric | Before | After | Change |
|---|---:|---:|---:|
| Group-3 P50 | 183.95 ms | 133.07 ms | -27.7% |
| Group-3 P95 | 297.66 ms | 180.56 ms | -39.3% |
| Snapshot builds | 3 | 1 | -66.7% |
| DB operations | 35 | 19 | -45.7% |
| Office-bearer aggregations | 12 | 4 | -66.7% |

Full-dashboard P50/P95 changed from 234.37/338.92 ms to 179.71/240.18 ms.

## Event-Loop Before/After

Interleaved Group-3 event-loop P95 changed from 31.49 to 19.07 ms. Full-fan-out P95 changed from 98.74 to 47.82 ms. These paired local controls are authoritative; O3's 24.02/56.60 ms values remain historical context.

## CPU Before/After

Group-3 Node CPU mean changed from 76.09% to 47.82%; host mean from 66.02% to 36.28%. Full-fan-out Node mean changed from 97.10% to 86.52%; host mean from 62.49% to 48.86%.

## Database Work Before/After

Group-3 exact DB work changed 35→19 operations and 12→4 shared office-bearer aggregations. Full fan-out changed from median 74→58 operations and 12→4 aggregations.

## Single-Flight KEEP/REVERT Decision

**KEEP.** Duplicate work was proven, work and latency decreased, output/security remained correct, failure retry worked, and entries did not persist.

## Widget Criticality Classification

Critical initial work is scope/breadcrumb, executive summary, and organization breakdown. Secondary work is membership, campaigns, meetings, reports, inactive units, inactive members, and unit-report downloads. Authentication, branding, notifications, and province filter data remain normal shell work.

## Staged Scheduling Experiment

After the single-flight decision, 15 alternating simultaneous/staged API trials were run. Secondary widgets begin as soon as all three primary requests settle; there is no timer or artificial delay. Request count (9), response bytes (23,135), DB operations (58), and normalized response hashes were unchanged.

## Initial Usability vs Full Completion

Primary P50/P95 improved from 227.93/433.53 ms to 133.02/207.57 ms. Full completion improved from 230.24/438.58 ms to 224.80/330.51 ms. Peak concurrency fell 9→6; event-loop P95 83.72→34.20 ms; Node CPU mean 105.47%→79.10%. **Staging: KEEP.**

## Final Dashboard State

The retained state is outcome A: single-flight KEEP and staging KEEP. The diagnostic dashboard group still makes all nine dashboard API requests, has zero duplicates within that group, returns 23,135 response bytes, and performs 58 DB operations with one snapshot build. Including unchanged shell calls, the established production page request set remains 13 requests, zero duplicates, 28,058 response bytes, and 36,033 transferred bytes.

## Functional Validation

All measured API hashes were equivalent, all secondary requests completed, and the Vite production build passed (213 modules). No diagnostic hooks remain. The final headless browser CDP connection stalled at `Network.enable` for both installed Chromium binaries, so O4 does not claim a new page-level browser timing sample; final timing uses the completed interleaved API fan-out/staging evidence, while page byte totals are the unchanged O3 validated totals.

## Authorization Validation

All tested organizational personas retained server-constrained filters. Different scope keys never shared an in-flight build. Unauthenticated requests remained rejected and Member dashboard denial remained unchanged.

## Limitations

This is local, single-process, non-production evidence on a small development dataset. CPU can exceed 100% across cores. The in-flight Map intentionally coalesces only within one Node process. A controlled failure hook was temporary. The browser CDP limitation above prevents presenting a fresh O4 page-level transferred-byte trace.

## O4 Classification

**HIGHLY SUCCESSFUL.** Both scoped changes produced independent, repeatable wins while preserving functionality and security.

## Recommendation for O5

If O5 is authorized later, focus on profiling the remaining independent full-fan-out MongoDB/Node work—especially membership payload/aggregation and inactive-unit query work—under representative data volume and concurrency. O5 was not started here.
