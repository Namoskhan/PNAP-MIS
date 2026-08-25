import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import UnitSwitcher from '../../components/UnitSwitcher';
import { HBar, MultiSparkline, PctBar, VBars, AreaChart, Donut, PieChart, BRAND } from '../../components/charts';
import SmartKpi from '../../components/SmartKpi';
import HeroBanner from '../../components/HeroBanner';
import { SkeletonKpiGrid } from '../../components/Skeleton';

import dialog from '../../components/dialog';
const MEETING_TYPE_LABEL = {
  GBM: 'General Body', EXC: 'Executive', PRT: 'Protest', JLS: 'Jalsa',
  CMP: 'Campaign', SEM: 'Seminar', STC: 'Study Circle', OTH: 'Other',
};
const ACTIVITY_TYPE_LABEL = {
  PROTEST: 'Protest', JALSA: 'Jalsa', CAMPAIGN: 'Campaign',
  SEMINAR: 'Seminar', STUDY_CIRCLE: 'Study Circle', TASK: 'Task',
  COMMUNITY_SERVICE: 'Community Service',
};
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatMonthLabel(ym) {
  if (!ym) return '';
  const [, m] = ym.split('-');
  return MONTH_SHORT[(parseInt(m, 10) || 1) - 1] || '';
}
import {
  isHigherAdmin,
  isPresidentPersona,
  isProvinceAdminOnly,
  isDistrictAdminOnly,
  isFinanceOnly,
  hasRole,
  OPERATOR_AUTOPIN_ROLES,
} from '../../utils/permissions';

const PKR = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });

// Map a parent level to its immediate child level. Used when the user
// drills into a row of the Subordinate Units table — we know the
// parent (ctx.unitLevel) and the child id (s._id), need the child
// level to build the drill ctx.
function childLevelOf(parentLevel) {
  return ({ CENTRAL: 'PROVINCE', PROVINCE: 'DISTRICT', DISTRICT: 'AREA', AREA: 'BASIC_UNIT' })[parentLevel] || null;
}

