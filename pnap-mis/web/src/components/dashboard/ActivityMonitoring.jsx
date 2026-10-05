import { useTranslation } from 'react-i18next';
import { SkeletonCard } from '../Skeleton';
import { AreaChart, PieChart, HBar, BRAND } from '../charts';
import { ZapIcon } from '../icons';
import useAnalytics from './useAnalytics';

// Section 7 — what "active" actually means, made visible: the trend of
// recorded organizational activity, the active/inactive split at every
// tier, and the latest events.

const ACTIVE_COLOR = 'var(--success)';
const INACTIVE_COLOR = 'var(--muted-soft)';
const CATEGORY_COLORS = ['#2563eb', '#ea580c', '#0d9488', '#c026d3', '#a16207', '#7c3aed'];
const CATEGORY_MAX = 6;

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

export default function ActivityMonitoring({ params, summary, windowLabel }) {
  const { t } = useTranslation();
  const trend = useAnalytics('/dashboard/activity-trend', { ...params, months: 12 });
  const feed = useAnalytics('/dashboard/activity', { ...params, limit: 12 });

  const categoryLabels = {
    MEETING: t('dashboard.totalMeetings', 'Meetings'),
    ATTENDANCE: t('dashboard.attendance', 'Attendance'),
    ACTIVITY: t('dashboard.activityTypes', 'Activities'),
    FINANCE: t('dashboard.finance', 'Finance'),
    REPORT: t('dashboard.unitReports', 'Reports'),
    MEMBER: t('dashboard.membershipBand', 'Membership'),
    ROLE: t('dashboard.cabinetRoles', 'Cabinet roles'),
    COMMUNICATION: t('dashboard.announcements', 'Announcements'),
    ORGANIZATION: t('dashboard.organizationBand', 'Org management'),
    ADMIN: t('dashboard.administration', 'Administration'),
    OTHER: t('common.other', 'Other'),
  };

  const split = (active, inactive) => [
    { label: t('common.active', 'Active'), value: active, color: ACTIVE_COLOR },
    { label: t('common.inactive', 'Inactive'), value: inactive, color: INACTIVE_COLOR },
  ];

  const org = summary?.organization;
  const mem = summary?.membership;
  const buckets = trend.data?.buckets || [];
  const rawCategories = trend.data?.byCategory || [];

  const categories = rawCategories.slice(0, CATEGORY_MAX).map((c, i) => ({
    label: categoryLabels[c.category] || c.category,
    value: c.events,
    color: CATEGORY_COLORS[i],
  }));
  const overflow = rawCategories.slice(CATEGORY_MAX);
  if (overflow.length) {
    categories.push({
      label: `${t('common.other', 'Other')} (${overflow.length})`,
      value: overflow.reduce((s, c) => s + c.events, 0),
      color: 'var(--muted-soft)',
    });
  }

  return (
    <>
      <div className="dash-grid-3-2">
        <ChartCard
          title={t('dashboard.monthlyActivityTrend', 'Monthly activity trend')}
          sub={t('dashboard.recordedActionsPerMonth', 'Recorded organizational actions per month')}
          meta={`${buckets.reduce((s, b) => s + b.events, 0).toLocaleString()} ${t('dashboard.events', 'events')}`}
        >
          {trend.loading && !trend.data ? (
            <SkeletonCard lines={4} />
          ) : buckets.length > 1 ? (
            <AreaChart
              values={buckets.map((b) => b.events)}
              labels={buckets.map((b) => b.label)}
              height={150}
              color={BRAND.dark}
              fill={BRAND.tint}
              valueLabel={String(buckets[buckets.length - 1].events)}
            />
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t('dashboard.notEnoughHistory', 'Not enough history yet.')}</p>
          )}
        </ChartCard>

        <ChartCard title={t('dashboard.recentActivity', 'Recent activity')} sub={t('dashboard.latestRecordedActions', 'Latest recorded actions')}>
          {feed.loading && !feed.data ? (
            <SkeletonCard lines={5} />
          ) : !feed.data || feed.data.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              {t('dashboard.nothingRecordedWindow', 'Nothing recorded in this window.')}
            </p>
          ) : (
            <div className="dash-feed" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {feed.data.map((a) => (
                <div key={a._id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13 }}>
                  <ZapIcon size={12} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <strong>{a.action.replace(/_/g, ' ').toLowerCase()}</strong>
                      {a.targetLabel && <span className="muted"> · {a.targetLabel}</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {a.member?.fullName || t('dashboard.system', 'System')}
                      {a.province?.name ? ` · ${a.province.name}` : ''}
                      {' · '}
                      {new Date(a.occurredAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 10, marginTop: 10,
      }}>
        <ChartCard
          title={t('dashboard.membersActivePerMonth', 'Members active per month')}
          sub={t('dashboard.distinctMembersWork', 'Distinct members who did organizational work')}
          meta={buckets.length ? `${buckets[buckets.length - 1].activeMembers} ${t('dashboard.thisMonth', 'this month')}` : undefined}
        >
          {buckets.length > 1 ? (
            <AreaChart
              values={buckets.map((b) => b.activeMembers)}
              labels={buckets.map((b) => b.label)}
              height={140}
              color="var(--success)"
              fill="var(--success-bg)"
              valueLabel={String(buckets[buckets.length - 1].activeMembers)}
            />
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t('dashboard.notEnoughHistory', 'Not enough history yet.')}</p>
          )}
        </ChartCard>

        <ChartCard
          title={t('dashboard.activityByKind', 'Activity by kind')}
          sub={t('dashboard.whatOrgSpendsEffort', 'What the organization actually spends its effort on')}
          meta={`${categories.reduce((s, c) => s + c.value, 0).toLocaleString()} ${t('dashboard.events', 'events')}`}
        >
          <HBar rows={categories} emptyLabel={t('dashboard.nothingRecordedWindow', 'Nothing recorded in this window.')} />
        </ChartCard>
      </div>

      {org && mem && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 10, marginTop: 10,
        }}>
          <ChartCard title={t('dashboard.activeVsInactiveMembers', 'Active vs inactive members')} sub={windowLabel}>
            <PieChart segments={split(mem.active, mem.inactive)} size={104} />
          </ChartCard>
          <ChartCard title={t('dashboard.activeVsInactiveBasicUnits', 'Active vs inactive basic units')} sub={t('dashboard.byKeyOfficeBearerActivity', 'By key office-bearer activity')}>
            <PieChart segments={split(org.basicUnits.active, org.basicUnits.inactive)} size={104} />
          </ChartCard>
          <ChartCard title={t('dashboard.activeVsInactiveAreas', 'Active vs inactive areas')} sub={t('dashboard.byKeyOfficeBearerActivity', 'By key office-bearer activity')}>
            <PieChart segments={split(org.areas.active, org.areas.inactive)} size={104} />
          </ChartCard>
          <ChartCard title={t('dashboard.activeVsInactiveDistricts', 'Active vs inactive districts')} sub={t('dashboard.byKeyOfficeBearerActivity', 'By key office-bearer activity')}>
            <PieChart segments={split(org.districts.active, org.districts.inactive)} size={104} />
          </ChartCard>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
        {t('dashboard.activityDefinitionNote', 'Active = one recorded organizational action in the window. Logins and page views do not count. A unit is active when one of its key office bearers is.')}
      </p>
    </>
  );
}
