# Phase O8 — Basic Unit / Area Lookup & Group Query-Shape Optimization

## Overview
Phase O8 focuses on isolating and evaluating query-shape alternatives for the volume bottleneck confirmed in Phase O7: the volume-proportional member `$lookup` and `$group` operations in `officeBearerActivity('BASIC_UNIT')` and `officeBearerActivity('AREA')`.

## Scope & Non-Negotiable Constraints
- **Preserve Phase O1–O7 artifacts and baselines**.
- **No new MongoDB indexes**.
- **No schema changes or denormalization**.
- **No Redis or new caching technology**.
- **No Node.js clustering**.
- **No semantic or authorization changes**.
- **Target Databases**: Retained disposable databases `pnap_mis_o7_c` (10,000 members) and `pnap_mis_o7_d` (50,000 members).
- **Untouched**: Main `pnap_mis` database remains completely read-only and untouched.

## Artifacts in this Directory
- `basic-unit-current-pipeline.md`: Exact mapping of the existing Basic Unit aggregation pipeline.
- `area-current-pipeline.md`: Exact mapping of the existing Area aggregation pipeline.
- `cardinality-analysis.json`: Detailed cardinality and lookup invocation analysis at 10k and 50k.
- `profiler-evidence.json`: MongoDB explain executionStats and profiling output.
- `baseline-10k.json`: Authoritative control baseline stats at 10,000 members.
- `baseline-50k.json`: Authoritative control baseline stats at 50,000 members.
- `candidate-a.json`: Candidate A (Pre-group before member lookup) results.
- `candidate-b.json`: Candidate B (Two-step query with Node join) results.
- `candidate-c.json`: Candidate C (Lookup after reducing cardinality) results.
- `candidate-d.json`: Candidate D (Smaller group payload) results.
- `candidate-e.json`: Candidate E (Window / Top-N style alternative) results.
- `candidate-f.json`: Candidate F (Narrow lookup verification) results.
- `response-equivalence.json`: Normalized cryptographic hash comparison confirming exact output matching.
- `memory-comparison.json`: Node RSS and heap memory consumption across candidates.
- `combined-results.json`: Full validation of combined retained candidates (Cold snapshot, Group-3, Staged Dashboard).
- `concurrency-results.json`: Concurrency stress check at 1, 3, 5, 10 workflows at 50k.
- `keep-revert-decisions.md`: Keep/revert verdicts and technical rationale for each candidate.
- `comparison.json`: High-level metrics comparison between control and winning candidate.
- `O8-BASIC-AREA-LOOKUP-GROUP-OPTIMIZATION-REPORT.md`: Comprehensive engineering report.