export default function UnitDashboardPage() {
  const { ctx, setCtx } = useUnit();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  // Re-pin ctx to the user's actual role-assignment unit on mount AND
  // whenever the active role changes. Tracks `pinReady` so the data
  // fetch below can block on it — guarantees the first dashboard
  // response is for the right unit, not a stale localStorage ctx.
  // Also tracks `homeCtx` so the user can drill into a subordinate
  // unit (via clicking a row below) and return to their own.
  const [pinReady, setPinReady] = useState(false);
  const [homeCtx, setHomeCtx] = useState(null);
  // Drill PATH — list of {unitLevel, unitId, unitName} entries the
  // user has drilled into, starting one level below home. Empty array
  // means viewing home unit. Each segment clickable to pop back.
  // Persisted in sessionStorage so navigating between pages keeps
  // the drill stack; cleared on logout or "Return to my unit".
  const DRILL_KEY = 'pnap_drill_path';
  const [drillPath, setDrillPath] = useState([]);
  useEffect(() => {
    setPinReady(false);
    if (!user) return;
    const operatorRoles = OPERATOR_AUTOPIN_ROLES;
    const myOperator = operatorRoles.find((r) => user.roles?.includes(r));
    // Auto-pin fires for: built-in operator roles, OR any user who
    // holds a non-MEMBER/OTHER role code (custom catalogue roles
    // like CUSTOM_KAKAKHAN). Plain MEMBER and admins fall through
    // and use UnitSwitcher / scope instead.
    const hasCustomRole = (user.roles || []).some((r) =>
      r && r !== 'MEMBER' && r !== 'OTHER' && !operatorRoles.includes(r) && !['SUPER_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN'].includes(r)
    );
    if ((!myOperator && !hasCustomRole) || !user.memberId) {
      setPinReady(true);
      return;
    }
    let cancelled = false;
    api.get('/roles', { params: { memberId: user.memberId, state: 'APPROVED' } })
      .then(async (r) => {
        if (cancelled) return;
        const ras = r.data.data || [];
        // Pin priority: matching operator role first, any built-in
        // operator next, then any active non-OTHER assignment (covers
        // custom catalogue roles).
        const ra = ras.find((a) => a.roleCode === myOperator && !a.endedAt)
                 || ras.find((a) => operatorRoles.includes(a.roleCode) && !a.endedAt)
                 || ras.find((a) => !a.endedAt && a.roleCode !== 'OTHER');
        if (!ra) { setPinReady(true); return; }
        let unitName = '';
        try {
          if (ra.unitLevel === 'BASIC_UNIT' && user.scope?.areaId) {
            const lst = await api.get('/org/basic-units', { params: { areaId: user.scope.areaId } });
            unitName = lst.data.data.find((b) => String(b._id) === String(ra.unitId))?.name || '';
          } else if (ra.unitLevel === 'AREA' && user.scope?.districtId) {
            const lst = await api.get('/org/areas', { params: { districtId: user.scope.districtId } });
            unitName = lst.data.data.find((a) => String(a._id) === String(ra.unitId))?.name || '';
          } else if (ra.unitLevel === 'DISTRICT' && user.scope?.provinceId) {
            const lst = await api.get('/org/districts', { params: { provinceId: user.scope.provinceId } });
            unitName = lst.data.data.find((d) => String(d._id) === String(ra.unitId))?.name || '';
          } else if (ra.unitLevel === 'PROVINCE') {
            const lst = await api.get('/org/provinces');
            unitName = lst.data.data.find((p) => String(p._id) === String(ra.unitId))?.name || '';
          } else if (ra.unitLevel === 'CENTRAL') {
            unitName = 'PKNAP Central';
          }
        } catch { /* fall back */ }
        if (cancelled) return;
        const homeUnit = { unitLevel: ra.unitLevel, unitId: ra.unitId, unitName: unitName || 'My Unit' };
        setHomeCtx(homeUnit);
        // If the user has drilled into subordinates this session,
        // restore the drill path (last entry becomes ctx). Otherwise
        // pin to home.
        const drillRaw = sessionStorage.getItem(DRILL_KEY);
        let stored = null;
        try { stored = drillRaw ? JSON.parse(drillRaw) : null; } catch {}
        const personaKey = `${user.memberId}:${(user.roles || []).join(',')}`;
        if (stored && stored.persona === personaKey && Array.isArray(stored.path) && stored.path.length > 0) {
          setDrillPath(stored.path);
          setCtx(stored.path[stored.path.length - 1]);
        } else {
          setDrillPath([]);
          setCtx(homeUnit);
        }
        setPinReady(true);
      })
      .catch(() => { if (!cancelled) setPinReady(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.memberId, user?.roles?.join(',')]);

  function persistDrillPath(path) {
    if (path.length === 0) {
      sessionStorage.removeItem(DRILL_KEY);
    } else {
      sessionStorage.setItem(DRILL_KEY, JSON.stringify({
        persona: `${user.memberId}:${(user.roles || []).join(',')}`,
        path,
      }));
    }
  }
  function drillIntoSubordinate(s) {
    const drillCtx = { unitLevel: childLevelOf(ctx?.unitLevel), unitId: s._id, unitName: s.name };
    const nextPath = [...drillPath, drillCtx];
    setDrillPath(nextPath);
    persistDrillPath(nextPath);
    setCtx(drillCtx);
  }
  function returnToHomeUnit() {
    setDrillPath([]);
    persistDrillPath([]);
    if (homeCtx) setCtx(homeCtx);
  }
  // Click a breadcrumb segment — truncate path back to that index.
  // index === -1 means home (clears the entire path).
  function jumpToCrumb(index) {
    if (index < 0) return returnToHomeUnit();
    const nextPath = drillPath.slice(0, index + 1);
    setDrillPath(nextPath);
    persistDrillPath(nextPath);
    setCtx(nextPath[nextPath.length - 1]);
  }
  const isDrilledIn = drillPath.length > 0;

  // Subordinate-unit report builder — lets the user generate a PDF /
  // Excel report for any specific subordinate over an arbitrary date
  // range (defaults to the current month). Same backend the Reports
  // page uses; surfaced here so a Secretary can grab a per-BU monthly
  // report without leaving the dashboard.
  const today = new Date();
  const ymToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [reportSubId, setReportSubId] = useState('');
  const [reportMonth, setReportMonth] = useState(ymToday);
  const [reportPreview, setReportPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  function reportRange() {
    const [y, m] = reportMonth.split('-').map(Number);
    const from = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { from, to };
  }

  // Resolve the picked dropdown value to a concrete (unitLevel,
  // unitId, name) — supports the special "self" value which targets
  // the current unit itself (e.g. the Area, when an Area FS wants
  // their own report).
  function resolveReportTarget() {
    if (reportSubId === 'self') {
      return { unitLevel: ctx.unitLevel, unitId: ctx.unitId, name: ctx.unitName };
    }
    const sub = subordinates.find((s) => String(s._id) === String(reportSubId));
    if (!sub) return null;
    return { unitLevel: childLevelOf(ctx?.unitLevel), unitId: sub._id, name: sub.name, code: sub.code };
  }

  async function previewSubReport() {
    const target = resolveReportTarget();
    if (!target) { dialog.alert('Pick a unit first.'); return; }
    setReportPreview(null);
    setPreviewBusy(true);
    try {
      const { from, to } = reportRange();
      const params = { unitLevel: target.unitLevel, unitId: target.unitId, from, to };
      const [meetings, activities, donations, expenses, monthly] = await Promise.all([
        api.get('/meetings', { params }).then((r) => r.data.data || []).catch(() => []),
        api.get('/activities', { params }).then((r) => r.data.data || []).catch(() => []),
        api.get('/finance/donations', { params }).then((r) => r.data.data || []).catch(() => []),
        api.get('/finance/expenses', { params }).then((r) => r.data.data || []).catch(() => []),
        api.get('/finance/monthly', { params }).then((r) => r.data.data || []).catch(() => []),
      ]);
      const monthBucket = monthly[0] || { donations: 0, expenses: 0, transfersIn: 0, transfersOut: 0, netBalance: 0 };
      setReportPreview({
        sub: target, from, to,
        counts: {
          meetings: meetings.length,
          activities: activities.length,
          donations: donations.length,
          expenses: expenses.length,
        },
        finance: {
          donationsTotal: monthBucket.donations || 0,
          expensesTotal: monthBucket.expenses || 0,
          transfersIn: monthBucket.transfersIn || 0,
          transfersOut: monthBucket.transfersOut || 0,
          balance: monthBucket.netBalance || 0,
        },
        meetings, activities,
      });
    } catch { dialog.alert('Could not load preview.'); }
    finally { setPreviewBusy(false); }
  }

  function downloadSubReport(kind, format) {
    const target = resolveReportTarget();
    if (!target) { dialog.alert('Pick a unit first.'); return; }
    const { from, to } = reportRange();
    const params = new URLSearchParams({ unitLevel: target.unitLevel, unitId: target.unitId, from, to });
    const ext = format === 'pdf' ? 'pdf' : 'xlsx';
    const filename = `${target.name}-${reportMonth}-${kind}.${ext}`;
    const token = localStorage.getItem('pnap_token');
    fetch(`/api/exports/unit/${kind}/${format}?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (res) => {
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    }).catch(() => dialog.alert('Download failed.'));
  }

  // Reset stale preview when picker selection changes.
  useEffect(() => { setReportPreview(null); }, [reportSubId, reportMonth]);

  // Persona detection — single source of truth in utils/permissions.js.
  // The dashboard's Quick Actions, "Subordinate Units" drilling, and
  // "Generate Subordinate Report" builder are all gated on these.
  const roles = user?.roles || [];
  const hasHigherAdminPersona = isHigherAdmin(user);
  const onlyDistrictAdmin = isDistrictAdminOnly(user);
  const onlyProvinceAdmin = isProvinceAdminOnly(user);
  const isPresidentPersonaUser = isPresidentPersona(user);
  const isFinanceOnlyUser = isFinanceOnly(user);
  // Hide the Unit Switcher for users whose ctx is system-pinned to a
  // single unit. Higher admins (Super / National / Central) and the
  // structuring admins (District / Province) keep the switcher so
  // they can drill. The remaining persona roles hold a specific
  // RoleAssignment that pins ctx automatically.
  const isPinned = !hasHigherAdminPersona && !onlyDistrictAdmin && !onlyProvinceAdmin
    && OPERATOR_AUTOPIN_ROLES.concat('AREA_ADMIN').some((r) => hasRole(user, r));

  // Latest-fetch guard — when ctx changes we may have an in-flight
  // request from the previous ctx. If that older request resolves
  // AFTER the new one (slower endpoint, network hiccup, etc.), it
  // would overwrite the correct data with stale zeros. Tag each
  // fetch with a monotonically-increasing id and only commit if our
  // id is still the latest.
  const fetchIdRef = useRef(0);
  const [subordinates, setSubordinates] = useState([]);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Re-usable fetch — wired both to ctx changes and to the polling
  // timer. `silent=true` skips the busy skeleton on background polls
  // so the user never sees the dashboard flash to skeleton state.
  const reload = useRef(null);
  reload.current = function reload(silent = false) {
    if (!ctx || !pinReady) return;
    const myId = ++fetchIdRef.current;
    if (!silent) setBusy(true);
    setRefreshing(true);
    const tasks = [
      api.get('/dashboard/unit', { params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId } })
        .then((r) => { if (myId === fetchIdRef.current) setData(r.data.data); })
        .catch(() => {}),
    ];
    if (ctx.unitLevel !== 'BASIC_UNIT') {
      tasks.push(
        api.get('/dashboard/subordinates', { params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId } })
          .then((r) => { if (myId === fetchIdRef.current) setSubordinates(r.data.data || []); })
          .catch(() => { if (myId === fetchIdRef.current) setSubordinates([]); })
      );
    } else if (myId === fetchIdRef.current) {
      setSubordinates([]);
    }
    Promise.all(tasks).finally(() => {
      if (myId === fetchIdRef.current) {
        if (!silent) setBusy(false);
        setRefreshing(false);
        setLastRefreshed(new Date());
      }
    });
  };

  // Initial / context-change fetch.
  useEffect(() => { reload.current(false); }, [ctx, pinReady]);

  // Real-time polling — refresh every 20s while the tab is visible.
  // Also refresh immediately on tab focus / visibility change so the
  // user never sees stale data after switching back from another tab.
  useEffect(() => {
    if (!ctx || !pinReady) return;
    const tick = () => { if (document.visibilityState === 'visible') reload.current(true); };
    const t = setInterval(tick, 20000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [ctx, pinReady]);

  const childLabel = {
    AREA: 'Basic Unit',
    DISTRICT: 'Area',
    PROVINCE: 'District',
    CENTRAL: 'Province',
  }[ctx?.unitLevel] || 'Unit';

  if (!ctx) return (
    <div>
      <h2>Unit Dashboard</h2>
      {!isPinned && <UnitSwitcher />}
      <p className="muted">
        {isPinned
          ? 'Loading your unit…'
          : 'Select a unit context above to load its dashboard.'}
      </p>
    </div>
  );

  const firstName = user?.fullName?.split(' ')[0] || '';
  // Central Cabinet officeholders use the Central Dashboard as their
  // only dashboard. Keep this redirect so an old bookmark to /unit
  // cannot reopen the previous unit dashboard.
  if (user?.canViewExecutiveDashboard) return <Navigate to="/" replace />;

  return (
    <div>
      <HeroBanner
        name={firstName}
        eyebrow={ctx.unitLevel.replace('_', ' ').toUpperCase()}
        subtitle={ctx.unitName}
        chips={data ? [
          { label: 'Members', value: (data.members?.total ?? 0).toLocaleString(), icon: '👥' },
          { label: 'Meetings (30d)', value: (data.meetings?.last30Days ?? 0).toLocaleString(), icon: '📋' },
          { label: 'Activities (30d)', value: (data.activities?.last30Days ?? 0).toLocaleString(), icon: '🎯' },
          { label: 'Net balance', value: PKR.format(data.finance?.balance ?? 0), icon: '💰' },
        ] : undefined}
        actions={
          <span className="hero-live-chip" title={lastRefreshed ? `Last updated ${lastRefreshed.toLocaleTimeString()}` : 'Loading…'}>
            <span className={`hero-live-pulse ${refreshing ? 'refreshing' : ''}`} aria-hidden="true" />
            {refreshing ? 'Updating…' : lastRefreshed ? `Live · ${lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Live'}
          </span>
        }
      />

      {!isPinned && <UnitSwitcher />}

      {isDrilledIn && homeCtx && (
        <div style={{
          display: 'flex', alignItems: 'center', flexWrap: 'wrap',
          gap: 6, marginBottom: 14, padding: '10px 14px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', fontSize: 13,
        }}>
          <span className="muted" style={{ marginRight: 4 }}>Drilled into:</span>
          <button
            type="button"
            onClick={() => jumpToCrumb(-1)}
            style={{ background: 'none', border: 0, padding: '2px 6px', cursor: 'pointer', color: 'var(--primary-dark)', fontWeight: 600 }}
            title={`Return to ${homeCtx.unitName}`}
          >
            🏠 {homeCtx.unitName}
          </button>
          {drillPath.map((seg, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span className="muted">›</span>
              <button
                type="button"
                onClick={() => jumpToCrumb(i)}
                disabled={i === drillPath.length - 1}
                style={{
                  background: 'none', border: 0,
                  padding: '2px 6px', cursor: i === drillPath.length - 1 ? 'default' : 'pointer',
                  color: i === drillPath.length - 1 ? 'var(--text)' : 'var(--primary-dark)',
                  fontWeight: i === drillPath.length - 1 ? 700 : 500,
                }}
                title={i === drillPath.length - 1 ? 'You are here' : `Jump back to ${seg.unitName}`}
              >
                {seg.unitName}
                <span className="muted" style={{ marginLeft: 4, fontSize: 11 }}>
                  ({seg.unitLevel.replace('_', ' ').toLowerCase()})
                </span>
              </button>
            </span>
          ))}
          <button
            className="btn secondary sm"
            onClick={returnToHomeUnit}
            style={{ marginLeft: 'auto' }}
          >
            ← Return to {homeCtx.unitName}
          </button>
        </div>
      )}

      {busy && <SkeletonKpiGrid count={4} />}
      {data && (
        <>
          {(() => {
            const trend = data.analytics?.trend || [];
            const sparkMeetings = trend.length ? trend.map((b) => b.meetings || 0) : [0, 0, 0, 0, 0, data.meetings.last30Days || 0];
            const sparkActivities = trend.length ? trend.map((b) => b.activities || 0) : [0, 0, 0, 0, 0, data.activities.last30Days || 0];
            const memberSpark = [
              Math.max(0, data.members.total - 5), Math.max(0, data.members.total - 4),
              Math.max(0, data.members.total - 3), Math.max(0, data.members.total - 2),
              Math.max(0, data.members.total - 1), data.members.total,
            ];
            const balance = data.finance.balance || 0;
            const balanceSpark = [0, balance * 0.3, balance * 0.5, balance * 0.7, balance * 0.85, balance];
            const fmtShort = (n) => {
              if (n == null) return '—';
              const abs = Math.abs(n);
              if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
              if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
              return n.toLocaleString();
            };
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 9, marginBottom: 11 }}>
                <SmartKpi
                  label="Members"
                  value={data.members.active}
                  icon="👥"
                  spark={memberSpark}
                  format={(v) => `${(v ?? 0).toLocaleString()} / ${data.members.total}`}
                />
                <SmartKpi
                  label="Donations"
                  value={data.finance.donations}
                  icon="💰"
                  iconBg={BRAND.pinker}
                  iconColor={BRAND.darkest}
                  spark={balanceSpark}
                  format={(v) => `Rs. ${fmtShort(v)}`}
                />
                <SmartKpi
                  label="Expenses"
                  value={data.finance.expenses}
                  icon="🧾"
                  iconBg={BRAND.tint}
                  iconColor={BRAND.mid}
                  sparkColor={BRAND.mid}
                  sparkFill="rgba(30,64,175,0.10)"
                  spark={sparkActivities.map((v, i) => v + i * (data.finance.expenses / 30 || 0))}
                  format={(v) => `Rs. ${fmtShort(v)}`}
                />
                <SmartKpi
                  label="Meetings (30d)"
                  value={data.meetings.last30Days}
                  icon="📅"
                  iconBg={BRAND.pinker}
                  iconColor={BRAND.dark}
                  spark={sparkMeetings}
                  format={(v) => (v ?? 0).toLocaleString()}
                />
              </div>
            );
          })()}

          {/* Quick stats secondary row — Pending / Activities / Balance */}
          <div className="dash-grid-2">
            <div className="chart-card">
              <div className="chart-card-head">
                <div>
                  <div className="chart-card-title">Pending approvals</div>
                  <div className="chart-card-sub">Members awaiting decision</div>
                </div>
                <div className="chart-card-meta">{data.members.pending}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Donut
                  percent={data.members.total > 0 ? Math.round((data.members.pending / data.members.total) * 100) : 0}
                  label="of total"
                  size={92}
                  stroke={11}
                />
                <div style={{ flex: 1, fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.5 }}>
                  <div><strong style={{ color: 'var(--text)' }}>{data.members.active}</strong> active</div>
                  <div><strong style={{ color: BRAND.dark }}>{data.members.pending}</strong> pending</div>
                  <div><strong style={{ color: 'var(--muted)' }}>{data.members.total}</strong> total roster</div>
                </div>
              </div>
            </div>
            <div className="chart-card">
              <div className="chart-card-head">
                <div>
                  <div className="chart-card-title">Net balance</div>
                  <div className="chart-card-sub">Donations − Expenses</div>
                </div>
                <div className="chart-card-meta" style={{ color: data.finance.balance < 0 ? 'var(--danger)' : BRAND.dark }}>
                  {PKR.format(data.finance.balance)}
                </div>
              </div>
              <VBars
                rows={[
                  { label: 'Don.', value: data.finance.donations, total: Math.max(data.finance.donations, data.finance.expenses) },
                  { label: 'Exp.', value: data.finance.expenses, total: Math.max(data.finance.donations, data.finance.expenses) },
                  { label: 'Bal.', value: Math.max(0, data.finance.balance), total: Math.max(data.finance.donations, data.finance.expenses) },
                ]}
                color={BRAND.dark}
                trackColor={BRAND.tint}
                height={110}
              />
            </div>
          </div>

          {/* ─── Analytics: type breakdowns + engagement quality + */}
          {/*    monthly trend + campaign performance (SRS §7-8) ─── */}
          {data.analytics && (
            <>
              {/* Meeting & Activity types as vertical bars + Quality donut */}
              <div className="dash-grid-3-2">
                <div className="dash-grid-2" style={{ marginBottom: 0 }}>
                  <div className="chart-card">
                    <div className="chart-card-head">
                      <div>
                        <div className="chart-card-title">Meeting types</div>
                        <div className="chart-card-sub">Last 30 days</div>
                      </div>
                      <div className="chart-card-meta">{data.meetings.last30Days || 0}</div>
                    </div>
                    <VBars
                      rows={data.analytics.meetingsByType.map((r) => ({
                        label: (MEETING_TYPE_LABEL[r.type] || r.type).slice(0, 6),
                        value: r.count,
                      }))}
                      color={BRAND.dark}
                      trackColor={BRAND.tint}
                      height={110}
                      emptyLabel="No meetings in the last 30 days."
                    />
                  </div>
                  <div className="chart-card">
                    <div className="chart-card-head">
                      <div>
                        <div className="chart-card-title">Activity types</div>
                        <div className="chart-card-sub">Last 30 days</div>
                      </div>
                      <div className="chart-card-meta">{data.activities.last30Days || 0}</div>
                    </div>
                    <VBars
                      rows={data.analytics.activitiesByType.map((r) => ({
                        label: (ACTIVITY_TYPE_LABEL[r.type] || r.type).slice(0, 6),
                        value: r.count,
                      }))}
                      color={BRAND.mid}
                      trackColor={BRAND.tint}
                      height={110}
                      emptyLabel="No activities in the last 30 days."
                    />
                  </div>
                </div>
                <div className="chart-card" style={{ display: 'flex', flexDirection: 'column' }}>
                  <div className="chart-card-head">
                    <div className="chart-card-title">Engagement quality</div>
                    <div className="chart-card-sub">{data.analytics.quality.finalizedTotal} finalized</div>
                  </div>
                  {(() => {
                    const q = data.analytics.quality;
                    const score = (q.attendanceRate != null || q.photoCoveragePct != null || q.gpsTaggedPct != null)
                      ? Math.round(((q.attendanceRate || 0) + (q.photoCoveragePct || 0) + (q.gpsTaggedPct || 0)) / 3)
                      : 0;
                    return (
                      <>
                        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 8px' }}>
                          <Donut percent={score} label="overall" size={108} stroke={12} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                          <PctBar label="Attendance" value={q.attendanceRate} threshold={60} />
                          <PctBar label="Photo coverage" value={q.photoCoveragePct} threshold={50} />
                          <PctBar label="GPS-tagged" value={q.gpsTaggedPct} threshold={70} />
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Activity trend area chart */}
              <div className="chart-card" style={{ marginBottom: 10 }}>
                <div className="chart-card-head">
                  <div>
                    <div className="chart-card-title">Activity trend</div>
                    <div className="chart-card-sub">Last 6 months</div>
                  </div>
                  <div className="chart-card-meta">
                    {data.analytics.trend.reduce((s, b) => s + (b.meetings || 0) + (b.activities || 0), 0)} total
                  </div>
                </div>
                <AreaChart
                  values={data.analytics.trend.map((b) => (b.meetings || 0) + (b.activities || 0))}
                  labels={data.analytics.trend.map((b) => formatMonthLabel(b.month))}
                  height={140}
                />
              </div>

              {/* Type-share pie + numeric activity-type breakdown side by side */}
              {(data.analytics.meetingsByType.length > 0 || data.analytics.activitiesByType.length > 0) && (
                <div className="dash-grid-2">
                  {data.analytics.meetingsByType.length > 0 && (
                    <div className="chart-card">
                      <div className="chart-card-head">
                        <div>
                          <div className="chart-card-title">Meeting type share</div>
                          <div className="chart-card-sub">Last 30 days · {data.meetings.last30Days || 0} meetings</div>
                        </div>
                      </div>
                      <PieChart
                        segments={data.analytics.meetingsByType.map((r) => ({
                          label: MEETING_TYPE_LABEL[r.type] || r.type,
                          value: r.count,
                        }))}
                        size={120}
                      />
                    </div>
                  )}
                  {data.analytics.activitiesByType.length > 0 && (
                    <div className="chart-card">
                      <div className="chart-card-head">
                        <div>
                          <div className="chart-card-title">Activity type share</div>
                          <div className="chart-card-sub">Last 30 days · {data.activities.last30Days || 0} activities</div>
                        </div>
                      </div>
                      <PieChart
                        segments={data.analytics.activitiesByType.map((r) => ({
                          label: ACTIVITY_TYPE_LABEL[r.type] || r.type,
                          value: r.count,
                        }))}
                        size={120}
                      />
                    </div>
                  )}
                </div>
              )}

              {data.analytics.campaigns && data.analytics.campaigns.total > 0 && (
                <div className="card" style={{ marginBottom: 16 }}>
                  <h3 style={{ marginTop: 0 }}>Campaign Performance <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>· {data.analytics.campaigns.total} campaign{data.analytics.campaigns.total === 1 ? '' : 's'}</span></h3>
                  <div className="kpi-grid">
                    <Kpi label="People Contacted" value={data.analytics.campaigns.peopleContacted.toLocaleString()} />
                    <Kpi label="Households Visited" value={data.analytics.campaigns.householdsVisited.toLocaleString()} />
                    <Kpi label="Pamphlets Distributed" value={data.analytics.campaigns.pamphletsDistributed.toLocaleString()} />
                    <Kpi label="Volunteer Hours" value={data.analytics.campaigns.volunteerHours.toLocaleString()} />
                  </div>
                  <div style={{ marginTop: 14, padding: 14, background: 'var(--surface-alt)', borderRadius: 'var(--radius)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                      <span style={{ color: 'var(--text-soft)', fontWeight: 500 }}>Conversion Funnel</span>
                      <span style={{ color: 'var(--muted)' }}>
                        {data.analytics.campaigns.actualJoiners.toLocaleString()} actual / {data.analytics.campaigns.expectedJoiners.toLocaleString()} expected
                      </span>
                    </div>
                    <PctBar
                      label="Expected → Actual Joiners"
                      value={data.analytics.campaigns.conversionPct}
                      threshold={70}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {!isFinanceOnlyUser && data.subordinateUnits && Object.keys(data.subordinateUnits).length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                <h3 style={{ margin: 0 }}>Subordinate Units & Hierarchical Roll-Up</h3>
                <span className="badge ACTIVE" style={{ fontSize: 12 }}>
                  {ctx.unitLevel.replace('_', ' ')} Hierarchy
                </span>
              </div>

              {data.rollup && (
                <div style={{ marginBottom: 16, padding: 14, background: 'var(--surface-alt)', borderRadius: 'var(--radius)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-soft)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Aggregated Subtree Roll-Up (All Subordinate Units)
                  </div>
                  <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
                    <Kpi label="Total Sub-Units" value={data.rollup.totalUnits} />
                    <Kpi label="Total Members" value={data.rollup.totalMembers} accent="good" />
                    <Kpi label="Meetings (30d)" value={data.rollup.meetings30} />
                    <Kpi label="Activities (30d)" value={data.rollup.activities30} />
                    <Kpi label="Donations" value={PKR.format(data.rollup.donations)} />
                    <Kpi label="Expenses" value={PKR.format(data.rollup.expenses)} />
                    <Kpi
                      label="Net Balance"
                      value={PKR.format(data.rollup.balance)}
                      accent={data.rollup.balance < 0 ? 'danger' : 'good'}
                    />
                  </div>
                </div>
              )}

              <div className="kpi-grid">
                {Object.entries(data.subordinateUnits).map(([k, v]) => (
                  <Kpi key={k} label={k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())} value={v} />
                ))}
              </div>
              {subordinates.length > 0 && (
                <>
                  <table className="list" style={{ marginTop: 14 }}>
                    <thead>
                      <tr>
                        <th>{childLabel}</th>
                        <th style={{ textAlign: 'right' }}>Active Members</th>
                        <th style={{ textAlign: 'right' }}>Meetings (30d)</th>
                        <th style={{ textAlign: 'right' }}>Activities (30d)</th>
                        <th style={{ textAlign: 'right' }}>Donations</th>
                        <th style={{ textAlign: 'right' }}>Expenses</th>
                        <th style={{ textAlign: 'right' }}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subordinates.map((s) => (
                        <tr
                          key={s._id}
                          onClick={() => drillIntoSubordinate(s)}
                          style={{ cursor: 'pointer' }}
                          title={`Switch to ${s.name}`}
                        >
                          <td><strong>{s.name}</strong>{s.code ? <span className="muted" style={{ fontSize: 12 }}> · {s.code}</span> : null}</td>
                          <td style={{ textAlign: 'right' }}>{s.members}</td>
                          <td style={{ textAlign: 'right' }}>{s.meetings30}</td>
                          <td style={{ textAlign: 'right' }}>{s.activities30 ?? 0}</td>
                          <td style={{ textAlign: 'right' }}>{PKR.format(s.donations)}</td>
                          <td style={{ textAlign: 'right' }}>{PKR.format(s.expenses)}</td>
                          <td style={{ textAlign: 'right', color: s.balance < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                            {PKR.format(s.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
          )}

          {!isFinanceOnlyUser && (!isPresidentPersonaUser || ctx.unitLevel === 'CENTRAL') && subordinates.length > 0 && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>Generate Subordinate Report</h3>
              <div className="form-grid" style={{ alignItems: 'end' }}>
                <div className="field">
                  <label>Unit</label>
                  <select value={reportSubId} onChange={(e) => setReportSubId(e.target.value)}>
                    <option value="">— pick a unit —</option>
                    <option value="self">{ctx.unitLevel.replace('_', ' ')} · {ctx.unitName}</option>
                    {subordinates.map((s) => (
                      <option key={s._id} value={s._id}>{s.name}{s.code ? ` · ${s.code}` : ''}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>Month</label>
                  <input type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
                </div>
                <div className="field" style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <button className="btn secondary" disabled={!reportSubId || previewBusy} onClick={previewSubReport}>
                    {previewBusy ? 'Loading…' : 'Preview'}
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="muted" style={{ fontSize: 12, marginRight: 4 }}>Meetings:</span>
                  <button className="btn" disabled={!reportSubId} onClick={() => downloadSubReport('meetings', 'pdf')}>PDF</button>
                  <button className="btn secondary" disabled={!reportSubId} onClick={() => downloadSubReport('meetings', 'xlsx')}>Excel</button>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="muted" style={{ fontSize: 12, marginRight: 4 }}>Finance:</span>
                  <button className="btn" disabled={!reportSubId} onClick={() => downloadSubReport('finance', 'pdf')}>PDF</button>
                  <button className="btn secondary" disabled={!reportSubId} onClick={() => downloadSubReport('finance', 'xlsx')}>Excel</button>
                </div>
              </div>

              {reportPreview && (
                <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>
                    {childLabel} · {reportPreview.sub.name}
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
                    {reportPreview.from} → {reportPreview.to}
                  </div>

                  <div className="kpi-grid">
                    <div className="kpi"><div className="label">Meetings</div><div className="value">{reportPreview.counts.meetings}</div></div>
                    <div className="kpi"><div className="label">Activities</div><div className="value">{reportPreview.counts.activities}</div></div>
                    <div className="kpi"><div className="label">Donations</div><div className="value">{PKR.format(reportPreview.finance.donationsTotal)}</div><div className="hint">{reportPreview.counts.donations} entries</div></div>
                    <div className="kpi"><div className="label">Expenses</div><div className="value">{PKR.format(reportPreview.finance.expensesTotal)}</div><div className="hint">{reportPreview.counts.expenses} entries</div></div>
                    <div className="kpi"><div className="label">Transfers In</div><div className="value">{PKR.format(reportPreview.finance.transfersIn)}</div></div>
                    <div className="kpi"><div className="label">Transfers Out</div><div className="value">{PKR.format(reportPreview.finance.transfersOut)}</div></div>
                    <div className={`kpi ${reportPreview.finance.balance < 0 ? 'kpi-danger' : 'kpi-good'}`}>
                      <div className="label">Net Balance</div>
                      <div className="value">{PKR.format(reportPreview.finance.balance)}</div>
                    </div>
                  </div>

                  {reportPreview.meetings.length > 0 && (
                    <>
                      <h4 style={{ marginTop: 16, marginBottom: 6 }}>Meetings</h4>
                      <table className="list">
                        <thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Venue</th><th>State</th></tr></thead>
                        <tbody>
                          {reportPreview.meetings.map((m) => (
                            <tr key={m._id}>
                              <td>{m.startAt ? new Date(m.startAt).toLocaleDateString() : '—'}</td>
                              <td>{m.type || '—'}</td>
                              <td>{m.title || '—'}</td>
                              <td>{m.venue || '—'}</td>
                              <td><span className={`badge ${m.state}`}>{m.state}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}

                  {reportPreview.activities.length > 0 && (
                    <>
                      <h4 style={{ marginTop: 16, marginBottom: 6 }}>Activities</h4>
                      <table className="list">
                        <thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Venue</th></tr></thead>
                        <tbody>
                          {reportPreview.activities.map((a) => (
                            <tr key={a._id}>
                              <td>{a.startAt ? new Date(a.startAt).toLocaleDateString() : '—'}</td>
                              <td>{a.type || '—'}</td>
                              <td>{a.title || '—'}</td>
                              <td>{a.venue || '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}

                  {reportPreview.meetings.length === 0 && reportPreview.activities.length === 0 && (
                    <p className="muted" style={{ marginTop: 12, fontSize: 13 }}>
                      No meetings or activities recorded in this period.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {data.committee && (
            <div className="card" style={{ marginBottom: 16 }}>
              <h3 style={{ marginTop: 0 }}>{data.committee.name}</h3>
              {!data.committee.formedAt && (
                <p className="muted" style={{ marginTop: 0 }}>
                  Not yet formed — assign the first {data.committee.kind === 'CENTRAL' ? 'Central' : data.committee.kind === 'SOBAYI' ? 'Province' : data.committee.kind === 'ZILLA' ? 'District' : 'Area'}-level cabinet role to activate it.
                </p>
              )}
              <div className="kpi-grid">
                <Kpi label="Total Members" value={data.committee.totalMembers} />
                <Kpi label={data.committee.kind === 'CENTRAL' ? 'Central Executive' : data.committee.kind === 'SOBAYI' ? 'Provincial Cabinet' : data.committee.kind === 'ZILLA' ? 'District Executive' : 'Area Executive'} value={data.committee.executiveCount} />
                <Kpi label={data.committee.subordinateLabel || 'Office-Holders'} value={data.committee.subordinateCount ?? 0} />
                <Kpi label="Selective Members" value={data.committee.permanentCount} />
                <Kpi label="Committee Meetings (30d)" value={data.committee.meetings30 ?? 0} />
                <Kpi label="Committee Activities (30d)" value={data.committee.activities30 ?? 0} />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <Link className="btn secondary" to="/unit/committee">Committee</Link>
                <Link className="btn secondary" to="/unit/meetings?body=COMMITTEE">Committee Meetings</Link>
                <Link className="btn secondary" to="/unit/activities?body=COMMITTEE">Committee Activities</Link>
                <Link className="btn secondary" to="/unit/finance?body=COMMITTEE">Committee Finance</Link>
                <Link className="btn secondary" to="/unit/transfers?body=COMMITTEE">Committee Transfers</Link>
                <Link className="btn secondary" to="/unit/reports">Reports</Link>
              </div>
            </div>
          )}

        </>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className={`kpi ${accent === 'danger' ? 'kpi-danger' : ''} ${accent === 'good' ? 'kpi-good' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value ?? 0}</div>
      {sub && <div className="hint">{sub}</div>}
    </div>
  );
}
