# O3 KEEP / REVERT Decisions

| O2 change | Decision | Evidence |
|---|---|---|
| Province request dedup | **KEEP** | Deterministic 16→13 request and 3→0 duplicate reduction; final DOM/security checks pass. |
| `unitDirectory().lean()` | **KEEP** | Equal responses; lean P95 beat hydrated for membership 31.74→61.64 ms, campaigns 22.75→24.12 ms, reports 15.26→17.03 ms (current→hydrated control). |
| Parallel unit-directory reads | **KEEP** | Equal responses; parallel P95 beat sequential for membership 19.37→21.41 ms, campaigns 18.84→23.74 ms, reports 15.06→31.71 ms. |
| Summary-count dedup | **KEEP; latency magnitude inconclusive** | One less DB operation. Fixed interleaved means/medians slightly favor current; P95 varied in opposite direction, while dashboard current/control P95 was 281.54/290.18 ms. No regression attribution. |
| Unused officer aggregation removal | **KEEP** | Twelve expensive `$lookup` aggregations remain eliminated from membership/campaigns/reports; isolated endpoints stay fast with identical responses. |

No O2 source change was reverted. Temporary diagnostic switches were removed.

