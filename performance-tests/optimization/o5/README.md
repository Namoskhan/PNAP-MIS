# Phase O5 — Membership and Inactive-Unit Query Optimization

Focused local/non-production analysis of the O4-retained membership and inactive-unit paths. Raw evidence is under `performance-tests/results/optimization/o5/`. O1–O4 evidence was not modified.

Environment: Node v24.11.0, MongoDB 8.2.5, `mongodb://127.0.0.1:27017/pnap_mis`, dbPath `D:\MongoDB\data`, 8 logical processors, 8 GiB installed RAM, database on D:. Normal backend/frontend ports are 5000/5173; the harness used ephemeral localhost ports and the production Vite build. No commits, pushes, PRs, index changes, cache changes, or authorization changes were made.
