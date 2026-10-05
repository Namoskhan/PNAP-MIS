import { useTranslation } from 'react-i18next';
import SmartKpi from '../SmartKpi';
import { SkeletonKpiGrid } from '../Skeleton';
import { HBar, AreaChart, PieChart, BRAND } from '../charts';
import { TargetIcon, CheckIcon, ClockIcon, UsersIcon } from '../icons';
import useAnalytics from './useAnalytics';

// Section 5 — campaigns by lifecycle stage, per unit, plus the reach
// metrics the activity module already captures on each campaign.

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

export default function CampaignsAnalytics({ params, windowLabel, showResults = true }) {
  const { t } = useTranslation();
  const { data, loading, error } = useAnalytics('/dashboard/campaigns', params);

  const levelNoun = {
    PROVINCE: t('units.province', 'Province'),
    DISTRICT: t('units.district', 'District'),
    AREA: t('units.area', 'Area'),
    BASIC_UNIT: t('units.basicUnit', 'Basic Unit'),
  };

  if (loading && !data) return <SkeletonKpiGrid count={4} />;
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return null;

  const totals = data.totals;
  const levels = data.levels || [];

  if (totals.total === 0) {
    return (
      <div className="empty-smart" style={{ padding: '28px 16px' }}>
        <div className="empty-icon">🎯</div>
        <p style={{ margin: 0 }}>
          {t('dashboard.noCampaignsRecorded', 'No campaigns recorded in the {{windowLabel}} for this selection.', { windowLabel })}
        </p>
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
          label={t('dashboard.activeCampaigns', 'Active Campaigns')} value={totals.running}
          icon={<TargetIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        <SmartKpi
          label={t('dashboard.completedCampaigns', 'Completed Campaigns')} value={totals.completed}
          icon={<CheckIcon size={14} />}
          iconBg="var(--success-bg)" iconColor="var(--success)"
        />
        <SmartKpi
          label={t('dashboard.upcomingCampaigns', 'Upcoming Campaigns')} value={totals.upcoming}
          icon={<ClockIcon size={14} />}
          iconBg="var(--warning-bg)" iconColor="var(--warning)"
        />
        {data.reach && (
          <SmartKpi
            label={t('dashboard.peopleContacted', 'People Contacted')} value={data.reach.peopleContacted}
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
          title={t('dashboard.campaignsEachMonth', 'Campaigns each month')}
          sub={t('dashboard.campaignsPerMonth12', 'Campaigns per month, last 12 months')}
          meta={`${totals.total.toLocaleString()} ${t('common.in', 'in')} ${windowLabel}`}
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
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t('dashboard.notEnoughDataChart', 'Not enough data to show this chart yet.')}</p>
          )}
        </ChartCard>

        <ChartCard title={t('dashboard.campaignStatus', 'Campaign status')} sub={windowLabel}>
          <PieChart
            segments={[
              { label: t('dashboard.running', 'Running'), value: totals.running, color: BRAND.dark },
              { label: t('dashboard.upcoming', 'Upcoming'), value: totals.upcoming, color: 'var(--warning)' },
              { label: t('common.completed', 'Completed'), value: totals.completed, color: 'var(--success)' },
              { label: t('common.cancelled', 'Cancelled'), value: totals.cancelled, color: 'var(--muted-soft)' },
            ].filter((s) => s.value > 0)}
            size={104}
          />
        </ChartCard>

        {/* One breakdown per tier beneath the current scope */}
        {levels.map((lvl) => {
          const rows = data.byLevel[lvl] || [];
          const attributed = rows.reduce((a, r) => a + r.total, 0);
          return (
            <ChartCard
              key={lvl}
              title={`${t('dashboard.campaignsBy', 'Campaigns by')} ${levelNoun[lvl] || lvl}`}
              sub={t('dashboard.allCampaignStatuses', 'All campaign statuses')}
              meta={attributed < totals.total ? `${attributed} ${t('common.of', 'of')} ${totals.total}` : undefined}
            >
              <HBar
                rows={rows.slice(0, 10).map((r) => ({ label: r.name, value: r.total }))}
                accent={LEVEL_ACCENT[lvl]}
              />
            </ChartCard>
          );
        })}

        {showResults && data.reach && (
          <ChartCard title={t('dashboard.campaignResults', 'Campaign results')} sub={t('dashboard.totalsRecordedCampaigns', 'Totals from all recorded campaigns')}>
            <div style={{ display: 'grid', gap: 7, fontSize: 13 }}>
              {[
                [t('dashboard.homesVisited', 'Homes visited'), data.reach.householdsVisited],
                [t('dashboard.peopleContacted', 'People contacted'), data.reach.peopleContacted],
                [t('dashboard.peopleExpectedJoin', 'People expected to join'), data.reach.expectedJoiners],
                [t('dashboard.peopleWhoJoined', 'People who joined'), data.reach.actualJoiners],
                [t('dashboard.volHoursLong', 'Volunteer hours'), data.reach.volunteerHours],
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
                  <span className="muted">{t('dashboard.peopleWhoJoinedVsExpected', 'People who joined compared with the expected number (%)')}</span>
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
