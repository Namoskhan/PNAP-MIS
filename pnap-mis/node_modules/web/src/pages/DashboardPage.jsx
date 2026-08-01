import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import SmartKpi from '../components/SmartKpi';
import HeroBanner from '../components/HeroBanner';
import { SkeletonCard, SkeletonKpiGrid } from '../components/Skeleton';
import { Donut } from '../components/charts';
import { UsersIcon, CheckIcon, ClockIcon, MinusCircleIcon } from '../components/icons';
import { isPureMember as isPureMemberFn } from '../utils/permissions';

// Semantic status colors — a reader should decode state without a
// legend: green = in good standing, amber = awaiting action,
// red = declined, neutrals = out of the roster.
const STATUS_META = [
  { key: 'ACTIVE', label: 'Active', color: 'var(--success)' },
  { key: 'PENDING_APPROVAL', label: 'Pending approval', color: 'var(--warning)' },
  { key: 'REJECTED', label: 'Rejected', color: 'var(--danger)' },
  { key: 'INACTIVE', label: 'Inactive', color: 'var(--muted)' },
  { key: 'SUSPENDED', label: 'Suspended', color: 'var(--tier-area)' },
  { key: 'EXPELLED', label: 'Expelled', color: 'var(--danger-strong)' },
  { key: 'DECEASED', label: 'Deceased', color: 'var(--muted-soft)' },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [me, setMe] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loadingMember, setLoadingMember] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const reloadRef = useRef(null);

  // Use the shared persona helper — it considers permissions so a
  // holder of a custom catalogue role doesn't render the read-only
  // member portal even though their role list includes 'MEMBER'.
  const isPureMember = isPureMemberFn(user);

  // The system-wide overview is Super Admin territory. Every other
  // signed-in persona (Secretary, Senior Mawin, Finance Secretary,
  // President, Area/District/Province admin, custom roles) operates
  // within a unit domain — send them to the unit dashboard that
  // UnitContext has already pinned to their role's unit.
  const isSuperAdmin = !!user?.roles?.includes('SUPER_ADMIN');
  const redirectToUnit = !isPureMember && !isSuperAdmin;

  reloadRef.current = function reload(silent = false) {
    if (redirectToUnit) return; // navigating away — skip fetching global stats
    if (isPureMember) {
      if (!silent) setLoadingMember(true);
      setRefreshing(true);
      const tasks = [];
      if (user?.memberId) {
        tasks.push(api.get(`/members/${user.memberId}`).then((r) => setMe(r.data.data)).catch(() => {}));
      }
      if (user?.scope?.basicUnitId) {
        const params = { unitLevel: 'BASIC_UNIT', unitId: user.scope.basicUnitId };
        tasks.push(api.get('/meetings', { params }).then((r) => setMeetings((r.data.data || []).slice(0, 5))).catch(() => {}));
        tasks.push(api.get('/activities', { params }).then((r) => setActivities((r.data.data || []).slice(0, 5))).catch(() => {}));
      }
      Promise.all(tasks).finally(() => {
        if (!silent) setLoadingMember(false);
        setRefreshing(false);
        setLastRefreshed(new Date());
      });
    } else {
      if (!silent) setLoadingStats(true);
      setRefreshing(true);
      api.get('/members/stats')
        .then((r) => setStats(r.data.data))
        .catch(() => {})
        .finally(() => {
          if (!silent) setLoadingStats(false);
          setRefreshing(false);
          setLastRefreshed(new Date());
        });
    }
  };

  useEffect(() => { reloadRef.current(false); }, [isPureMember, user?.memberId, user?.scope?.basicUnitId]);

  // Real-time polling — refresh stats every 25s, with immediate
  // refetch on tab focus / visibility change.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') reloadRef.current(true); };
    const t = setInterval(tick, 25000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [isPureMember, user?.memberId, user?.scope?.basicUnitId]);

  if (redirectToUnit) {
    return <Navigate to="/unit" replace />;
  }

  if (isPureMember) {
    const firstName = user?.fullName?.split(' ')[0] || 'Member';
    return (
      <div>
        <HeroBanner
          name={firstName}
          eyebrow="MEMBER PORTAL"
          subtitle={me?.basicUnitId?.name ? `Your unit · ${me.basicUnitId.name}` : 'Your activity at a glance.'}
          chips={[
            { label: 'Status', value: me?.status?.replace('_', ' ').toLowerCase() || '—', icon: '●' },
            { label: 'Member ID', value: me?.memberId || '—', icon: '🪪' },
            { label: 'Meetings (recent)', value: meetings.length, icon: '📋' },
            { label: 'Activities', value: activities.length, icon: '🎯' },
          ]}
        />

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>My Profile</h3>
          {loadingMember && !me ? (
            <SkeletonCard lines={3} />
          ) : me ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, fontSize: 14 }}>
              <div><span className="muted">Name</span><div><strong>{me.fullName}</strong></div></div>
              <div><span className="muted">Member ID</span><div>{me.memberId || '—'}</div></div>
              <div><span className="muted">CNIC</span><div>{me.cnic}</div></div>
              <div><span className="muted">Phone</span><div>{me.phone || '—'}</div></div>
              <div><span className="muted">Status</span><div><span className={`badge ${me.status}`}>{me.status}</span></div></div>
              <div><span className="muted">Basic Unit</span><div>{me.basicUnitId?.name || '—'}</div></div>
            </div>
          ) : (
            <p className="muted" style={{ margin: 0 }}>Could not load your profile.</p>
          )}
          {user?.memberId && (
            <div style={{ marginTop: 14 }}>
              <Link to={`/members/${user.memberId}`} className="btn secondary">View &amp; Update Profile</Link>
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Recent Meetings</h3>
          {loadingMember ? (
            <SkeletonCard lines={3} />
          ) : meetings.length === 0 ? (
            <div className="empty-smart" style={{ padding: 24 }}>
              <div className="empty-icon">📋</div>
              <p>No meetings have been logged yet.</p>
            </div>
          ) : (
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {meetings.map((m) => (
                <li key={m._id} style={{ marginBottom: 6 }}>
                  <strong>{m.title || m.type}</strong>
                  {m.startAt && <span className="muted"> · {new Date(m.startAt).toLocaleDateString()}</span>}
                  {m.venue && <span className="muted"> · {m.venue}</span>}
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 12 }}>
            <Link to="/unit/meetings" className="btn ghost">See all meetings →</Link>
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Recent Activities</h3>
          {loadingMember ? (
            <SkeletonCard lines={3} />
          ) : activities.length === 0 ? (
            <div className="empty-smart" style={{ padding: 24 }}>
              <div className="empty-icon">🎯</div>
              <p>No activities recorded for your unit yet.</p>
            </div>
          ) : (
            <ul style={{ paddingLeft: 18, margin: 0 }}>
              {activities.map((a) => (
                <li key={a._id} style={{ marginBottom: 6 }}>
                  <strong>{a.title || a.type}</strong>
                  {a.startAt && <span className="muted"> · {new Date(a.startAt).toLocaleDateString()}</span>}
                </li>
              ))}
            </ul>
          )}
          <div style={{ marginTop: 12 }}>
            <Link to="/unit/activities" className="btn ghost">See all activities →</Link>
          </div>
        </div>
      </div>
    );
  }

  if (loadingStats) {
    return (
      <div>
        <div className="page-header"><h2>Dashboard</h2></div>
        <SkeletonKpiGrid count={4} />
      </div>
    );
  }

  if (!stats) {
    return (
      <div>
        <div className="page-header"><h2>Dashboard</h2></div>
        <div className="empty-smart">
          <div className="empty-icon">📊</div>
          <h3>No data available</h3>
          <p>The member statistics endpoint returned no data.</p>
        </div>
      </div>
    );
  }

  const total = Object.values(stats).reduce((a, b) => a + b, 0);
  const activePct = total > 0 ? Math.round((stats.ACTIVE / total) * 100) : 0;
  const pendingPct = total > 0 ? Math.round((stats.PENDING_APPROVAL / total) * 100) : 0;
  const outCount = (stats.INACTIVE || 0) + (stats.SUSPENDED || 0) + (stats.REJECTED || 0);

  // Distribution rows — real counts only, semantic colors, full
  // labels. Zero-count states are hidden to keep signal density high.
  const distRows = STATUS_META
    .map((m) => ({ ...m, count: stats[m.key] || 0 }))
    .filter((m) => m.count > 0);
  const distMax = Math.max(...distRows.map((r) => r.count), 1);

  return (
    <div>
      {/* Standard MIS overview header — title, scope, freshness. */}
      <div className="page-header">
        <div>
          <h2>System Overview</h2>
          <div className="subtitle">Membership and approvals across all provinces</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: 12 }}>
            Press <kbd className="kbd-key kbd-key-light">Ctrl</kbd> + <kbd className="kbd-key kbd-key-light">K</kbd> for quick search
          </span>
          <span className="live-chip" title={lastRefreshed ? `Last updated ${lastRefreshed.toLocaleTimeString()}` : 'Loading…'}>
            <span className={`hero-live-pulse ${refreshing ? 'refreshing' : ''}`} aria-hidden="true" />
            {refreshing ? 'Updating…' : lastRefreshed ? `Live · ${lastRefreshed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Live'}
          </span>
        </div>
      </div>

      {/* Row 1 — KPIs. Real values with real shares; no synthetic
          trends (backend has no time-series endpoint yet). */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
        <SmartKpi
          label="Total Members"
          value={total}
          icon={<UsersIcon size={14} />}
          iconBg="var(--primary-tint)"
          iconColor="var(--primary)"
          format={(v) => (v ?? 0).toLocaleString()}
        />
        <SmartKpi
          label="Active"
          value={stats.ACTIVE}
          icon={<CheckIcon size={14} />}
          iconBg="var(--success-bg)"
          iconColor="var(--success)"
          format={(v) => `${(v ?? 0).toLocaleString()} (${activePct}%)`}
        />
        <SmartKpi
          label="Pending Approval"
          value={stats.PENDING_APPROVAL}
          icon={<ClockIcon size={14} />}
          iconBg="var(--warning-bg)"
          iconColor="var(--warning)"
          format={(v) => `${(v ?? 0).toLocaleString()} (${pendingPct}%)`}
        />
        <SmartKpi
          label="Inactive / Suspended"
          value={outCount}
          icon={<MinusCircleIcon size={14} />}
          iconBg="var(--surface-alt)"
          iconColor="var(--muted)"
          format={(v) => (v ?? 0).toLocaleString()}
        />
      </div>

      {/* Row 2 — one view per fact: distribution (bar list, full
          labels) + active share (honestly labelled donut). */}
      <div className="dash-grid-3-2">
        <div className="chart-card">
          <div className="chart-card-head">
            <div>
              <div className="chart-card-title">Member status distribution</div>
              <div className="chart-card-sub">All registrations, by workflow state</div>
            </div>
            <div className="chart-card-meta">{total.toLocaleString()} total</div>
          </div>
          {distRows.length === 0 ? (
            <div className="empty-smart" style={{ padding: '28px 16px', border: 0 }}>
              <div className="empty-icon">📊</div>
              <p style={{ margin: 0 }}>No members registered yet.</p>
            </div>
          ) : (
            <div style={{ paddingTop: 4 }}>
              {distRows.map((r) => {
                const share = total > 0 ? Math.round((r.count / total) * 100) : 0;
                return (
                  <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9, fontSize: 13 }}>
                    <span style={{ width: 9, height: 9, borderRadius: '50%', background: r.color, flexShrink: 0 }} aria-hidden="true" />
                    <div style={{ width: 130, color: 'var(--text-soft)', fontWeight: 500 }}>{r.label}</div>
                    <div style={{ flex: 1, height: 8, background: 'var(--surface-alt)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.round((r.count / distMax) * 100)}%`, height: '100%', background: r.color, borderRadius: 4, transition: 'width .3s ease' }} />
                    </div>
                    <div style={{ width: 90, textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
                      {r.count.toLocaleString()} <span className="muted" style={{ fontWeight: 500 }}>({share}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="chart-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="chart-card-head">
            <div>
              <div className="chart-card-title">Active share</div>
              <div className="chart-card-sub">{stats.ACTIVE.toLocaleString()} of {total.toLocaleString()} members</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '6px 0' }}>
            <Donut percent={activePct} label="active" size={120} stroke={14} color="var(--success)" trackColor="var(--success-bg)" />
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gap: 6, fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted">Awaiting approval</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{(stats.PENDING_APPROVAL || 0).toLocaleString()}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span className="muted">Rejected</span>
              <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{(stats.REJECTED || 0).toLocaleString()}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3 — where to act next. Mirrors existing sidebar routes;
          navigation only, no new capabilities. */}
      <div className="chart-card">
        <div className="chart-card-head">
          <div className="chart-card-title">Quick actions</div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Link to="/members" className="btn secondary">All members</Link>
          <Link to="/admin/pending-approvals" className="btn secondary">Pending role approvals</Link>
          <Link to="/admin/finance-overview" className="btn secondary">Finance overview</Link>
        </div>
      </div>
    </div>
  );
}
