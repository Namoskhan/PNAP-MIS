# Phase O2 — Dashboard & API Performance Optimization

## 1. Executive Summary

The Executive Command Center loaded 16 API requests across 13 endpoints. Four identical province requests caused three duplicates; membership, campaigns and reports each performed four unused office-bearer aggregations; summary separately counted a roster already partitioned by its status aggregation.

O2 reduced the load to 13 requests with no duplicates, response bytes from 30,386 to 28,058, transferred bytes from 40,200 to 36,033, and median database operations from 99 to 80. Membership, campaign and report P95 improved materially. Dashboard completion P50 regressed from 922.56 ms to 1,727.83 ms amid broad local-run variance. Functionality and authorization remained identical. Result: **MIXED**.

## 2. Environment

- Local/non-production production Vite build served by Express on ephemeral `127.0.0.1` ports.
- MongoDB `127.0.0.1:27017/pnap_mis`; dbPath `D:\MongoDB\data`.
- 40 collections, 4,255 objects; document and index fingerprints unchanged.
- 151.20 GB filesystem, 81.58 GB used, about 69.62 GB available; Node v24.11.0.

## 3. Evidence Used

All surviving `performance-tests` evidence was inspected, including O1 recovery/validation and historical scalability/volume/dashboard artifacts. O2 used a labelled current local baseline. O1 was hash-checked on every candidate.

## 4. Dashboard Request Map

`dashboard-request-map.md` contains the full component→route→middleware→controller→service→query inventory. Analyzed: `DashboardPage` / `CommandCenter`, `AnalyticsFilters`, membership, campaign, meeting and report analytics, downloads, inactive tables, and shell contexts/components.

## 5. Pre-Optimization Baseline

Method: 1 VU, two warmups, 20 iterations per API and five production browser captures with HTTP cache disabled and analytics cache invalidated before each measurement.

| Metric | Before |
|---|---:|
| Requests / unique / duplicates | 16 / 13 / 3 |
| Response / transferred bytes | 30,386 / 40,200 |
| Completion P50 / P95 | 922.56 / 1,323.04 ms |
| DB operations P50 | 99 |

## 6. Problems Identified

- `/api/org/provinces` fetched four times: twice by `UnitContext`, once by each of two children.
- Three endpoints used `orgSnapshot` only for labels, triggering 12 unused role-assignment/member `$lookup` aggregations.
- Summary duplicated a member count covered by `byStatus`.
- Production captures showed no StrictMode-only duplication.

## 7. Optimization Proposals

See `optimization-proposals.md`. Only OPT-02 through OPT-04 application changes were implemented. Giant endpoint consolidation, new caching, React Query and index changes were rejected.

## 8. Changes Implemented

- Reused `UnitContext.provinces` and loaded it once per authenticated session.
- Added scoped, projected, read-only `.lean()` `unitDirectory(f)` for endpoints not consuming officer activity.
- Derived summary total from `byStatus`.
- Hardened only the O2 measurement harness for Windows CDP reliability.

## 9. Changes Reverted

The first province-dedup attempt lacked a `useRef` import and failed the dashboard gate. It was corrected and rerun. Failed and incomplete evidence remains labelled; no retained application optimization was reverted.

## 10. API Before/After Results

| Endpoint | Before P95 | After P95 | Change | Result |
|---|---:|---:|---:|---|
| summary | 73.63 | 229.28 ms | +211.42% | REGRESSED |
| scope | 4.94 | 10.09 ms | +104.48% | REGRESSED |
| org-breakdown | 54.31 | 188.90 ms | +247.82% | REGRESSED |
| membership | 57.35 | 27.59 ms | -51.88% | IMPROVED |
| campaigns | 89.47 | 19.67 ms | -78.02% | IMPROVED |
| meetings | 13.06 | 19.41 ms | +48.62% | REGRESSED |
| reports | 55.08 | 19.56 ms | -64.50% | IMPROVED |
| inactive-units | 87.22 | 186.77 ms | +114.15% | REGRESSED |
| inactive-members | 12.70 | 17.84 ms | +40.49% | REGRESSED |

All error rates were 0%. Candidate B P95 for membership/campaigns/reports was 35.54/41.20/28.17 ms. Candidate C reduced summary operations 16→15 and Candidate-B→C summary P95 255.80→171.42 ms. Final absolute regressions are not hidden.

## 11. Dashboard Network Before/After

| Metric | Before | After | Change | Result |
|---|---:|---:|---:|---|
| Requests | 16 | 13 | -3 | IMPROVED |
| Unique endpoints | 13 | 13 | 0 | UNCHANGED |
| Duplicates | 3 | 0 | -3 | IMPROVED |
| Response bytes | 30,386 | 28,058 | -7.66% | IMPROVED |
| Transferred bytes | 40,200 | 36,033 | -10.37% | IMPROVED |
| Completion P50 | 922.56 ms | 1,727.83 ms | +87.29% | REGRESSED |

Membership remained the largest response at 9,670 bytes. No endpoint response field was removed; the byte saving is three eliminated province responses.

## 12. Database Work Before/After

Median dashboard operations fell 99→80. Province dedup removed six; membership 12→8, campaigns 13→9 and reports 12→8 removed 12 unused `$lookup` aggregations; summary 16→15 removed the duplicate count.

## 13. Functional Regression Results

Normalized response hashes/shapes and DOM matched. Widgets, navigation and selects remained present; no console/API errors occurred; database and O1 fingerprints remained unchanged.

## 14. Authorization/Security Validation

Unauthenticated APIs remained 401. Central, Province, District, Area, Basic Unit, Central Admin and Member personas were exercised. Tampered lower-tier scope parameters did not broaden results. No security difference occurred.

## 15. Remaining Dashboard Problems

Summary, org-breakdown and inactive-units remain query-heavy and dominated final concurrent completion. Local browser runs show high contention/variance. Membership remains the largest response. Pre-existing analytics caching was not changed.

## 16. Limitations

This is a local single-user suite, not production telemetry. Baseline/final runs were sequential, not interleaved; unchanged endpoints also regressed, indicating host drift. No stress, spike, soak, 50k-volume or full scalability suite was rerun.

## 17. O2 Classification

**MIXED** — deterministic request, payload and DB-work wins plus three endpoint P95 improvements, without functional/security regression, but final dashboard completion and several endpoint P95s regressed.

## 18. Recommendation for O3

Keep O3 isolated. Use interleaved measurements to investigate summary, org-breakdown, inactive-units and local concurrency contention. Do not reopen indexes or add caching unless separately authorized.
