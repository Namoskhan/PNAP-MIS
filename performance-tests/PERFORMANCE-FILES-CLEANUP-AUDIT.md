# Performance Files Cleanup Audit

Audit date: 2026-09-21  
Scope: the complete `performance-tests/` tree plus the two performance-report copies at repository root.  
Method: recursive file inventory, byte counts, extension and phase grouping, `git status --short`, `git status --short --ignored`, `git ls-files`, `git diff --stat`, SHA-256-equivalent Git blob hashing (`git hash-object --no-filters`), and review of final-report evidence citations. No file was deleted, moved, renamed, staged, committed, or modified during the audit. This audit is the only file created.

## Repository Summary

- Audit-snapshot performance artifacts: **27,877 files / 1,782,232,272 bytes (1.660 GiB)**. This count excludes this newly created audit itself.
- Files physically under `performance-tests/`: **27,875 / 1,780,296,881 bytes (1.658 GiB)**.
- Additional performance artifacts elsewhere: the root PDF and DOCX, **2 / 1,935,391 bytes**. Both are byte-identical to the canonical copies under `performance-tests/final-management-report/`.
- Recommended classification: **165 KEEP**, **253 ARCHIVE**, **27,459 SAFE TO DELETE**.
- Recommended GitHub payload: **3,643,874 bytes (3.47 MiB)** before adding this audit; roughly **3.5 MiB** with the audit.
- The application files whose names contain “Performance” (for example React pages/components) are application source, not generated performance-test artifacts, and are intentionally outside this cleanup classification.
- O1's original full raw pre-optimization baseline is not present. Its surviving authoritative historical record is explicitly described as partial/recovered. The final before/after management evidence instead cites the authoritative O7/O8 volume controls and O9 frontend controls.

### Git state at audit snapshot

| State | Files under `performance-tests/` | Size / observation |
|---|---:|---|
| Tracked | 3,782 | 452,227,311 bytes (431.28 MiB) |
| Untracked | 23,095 | Included in the 1,328,069,570-byte untracked-or-ignored total |
| Ignored | 998 | Included in the 1,328,069,570-byte untracked-or-ignored total; primarily `*.log` |
| Modified tracked performance files | 0 | No performance path appeared as modified |
| Repository modifications outside scope | 4 | Existing application-source modifications; untouched by this audit |

`git diff --stat` showed only four pre-existing application-source modifications (498 changed lines in total). Nothing was staged. The two root final-report files and the O7-O10/final-management-report material were untracked at the snapshot.

## Current Performance Directory Size

| Area | Files | Bytes | Approximate size |
|---|---:|---:|---:|
| `performance-tests/results/` | 15,716 | 1,103,950,942 | 1.028 GiB |
| `performance-tests/optimization/` | 12,130 | 672,371,659 | 641.22 MiB |
| `performance-tests/final-management-report/` | 14 | 3,945,307 | 3.76 MiB |
| `performance-tests/recovery/` | 3 | 16,474 | 16.09 KiB |
| `performance-tests/chrome-profile/` | 12 | 12,499 | 12.21 KiB |
| **Total `performance-tests/`** | **27,875** | **1,780,296,881** | **1.658 GiB** |

The largest phases are O9 (**23,760 files / 1,319,207,814 bytes**) and O2 (**2,983 / 375,187,282 bytes**). Generated browser-profile directories alone account for **27,378 files / 1,732,572,566 bytes (1.613 GiB)**.

## Authoritative Files

