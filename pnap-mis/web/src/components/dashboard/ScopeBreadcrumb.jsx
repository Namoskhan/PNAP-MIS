import { useTranslation } from 'react-i18next';

// Breadcrumb for the drill-down scope: Pakistan > KPK > Mardan > …
export default function ScopeBreadcrumb({ trail, onNavigate }) {
  const { t } = useTranslation();
  const crumbs = trail && trail.length ? trail : [{ level: 'NATIONAL', _id: null, name: 'Pakistan' }];

  const levelLabels = {
    NATIONAL: t('units.central', 'National'),
    PROVINCE: t('units.province', 'Province'),
    DISTRICT: t('units.district', 'District'),
    AREA: t('units.area', 'Area'),
    BASIC_UNIT: t('units.basicUnit', 'Basic Unit'),
  };

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
              title={isCurrent ? undefined : `${t('common.back', 'Back')} to ${c.name}`}
              onClick={() => !isCurrent && onNavigate(c.level, c._id)}
            >
              {c.name}
              {isCurrent && c.level !== 'NATIONAL' && (
                <span className="muted" style={{ fontWeight: 500, marginInlineStart: 6, fontSize: 11 }}>
                  {levelLabels[c.level] || c.level}
                </span>
              )}
            </button>
          </span>
        );
      })}
    </nav>
  );
}
