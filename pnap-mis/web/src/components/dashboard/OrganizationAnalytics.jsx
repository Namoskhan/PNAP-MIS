import { useTranslation } from 'react-i18next';
import { SkeletonKpiGrid } from '../Skeleton';
import { HBar, PieChart, BRAND } from '../charts';
import { ChevronLeftIcon } from '../icons';
import ScopeBreadcrumb from './ScopeBreadcrumb';
import useAnalytics from './useAnalytics';

// Section 2 — one card per child unit of the current scope, plus the
// province-wise distribution charts.

const ACTIVE_COLOR = 'var(--success)';
const INACTIVE_COLOR = 'var(--muted-soft)';
const CHART_LIMIT = 10;

function Stat({ label, value, accent }) {
  return (
    <div className="dash-unit-stat">
      <span>{label}</span>
      <strong style={accent ? { color: accent } : undefined}>{(value ?? 0).toLocaleString()}</strong>
    </div>
  );
}

function ChartCard({ title, sub, children }) {
  return (
    <div className="chart-card">
      <div className="chart-card-head">
        <div>
          <div className="chart-card-title">{title}</div>
          {sub && <div className="chart-card-sub">{sub}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}

function DrillNav({ trail, onNavigate }) {
  const { t } = useTranslation();
  if (!trail || trail.length < 2) return null;
  const parent = trail[trail.length - 2];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      flexWrap: 'wrap', marginBottom: 12,
      paddingBottom: 10, borderBottom: '1px solid var(--border)',
    }}>
      <button
        type="button"
        className="btn secondary sm"
        onClick={() => onNavigate(parent.level, parent._id)}
      >
        <ChevronLeftIcon size={13} /> {t('dashboard.backToScope', 'Back to {{name}}', { name: parent.name })}
      </button>
      <ScopeBreadcrumb trail={trail} onNavigate={onNavigate} />
    </div>
  );
}

