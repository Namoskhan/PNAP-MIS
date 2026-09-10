# Phase O2 — Optimization Change Log

| ID | Files | Change | Validation | Performance | Decision |
|---|---|---|---|---|---|
| CHG-01 | `browser.cjs` | Hardened the O2-only Chrome harness against stale/locked port files and unbounded CDP waits. | Repeated captures completed; no application impact. | Reliable controlled evidence. | KEEP |
| CHG-02 | `AnalyticsFilters.jsx`, `UnitReportDownloads.jsx`, `UnitContext.jsx` | Reused context provinces and guarded the authenticated context fetch. | Build, hashes, DOM, RBAC/scope, DB and O1 checks passed. | Requests 16→13; duplicates 3→0; response bytes 30,386→28,058. | KEEP |
| CHG-03 | `analyticsService.js` | Added scoped lean `unitDirectory`; membership, campaigns and reports no longer calculate unused officer activity. | Candidate B checks passed with identical responses. | DB ops: membership 12→8, campaigns 13→9, reports 12→8. | KEEP |
| CHG-04 | `analyticsService.js` | Derived summary total from its status aggregation; removed duplicate member count. | Candidate C checks passed with identical responses. | Summary DB ops 16→15; Candidate B→C P95 255.80→171.42 ms. | KEEP |

The first CHG-02 attempt omitted the `useRef` import and failed the regression gate; it was fixed before retention. Its evidence and all harness-interrupted attempts are preserved under clearly labelled `candidate-a-failed-*` / `candidate-a-incomplete-*` directories. Monolithic consolidation, caching, React Query and MongoDB indexes were rejected and not implemented.

