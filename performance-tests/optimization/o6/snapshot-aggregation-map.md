# Snapshot aggregation map

One cold `orgSnapshot` performs eight snapshot operations in two parallel groups: four projected lean unit reads, then four parallel `officeBearerActivity(level)` aggregations. Authentication adds one request-level user lookup to harness DB-operation totals.

| # | Collection | Purpose | Filter / stages | Returned | Consumer |
|---:|---|---|---|---:|---|
| 1 | provinces | Unit labels/IDs | scoped `find`, projection `name code` | 3 | province decoration |
| 2 | districts | Unit hierarchy | scoped `find`, projection `name code provinceId` | 9 | district decoration/path |
| 3 | areas | Unit hierarchy | scoped `find`, projection `name districtId provinceId` | 24 | area decoration/path |
| 4 | basicunits | Unit hierarchy | scoped `find`, projection `name areaId districtId provinceId` | 48 | basic-unit decoration/path |
| 5 | roleassignments | Basic-unit officer activity | early `$match` → projected member `$lookup` → `$unwind` → `$group` | 46 groups | basic-unit activity map |
| 6 | roleassignments | Area officer activity | same stages, AREA role constraint | 24 groups | area activity map |
| 7 | roleassignments | District officer activity | same stages, DISTRICT role constraint | 8 groups | district activity map |
| 8 | roleassignments | Province officer activity | same stages, province role constraint | 2 groups | province activity map |

The `$match` is already first and filters `unitLevel`, level-specific key `roleCode`, `APPROVED`, and missing `endedAt`. The `$lookup` joins members by `_id` and projects only `fullName`, `memberId`, `phone`, and `lastActivityAt`. There is no `$sort` or `$facet` in the retained pipeline.
