import { useCallback, useMemo, useState } from 'react';
import useAnalytics from './useAnalytics';
import DashboardSection from './DashboardSection';
import ScopeBreadcrumb from './ScopeBreadcrumb';
import AnalyticsFilters from './AnalyticsFilters';
import ExecutiveSummary from './ExecutiveSummary';
import OrganizationAnalytics from './OrganizationAnalytics';
import MembershipAnalytics from './MembershipAnalytics';
import MeetingsAnalytics from './MeetingsAnalytics';
import CampaignsAnalytics from './CampaignsAnalytics';
import ReportsAnalytics from './ReportsAnalytics';
import ActivityMonitoring from './ActivityMonitoring';
import { InactiveUnitsTable, InactiveMembersTable } from './InactiveTables';

// ─── Executive National MIS Dashboard ──────────────────────────────
//
// ONE dashboard, one route, eight collapsible sections. Only the
// Executive Summary is open by default; every other section mounts
// its children — and therefore issues its first request — the first
// time it is expanded. A dashboard this dense would otherwise fire a
// dozen aggregations on every load to render content nobody scrolled
// to.
//
// Scope is a single piece of state shared by three interfaces onto it:
// the breadcrumb (walk back up), the drill-down cards (walk down), and
// the filter selects (jump anywhere). All three write here.
//
// This block extends the existing System Overview above it rather than
// replacing it: that view answers "what is the state of the roster",
// this one answers "is the organization working".

const EMPTY_SCOPE = { provinceId: '', districtId: '', areaId: '', basicUnitId: '' };

// Drilling into a unit sets that level's id and clears everything
// below it — the scope chain must stay contiguous or the server
// cannot resolve a breadcrumb for it.
const DRILL_KEY = {
  PROVINCE: 'provinceId',
  DISTRICT: 'districtId',
  AREA: 'areaId',
  BASIC_UNIT: 'basicUnitId',
};
const BELOW = {
  NATIONAL: ['provinceId', 'districtId', 'areaId', 'basicUnitId'],
  PROVINCE: ['districtId', 'areaId', 'basicUnitId'],
  DISTRICT: ['areaId', 'basicUnitId'],
  AREA: ['basicUnitId'],
  BASIC_UNIT: [],
};

