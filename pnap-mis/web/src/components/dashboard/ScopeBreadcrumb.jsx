// Breadcrumb for the drill-down scope: Pakistan > KPK > Mardan > …
//
// The trail is resolved server-side (GET /dashboard/scope) rather than
// accumulated in the client, so a scope restored from a link or a
// reload still shows real unit names instead of ids.
//
// Every crumb except the last is a button that truncates the scope
// back to that level — the only way back up, since drilling down is
// one-directional.

const LEVEL_LABEL = {
  NATIONAL: 'National',
  PROVINCE: 'Province',
  DISTRICT: 'District',
  AREA: 'Area',
  BASIC_UNIT: 'Basic Unit',
};

export default function ScopeBreadcrumb({ trail, onNavigate }) {
  const crumbs = trail && trail.length ? trail : [{ level: 'NATIONAL', _id: null, name: 'Pakistan' }];

  return (
    <nav className="dash-crumbs" aria-label="Organizational scope">
      {crumbs.map((c, i) => {
        const isCurrent = i === crumbs.length - 1;
        return (
          <span key={c.level + String(c._id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {i > 0 && <span className="dash-crumb-sep" aria-hidden="true">›</span>}
            <button
              type="button"
              className={`dash-crumb${isCurrent ? ' current' : ''}`}
              aria-current={isCurrent ? 'page' : undefined}
              disabled={isCurrent}
              title={isCurrent ? undefined : `Back to ${c.name}`}
              onClick={() => !isCurrent && onNavigate(c.level, c._id)}
            >
              {c.name}
              {isCurrent && c.level !== 'NATIONAL' && (
                <span className="muted" style={{ fontWeight: 500, marginLeft: 6, fontSize: 11 }}>
                  {LEVEL_LABEL[c.level]}
                </span>
              )}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
