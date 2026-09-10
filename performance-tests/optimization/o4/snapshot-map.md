# Organization Snapshot Map

- **File/function:** `server/src/services/analyticsService.js` → `orgSnapshot(f)` via `cached('org', f, producer)`.
- **Storage:** process-local `Map` named `cache`, bounded to 40 completed values.
- **TTL:** 45 seconds; O4 does not change it.
- **Key:** prefix, `from`, `to` (or `now`), `provinceId`, `districtId`, `areaId`, `basicUnitId`, and `memberStatus`.
- **Build:** four scoped lean unit reads followed by four parallel `officeBearerActivity` aggregations, then Node-side decoration.
- **Invalidation:** `invalidateCache()` clears completed values. Activity writers may call it; TTL remains the general freshness bound.
- **Actual snapshot consumers:** `summary`, `orgBreakdown` (and its compatibility wrapper), and `inactiveUnits`.
- **Non-consumers after O2:** membership, campaigns and reports use lightweight `unitDirectory`; scope, meetings and inactive-members do not consume the snapshot.
- **Cold behavior before O4:** completed-value lookup occurs before `producer()`, but there was no in-progress Promise registry. Concurrent same-key misses could each run `producer()`.