| Role | Authoritative path | Size | Finding |
|---|---|---:|---|
| Final management report (source) | `performance-tests/final-management-report/PNAP-MIS-PERFORMANCE-OPTIMIZATION-FINAL-REPORT.md` | reviewed | Canonical narrative and before/after scorecard |
| Final management PDF | `performance-tests/final-management-report/PNAP-MIS-PERFORMANCE-OPTIMIZATION-FINAL-REPORT.pdf` | 1,225,892 B | Canonical PDF; root copy is exact duplicate |
| Final management DOCX | `performance-tests/final-management-report/PNAP-MIS-PERFORMANCE-OPTIMIZATION-FINAL-REPORT.docx` | 709,499 B | Canonical DOCX; root copy is exact duplicate |
| Management source data | `performance-tests/final-management-report/FINAL-MANAGEMENT-REPORT-DATA.json` | compact JSON | Source for the generated final report and charts |
| Final report integrity audit | `performance-tests/final-management-report/REPORT-DATA-INTEGRITY-AUDIT.md` | 7,681 B | Claim-to-source traceability for final management figures |
| Final post-optimization baseline | `performance-tests/optimization/o10/FINAL-LOCAL-POST-OPTIMIZATION-BASELINE.json` | 4,530 B | Explicitly frozen authoritative local baseline |
| Management summary | `performance-tests/optimization/o10/O10-MANAGEMENT-SUMMARY.md` | 5,070 B | Authoritative executive O10 summary |
| Technical final report | `performance-tests/optimization/o10/O10-FINAL-POST-OPTIMIZATION-REVALIDATION-REPORT.md` | 26,711 B | Authoritative final technical validation |
| Data-integrity audit | `performance-tests/optimization/o8/O8-FINAL-DATA-INTEGRITY-AUDIT.md` | 6,704 B | Authoritative O8 baseline/hash and equivalence evidence |
| Frontend report | `performance-tests/optimization/o9/O9-FRONTEND-BUNDLE-LOADING-OPTIMIZATION-REPORT.md` | 14,172 B | Authoritative O9 frontend report |
| Pre-optimization volume controls | `performance-tests/optimization/o7/level-d.json`; `dashboard-concurrency-level-d.json` | compact JSON | Raw 50k before values cited by the final integrity audit |
| Pre-optimization O8 controls | `performance-tests/optimization/o8/baseline-10k.json`; `baseline-50k.json`; O8 final audit | compact JSON/MD | Basic-unit and area before values plus integrity proof |
| Pre-optimization frontend controls | `performance-tests/optimization/o9/build-baseline.json`; `baseline-lighthouse.json`; `dashboard-loading-baseline.json` | compact JSON | Bundle, Lighthouse, and dashboard-loading before state |
| O10 final raw summaries | `volume-revalidation-results.json`; `concurrency-results.json`; `frontend-final-build.json`; `final-lighthouse.json`; `response-equivalence.json` | compact JSON | Direct post-optimization evidence behind the frozen baseline |
| Recovered O1 history | `performance-tests/optimization/o1/recovered/historical-baseline-summary.json`; `evidence-manifest.json`; O1 report | compact JSON/MD | Preserve with its explicit limitation: partial recovery, not a recreated full baseline |

`PNAP-MIS-FINAL-PERFORMANCE-ASSESSMENT.md` was not found. Its apparent role is fulfilled by the final management report and the O10 final revalidation report above.

## KEEP IN GITHUB

The rows below are mutually exclusive and cover all **165** KEEP files.

| Path | Purpose | Size | Reason |
|---|---|---:|---|
| `performance-tests/**/*.md` excluding duplicated `results/` copies | Phase reports, READMEs, methodology, decisions, provenance, and final reports (48 files) | 237,970 B | Manually authored, compact, and needed to interpret evidence |
| `performance-tests/optimization/**/*.cjs`, `performance-tests/recovery/*.cjs`, and `performance-tests/chrome-profile/*.cjs` (canonical copies only; 56 files) | Benchmark, volume, concurrency, API, dashboard, MongoDB, frontend, validation, and recovery harnesses | 330,198 B | Required for future regression testing and reproducibility |
| `performance-tests/final-management-report/*.py` (3 files) | Rebuild charts, HTML/PDF, and DOCX | 118,701 B | Reproducible report-generation tooling |
| `performance-tests/final-management-report/charts/*.png` (5 files) | Charts referenced by the canonical Markdown report | 761,474 B | Required for a complete rendered report |
| `performance-tests/final-management-report/PNAP-MIS-PERFORMANCE-OPTIMIZATION-FINAL-REPORT.pdf` | Final management deliverable | 1,225,892 B | Authoritative final PDF |
| `performance-tests/final-management-report/PNAP-MIS-PERFORMANCE-OPTIMIZATION-FINAL-REPORT.docx` | Editable final management deliverable | 709,499 B | Authoritative final DOCX |
| Selected compact JSON baselines/configuration/integrity evidence (51 files) | Frozen baseline, before controls, final summaries, environment, equivalence, integrity, and benchmark configuration | 260,140 B | Necessary authoritative evidence or rerun configuration |
| **KEEP total** | **165 files** | **3,643,874 B (3.47 MiB)** | Recommended GitHub footprint before this audit |

