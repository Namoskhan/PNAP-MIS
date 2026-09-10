# O5 keep/revert decisions

| Candidate | Decision | Evidence |
|---|---|---|
| Combine membership totals, trend, and tier groups into one `$facet` | **KEEP** | DB operations 8→6; member scans 3→1; exact response hashes/shapes; interleaved P95 19.21→18.42 ms; staged dashboard DB operations 58→56 and P95 162.07→130.41 ms. |
| Remove unused membership row `_id` values | **REVERT / not applied** | Frontend search proves the values unused, but the retained DB candidate already delivers the supported benefit; preserving exact response compatibility was safer than a small payload-only contract change. |
| Rewrite inactive-unit sorting/path mapping | **REVERT / not applied** | No inactive-unit-specific DB query exists; only small in-memory work remains, with 874-byte output. No evidence supported a semantic-risking rewrite. |

No cache, index, O4 single-flight, staging, authentication, authorization, search, or pagination behavior changed.
