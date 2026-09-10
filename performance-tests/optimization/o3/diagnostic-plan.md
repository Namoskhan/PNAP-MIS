# O3 Diagnostic Plan

- Preserve O1/O2 evidence and application data/index fingerprints.
- Reproduce all nine dashboard APIs with 3 warmups and 30 current-state samples.
- Alternate current/control requests for summary, org-breakdown and inactive-units.
- Independently alternate lean/hydrated and parallel/sequential unit-directory states.
- Measure isolated and four fan-out groups with process/host CPU, memory, event-loop delay, MongoDB command time and request time.
- Compare query signatures, bytes and response hashes before making KEEP/REVERT decisions.
- Remove all temporary source toggles after evidence capture.