The selected JSON rule is conservative and explicit: keep final-management data; final frozen baseline; benchmark configurations; evidence manifests; recovered historical summary; O7 `level-d` and level-D concurrency; O8 10k/50k controls; O9 build/Lighthouse/dashboard-loading controls; O10 environment, volume, concurrency, build/Lighthouse, regression, authorization, equivalence, integrity, dataset, lazy-loading, and single-flight summaries. Raw per-run and candidate JSON not in that set belongs in the local archive.

### Benchmark scripts to retain

- O10: `run-volume-revalidation.cjs`, `run-regression-and-equivalence.cjs`, `run-frontend-revalidation.cjs`, `local-dashboard-performance.cjs`, `profile-api-auth.cjs`, `validate-single-flight-dashboard.cjs`, `verify-datasets.cjs`, and `dev-smoke-check.cjs`.
- O7/O8 volume and data integrity: `seed-o7-volume.cjs`, `run-level.cjs`, `run-dashboard-concurrency.cjs`, `run-candidate-benchmarks.cjs`, `validate-post-optimization.cjs`, `test-equivalence.cjs`, and `run-profiler-evidence.cjs`.
- O9 frontend: `analyze-bundle.cjs`, `benchmark-frontend.cjs`, `measure-dashboard.cjs`, `test-lh.cjs`, and `validate-functionality.cjs`.
- O2-O6 diagnostics/regression harnesses: retain the canonical scripts under each `optimization/oN/` directory; do not keep their copied `results/optimization/` versions.
- O1 recovery/validation: retain the canonical O1 scripts and the two `recovery/*.cjs` scripts because they document the limitations and provenance of the recovered baseline.

## ARCHIVE LOCALLY

The classification rule below covers every ARCHIVE file. Archive with a manifest/checksum outside the Git worktree before deleting anything from the repository.

| Path | Purpose | Size | Reason |
|---|---|---:|---|
| Non-profile raw/candidate/run output not selected in KEEP, principally `performance-tests/optimization/o*/**/*.json` and unique files under `performance-tests/results/**` (253 files) | Detailed profiler/explain captures, candidate experiments, per-run Lighthouse JSON, screenshots, crash dumps, repeated resource traces, and old diagnostic results | 40,247,254 B (38.38 MiB) | Useful historical detail, but too noisy or large for the authoritative Git history; not required to reproduce tests |

Notable archive candidates include the unique O6 `candidate-results.json` (9.89 MB), O6 baseline/final raw JSON (about 2.31 MB each), O5 baseline/final raw JSON (about 2.01 MB each), O1 explain captures (about 1.24 MB each), and O2 dashboard screenshots (about 0.84-0.87 MB each). Crash dumps and cache files that fall outside the browser-profile-name pattern should be treated as generated material; they may be deleted after the archive has been verified.

## SAFE TO DELETE

The rows are mutually exclusive (evaluated top to bottom) and cover all **27,459** SAFE files. “Safe” means safe after confirming the KEEP set and, where applicable, the archive checksum; no deletion was performed.

| Path | Purpose | Size | Reason |
|---|---|---:|---|
| Any directory component matching `*chrome-profile*`, `*capture-profile*`, `test-launch-profile`, or `temp_chrome*` (27,378 files) | Temporary Chrome user profiles, caches, downloaded models, Safe Browsing databases, GPU caches, logs, and crash state | 1,732,572,566 B (1.613 GiB) | Generated browser state; neither authoritative evidence nor a rerun prerequisite |
| Exact non-profile mirrors under `performance-tests/results/optimization/` with hash-identical canonical files under `performance-tests/optimization/` (78 files) | Copied reports, scripts, and result summaries | included in SAFE total | Redundant; preserve the canonical `optimization/` copy |
| `performance-tests/final-management-report/report.html` (1 file) | Rendered report intermediate | included in SAFE total | Regenerable from the retained Markdown/data/scripts |
| Root `PNAP-MIS-PERFORMANCE-OPTIMIZATION-FINAL-REPORT.pdf` and `.docx` (2 files) | Convenience copies | 1,935,391 B | SHA/hash-identical to canonical `final-management-report/` copies |
| **SAFE total** | **27,459 files** | **1,738,341,144 B (1.619 GiB)** | Generated or exact duplicates only |

## Exact Duplicates

