import { SkeletonKpiGrid } from '../Skeleton';
import { HBar, PieChart, BRAND } from '../charts';
import { ChevronLeftIcon } from '../icons';
import ScopeBreadcrumb from './ScopeBreadcrumb';
import useAnalytics from './useAnalytics';

// Section 2 — one card per child unit of the current scope, plus the
// province-wise distribution charts.
//
// Clicking a card drills the WHOLE dashboard into that unit; it does
// not navigate away and it does not open a dropdown. The card grid
// re-renders at the next tier down and every other section re-queries
// against the narrower scope.

const ACTIVE_COLOR = 'var(--success)';
const INACTIVE_COLOR = 'var(--muted-soft)';
const CHART_LIMIT = 10;

const LEVEL_NOUN = {
  PROVINCE: 'Provinces',
  DISTRICT: 'Districts',
  AREA: 'Areas',
  BASIC_UNIT: 'Basic Units',
};

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

// Local way back, rendered directly above the cards. Drilling happens
// here, so the return path belongs here too — expecting the user to
// scroll back to the page-level trail after every click is how you end
// up in a hierarchy with no exit.
function DrillNav({ trail, onNavigate }) {
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
        <ChevronLeftIcon size={13} /> Back to {parent.name}
      </button>
      <ScopeBreadcrumb trail={trail} onNavigate={onNavigate} />
    </div>
  );
}

export default function OrganizationAnalytics({ params, onDrill, trail, onNavigate }) {
  const { data, loading, error } = useAnalytics('/dashboard/org-breakdown', params);

  if (loading && !data) return <SkeletonKpiGrid count={4} />;
  if (error) return <div className="alert error">{error}</div>;

  // The two dead ends below are precisely where a user gets stranded,
  // so both render the back control FIRST and only then explain why
  // there is nothing to show.
  if (!data || !data.level) {
    return (
      <>
        <DrillNav trail={trail} onNavigate={onNavigate} />
        <div className="empty-smart" style={{ padding: '28px 16px' }}>
          <div className="empty-icon">🏢</div>
          <p style={{ margin: 0 }}>
            This is a Basic Unit — the lowest tier, so there is nothing below it
            to break down.
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
          <p style={{ margin: 0 }}>No {LEVEL_NOUN[data.level].toLowerCase()} in this scope yet.</p>
        </div>
      </>
    );
  }

  const charted = rows.slice(0, CHART_LIMIT);
  const truncated = rows.length > CHART_LIMIT;
  const noun = LEVEL_NOUN[data.level];
  const canDrill = data.level !== 'BASIC_UNIT';

  // Roll the per-unit tallies up into the section's own totals so the
  // active/inactive pies describe this tier, not the whole country.
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
            aria-label={canDrill ? `Drill into ${r.name}` : r.name}
          >
            <div className="dash-unit-card-head">
              <span className="dash-unit-card-name">
                {r.name}
                {r.code && <span className="muted" style={{ fontWeight: 500 }}> ({r.code})</span>}
              </span>
              <span className={`badge ${r.isActiveUnit ? 'ACTIVE' : 'INACTIVE'}`}>
                {r.isActiveUnit ? 'ACTIVE' : 'INACTIVE'}
              </span>
            </div>

            <div className="dash-unit-stats">
              <Stat label="Members" value={r.members.total} />
              {r.districts && <Stat label="Districts" value={r.districts.total} />}
              {r.areas && <Stat label="Areas" value={r.areas.total} />}
              {r.basicUnits && <Stat label="Units" value={r.basicUnits.total} />}
              <Stat label="Active mem." value={r.members.active} accent="var(--success)" />
              <Stat label="Inactive mem." value={r.members.inactive} />
              {r.basicUnits && <Stat label="Active units" value={r.basicUnits.active} accent="var(--success)" />}
              {r.basicUnits && <Stat label="Inactive units" value={r.basicUnits.inactive} />}
            </div>

            <div className="dash-unit-card-foot">
              <span>
                {r.recentActivity.events.toLocaleString()} events ·{' '}
                {r.recentActivity.lastActivityAt
                  ? new Date(r.recentActivity.lastActivityAt).toLocaleDateString()
                  : 'no activity'}
              </span>
              {canDrill && <span style={{ color: 'var(--primary-dark)', fontWeight: 600 }}>View →</span>}
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
          title={`${noun} — membership`}
          sub={truncated ? `Top ${CHART_LIMIT} by size` : `Members per ${noun.toLowerCase().replace(/s$/, '')}`}
        >
          <HBar rows={charted.map((r) => ({ label: r.name, value: r.members.total }))} accent={BRAND.dark} />
        </ChartCard>

        {rows.some((r) => r.basicUnits) && (
          <ChartCard title={`${noun} — basic units`} sub="Basic units beneath each">
            <HBar rows={charted.map((r) => ({ label: r.name, value: r.basicUnits?.total || 0 }))} accent={BRAND.mid} />
          </ChartCard>
        )}
        {rows.some((r) => r.areas) && (
          <ChartCard title={`${noun} — areas`} sub="Areas beneath each">
            <HBar rows={charted.map((r) => ({ label: r.name, value: r.areas?.total || 0 }))} accent={BRAND.bright} />
          </ChartCard>
        )}
        {rows.some((r) => r.districts) && (
          <ChartCard title={`${noun} — districts`} sub="Districts beneath each">
            <HBar rows={charted.map((r) => ({ label: r.name, value: r.districts?.total || 0 }))} accent={BRAND.light} />
          </ChartCard>
        )}

        <ChartCard title={`Active vs inactive ${noun.toLowerCase()}`} sub="By key office-bearer activity">
          <PieChart
            segments={[
              { label: 'Active', value: activeUnits, color: ACTIVE_COLOR },
              { label: 'Inactive', value: rows.length - activeUnits, color: INACTIVE_COLOR },
            ]}
            size={104}
          />
        </ChartCard>
        <ChartCard title="Active vs inactive members" sub={`Across these ${noun.toLowerCase()}`}>
          <PieChart
            segments={[
              { label: 'Active', value: sum((r) => r.members.active), color: ACTIVE_COLOR },
              { label: 'Inactive', value: sum((r) => r.members.inactive), color: INACTIVE_COLOR },
            ]}
            size={104}
          />
        </ChartCard>
      </div>
    </>
  );
}
