# O7 Large-Volume Optimization Candidates

- Isolate member lookup/group query-shape alternatives at 10k and 50k while preserving response equivalence.
- Test bounded projection or lookup restructuring only as controlled O8 candidates; the O6 early projection and one-command consolidation failures must remain controls.
- Use profiler/stage-level evidence to separate lookup from group cost.
- Do not start with a new index phase: every source plan remained indexed and no COLLSCAN appeared.
- Do not justify denormalization or materialized snapshots from O7 alone; architectural changes need broader correctness and write-cost analysis.