Hashing found **2,233 duplicate-content groups inside `performance-tests/`**, containing **24,726 redundant copies** and **1,224,452,234 redundant bytes**. Adding the exact root PDF and DOCX copies gives **2,235 groups / 24,728 redundant copies / 1,226,387,625 redundant bytes** across the full audit scope.

- There are **11,925 exact same-relative-path pairs** between `performance-tests/results/optimization/` and `performance-tests/optimization/`, representing **660,956,621 redundant bytes**.
- Mirror pairs by phase: O3 **6**, O8 **2**, O9 **11,880**, O10 **37**.
- The duplicate-group count is smaller than the redundant-copy count because browser caches often contain dozens or hundreds of identical files. For example, one 270,336-byte Dawn cache object occurs 384 times.
- Canonical choice: retain `performance-tests/optimization/oN/...`; delete the hash-identical `performance-tests/results/optimization/oN/...` copy.
- The exact root/final-management hashes were verified: PDF `33473B0605B7535437593786E1EF569D0B0DE9B04F7635751E94048FCAAB7476`; DOCX `4B44800E9F4FE35CCAE6B79FC223FA2C2018FCE1B15DF9FF62F8E68B3FBC4397`.

## 20 Largest Files

All 20 are unnecessary generated browser-profile content and are classified SAFE TO DELETE.

| # | Path | Size |
|---:|---|---:|
| 1 | `performance-tests/results/optimization/o9/chrome-profile-1789113652061/optimization_guide_model_store/43/E6DC4029A1E4B4C1/13437DA35847E98F/model.tflite` | 36,778,224 B |
| 2 | `performance-tests/results/optimization/o9/chrome-profile-1789114057607/optimization_guide_model_store/43/E6DC4029A1E4B4C1/A596689472AF6687/model.tflite` | 36,778,224 B |
| 3 | `performance-tests/results/optimization/o2/candidate-a-failed-import/chrome-profile/optimization_guide_model_store/43/E6DC4029A1E4B4C1/62C8C48DA8B87449/model.tflite` | 36,778,224 B |
| 4 | `performance-tests/optimization/o9/chrome-profile-1789114057607/optimization_guide_model_store/43/E6DC4029A1E4B4C1/A596689472AF6687/model.tflite` | 36,778,224 B |
| 5 | `performance-tests/optimization/o9/chrome-profile-1789113652061/optimization_guide_model_store/43/E6DC4029A1E4B4C1/13437DA35847E98F/model.tflite` | 36,778,224 B |
| 6 | `performance-tests/results/optimization/o2/after/chrome-profile/Default/Download Service/Files/063410e4-6348-4c18-8788-d6f18e94be0b` | 33,619,428 B |
| 7 | `performance-tests/results/optimization/o2/candidate-b/chrome-profile/Default/Download Service/Files/3130ba11-9d27-4913-9cdd-3a47d2d6d1e8` | 33,619,428 B |
| 8 | `performance-tests/results/optimization/o2/candidate-c/chrome-profile/Default/Download Service/Files/2dc6e2ff-6b26-45ca-960f-199c2e9d1f1e` | 33,619,428 B |
| 9 | `performance-tests/results/optimization/o2/candidate-a/chrome-profile/Default/Download Service/Files/Unconfirmed 981994.crdownload` | 30,536,811 B |
| 10 | `performance-tests/results/optimization/o9/chrome-profile-1789114057607/component_crx_cache/485187ce78b5eaa19aaba6cb088a3d8ef80fafe00f5068fa71a7989775436e2e` | 23,364,903 B |
| 11 | `performance-tests/optimization/o9/chrome-profile-1789114057607/component_crx_cache/485187ce78b5eaa19aaba6cb088a3d8ef80fafe00f5068fa71a7989775436e2e` | 23,364,903 B |
| 12 | `performance-tests/results/optimization/o9/chrome-profile-1789113652061/component_crx_cache/485187ce78b5eaa19aaba6cb088a3d8ef80fafe00f5068fa71a7989775436e2e` | 23,364,903 B |
| 13 | `performance-tests/optimization/o9/chrome-profile-1789113652061/component_crx_cache/485187ce78b5eaa19aaba6cb088a3d8ef80fafe00f5068fa71a7989775436e2e` | 23,364,903 B |
| 14 | `performance-tests/results/optimization/o9/chrome-profile-1789113652061/WasmTtsEngine/20260826.1/bindings_main.wasm` | 22,970,342 B |
| 15 | `performance-tests/results/optimization/o9/chrome-profile-1789114057607/WasmTtsEngine/20260826.1/bindings_main.wasm` | 22,970,342 B |
| 16 | `performance-tests/optimization/o9/chrome-profile-1789113652061/WasmTtsEngine/20260826.1/bindings_main.wasm` | 22,970,342 B |
| 17 | `performance-tests/optimization/o9/chrome-profile-1789114057607/WasmTtsEngine/20260826.1/bindings_main.wasm` | 22,970,342 B |
| 18 | `performance-tests/results/optimization/o9/chrome-profile-1789114057607/Safe Browsing/UrlSoceng.store.4_13433587776339085` | 16,624,516 B |
| 19 | `performance-tests/optimization/o9/chrome-profile-1789113652061/Safe Browsing/UrlSoceng.store.4_13433587462688051` | 16,624,516 B |
| 20 | `performance-tests/results/optimization/o9/chrome-profile-1789113652061/Safe Browsing/UrlSoceng.store.4_13433587462688051` | 16,624,516 B |

