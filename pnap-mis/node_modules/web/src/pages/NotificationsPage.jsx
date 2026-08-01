import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';

const SEV_LABEL = { INFO: 'Info', SUCCESS: 'Success', WARNING: 'Warning', DANGER: 'Critical' };

export default function NotificationsPage() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const navigate = useNavigate();

  async function load(silent = false) {
    if (!silent) setBusy(true);
    setErr('');
    try {
      const r = await api.get('/notifications', {
        params: { limit: 100, ...(filter === 'unread' ? { unreadOnly: true } : {}) },
      });
      setItems(r.data.data || []);
    } catch (e) { if (!silent) setErr(errorMessage(e)); }
    finally { if (!silent) setBusy(false); }
  }
  useEffect(() => { load(false); }, [filter]);

  // Live tick — drops expired notifications from the rendered list
  // even before the next server poll.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Background poll — keeps the list synced with the server filter
  // (which already drops expired rows) without needing manual reload.
  useEffect(() => {
    const tick = () => { if (document.visibilityState === 'visible') load(true); };
    const t = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const visibleItems = useMemo(() => (items || []).filter((n) => {
    if (!n.expiresAt) return true;
    return new Date(n.expiresAt).getTime() > now;
  }), [items, now]);

  async function open(n) {
    if (!n.read) {
      try { await api.post(`/notifications/${n._id}/read`); } catch {}
      setItems((prev) => prev.map((x) => x._id === n._id ? { ...x, read: true } : x));
    }
    if (n.link) navigate(n.link);
  }
  async function markAllRead() {
    try { await api.post('/notifications/mark-all-read'); load(); } catch (e) { setErr(errorMessage(e)); }
  }
  async function remove(id) {
    try { await api.delete(`/notifications/${id}`); setItems((prev) => prev.filter((x) => x._id !== id)); }
    catch (e) { setErr(errorMessage(e)); }
  }

  const unreadCount = visibleItems.filter((x) => !x.read).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>Notifications</h2>
          <div className="subtitle">{unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={`btn ${filter === 'all' ? '' : 'secondary'}`} onClick={() => setFilter('all')}>All</button>
          <button className={`btn ${filter === 'unread' ? '' : 'secondary'}`} onClick={() => setFilter('unread')}>Unread</button>
          {unreadCount > 0 && <button className="btn secondary" onClick={markAllRead}>Mark all read</button>}
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}

      {busy && <p className="muted">Loading…</p>}
      {!busy && visibleItems.length === 0 && (
        <div className="empty-smart">
          <div className="empty-icon">🔔</div>
          <h3>No notifications</h3>
          <p>You'll see system alerts and announcements here.</p>
        </div>
      )}

      <div className="notif-list">
        {visibleItems.map((n) => (
          <div key={n._id} className={`notif-row ${n.read ? '' : 'unread'} sev-${n.severity || 'INFO'}`}>
            <div className="notif-row-main" onClick={() => open(n)} role="button" tabIndex={0}>
              <div className="notif-row-title">{n.title}</div>
              {n.body && <div className="notif-row-body">{n.body}</div>}
              <div className="notif-row-meta">
                <span className={`badge ${(n.severity || 'INFO').toLowerCase()}`}>{SEV_LABEL[n.severity] || 'Info'}</span>
                <span className="muted">{new Date(n.createdAt).toLocaleString()}</span>
              </div>
            </div>
            <button className="btn ghost" onClick={() => remove(n._id)} title="Dismiss">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}
