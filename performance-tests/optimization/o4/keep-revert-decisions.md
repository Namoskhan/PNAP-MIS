# O4 keep/revert decisions

| Change | Decision | Evidence |
|---|---|---|
| Same-key organization snapshot Promise coalescing | **KEEP** | Builds 3→1, Group-3 DB operations 35→19, equivalent responses, separate scope keys, failure cleanup and retry passed, no retained entries. |
| Critical-first widget scheduling | **KEEP** | Primary P50/P95 227.93/433.53→133.02/207.57 ms; full P50/P95 230.24/438.58→224.80/330.51 ms; all nine widget requests and response hashes preserved. |

No cache TTL, invalidation, index, authentication, authorization, persistent-cache, deployment, or bundle behavior was changed.
