import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SmartKpi from '../SmartKpi';
import { SkeletonKpiGrid } from '../Skeleton';
import { HBar, AreaChart, StackedHBar, BRAND } from '../charts';
import { UsersIcon, ZapIcon, CheckIcon, MinusCircleIcon } from '../icons';
import useAnalytics from './useAnalytics';

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

export default function MembershipAnalytics({ params, windowLabel, byStatus }) {
  const { t } = useTranslation();
  const { data, loading, error } = useAnalytics('/dashboard/membership', params);
  const [tier, setTier] = useState(null);

  const levelNounMap = {
    PROVINCE: t('units.province', 'Province'),
    DISTRICT: t('units.district', 'District'),
    AREA: t('units.area', 'Area'),
    BASIC_UNIT: t('units.basicUnit', 'Basic Unit'),
  };

  const statusMeta = [
    { key: 'ACTIVE', label: t('common.active', 'Active'), color: 'var(--success)' },
    { key: 'PENDING_APPROVAL', label: t('dashboard.pendingApprovals', 'Pending approval'), color: 'var(--warning)' },
    { key: 'REJECTED', label: t('common.rejected', 'Rejected'), color: 'var(--danger)' },
    { key: 'INACTIVE', label: t('dashboard.inactive', 'Inactive'), color: 'var(--muted)' },
    { key: 'SUSPENDED', label: t('dashboard.statuses.SUSPENDED', 'Suspended'), color: 'var(--tier-area)' },
    { key: 'EXPELLED', label: t('dashboard.statuses.EXPELLED', 'Expelled'), color: 'var(--danger-strong)' },
    { key: 'DECEASED', label: t('dashboard.statuses.DECEASED', 'Deceased'), color: 'var(--muted-soft)' },
  ];

  if (loading && !data) return <SkeletonKpiGrid count={4} />;
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return null;

  const totals = data.totals;
  const levels = data.levels || [];
  const activeTier = levels.includes(tier) ? tier : levels[0] || null;
  const rows = activeTier ? (data.byLevel[activeTier] || []) : [];
  const noun = activeTier ? levelNounMap[activeTier] : null;
  const top = rows.slice(0, 10);

  const statusRows = statusMeta
    .map((m) => ({ label: m.label, value: byStatus?.[m.key] || 0, color: m.color }))
    .filter((r) => r.value > 0);
  const statusTotal = statusRows.reduce((sum, r) => sum + r.value, 0);

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 10, marginBottom: 12,
      }}>
        <SmartKpi
          label={t('dashboard.totalMembers', 'Total members')} value={totals.total}
          icon={<UsersIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        <SmartKpi
          label={t('dashboard.newMembers', 'New members')} value={totals.newMembers}
          icon={<ZapIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        <SmartKpi
          label={t('dashboard.activeMembers', 'Active members')} value={totals.active}
          icon={<CheckIcon size={14} />}
          iconBg="var(--success-bg)" iconColor="var(--success)"
        />
        <SmartKpi
          label={t('dashboard.inactiveMembers', 'Inactive members')} value={totals.inactive}
          icon={<MinusCircleIcon size={14} />}
          iconBg="var(--surface-alt)" iconColor="var(--muted)"
        />
      </div>

      {levels.length > 1 && (
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap',
          alignItems: 'center', marginBottom: 10,
        }}>
          <span className="muted" style={{ fontSize: 12, marginRight: 2 }}>{t('dashboard.showBy', 'Show by')}</span>
          {levels.map((lvl) => (
            <button
              key={lvl}
              type="button"
              className={`chip${activeTier === lvl ? ' on' : ''}`}
              onClick={() => setTier(lvl)}
            >
              {levelNounMap[lvl] || lvl}
            </button>
          ))}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 10,
      }}>
        {statusRows.length > 0 && (
          <ChartCard
            title={t('dashboard.membersByStatus', 'Members by status')}
            sub={t('dashboard.membersByStatusSub', "Shows each member's registration status. Activity is shown separately.")}
            meta={`${statusTotal.toLocaleString()} ${t('common.total', 'total')}`}
          >
            <HBar rows={statusRows} emptyLabel={t('common.noData', 'No members registered yet.')} />
          </ChartCard>
        )}

        <ChartCard
          title={t('dashboard.newMembersEachMonth', 'New members each month')}
          sub={t('dashboard.newMembersPerMonth12', 'New members per month, last 12 months')}
          meta={`${totals.newMembers.toLocaleString()} in ${windowLabel}`}
        >
          {data.trend && data.trend.length > 1 ? (
            <AreaChart
              values={data.trend.map((b) => b.newMembers)}
              labels={data.trend.map((b) => b.label)}
              height={140}
              color={BRAND.dark}
              fill={BRAND.tint}
            />
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t('dashboard.notEnoughDataChart', 'Not enough data to show this chart yet.')}</p>
          )}
        </ChartCard>

        {noun && (
          <>
            <ChartCard title={`${t('common.members', 'Members')} by ${noun.toLowerCase()}`} sub={t('dashboard.totalMembers', 'Total members')}>
              <HBar
                rows={top.map((r) => ({ label: r.name, value: r.total }))}
                accent={BRAND.dark}
                emptyLabel={t('dashboard.noUnitsFoundSelection', 'No units found for this selection.')}
              />
            </ChartCard>
            <ChartCard title={`${t('dashboard.newMembers', 'New members')} by ${noun.toLowerCase()}`} sub={`${t('auth.register', 'Registered')} in the ${windowLabel}`}>
              <HBar
                rows={top.map((r) => ({ label: r.name, value: r.newMembers }))}
                accent={BRAND.bright}
                emptyLabel={t('dashboard.noUnitsFoundSelection', 'No units found for this selection.')}
              />
            </ChartCard>
            <ChartCard title={`${t('dashboard.activeMembers', 'Active members')} by ${noun.toLowerCase()}`} sub={t('dashboard.takingPart', 'Took part during the selected dates')}>
              <HBar
                rows={top.map((r) => ({ label: r.name, value: r.active }))}
                accent="var(--success)"
                emptyLabel={t('dashboard.noUnitsFoundSelection', 'No units found for this selection.')}
              />
            </ChartCard>
            <ChartCard title={`${t('dashboard.inactiveMembers', 'Inactive members')} by ${noun.toLowerCase()}`} sub={t('dashboard.notTakingPart', 'No activity during the selected dates')}>
              <HBar
                rows={top.map((r) => ({ label: r.name, value: r.inactive }))}
                accent="var(--muted-soft)"
                emptyLabel={t('dashboard.noUnitsFoundSelection', 'No units found for this selection.')}
              />
            </ChartCard>
          </>
        )}
      </div>

      {noun && rows.length > 0 && (
        <ChartCard
          title={`${t('dashboard.comparison', 'Compare')} ${t('common.members', 'members')} by ${noun.toLowerCase()}`}
          sub={t('dashboard.composition30d', 'Each bar shows total members. Colours show active and inactive members.')}
          meta={`${rows.length} ${noun.toLowerCase()}`}
        >
          <StackedHBar
            rows={rows.map((r) => ({
              label: r.name,
              values: { active: r.active, inactive: r.inactive },
              note: r.newMembers,
            }))}
            series={[
              { key: 'active', label: t('dashboard.takingPart', 'Taking part'), color: 'var(--success)' },
              { key: 'inactive', label: t('dashboard.notTakingPart', 'Not taking part'), color: 'var(--muted-soft)' },
            ]}
            noteLabel={t('dashboard.joinedRecently', 'Joined recently')}
            emptyLabel={t('dashboard.noUnitsFoundSelection', 'No units found for this selection.')}
          />
          <p className="muted" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>
            {t('dashboard.joinedRecentlyNote', 'The green figure after each bar is how many people joined recently.')}
          </p>
        </ChartCard>
      )}
    </>
  );
}
