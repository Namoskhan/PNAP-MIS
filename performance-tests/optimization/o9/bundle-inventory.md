# Phase O9 — Frontend Bundle Inventory (Baseline)

## 1. Production Build Asset Summary

The baseline production build was executed via `vite build` against the unmodified Phase O8 frontend code (`pnap-mis/web`).

| Asset Path | Type | Raw Size (Bytes) | Raw Size (KB) | Gzip Size (Bytes) | Gzip Size (KB) | Initial Critical Path |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `dist/assets/index-JgCJ7jVi.js` | JavaScript | 944,602 | 944.60 KB | 234,858 | 234.86 KB | **Yes (100% of all JS)** |
| `dist/assets/index-2MSsyl9C.css` | Stylesheet | 108,083 | 108.08 KB | 18,911 | 18.91 KB | **Yes** |
| `dist/index.html` | HTML Entry | 2,110 | 2.11 KB | 1,056 | 1.06 KB | **Yes** |
| `dist/favicon.ico` | Asset | 1,129 | 1.13 KB | 1,152 | 1.15 KB | No |
| `dist/favicon.png` | Asset | 1,129 | 1.13 KB | 1,152 | 1.15 KB | No |
| `dist/favicon.svg` | Asset | 302 | 0.30 KB | 224 | 0.22 KB | No |

**Total Application JavaScript:** 944,602 bytes (944.60 KB raw / 234.86 KB gzip)  
**Total Application CSS:** 108,083 bytes (108.08 KB raw / 18.91 KB gzip)  
**Initial JavaScript Transferred:** 944,602 bytes (100% monolithic entry chunk)  
**Chunk Count:** 1 JS chunk  

---

## 2. Chunk Composition & Ownership Analysis

Because `web/src/App.jsx` eagerly imports all 56 page components across all routes, Vite outputs a single monolithic chunk containing the entire application:

### Major Source Modules Contributing to `index-JgCJ7jVi.js`

| Subsystem / Directory | Unminified Source Bytes | Estimated Chunk Share | Description & Ownership |
| :--- | :--- | :--- | :--- |
| `pages/unit/` | 329,484 bytes | ~35% | Unit operational pages (`MeetingsPage`, `FinancePage`, `CabinetPage`, `JirgaPage`, `CongressPage`, etc.) |
| `pages/admin/` | 277,412 bytes | ~29% | Admin console (`UsersPage`, `ManageOrgPage`, `ReportTemplatesPage`, `PerformanceRuleSetsPage`, etc.) |
| `components/` | 375,591 bytes | ~25% | Shared UI components, `Layout.jsx` (36.5 KB), SVG `charts.jsx` (32.4 KB), modals, and cards |
| `pages/admin/settings/`| 134,449 bytes | ~10% | Theming, branding, typography, logo managers |
| External Dependencies | ~130,000 bytes | ~12% | `react` (18.3.1), `react-dom` (18.3.1), `react-router-dom` (6.26.2), `axios` (1.7.7) |
| `pages/` (Other) | 132,689 bytes | ~10% | `DashboardPage`, `MemberListPage`, `MemberDetailPage`, Auth pages |

---

## 3. Key Observations & Optimization Potential

1. **Monolithic Bundle Trap:** Every route—even `/login`—downloads and parses all 56 application pages, including heavy administrative tables, template editors, and unit governance wizards.
2. **Zero Route-Level Code Splitting:** Vite warned during build:
   `(!) Some chunks are larger than 500 kB after minification. Consider using dynamic import() to code-split the application`.
3. **No Heavy External Chart/UI Libraries:** The application uses pure vanilla SVG for charts (`components/charts.jsx`) and vanilla CSS for styling (`styles.css`), meaning bundle size is driven almost entirely by first-party code rather than third-party node_modules bloat.
4. **Immediate Opportunity:** Splitting routes into lazy chunks will dramatically slash initial JS for entry routes like `/login` and `/dashboard`.
