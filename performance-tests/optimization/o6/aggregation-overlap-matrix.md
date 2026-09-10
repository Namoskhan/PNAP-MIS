# Aggregation overlap matrix

| Dimension | Basic Unit | Area | District | Province | Overlap |
|---|---|---|---|---|---|
| Source | roleassignments | same | same | same | HIGH |
| State/end filter | APPROVED, no endedAt | same | same | same | HIGH |
| Unit-level filter | BASIC_UNIT | AREA | DISTRICT | PROVINCE | NONE |
| Key roles | secretary trio | same trio | same trio | president/general/finance | MEDIUM |
| Member lookup | `_id = memberId` | same | same | same | HIGH |
| Joined fields | name/code/phone/activity | same | same | same | HIGH |
| Group key | unitId | unitId | unitId | unitId | HIGH |
| Date handling | latest member activity | same | same | same | HIGH |

Structural overlap is high, but each tier has a disjoint source match and the four commands currently execute in parallel. A shared `$or` aggregation was therefore safe semantically but slower operationally.
