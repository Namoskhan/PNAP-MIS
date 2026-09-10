# Inactive-units query map

`GET /api/dashboard/inactive-units` → `dashboardRoutes.js` (`SUPER_ONLY`) → `dashboardController.inactiveUnits` → `parseFilters` → `analyticsService.inactiveUnits`.

The function validates level/page/limit and awaits the O4 `orgSnapshot`. On a cold isolated request, that snapshot performs four projected lean unit reads and four role-assignment/member activity aggregations (plus authentication lookup). `inactiveUnits` itself performs no MongoDB query, lookup, populate, or aggregation. It builds path-name maps, filters active/inactive units, sorts by `lastActivityAt`, slices the requested page, and constructs the actionable officer/path response.

Under the staged dashboard, summary/org-breakdown build the same-key snapshot first, so inactive-units reuses it and adds zero DB operations. Its response is 874 bytes for the measured default page. No O5 change was retained: changing the snapshot would reopen O4, while replacing the small in-memory sort/map work showed no evidence-supported benefit and risked sort/pagination semantics.
