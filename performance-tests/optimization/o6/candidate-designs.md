# Candidate designs

## Candidate A — early source projection

Insert `$project { unitLevel, unitId, memberId, roleCode }` immediately after the existing first-stage `$match`. This removes unused RoleAssignment fields before lookup/group but retains four parallel commands.

## Candidate B — match earlier

Inspection confirmed `$match` is already the first stage, before lookup, unwind, and group. Lookup matching is also first inside the lookup pipeline. No mathematically equivalent earlier placement exists, so no redundant candidate was implemented.

## Candidate C — shared base aggregation

Replace four parallel commands with one `$or` match covering each level/role pair, perform one member lookup, group by `{level, unitId}`, then split results into per-level Maps in Node. This is equivalent to facet consolidation without a giant facet document.

Parallelism was deliberately unchanged in the final state. Candidate C demonstrated that fewer commands serialize work that the retained implementation runs concurrently.