export default function OrganizationAnalytics({ params, onDrill, trail, onNavigate }) {
  const { t } = useTranslation();
  const { data, loading, error } = useAnalytics('/dashboard/org-breakdown', params);

  const levelNoun = {
    PROVINCE: t('units.provinces', 'Provinces'),
    DISTRICT: t('units.districts', 'Districts'),
    AREA: t('units.areas', 'Areas'),
    BASIC_UNIT: t('units.basicUnits', 'Basic Units'),
  };

  const levelNounSingular = {
    PROVINCE: t('units.province', 'Province'),
    DISTRICT: t('units.district', 'District'),
    AREA: t('units.area', 'Area'),
    BASIC_UNIT: t('units.basicUnit', 'Basic Unit'),
  };

  if (loading && !data) return <SkeletonKpiGrid count={4} />;
  if (error) return <div className="alert error">{error}</div>;

  if (!data || !data.level) {
    return (
      <>
        <DrillNav trail={trail} onNavigate={onNavigate} />
        <div className="empty-smart" style={{ padding: '28px 16px' }}>
          <div className="empty-icon">🏢</div>
          <p style={{ margin: 0 }}>
            {t('dashboard.basicUnitLowestTier', 'This is a Basic Unit — the lowest tier, so there is nothing below it to break down.')}
          </p>
        </div>
      </>
    );
  }

  const rows = data.rows || [];
  if (rows.length === 0) {
    return (
      <>
        <DrillNav trail={trail} onNavigate={onNavigate} />
        <div className="empty-smart" style={{ padding: '28px 16px' }}>
          <div className="empty-icon">🏢</div>
          <p style={{ margin: 0 }}>
            {t('dashboard.noUnitsInScope', 'No {{tier}} in this scope yet.', { tier: (levelNoun[data.level] || data.level).toLowerCase() })}
          </p>
        </div>
      </>
    );
  }

  const charted = rows.slice(0, CHART_LIMIT);
  const truncated = rows.length > CHART_LIMIT;
  const noun = levelNoun[data.level] || data.level;
  const canDrill = data.level !== 'BASIC_UNIT';

  const sum = (pick) => rows.reduce((a, r) => a + (pick(r) || 0), 0);
  const activeUnits = rows.filter((r) => r.isActiveUnit).length;

  return (
    <>
      <DrillNav trail={trail} onNavigate={onNavigate} />
      <div className="dash-unit-grid" style={{ marginBottom: 12 }}>
        {rows.map((r) => (
          <button
            key={r._id}
            type="button"
            className={`dash-unit-card${canDrill ? '' : ' leaf'}`}
            onClick={() => canDrill && onDrill(data.level, r._id)}
            aria-label={canDrill ? `${t('common.view', 'View')} ${r.name}` : r.name}
          >
            <div className="dash-unit-card-head">
              <span className="dash-unit-card-name">
                {r.name}
                {r.code && <span className="muted" style={{ fontWeight: 500 }}> ({r.code})</span>}
              </span>
              <span className={`badge ${r.isActiveUnit ? 'ACTIVE' : 'INACTIVE'}`}>
                {r.isActiveUnit ? t('common.active', 'ACTIVE') : t('common.inactive', 'INACTIVE')}
              </span>
            </div>

            <div className="dash-unit-stats">
              <Stat label={t('dashboard.membershipBand', 'Members')} value={r.members.total} />
              {r.districts && <Stat label={t('units.districts', 'Districts')} value={r.districts.total} />}
              {r.areas && <Stat label={t('units.areas', 'Areas')} value={r.areas.total} />}
              {r.basicUnits && <Stat label={t('dashboard.units', 'Units')} value={r.basicUnits.total} />}
              <Stat label={t('dashboard.activeMemShort', 'Active mem.')} value={r.members.active} accent="var(--success)" />
              <Stat label={t('dashboard.inactiveMemShort', 'Inactive mem.')} value={r.members.inactive} />
              {r.basicUnits && <Stat label={t('dashboard.activeUnits', 'Active units')} value={r.basicUnits.active} accent="var(--success)" />}
              {r.basicUnits && <Stat label={t('dashboard.inactiveUnits', 'Inactive units')} value={r.basicUnits.inactive} />}
            </div>

            <div className="dash-unit-card-foot">
              <span>
                {r.recentActivity.events.toLocaleString()} {t('dashboard.events', 'events')} ·{' '}
                {r.recentActivity.lastActivityAt
                  ? new Date(r.recentActivity.lastActivityAt).toLocaleDateString()
                  : t('dashboard.noActivityRecorded', 'no activity')}
              </span>
              {canDrill && <span style={{ color: 'var(--primary-dark)', fontWeight: 600 }}>{t('common.view', 'View')} →</span>}
            </div>
          </button>
        ))}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 10,
      }}>
        <ChartCard
          title={`${noun} — ${t('dashboard.membershipBand', 'membership')}`}
          sub={truncated ? t('dashboard.topLimitBySize', 'Top {{limit}} by size', { limit: CHART_LIMIT }) : t('dashboard.membersPerUnit', 'Members per {{noun}}', { noun: levelNounSingular[data.level]?.toLowerCase() })}
        >
          <HBar rows={charted.map((r) => ({ label: r.name, value: r.members.total }))} accent={BRAND.dark} />
        </ChartCard>

        {rows.some((r) => r.basicUnits) && (
          <ChartCard title={`${noun} — ${t('units.basicUnits', 'basic units')}`} sub={t('dashboard.basicUnitsBeneath', 'Basic units beneath each')}>
            <HBar rows={charted.map((r) => ({ label: r.name, value: r.basicUnits?.total || 0 }))} accent={BRAND.mid} />
          </ChartCard>
        )}
        {rows.some((r) => r.areas) && (
          <ChartCard title={`${noun} — ${t('units.areas', 'areas')}`} sub={t('dashboard.areasBeneath', 'Areas beneath each')}>
            <HBar rows={charted.map((r) => ({ label: r.name, value: r.areas?.total || 0 }))} accent={BRAND.bright} />
          </ChartCard>
        )}
        {rows.some((r) => r.districts) && (
          <ChartCard title={`${noun} — ${t('units.districts', 'districts')}`} sub={t('dashboard.districtsBeneath', 'Districts beneath each')}>
            <HBar rows={charted.map((r) => ({ label: r.name, value: r.districts?.total || 0 }))} accent={BRAND.light} />
          </ChartCard>
        )}

        <ChartCard title={t('dashboard.activeVsInactiveUnits', 'Active vs inactive {{tier}}', { tier: noun.toLowerCase() })} sub={t('dashboard.byKeyOfficeBearerActivity', 'By key office-bearer activity')}>
          <PieChart
            segments={[
              { label: t('common.active', 'Active'), value: activeUnits, color: ACTIVE_COLOR },
              { label: t('common.inactive', 'Inactive'), value: rows.length - activeUnits, color: INACTIVE_COLOR },
            ]}
            size={104}
          />
        </ChartCard>
        <ChartCard title={t('dashboard.activeVsInactiveMembers', 'Active vs inactive members')} sub={t('dashboard.acrossTheseUnits', 'Across these {{tier}}', { tier: noun.toLowerCase() })}>
          <PieChart
            segments={[
              { label: t('common.active', 'Active'), value: sum((r) => r.members.active), color: ACTIVE_COLOR },
              { label: t('common.inactive', 'Inactive'), value: sum((r) => r.members.inactive), color: INACTIVE_COLOR },
            ]}
            size={104}
          />
        </ChartCard>
      </div>
    </>
  );
}
