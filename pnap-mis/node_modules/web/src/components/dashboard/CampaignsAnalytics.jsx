import SmartKpi from '../SmartKpi';
import { SkeletonKpiGrid } from '../Skeleton';
import { HBar, AreaChart, PieChart, BRAND } from '../charts';
import { TargetIcon, CheckIcon, ClockIcon, UsersIcon } from '../icons';
import useAnalytics from './useAnalytics';

// Section 5 — campaigns by lifecycle stage, per unit, plus the reach
// metrics the activity module already captures on each campaign.

const LEVEL_NOUN = {
  PROVINCE: 'Province', DISTRICT: 'District',
  AREA: 'Area', BASIC_UNIT: 'Basic Unit',
};

// Bar accent per tier, so the four breakdowns read as one family
// stepping down the hierarchy rather than four unrelated charts.
const LEVEL_ACCENT = {
  PROVINCE: BRAND.dark,
  DISTRICT: BRAND.mid,
  AREA: BRAND.bright,
  BASIC_UNIT: BRAND.light,
};

function ChartCard({ title, sub, meta, children }) {
  return (
    <div className="chart-card">
      <div className="chart-card-head">
        <div>
          <div className="chart-card-title">{title}</div>
          {sub && <div className="chart-card-sub">{sub}</div>}
        </div>
        {meta && <div className="chart-card-meta">{meta}</div>}
      </div>
      {children}
    </div>
  );
}

export default function CampaignsAnalytics({ params, windowLabel }) {
  const { data, loading, error } = useAnalytics('/dashboard/campaigns', params);

  if (loading && !data) return <SkeletonKpiGrid count={4} />;
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return null;

  const t = data.totals;
  const levels = data.levels || [];

  if (t.total === 0) {
    return (
      <div className="empty-smart" style={{ padding: '28px 16px' }}>
        <div className="empty-icon">🎯</div>
        <p style={{ margin: 0 }}>No campaigns recorded in the {windowLabel} for this scope.</p>
      </div>
    );
  }

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 10, marginBottom: 12,
      }}>
        <SmartKpi
          label="Active Campaigns" value={t.running}
          icon={<TargetIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        <SmartKpi
          label="Completed Campaigns" value={t.completed}
          icon={<CheckIcon size={14} />}
          iconBg="var(--success-bg)" iconColor="var(--success)"
        />
        <SmartKpi
          label="Upcoming Campaigns" value={t.upcoming}
          icon={<ClockIcon size={14} />}
          iconBg="var(--warning-bg)" iconColor="var(--warning)"
        />
        {data.reach && (
          <SmartKpi
            label="People Contacted" value={data.reach.peopleContacted}
            icon={<UsersIcon size={14} />}
            iconBg="var(--primary-tint)" iconColor="var(--primary)"
          />
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 10,
      }}>
        <ChartCard
          title="Campaign trend"
          sub="Campaigns per month, last 12 months"
          meta={`${t.total.toLocaleString()} in ${windowLabel}`}
        >
          {data.trend && data.trend.length > 1 ? (
            <AreaChart
              values={data.trend.map((b) => b.total)}
              labels={data.trend.map((b) => b.label)}
              height={140}
              color={BRAND.dark}
              fill={BRAND.tint}
            />
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Not enough history yet.</p>
          )}
        </ChartCard>

        <ChartCard title="Campaigns by stage" sub={windowLabel}>
          <PieChart
            segments={[
              { label: 'Running', value: t.running, color: BRAND.dark },
              { label: 'Upcoming', value: t.upcoming, color: 'var(--warning)' },
              { label: 'Completed', value: t.completed, color: 'var(--success)' },
              { label: 'Cancelled', value: t.cancelled, color: 'var(--muted-soft)' },
            ].filter((s) => s.value > 0)}
            size={104}
          />
        </ChartCard>

        {/* One breakdown per tier beneath the current scope — at
            national that is province-wise, district-wise, area-wise and
            basic-unit-wise, all visible at once. */}
        {levels.map((lvl) => {
          const rows = data.byLevel[lvl] || [];
          const attributed = rows.reduce((a, r) => a + r.total, 0);
          return (
            <ChartCard
              key={lvl}
              title={`${LEVEL_NOUN[lvl]}-wise campaigns`}
              sub="All stages"
              // A campaign run AT district level belongs to no area, so
              // the area-wise bars legitimately sum to less than the
              // grand total. Saying so beats letting it read as data loss.
              meta={attributed < t.total ? `${attributed} of ${t.total}` : undefined}
            >
              <HBar
                rows={rows.slice(0, 10).map((r) => ({ label: r.name, value: r.total }))}
                accent={LEVEL_ACCENT[lvl]}
              />
            </ChartCard>
          );
        })}

        {data.reach && (
          <ChartCard title="Campaign reach" sub="Aggregated across recorded campaigns">
            <div style={{ display: 'grid', gap: 7, fontSize: 13 }}>
              {[
                ['Households visited', data.reach.householdsVisited],
                ['People contacted', data.reach.peopleContacted],
                ['Expected joiners', data.reach.expectedJoiners],
                ['Actual joiners', data.reach.actualJoiners],
                ['Volunteer hours', data.reach.volunteerHours],
              ].map(([label, v]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">{label}</span>
                  <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{(v || 0).toLocaleString()}</strong>
                </div>
              ))}
              {data.reach.conversionPct != null && (
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  borderTop: '1px solid var(--border)', paddingTop: 7,
                }}>
                  <span className="muted">Conversion</span>
                  <strong style={{ color: 'var(--success)' }}>{data.reach.conversionPct}%</strong>
                </div>
              )}
            </div>
          </ChartCard>
        )}
      </div>
    </>
  );
}
