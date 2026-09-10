# Phase O4 — Snapshot Coalescing and Dashboard Scheduling

O4 measures same-key cold snapshot request coalescing first. Widget scheduling is evaluated only after an independent single-flight decision. Raw evidence is stored in `performance-tests/results/optimization/o4/`.

## Verified local environment

- Node v24.11.0; MongoDB 8.2.5.
- Database `mongodb://127.0.0.1:27017/pnap_mis`; dbPath `D:\MongoDB\data`.
- 8 logical processors and 8 GiB installed RAM; available RAM varied during trials.
- Database disk D:. Normal backend/frontend ports are 5000/5173; the harness used ephemeral local Express ports serving the production Vite build.
- Local/non-production only.

## Git safety

Retained O2 source changes at O4 start were `analyticsService.js`, `AnalyticsFilters.jsx`, `UnitReportDownloads.jsx`, and `UnitContext.jsx`, plus the untracked performance evidence tree. O4 added focused changes to `analyticsService.js` and `CommandCenter.jsx`. O1–O3 evidence was not overwritten. Nothing was committed, pushed, or submitted as a PR.
