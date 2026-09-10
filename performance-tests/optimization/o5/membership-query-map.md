# Membership query map

`GET /api/dashboard/membership` → `dashboardRoutes.js` (`SUPER_ONLY`) → `dashboardController.membership` → `parseFilters` → `analyticsService.membershipAnalytics`.

The O4 baseline performed eight captured DB operations: authenticated user lookup, three `members` aggregations (totals, tier `$facet`, monthly trend), and four projected `.lean()` unit-directory finds. The three member aggregations used the same scope match and each examined 384 member documents in the measured Central case. Node then joins grouped counts to 3 provinces, 9 districts, 24 areas, and 48 basic units, sorts each tier by total/name, fills 12 month buckets, and serializes the response.

The retained O5 implementation uses one top-level `$facet` containing totals, trend, and each requested tier group. It preserves parallel execution with the four unit-directory reads. Captured operations fall from eight to six, and member documents examined across diagnostic aggregation replays fall from 1,152 to 384.
