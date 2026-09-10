# Phase O5 — Membership & Inactive-Unit Query Optimization

## Executive Summary

O5 is **SUCCESSFUL**. Membership’s three scans of the same matched roster were combined into one `$facet`: membership DB operations fell 8→6, diagnostic member scans fell 3→1, exact responses remained equivalent, and interleaved membership P95 improved 19.21→18.42 ms with P99 89.23→27.15 ms. Staged-dashboard operations fell 58→56 and interleaved P95 improved 162.07→130.41 ms. Inactive-units required no safe change because it adds no query after reusing O4’s snapshot.

## Environment

Local development only: Node v24.11.0, MongoDB 8.2.5, `127.0.0.1:27017/pnap_mis`, dbPath `D:\MongoDB\data`, database disk D:, 8 logical processors, 8 GiB RAM. Normal ports are backend 5000/frontend 5173; tests used ephemeral localhost Express ports serving the production Vite build.

## O4 Baseline State

O4 single-flight and critical-first scheduling were left unchanged. Snapshot coalescing still produces one same-key build, and secondary widgets still begin after summary, scope, and org-breakdown settle.

## O5 Baseline

Thirty cold isolated samples per endpoint and 15 staged-dashboard samples were captured before O5 changes. Baseline membership P50/P95/P99 was 14.12/24.96/177.31 ms, 9,670 bytes, eight DB operations. Inactive-units was 41.35/60.64/65.31 ms, 874 bytes, nine cold DB operations. Dashboard P50/P95 was 103.09/131.68 ms with 58 operations. Interleaved control values are authoritative for the candidate decision because the baseline’s first-run tail showed host/JIT drift.

## Membership Query Map

Route and middleware lead through the thin controller to `membershipAnalytics`. Baseline work comprised authentication, three member aggregations, and four parallel lean unit-directory finds. Node joins counts to every unit, sorts tiers, fills months, and serializes the result.

## Membership Payload Analysis

Of the 9,670-byte response, `byLevel` contributes 8,914 bytes (3 province, 9 district, 24 area, 48 basic-unit rows), trend 591 bytes, totals 57 bytes, and levels 43 bytes. All top-level fields are used by `MembershipAnalytics`. Row `_id` is not read by the frontend, but it was retained for exact API compatibility.

## Membership Bottlenecks

Three member aggregation commands independently examined the same 384-document roster: totals, tier breakdowns, and trend. ExecutionStats replays reported 8, 4, and 4 ms respectively. Payload size is dominated by required switchable tier data, not internal fields.

## Membership Candidates

The evidence-supported candidate combined totals, trend, and dynamic tier groups into one `$facet`. Removal of row IDs was evaluated from frontend usage but not applied. No cache, index, populate, lookup, or new parallelism was added.

## Membership Before/After

Authoritative 30-pair interleaved results: P50 11.03→10.82 ms, P95 19.21→18.42 ms, P99 89.23→27.15 ms, mean 15.16→12.23 ms. DB operations were deterministically 8→6 and response bytes remained 9,670.

## Inactive-Units Query Map

Cold inactive-units awaits `orgSnapshot`, then performs only in-memory name-map construction, status filtering, stable inactivity sorting, slicing, and response mapping. Under O4 staging its snapshot is already populated by primary widgets.

## Inactive-Units Bottlenecks

The measured cost is the shared snapshot’s four role-assignment aggregations, not an inactive-unit query. Diagnostic replay maxima were approximately 74, 35, 11, and 5 ms in the baseline capture; these operations are already single-flighted by O4.

## Inactive-Units Candidates

No candidate met the evidence threshold. Snapshot changes were outside O5’s intent and would reopen O4. The small in-memory maps and sort are required for path columns, ordering, and pagination.

## Inactive-Units Before/After

No code changed. Independent local runs observed P50/P95/P99 41.35/60.64/65.31 ms before and 40.52/48.95/53.30 ms afterward; this is host variance, not an O5 optimization. Bytes remained 874 and cold operations remained nine.

## MongoDB vs Node Time

Membership diagnostic critical-path replay changed approximately 8→4 ms. Against interleaved means, the residual request/Node/network portion is approximately 7.16→8.23 ms; it is a subtraction estimate, not direct serialization timing. Inactive-unit replay timings varied between runs while its code and command shapes remained identical, so no causal MongoDB/Node improvement is claimed.

## Payload Before/After

Membership remained 9,670 bytes and inactive-units 874 bytes. No functionality was dropped to manufacture a payload win.

## DB Work Before/After

Membership operations: 8→6. Staged dashboard: 58→56. Inactive-units cold: 9→9. Member roster aggregation scans: 3→1.

## Event-Loop Before/After

Interleaved membership event-loop P95 was 6.19→6.26 ms (effectively unchanged). Staged dashboard improved 19.61→15.69 ms. Unchanged inactive-unit independent measurements were 15.64→16.07 ms.

## CPU Before/After

Membership mean CPU was 133.67%→149.30% in very short interleaved samples, where timer granularity makes percentages noisy. Staged mean was 82.81%→86.92%, a small regression; host mean improved 38.94%→34.13%. This is reported rather than attributed away.

## Fan-Out Validation

Fifteen interleaved staged-dashboard pairs retained identical response hashes and bytes. P50/P95 improved 102.73/162.07→97.28/130.41 ms and DB work fell 58→56, with no request removal.

## Functional Validation

Exact membership and complete dashboard response hashes/shapes matched control. Inactive-unit set, ordering, filters, scope, labels, page, and limit were untouched. Production Vite build passed.

## Authorization Validation

Central, Province, District, Area, Basic Unit, Central Admin, Member, unauthenticated, and tampered-scope cases passed. Database fingerprints were unchanged.

## KEEP / REVERT Decisions

KEEP combined membership `$facet`. REVERT/not apply membership row-ID removal and inactive-unit rewrites.

## Remaining Bottlenecks

Cold inactive-unit latency remains dominated by the shared organization snapshot’s role-assignment activity aggregations. Membership’s remaining response size is required multi-tier data.

## Limitations

Local single-process development dataset only; no stress, spike, soak, 50k, or scalability run. CPU measurements on short requests are noisy. ExecutionStats are diagnostic replays and do not equal parallel application wall time. No index changes were tested.

## O5 Classification

**SUCCESSFUL**: deterministic DB-work reduction and improved interleaved tails without functional/security change, tempered by modest CPU noise/regression and no safe inactive-unit change.

## Recommendation for O6

If separately authorized, O6 should validate the remaining role-assignment snapshot aggregations at representative production-like volume/concurrency and determine whether query-shape or data-model changes are warranted. O6 was not started.
