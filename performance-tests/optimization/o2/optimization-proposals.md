# Phase O2 — Optimization Proposals

## 1. Candidate Evaluation Matrix

| ID | Candidate Title | Category | Scope | Classification | Decision |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **OPT-01** | Fix CDP DevToolsActivePort in Test Harness | Test Harness Safety | `browser.cjs` | **MUST FIX** | **ACCEPTED** |
| **OPT-02** | Eliminate 3 Duplicate `/api/org/provinces` Requests | Frontend Request Orchestration | `AnalyticsFilters.jsx`, `UnitReportDownloads.jsx`, `UnitContext.jsx` | **MUST FIX** | **ACCEPTED** |
| **OPT-03** | Decouple `officeBearerActivity` from Non-Officer Endpoints | Backend Query Optimization | `analyticsService.js` (`membership`, `campaigns`, `reports`) | **STRONGLY JUSTIFIED** | **ACCEPTED** |
| **OPT-04** | Deduplicate `Member.countDocuments(base)` in `summary()` | Backend Redundancy Elimination | `analyticsService.js` (`summary`) | **STRONGLY JUSTIFIED** | **ACCEPTED** |
| **OPT-05** | Monolithic Consolidation of All Dashboard Endpoints | Architecture | All Dashboard Endpoints | **REJECT** | **REJECTED** |
| **OPT-06** | Add Redis / In-Memory Server Persistent Caching | Caching | `server/` | **REJECT** | **REJECTED (Out of Scope)** |
| **OPT-07** | Add Client-Side React Query / TanStack Query | Caching | `web/` | **REJECT** | **REJECTED (Out of Scope)** |
| **OPT-08** | Add New MongoDB Indexes | Database Schema | MongoDB Collections | **REJECT** | **REJECTED (Out of Scope)** |

---

## 2. Detailed Proposal Specifications

### OPT-01: Fix CDP DevToolsActivePort in Test Harness
- **Problem**: When `profile` directory already exists from previous runs, `DevToolsActivePort` contains the port of an exited Chrome process, causing repeated headless Chrome launches to fail or hang.
- **Evidence**: `TypeError: fetch failed (connect ECONNREFUSED 127.0.0.1:52211)` when running repeated browser launches with the same profile path.
- **Affected File**: `performance-tests/optimization/o2/browser.cjs`
- **Current Behavior**: Checks `fs.existsSync('DevToolsActivePort')` immediately without verifying if the file was left by a prior run.
- **Proposed Change**: In `launch(profile)`, unlink `DevToolsActivePort` if present before spawning the new Chrome process.
- **Expected Benefit**: Reliable headless browser testing across before, candidate, and after benchmarking phases.
- **Functional Risk**: None.
- **Security Risk**: None.
- **Implementation Complexity**: Very Low (3 lines).
- **Classification**: **MUST FIX**

---

### OPT-02: Eliminate 3 Duplicate `/api/org/provinces` Requests
- **Problem**: The dashboard triggers `GET /api/org/provinces` four separate times on initial mount.
- **Evidence**: Headless Chrome Network CDP capture logs 4 identical `GET /api/org/provinces` requests returning identical 776-byte payloads within 1.5s of page load.
- **Affected Components**:
  - `web/src/components/dashboard/AnalyticsFilters.jsx`
  - `web/src/components/dashboard/UnitReportDownloads.jsx`
  - `web/src/context/UnitContext.jsx`
- **Current Behavior**:
  - `UnitContext.jsx` line 54 fetches provinces and stores them in context state.
  - `UnitContext.jsx` line 52 re-triggers when `user` identity changes following `/auth/me`.
  - `AnalyticsFilters.jsx` line 36 performs its own `api.get('/org/provinces')`.
  - `UnitReportDownloads.jsx` line 85 performs its own `api.get('/org/provinces')`.
- **Proposed Change**:
  - Consume `provinces` from `useUnit()` in `AnalyticsFilters.jsx` and `UnitReportDownloads.jsx`.
  - Guard the fetch in `UnitContext.jsx` to only run if `provinces.length === 0`.
  - Run production build: `npm run build` in `pnap-mis/web`.
