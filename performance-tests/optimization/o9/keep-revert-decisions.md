# Phase O9 — Keep / Revert Decisions

## Overview
Phase O9 systematically tested seven discrete frontend optimization candidates against the production build of PNAP-MIS. Each candidate was measured in isolation for bundle size, network transfer, Lighthouse scores (5-run medians), and dashboard usability timing.

---

### Candidate A — Route-Level Code Splitting
- **Scope**: Converted 54 secondary and admin routes in `web/src/App.jsx` from eager static imports to `React.lazy()` with `Suspense` fallback rendering `<SkeletonCard />`.
- **Measured Impact**:
  - Initial JS bundle: 944,602 bytes → 325,884 bytes (-65.5%)
  - Initial JS Gzip: 234,860 bytes → 99,420 bytes (-57.7%)
  - Lighthouse Score: 89 → 99 (+10 points)
  - FCP / LCP: 2,824.0 ms → 1,575.4 ms (-44.2%)
- **Decision**: **KEEP**
- **Rationale**: Immediate dramatic reduction in main-thread script parsing and initial bundle transfer with zero regression in functionality or authorization boundaries.

---

### Candidate B — Heavy Dashboard Component Lazy Loading
- **Scope**: In `web/src/components/dashboard/cc/CommandCenter.jsx`, deferred the code for non-critical Acts 3–7 (`MembershipAnalytics`, `MeetingsAnalytics`, `CampaignsAnalytics`, `ReportsAnalytics`, `InactiveUnitsTable`) using `React.lazy()` and `Suspense`. Kept critical Acts 1 & 2 (`ScopeBreadcrumb`, `AnalyticsFilters`, standing KPIs, `ProvinceMatrix`) eager.
- **Measured Impact**:
  - `DashboardPage` bundle chunk: 54.52 kB raw (14.47 kB gzip) → 22.13 kB raw (6.88 kB gzip) (-59.4%)
  - Dashboard primary usable time (50k members): 6,395.9 ms → 6,339.1 ms
- **Decision**: **KEEP**
- **Rationale**: Keeps the primary dashboard entry chunk lightweight and downloads secondary analytics widgets only when `secondaryReady` triggers, aligning with O4 staged API architecture.

---

### Candidate C — Chart Library Cost Evaluation
- **Scope**: Inspected charting packages and module bundling.
- **Findings**:
  - No external bloated third-party charting libraries (Chart.js, Recharts, ECharts, D3) are present in `package.json`.
  - Application uses native SVG React components (`web/src/components/charts.jsx`, 15.56 kB raw / 5.15 kB gzip).
  - Vite/Rollup tree-shaking functions cleanly.
- **Decision**: **NO_ACTION_REQUIRED**

---

### Candidate D — Icon Imports Evaluation
- **Scope**: Inspected icon import mechanisms.
- **Findings**:
  - No massive third-party icon packages (`lucide-react`, `react-icons`, `@heroicons/react`) are installed.
  - Custom stroke SVG set (`web/src/components/icons.jsx`) is 11.4 KB total and tree-shakes down to ~2 kB per chunk.
- **Decision**: **NO_ACTION_REQUIRED**

---

### Candidate E — Action & Modal Dependency Deferral
- **Scope**: Defer modal components loaded conditionally:
  - `PublicRegisterModal` (22.6 KB source) in `LoginPage.jsx` (only rendered when registration clicked).
  - `MemberRegisterModal` (14.7 KB) and `CommandPalette` (8.3 KB) in `App.jsx` (only rendered when shortcuts open).
- **Measured Impact**:
  - Initial JS bundle: 325,884 bytes → 297,242 bytes (-28,642 bytes / -8.8%)
  - Initial JS Gzip: 99,420 bytes → 92,870 bytes (-6,550 bytes / -6.6%)
  - Total Initial Transferred: 425.86 KB → 397.89 KB
- **Decision**: **KEEP**
- **Rationale**: Removes heavyweight modal form validation and registration code from initial login and app startup paths without impacting usability.

---

### Candidate F — Dead Code Cleanup
- **Scope**: Searched for unreferenced frontend components and dead modules.
- **Findings**:
  - Legacy components like `ExecutiveAnalytics.jsx` and `CongressManager.jsx` are not referenced by the active import graph and therefore are never emitted into `dist/` by Vite.
  - Active codebase contains no dead bundle payload.
- **Decision**: **NO_ACTION_REQUIRED**

---

### Candidate G — Vite manualChunks Vendor Splitting
- **Scope**: Tested `manualChunks` in `vite.config.js` to isolate React vendor (`react`, `react-dom`, `react-router-dom`) into `vendor-react.js`.
- **Measured Impact**:
  - Initial HTTP JS requests increased from 1 to 2 (`index.js` + `vendor-react.js`).
  - Total initial transferred bytes increased from 397.89 KB to 400.25 KB (+2.36 KB due to inter-chunk module glue).
  - FCP / LCP degraded from 1,654.9 ms to 1,835.5 ms (+180.6 ms).
  - Lighthouse performance score dropped from 99 to 98.
- **Decision**: **REVERT**
- **Rationale**: Additional HTTP roundtrip and chunk waterfall degraded FCP/LCP. Standard Vite chunking with single optimized entry chunk is superior for critical-path delivery.

---

## Summary of Retained Candidates
- **Retained**: Candidate A, Candidate B, Candidate E.
- **Evaluated (No Change Needed)**: Candidate C, Candidate D, Candidate F.
- **Reverted**: Candidate G.
