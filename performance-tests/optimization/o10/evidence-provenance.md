# Phase O10 — Evidence Provenance & Comparison Methodology

## 1. Principles of Methodological Comparability
A core rule of Phase O10 is that numbers sharing a metric name cannot be compared unless their underlying test methodology, harness, network environment, dataset size, and concurrency parameters match. Every historical comparison in Phase O10 is explicitly classified into one of three tiers:

- **DIRECTLY COMPARABLE**: Identical test harness, identical dataset, identical concurrency, identical measurement protocol (e.g. median of identical repeated iterations, cold-wave triggering).
- **DIRECTIONALLY COMPARABLE**: Same conceptual system metric, but evaluated under differing baseline software harness tooling, minor environmental drift, or extended iteration count.
- **NOT COMPARABLE**: Different workloads, differing datasets, differing concurrency, or unthrottled vs throttled conditions.

---

## 2. Historical Provenance Ledger

| Historical Phase | Source Artifact | Metric | Methodology | Dataset | Concurrency | O10 Comparability | Rationale |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **O1** | `optimization/o1/api-profile.json` | API Endpoint Latency | Autocannon HTTP load testing against unoptimized backend | `pnap_mis` (dev seed) | c=10, 30s duration | **DIRECTIONALLY COMPARABLE** | Same endpoints tested; local machine load may have minor background variance. |
| **O2** | `optimization/o2/dashboard-results.json` | Dashboard Request Count | Network request interceptor on dashboard load | `pnap_mis` | Single client | **DIRECTLY COMPARABLE** | Same page load request counting methodology. |
| **O2** | `optimization/o2/duplicate-requests.json` | Duplicate Requests | URL hash deduplication on page load | `pnap_mis` | Single client | **DIRECTLY COMPARABLE** | Direct structural verification of duplicate calls. |
| **O4** | `optimization/o4/single-flight.json` | Snapshot Build Count | Cold concurrent same-key requests | `pnap_mis` | c=5 wave | **DIRECTLY COMPARABLE** | Identical single-flight concurrency probe. |
| **O7** | `results/optimization/o7/snapshot-results.json` | Cold Snapshot P95 | Single cold snapshot build via Chrome/Node harness | `pnap_mis_o7_d` (50k) | c=1 | **DIRECTLY COMPARABLE** | Identical database, identical query parameters. |
| **O7** | `results/optimization/o7/group3-results.json` | Group 3 P95 | Aggregated query timings for Group 3 endpoints | `pnap_mis_o7_d` (50k) | c=1 | **DIRECTLY COMPARABLE** | Identical query payload on identical dataset. |
| **O7** | `results/optimization/o7/dashboard-results.json` | Staged Dashboard P95 | End-to-end staged dashboard query suite | `pnap_mis_o7_d` (50k) | c=1 | **DIRECTLY COMPARABLE** | Identical staging protocol. |
| **O7** | `results/optimization/o7/concurrency-results.json` | Snapshot Consumer P95 | Concurrent consumers of shared cold snapshot | `pnap_mis_o7_d` (50k) | c=1, 3, 5, 10 | **DIRECTLY COMPARABLE** | Identical consumer fan-out methodology. |
| **O7** | `results/optimization/o7/dashboard-concurrency-level-d.json` | Staged Workflow P95 | Concurrent multi-user staged dashboard workflows | `pnap_mis_o7_d` (50k) | c=1, 3, 5, 10 | **DIRECTLY COMPARABLE** | Identical full-dashboard multi-request concurrency. |
| **O8** | `results/optimization/o8/o8-candidate-b-50k.json` | Basic Unit & Area Lookup P95 | Correlated lookup vs 2-step Node hash-join | `pnap_mis_o7_d` (50k) | c=1, 5 iterations | **DIRECTLY COMPARABLE** | Identical unit lookup parameters and test harness. |
| **O9** | `optimization/o9/build-baseline.json` | Initial & Total JS Bundle | Vite production build chunk sizes | Web SPA `dist/` | Production build | **DIRECTLY COMPARABLE** | Identical Vite production build toolchain. |
| **O9** | `optimization/o9/lighthouse-comparison.json` | Lighthouse Metrics (FCP, LCP, CLS, Perf) | Chrome headless Lighthouse CLI | Production preview (5005) | 5 runs (median) | **DIRECTLY COMPARABLE** | Identical Chrome flags, throttling mode, and 5-run median protocol. |
| **O9** | `optimization/o9/dashboard-loading-comparison.json` | Dashboard Primary Usable Time | Chrome CDP authenticated DOM inspection | `pnap_mis_o7_d` (50k) | 5 runs (median) | **DIRECTLY COMPARABLE** | Identical Chrome CDP DOM detection markers. |

---

## 3. Strict Comparability Guards
- **Workload Separation**: Snapshot consumer concurrency (single shared key fan-out) is strictly separated from full staged-dashboard workflows (independent user sessions requesting multiple endpoints).
- **Metric Integrity**: P95 numbers are derived from the full set of recorded runs using percentile rank interpolation, rather than selecting the best single run.
- **Dataset Consistency**: Volume benchmarks use verified O7 disposable tiers A (500), B (5k), C (10k), and D (50k).