- **Expected Benefit**: Eliminates **3 redundant HTTP round-trips** and **6 backend database queries**, reducing total dashboard requests from **16 to 13**.
- **Functional Risk**: None. All components receive the exact same array of province documents.
- **Security Risk**: None. Auth middleware on `/api/org/provinces` remains unchanged; `UnitContext` is already scoped to the authenticated session.
- **Implementation Complexity**: Low.
- **Classification**: **MUST FIX**

---

### OPT-03: Decouple `officeBearerActivity` from Non-Officer Endpoints
- **Problem**: `membershipAnalytics`, `campaignsAnalytics`, and `reportsAnalytics` invoke `orgSnapshot(f)`, which executes 4 heavy `RoleAssignment.aggregate` + `$lookup` (to members) queries (`officeBearerActivity` for BASIC_UNIT, AREA, DISTRICT, PROVINCE). None of these endpoints use the office bearer activity results, officer details, or active unit flags; they only need unit names and IDs to label the response rows.
- **Evidence**: `query-count-before.json` reveals 12 database operations for `membership`, 13 for `campaigns`, and 12 for `reports`, with each trace containing 4 `roleassignments` aggregations with member lookups.
- **Affected Files**: `server/src/services/analyticsService.js`
- **Current Behavior**: Calls `orgSnapshot(f)` which eagerly runs `officeBearerActivity()` across all 4 tiers.
- **Proposed Change**:
  - Implement a lightweight `unitDirectory(f)` helper that retrieves `{ _id, name, code, provinceId, districtId, areaId }` directly with `.lean()`.
  - Update `membershipAnalytics`, `campaignsAnalytics`, and `reportsAnalytics` to use `unitDirectory(f)`.
- **Expected Benefit**: Eliminates **4 expensive `$lookup` database queries per endpoint** (**12 total DB queries eliminated** per dashboard load cycle). Reduces P95 latency by ~20–40ms for `membership`, `campaigns`, and `reports`.
- **Functional Risk**: Zero. Returned JSON data structures and values are byte-for-byte identical.
- **Security Risk**: None. Units queried obey the exact same territorial scope constraints via `unitMatch(f, level)`.
- **Implementation Complexity**: Low to Moderate.
- **Classification**: **STRONGLY JUSTIFIED**

---

### OPT-04: Deduplicate `Member.countDocuments(base)` in `summary()`
- **Problem**: In `summary()`, line 533 issues `Member.countDocuments(base)` while line 538 issues `Member.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }])`.
- **Evidence**: On the database, `countDocuments(base)` equals 384, exactly matching the sum of counts across all statuses in `byStatus` (384). Running both is redundant.
- **Affected Files**: `server/src/services/analyticsService.js` (`summary()`)
- **Current Behavior**: Issues two separate queries over the `members` collection for the same scope.
- **Proposed Change**: Derive `total` directly from the sum of the status counts returned by `byStatus`.
- **Expected Benefit**: Eliminates 1 full collection scan / count operation from the most latency-critical endpoint (`summary`, P95 157.68ms).
- **Functional Risk**: Zero. The calculated total is mathematically identical.
- **Security Risk**: None.
- **Implementation Complexity**: Low (1 line change).
- **Classification**: **STRONGLY JUSTIFIED**

---

### OPT-05: Monolithic Consolidation of All Dashboard Endpoints
- **Problem**: Temptation to merge all 9 dashboard endpoints into a single giant endpoint.
- **Evaluation against Section 10 Consolidation Rules**:
  - Would make Act 1 (fast headline KPIs) wait on slower Act 3/5/7 charts.
  - Would break component independence and independent refreshing (e.g. `summary` polls every 60s, while tables paginate independently).
  - High risk of regression.
- **Decision**: **REJECT**.

---

### OPT-06 to OPT-08: Redis / TanStack Query / MongoDB Index Changes
- Explicitly forbidden by Section 1 Absolute Scope instructions.
- **Decision**: **REJECT**.
