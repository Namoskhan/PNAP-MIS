# Single-Flight Design

`orgSnapshotInFlight` is a process-local `Map` used only while an `orgSnapshot` build is active. Its key is the existing complete snapshot cache key: date window (`from`, `to`/`now`), province, district, area, basic unit, member status, plus the `org` prefix. Authorization middleware still constrains filters before the service is called.

The completed-value cache remains unchanged at 45 seconds/40 entries. On a same-key miss, the first caller stores the build Promise and later callers await it. A `finally` block removes only the matching Promise, including rejection. Different keys never share. No rejected Promise or new completed value lifetime is introduced.

