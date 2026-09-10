# O6 keep/revert decisions

| Candidate | Decision | Reason |
|---|---|---|
| Early RoleAssignment `$project` | **REVERT** | No DB-operation reduction; snapshot P95 203.28→256.68 ms and Group-3 P95 155.78→177.92 ms. |
| Earlier `$match` | **KEEP EXISTING / no change** | Match is already the first outer and inner lookup stage; nothing could move earlier safely. |
| Shared one-command base aggregation | **REVERT** | Commands 4→1 and CPU fell, but snapshot P50/P95 82.61/117.18→152.00/204.43 ms and Group-3 106.31/199.93→168.89/270.15 ms. |
| Change parallelism | **REVERT / no change** | Existing four independent aggregations already use `Promise.all`; consolidation showed serializing them harms latency. |

Final application source is the O5-retained implementation. All O6 diagnostic switches/functions were removed.