## Recommended Final GitHub Structure

This is a proposed structure only; nothing has been moved.

```text
performance-tests/
  README.md
  PERFORMANCE-FILES-CLEANUP-AUDIT.md
  baselines/
    pre-optimization/
      o1-recovered-summary.json
      o7-50k-volume.json
      o7-50k-concurrency.json
      o8-10k.json
      o8-50k.json
      o9-build.json
      o9-lighthouse.json
      o9-dashboard-loading.json
    final/
      FINAL-LOCAL-POST-OPTIMIZATION-BASELINE.json
      environment.json
      supporting-final-summaries/*.json
  reports/
    management/
      PNAP-MIS-PERFORMANCE-OPTIMIZATION-FINAL-REPORT.md
      PNAP-MIS-PERFORMANCE-OPTIMIZATION-FINAL-REPORT.pdf
      PNAP-MIS-PERFORMANCE-OPTIMIZATION-FINAL-REPORT.docx
      REPORT-DATA-INTEGRITY-AUDIT.md
      charts/*.png
    technical/
      O1-...md through O10-...md
      O8-FINAL-DATA-INTEGRITY-AUDIT.md
      O9-FRONTEND-BUNDLE-LOADING-OPTIMIZATION-REPORT.md
      O10-FINAL-POST-OPTIMIZATION-REVALIDATION-REPORT.md
      O10-MANAGEMENT-SUMMARY.md
  scripts/
    api/
    dashboard/
    volume/
    concurrency/
    frontend/
    integrity/
    report-generation/
  evidence/
    compact-comparisons-and-integrity-json-only/
```

Keep a small provenance map during any later move so links in final reports can be updated atomically. Do not reorganize until the local archive is verified and report references are enumerated.

## Recommended .gitignore Changes

The current `.gitignore` covers logs, dependencies, build output, coverage, and editor cruft, but does not exclude the browser-profile trees or raw performance output. Add narrowly scoped rules; do not use a broad `performance-tests/**/*.json` or `performance-tests/results/` rule because those would hide authoritative baselines.

```gitignore
# Generated performance-test browser state
performance-tests/**/*chrome-profile*/
performance-tests/**/*capture-profile*/
performance-tests/**/test-launch-profile/
performance-tests/**/temp_chrome*/

# Generated profiler/crash/browser caches
performance-tests/**/*.dmp
performance-tests/**/*.pma
performance-tests/**/*.crdownload
performance-tests/**/Crashpad/
performance-tests/**/GPUCache/
performance-tests/**/ShaderCache/
performance-tests/**/GrShaderCache/
performance-tests/**/DawnGraphiteCache/
performance-tests/**/DawnWebGPUCache/
performance-tests/**/Code Cache/

# Regenerable report and temporary captures
performance-tests/final-management-report/report.html
performance-tests/**/raw-results/
performance-tests/**/tmp/
performance-tests/**/temp/
performance-tests/**/*-trace.json
performance-tests/**/*-profile.json
performance-tests/**/*.cpuprofile
performance-tests/**/*.heapprofile
performance-tests/**/*.heapsnapshot
performance-tests/**/*.log
```

