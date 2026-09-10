# Phase O6 — Role-Assignment Snapshot Aggregation Optimization

Focused local/non-production analysis of the four `orgSnapshot` role-assignment aggregations. Raw evidence is under `performance-tests/results/optimization/o6/`; O1–O5 artifacts were not modified.

Environment: Node v24.11.0, MongoDB 8.2.5, `mongodb://127.0.0.1:27017/pnap_mis`, dbPath `D:\MongoDB\data`, database disk D:, 8 logical processors, 8 GiB installed RAM. Normal backend/frontend ports are 5000/5173; the harness used ephemeral localhost ports serving the production Vite build. No commit, push, PR, index, cache, schema, authentication, authorization, O4 single-flight, or scheduling change was made.
