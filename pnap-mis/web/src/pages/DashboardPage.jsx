import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import HeroBanner from '../components/HeroBanner';
import { SkeletonCard } from '../components/Skeleton';
import { isPureMember as isPureMemberFn } from '../utils/permissions';
import CommandCenter from '../components/dashboard/cc/CommandCenter';

export default function DashboardPage() {
  const { user } = useAuth();
  const [me, setMe] = useState(null);
  const [meetings, setMeetings] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loadingMember, setLoadingMember] = useState(true);
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

  // Only the member portal loads anything here now. Super Admin goes
  // straight to ExecutiveAnalytics, which owns its own fetching and
  // its own 60s refresh — the /members/stats call and the 25s poll
  // that fed the old System Overview are gone with it.
  reloadRef.current = function reload(silent = false) {
    if (!isPureMember) return;
    if (!silent) setLoadingMember(true);
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
    });
  };

  useEffect(() => { reloadRef.current(false); }, [isPureMember, user?.memberId, user?.scope?.basicUnitId]);

  // Real-time polling for the member portal, with an immediate refetch
  // on tab focus / visibility change.
  useEffect(() => {
    if (!isPureMember) return undefined;
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

  // Super Admin lands directly on the Executive National MIS. The old
  // System Overview block that sat above it (status KPIs, distribution
  // bars, active-share donut, quick actions) is gone: the analytics
  // below answer the same questions with more depth, and its three
  // quick-action links already live in the sidebar.
  // Super Admin lands on the Command Centre. The previous section-based
  // view is untouched at components/dashboard/ExecutiveAnalytics.jsx —
  // swapping this one import back restores it.
  return <CommandCenter />;
}
