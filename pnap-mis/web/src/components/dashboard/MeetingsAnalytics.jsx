import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import SmartKpi from '../SmartKpi';
import { SkeletonKpiGrid } from '../Skeleton';
import {
  HBar, AreaChart, VBars, BRAND,
  StackedColumns, StackedHBar, Heatmap, CATEGORICAL, rampSteps,
} from '../charts';
import { CalendarIcon, CheckIcon, ClockIcon, InfoIcon } from '../icons';
import useAnalytics from './useAnalytics';
import CongressManager from './CongressManager';

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

export default function MeetingsAnalytics({ params, windowLabel }) {
  // Calendar vs the Pakistani fiscal year the finance module already
  // uses, so a meeting count and a finance total for the same labelled
  // year cover the same span.
  const [yearBasis, setYearBasis] = useState('CALENDAR');
  const [years, setYears] = useState(5);
  const [showCongress, setShowCongress] = useState(false);
  // The yearly columns can be split by body or by tier. Two separate
  // charts would force the reader to hold one in memory to compare;
  // one chart with a toggle keeps the axis and scale fixed.
  const [yearSplit, setYearSplit] = useState('BODY');
  const { t } = useTranslation();
  const { data, loading, error, reload } = useAnalytics(
    '/dashboard/meetings',
    { ...params, yearBasis, years },
  );

  const tierLabels = {
    CENTRAL: t('admin.central', 'Central'),
    PROVINCE: t('units.province', 'Province'),
    DISTRICT: t('units.district', 'District'),
    AREA: t('units.area', 'Area'),
    BASIC_UNIT: t('units.basicUnit', 'Basic Unit'),
  };
  const bodyLabels = {
    EXECUTIVE: t('admin.executiveCabinet', 'Cabinet'),
    COMMITTEE: t('admin.committee', 'Committee'),
    GENERAL_BODY: t('meetings.types.generalBody', 'General Body'),
  };
  const stateMeta = [
    { key: 'DRAFT', label: t('common.draft', 'Draft'), color: 'var(--muted-soft)' },
    { key: 'SCHEDULED', label: t('dashboard.plannedMeetings', 'Planned'), color: 'var(--info)' },
    { key: 'IN_PROGRESS', label: t('common.inProgress', 'Ongoing'), color: 'var(--warning)' },
    { key: 'PENDING_REPORT', label: t('dashboard.lateReports', 'Report needed'), color: 'var(--warning-strong)' },
    { key: 'FINALIZED', label: t('dashboard.completedMeetings', 'Completed'), color: 'var(--success)' },
    { key: 'CANCELLED', label: t('common.cancelled', 'Cancelled'), color: 'var(--danger)' },
  ];

  if (loading && !data) return <SkeletonKpiGrid count={4} />;
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return null;

  const totals = data.totals;
  const tiers = data.byTier || [];
  const yearly = data.yearly || [];
  const matrix = data.yearlyMatrix || [];
  const tiersPresent = data.tiersPresent || [];
  const bodiesPresent = data.bodiesPresent || [];

  const axisLabel = (y) => y.shortLabel || y.label;
  const longestLabel = yearly.reduce((n, y) => Math.max(n, axisLabel(y).length), 0);
  const slotWidth = Math.min(200, Math.max(44, Math.round(longestLabel * 6.2) + 12));
  const chartWidth = Math.max(240, yearly.length * slotWidth);

  const matrixCols = [];
  const colSeen = new Set();
  const matrixRows = [];
  const rowSeen = new Set();
  const matrixCells = {};
  matrix.forEach((r) => {
    const ck = `${r.level}|${r.body}`;
    if (!colSeen.has(ck)) {
      colSeen.add(ck);
      matrixCols.push({
        key: ck,
        label: tierLabels[r.level] || r.level,
        sublabel: bodyLabels[r.body] || r.body,
      });
    }
    const rk = String(r.year);
    if (!rowSeen.has(rk)) {
      rowSeen.add(rk);
      matrixRows.push({ key: rk, label: r.label });
    }
    if (!matrixCells[rk]) matrixCells[rk] = {};
    matrixCells[rk][ck] = r.conducted;
  });

  const yearSeries = yearSplit === 'BODY'
    ? bodiesPresent.map((b, i) => ({
        key: b,
        label: bodyLabels[b] || b,
        color: CATEGORICAL[i % CATEGORICAL.length],
      }))
    : tiersPresent.map((tr, i) => ({
        key: tr,
        label: tierLabels[tr] || tr,
        color: rampSteps(tiersPresent.length)[i],
      }));

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 10, marginBottom: 12,
      }}>
        <SmartKpi
          label={t('dashboard.totalMeetings', 'Total Meetings')} value={totals.total}
          icon={<CalendarIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        <SmartKpi
          label={t('dashboard.completedMeetings', 'Completed meetings')} value={totals.conducted}
          icon={<CheckIcon size={14} />}
          iconBg="var(--success-bg)" iconColor="var(--success)"
        />
        <SmartKpi
          label={t('dashboard.plannedMeetings', 'Planned meetings')} value={totals.scheduled}
          icon={<ClockIcon size={14} />}
          iconBg="var(--warning-bg)" iconColor="var(--warning)"
        />
        <SmartKpi
          label={t('dashboard.lateReports', 'Late reports')} value={totals.overdueReports}
          icon={<InfoIcon size={14} />}
          iconBg="var(--danger-bg)" iconColor="var(--danger)"
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 10,
      }}>
        <ChartCard
          title={t('dashboard.meetingsEachMonth', 'Meetings each month')}
          sub={t('dashboard.meetingsPerMonth12', 'Meetings per month, last 12 months')}
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

        <ChartCard title={t('dashboard.meetingStatus', 'Meeting status')} sub={`${t('common.status', 'Status')}: ${windowLabel}`}>
          <HBar
            rows={stateMeta
              .map((s) => ({ label: s.label, value: data.byState?.[s.key] || 0, color: s.color }))
              .filter((r) => r.value > 0)}
            emptyLabel={t('dashboard.noMeetingsSelectedDates', 'No meetings during the selected dates.')}
          />
        </ChartCard>
      </div>

      <div className="chart-card" style={{ marginTop: 10 }}>
        <div className="chart-card-head">
          <div>
            <div className="chart-card-title">{t('dashboard.completedMeetingsByYear', 'Completed meetings by year')}</div>
            <div className="chart-card-sub">
              {data.yearBasisLabel} · {t('dashboard.usesYearOptions', 'this chart uses the year options below')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`chip${yearBasis === 'CALENDAR' ? ' on' : ''}`}
              onClick={() => setYearBasis('CALENDAR')}
            >
              {t('dashboard.januaryDecember', 'January–December')}
            </button>
            <button
              type="button"
              className={`chip${yearBasis === 'FISCAL' ? ' on' : ''}`}
              onClick={() => setYearBasis('FISCAL')}
            >
              {t('dashboard.julyJune', 'July–June')}
            </button>
            <button
              type="button"
              className={`chip${yearBasis === 'CONGRESS' ? ' on' : ''}`}
              onClick={() => setYearBasis('CONGRESS')}
            >
              {t('dashboard.congressToCongress', 'Congress to Congress')}
            </button>
            {yearBasis !== 'CONGRESS' && (
              <select
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
                aria-label={t('dashboard.yearsToShow', 'Years to show')}
              >
                {[3, 5, 10].map((n) => <option key={n} value={n}>{n} {t('dashboard.yearsCount', '{{count}} years', { count: n })}</option>)}
              </select>
            )}
            {yearBasis === 'CONGRESS' && (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setShowCongress((v) => !v)}
              >
                {showCongress ? t('dashboard.hideCalendar', 'Hide calendar') : t('dashboard.manageCalendar', 'Manage calendar')}
              </button>
            )}
          </div>
        </div>

        {yearBasis === 'CONGRESS' && data.congressConfigured === false ? (
          <div className="alert info" style={{ marginBottom: 0 }}>
            {t('dashboard.noCongressDates', 'No Congress dates recorded yet.')}
          </div>
        ) : yearly.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t('common.noData', 'No records found')}</p>
        ) : (
          <>
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: chartWidth }}>
                <VBars
                  rows={yearly.map((y) => ({ label: axisLabel(y), value: y.conducted, total: y.total }))}
                  height={150}
                  width={chartWidth}
                  color={BRAND.dark}
                  trackColor={BRAND.tint}
                />
              </div>
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
              {t('dashboard.darkLightBarsMeetingNote', 'Dark bars = completed meetings · light bars = all meetings held')}
              {yearly.length > 6 && ` · ${t('dashboard.scrollSidewaysYears', 'scroll sideways to see all years')}`}
            </div>
          </>
        )}

        {yearBasis === 'CONGRESS' && data.unassignedMeetings > 0 && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            <InfoIcon size={12} /> {data.unassignedMeetings.toLocaleString()} {t('dashboard.unassignedMeetingsNote', 'meetings took place before the first Congress date and are not included in these periods.')}
          </p>
        )}

        {yearBasis === 'CONGRESS' && showCongress && (
          <CongressManager onChanged={() => reload(true)} />
        )}
      </div>

      {yearly.length > 0 && (bodiesPresent.length > 0 || tiersPresent.length > 0) && (
        <div className="chart-card" style={{ marginTop: 10 }}>
          <div className="chart-card-head">
            <div>
              <div className="chart-card-title">
                {t('dashboard.completedMeetingsByYearAnd', 'Completed meetings by year and')} {yearSplit === 'BODY' ? t('dashboard.byGroup', 'group') : t('dashboard.byLevel', 'level')}
              </div>
              <div className="chart-card-sub">{data.yearBasisLabel}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`chip${yearSplit === 'BODY' ? ' on' : ''}`}
                onClick={() => setYearSplit('BODY')}
                disabled={bodiesPresent.length === 0}
              >
                {t('dashboard.byGroup', 'By group')}
              </button>
              <button
                type="button"
                className={`chip${yearSplit === 'TIER' ? ' on' : ''}`}
                onClick={() => setYearSplit('TIER')}
                disabled={tiersPresent.length === 0}
              >
                {t('dashboard.byLevel', 'By level')}
              </button>
            </div>
          </div>
          <StackedColumns
            groups={yearly.map((y) => ({
              label: axisLabel(y),
              sublabel: `${y.conducted.toLocaleString()} ${t('common.of', 'of')} ${y.total.toLocaleString()}`,
              values: yearSplit === 'BODY'
                ? Object.fromEntries(bodiesPresent.map((b) => [b, y.bodies[b]?.conducted ?? 0]))
                : Object.fromEntries(tiersPresent.map((tr) => [tr, y.tiers[tr]?.conducted ?? 0])),
            }))}
            series={yearSeries}
            height={240}
            colWidth={Math.max(58, Math.min(150, slotWidth))}
            emptyLabel={t('dashboard.noCompletedMeetingsFound', 'No completed meetings found.')}
          />
        </div>
      )}

      {matrix.length > 0 && (
        <div className="chart-card" style={{ marginTop: 10 }}>
          <div className="chart-card-head">
            <div>
              <div className="chart-card-title">{t('dashboard.meetingsByYearLevelGroup', 'Meetings by year, level and group')}</div>
              <div className="chart-card-sub">
                {t('dashboard.darkerColoursCompleted', 'Darker colours mean more completed meetings')}
              </div>
            </div>
            <div className="chart-card-meta">{matrixCols.length} {t('dashboard.groups', 'groups')}</div>
          </div>
          <Heatmap
            rowHeader={t('dashboard.period', 'Period')}
            valueNoun={t('dashboard.completed', 'completed')}
            rows={matrixRows}
            cols={matrixCols}
            cells={matrixCells}
            emptyLabel={t('dashboard.noRecordsYet', 'No records yet.')}
          />
        </div>
      )}

      {tiers.length > 0 && (
        <div className="chart-card" style={{ marginTop: 10 }}>
          <div className="chart-card-head">
            <div>
              <div className="chart-card-title">{t('dashboard.meetingsByLevelAndGroup', 'Meetings by level and group')}</div>
              <div className="chart-card-sub">
                {t('dashboard.completedAndPlannedMeetings', 'Completed and planned meetings')}, {windowLabel}
              </div>
            </div>
          </div>
          <StackedHBar
            rows={tiers.map((r) => ({
              label: `${tierLabels[r.level] || r.level} ${bodyLabels[r.body] || r.body}`,
              values: { conducted: r.conducted, scheduled: r.scheduled },
            }))}
            series={[
              { key: 'conducted', label: t('dashboard.completed', 'Completed'), color: 'var(--success)' },
              { key: 'scheduled', label: t('dashboard.planned', 'Planned'), color: 'var(--warning)' },
            ]}
            emptyLabel={t('dashboard.noMeetingsSelectedDates', 'No meetings during the selected dates.')}
          />
        </div>
      )}

      {data.jirgaTracked === false && (
        <div className="alert info" style={{ marginTop: 12 }}>
          <strong>{t('dashboard.jirgaNoteBold', 'Jirga meetings are not counted above.')}</strong>{' '}
          {t('dashboard.jirgaNoteBody', 'A meeting stores its body as Cabinet or Committee only, so Jirga meetings are recorded as one of those and cannot be separated out.')}
        </div>
      )}
    </>
  );
}
