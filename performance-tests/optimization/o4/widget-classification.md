# Dashboard Widget Criticality

## Critical initial

- Scope/breadcrumb: establishes what organization the user is viewing.
- Executive summary: primary headline member/unit state.
- Organization breakdown: immediate structural comparison shown near the top of Command Center.

## Secondary

- Membership trends, campaigns, meetings and reports analytics.
- Inactive-unit and inactive-member detail tables.
- Unit report download controls/metadata.
- Shell authentication, branding, notification and the single province list remain normal shell work and are not removed.

The experiment uses a scheduling boundary after all three critical API calls settle, without an artificial delay. Every secondary request still runs.