If future harnesses write raw JSON beside authoritative JSON, change them to write under `raw-results/`; that enables safe ignoring without name-based exceptions. Keep `FINAL-LOCAL-POST-OPTIMIZATION-BASELINE.json`, the selected pre-optimization controls, final reports, and compact integrity/equivalence JSON explicitly visible to Git.

## Estimated Repository Size Reduction

| Scenario | Remaining performance payload | Reduction from full 1,782,232,272-byte audit scope |
|---|---:|---:|
| Delete only SAFE; leave archive in worktree | 43,891,128 B (41.86 MiB) | 97.54% |
| Recommended GitHub set (KEEP only) | 3,643,874 B (3.47 MiB), plus this audit | 99.80% |
| Local archive outside GitHub | 40,247,254 B (38.38 MiB) | Retained locally, not pushed |

The final `performance-tests/` GitHub content is estimated at **about 3.5 MiB** after cleanup and reorganization, versus **1.658 GiB** now. Git's historical object database will not shrink merely by deleting tracked files in a new commit; history rewriting would be a separate, higher-risk decision and is not recommended or authorized by this audit.

## Final Cleanup Plan

1. Create an archive outside the repository containing all 253 ARCHIVE files, plus a path/size/SHA-256 manifest; verify the archive can be read.
2. Confirm the 165 KEEP paths and this audit are present, and validate links in the final management and O10 reports.
3. Remove generated profile directories and other SAFE files. For mirrored files, retain the `optimization/` copy and remove only the hash-identical `results/optimization/` copy. Retain canonical final deliverables under `final-management-report/`.
4. Add the narrow `.gitignore` rules above before rerunning any browser benchmarks.
5. Reorganize KEEP files into the proposed structure in a separate, reviewable change, updating report links and script output paths together.
6. Run a read-only verification: file counts/sizes, duplicate scan, report-link check, `git status --short`, and a smoke invocation/help check for retained harnesses.
7. Stage and commit only after a human reviews the archive manifest and the final before/after evidence set.

### Final answers

1. **How many performance-related files exist?** 27,877 at the audit snapshot (27,875 under `performance-tests/` plus two root report copies), excluding this audit file.
2. **What is their total size?** 1,782,232,272 bytes (1.660 GiB); `performance-tests/` itself is 1,780,296,881 bytes (1.658 GiB).
3. **How many should stay in GitHub?** 165 existing files, plus this audit: 166 after the audit is created.
4. **How many should be archived locally?** 253.
5. **How many are safe to delete?** 27,459.
6. **How many exact duplicates exist?** 2,235 duplicate-content groups across the full scope, containing 24,728 redundant copies; 11,925 are exact `results/optimization/` ↔ `optimization/` same-path pairs.
7. **What are the largest unnecessary files?** Generated Chrome model files (36.78 MB each), browser download cache files (33.62 MB each), a partial download (30.54 MB), cached browser components (23.36 MB), and cached WebAssembly engines (22.97 MB).
8. **Which files are absolutely required for before-vs-after evidence?** The final management Markdown/data/integrity audit; O7 `level-d.json` and `dashboard-concurrency-level-d.json`; O8 final integrity audit and 10k/50k controls; O9 build/Lighthouse/dashboard-loading baselines and final report; O10 frozen baseline, volume/concurrency/build/Lighthouse/equivalence summaries, management summary, and technical final report. Preserve the O1 recovered summary and provenance with its limitation statement.
9. **Which benchmark scripts should remain?** The canonical `optimization/` and `recovery/` CJS harnesses listed above, especially O7/O8 volume/integrity, O9 frontend, and O10 final revalidation scripts; remove only duplicate script copies under `results/`.
10. **What should be added to `.gitignore`?** Narrow rules for Chrome/capture profiles, Crashpad and GPU/shader/code caches, dumps/profiles/traces/logs, `raw-results/`, temp directories, and the regenerable management HTML. Never broadly ignore JSON or final reports.
11. **What would the final `performance-tests` directory size be?** About 3.5 MiB in GitHub including this audit, before any small path/README changes made during a later reorganization.
12. **Is cleanup safe to perform?** **Yes, conditionally**: archive and checksum the 253 historical files first, preserve and link-check the 165-file authoritative/reproducible set, then delete only the enumerated generated profiles, exact duplicates, and regenerable render. Cleanup is not safe as a blind deletion of all `results/` or all JSON.