export default function ExecutiveAnalytics() {
  const [scope, setScope] = useState(EMPTY_SCOPE);
  const [filters, setFilters] = useState({ days: 30, memberStatus: '', orgStatus: '' });

  // The single query object every section receives. Memoized by value
  // so a parent re-render doesn't retrigger a dozen fetches.
  const params = useMemo(() => {
    const p = { days: filters.days };
    for (const [k, v] of Object.entries(scope)) if (v) p[k] = v;
    if (filters.memberStatus) p.memberStatus = filters.memberStatus;
    if (filters.orgStatus) p.orgStatus = filters.orgStatus;
    return p;
  }, [scope, filters]);

  // Summary and scope are the only two things fetched eagerly: the
  // summary because its section is open by default, the scope because
  // the breadcrumb is always visible.
  const summary = useAnalytics('/dashboard/summary', params, { poll: 60000 });
  const scopeInfo = useAnalytics('/dashboard/scope', params);

  const drillTo = useCallback((level, id) => {
    setScope((s) => {
      const next = { ...s };
      for (const key of BELOW[level] || []) next[key] = '';
      if (DRILL_KEY[level]) next[DRILL_KEY[level]] = String(id);
      return next;
    });
  }, []);

  // Breadcrumb click: truncate the scope back to the level clicked.
  const navigateTo = useCallback((level) => {
    setScope((s) => {
      if (level === 'NATIONAL') return EMPTY_SCOPE;
      const next = { ...s };
      for (const key of BELOW[level] || []) next[key] = '';
      return next;
    });
  }, []);

  const windowLabel = `last ${filters.days} days`;
  const s = summary.data;
  const trail = scopeInfo.data?.trail;
  const scopeName = trail?.length ? trail[trail.length - 1].name : 'Pakistan';

  // The scope expressed as a single (level, id) pair, which is what the
  // performance endpoints take. National scope maps to CENTRAL — the
  // whole organization — so the report is never unscoped.
  const reportUnit = useMemo(() => {
    if (scope.basicUnitId) return { level: 'BASIC_UNIT', id: scope.basicUnitId };
    if (scope.areaId) return { level: 'AREA', id: scope.areaId };
    if (scope.districtId) return { level: 'DISTRICT', id: scope.districtId };
    if (scope.provinceId) return { level: 'PROVINCE', id: scope.provinceId };
    return { level: 'CENTRAL', id: '' };
  }, [scope]);

  // The dashboard filter speaks in `days`; the performance endpoints
  // take from/to. Translate here rather than letting the performance
  // report quietly cover all time while the page header says "last 90
  // days".
  const periodFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - filters.days);
    return d.toISOString().slice(0, 10);
  }, [filters.days]);

  return (
    <div style={{ marginTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 10 }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>Executive National MIS</h2>
          <div className="subtitle">
            Organizational health for {scopeName} — {windowLabel}
          </div>
        </div>
      </div>

      {/* The scope trail is what sticks, not the Executive Summary.
          Drilling happens from cards far down the page, so the way back
          has to stay on screen — and a thin bar can do that, whereas a
          KPI block taller than the viewport cannot usefully be pinned. */}
      <div className="dash-scope-bar">
        <ScopeBreadcrumb trail={trail} onNavigate={navigateTo} />
        {scope.provinceId && (
          <button
            type="button"
            className="btn secondary sm"
            onClick={() => navigateTo('NATIONAL')}
          >
            Reset to Pakistan
          </button>
        )}
      </div>

      <AnalyticsFilters
        scope={scope}
        filters={filters}
        onScope={(next) => setScope({ ...EMPTY_SCOPE, ...next })}
        onFilters={setFilters}
        busy={summary.loading}
      />

      {summary.error && <div className="alert error" style={{ marginBottom: 10 }}>{summary.error}</div>}

      <DashboardSection
        title="Executive Summary"
        subtitle={`Headline figures for ${scopeName}`}
        defaultOpen
      >
        <ExecutiveSummary data={s} loading={summary.loading} windowLabel={windowLabel} />
      </DashboardSection>

      <DashboardSection
        title="Organization Analytics"
        subtitle="Drill down through provinces, districts, areas and basic units"
        badge={scopeInfo.data?.childLevel ? undefined : 'Leaf'}
      >
        <OrganizationAnalytics
          params={params}
          onDrill={drillTo}
          trail={trail}
          onNavigate={navigateTo}
        />
      </DashboardSection>

      <DashboardSection
        title="Membership Analytics"
        subtitle="Total and new membership, broken down by tier"
        badge={s ? s.membership.total.toLocaleString() : undefined}
      >
        <MembershipAnalytics
          params={params}
          windowLabel={windowLabel}
          byStatus={s?.membership.byStatus}
        />
      </DashboardSection>

      <DashboardSection
        title="Meetings"
        subtitle="Scheduled and conducted meetings by tier and body"
        badge={s ? s.meetings.total.toLocaleString() : undefined}
      >
        <MeetingsAnalytics params={params} windowLabel={windowLabel} />
      </DashboardSection>

      <DashboardSection
        title="Campaigns"
        subtitle="Running, upcoming and completed campaigns"
        badge={s ? s.campaigns.total.toLocaleString() : undefined}
      >
        <CampaignsAnalytics params={params} windowLabel={windowLabel} />
      </DashboardSection>

      <DashboardSection
        title="Reports"
        subtitle="Filing status, unit reports and performance reports"
        badge={s ? `${s.reports.outstanding.toLocaleString()} owed` : undefined}
      >
        <ReportsAnalytics
          params={params}
          windowLabel={windowLabel}
          unitLevel={reportUnit.level}
          unitId={reportUnit.id}
          scopeName={scopeName}
          periodFrom={periodFrom}
          scope={scope}
        />
      </DashboardSection>

      <DashboardSection
        title="Activity Monitoring"
        subtitle="What counts as activity, and who is doing it"
      >
        <ActivityMonitoring params={params} summary={s} windowLabel={windowLabel} />
      </DashboardSection>

      <DashboardSection
        title="Inactive Organization"
        subtitle="Dormant units and members, with the responsible officer"
        badge={s ? (s.organization.basicUnits.inactive + s.membership.inactive).toLocaleString() : undefined}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <InactiveUnitsTable params={params} />
          <InactiveMembersTable params={params} />
        </div>
      </DashboardSection>
    </div>
  );
}
