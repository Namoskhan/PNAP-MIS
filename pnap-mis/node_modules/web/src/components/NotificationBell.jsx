import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

// Topbar bell — shows the unread count, opens a dropdown of the most
// recent notifications, and marks them read on click. Polls the
// unread-count endpoint every 30s so badges stay roughly fresh
// without a websocket.
export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const navigate = useNavigate();

  // Tick once a minute so notifications attached to an expired
  // announcement disappear from the dropdown (and stop counting toward
  // the unread badge) the moment they pass their expiresAt — without
  // waiting on the next 30s server poll.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);
  const visibleItems = useMemo(() => (items || []).filter((n) => {
    if (!n.expiresAt) return true;
    return new Date(n.expiresAt).getTime() > now;
  }), [items, now]);
  const visibleUnread = useMemo(() => {
    // If we have an open list of items, prefer that count (matches
    // what the user sees). Otherwise fall back to the server count.
    if (visibleItems.length > 0) return visibleItems.filter((x) => !x.read).length;
    return unread;
  }, [visibleItems, unread]);

  async function loadCount() {
    try {
      const r = await api.get('/notifications/unread-count');
      setUnread(r.data.data?.count || 0);
    } catch { /* ignore — bell stays at last-known count */ }
  }
  async function loadList() {
    setLoading(true);
    try {
      const r = await api.get('/notifications', { params: { limit: 15 } });
      setItems(r.data.data || []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }

  // Poll unread count.
  useEffect(() => {
    loadCount();
    const t = setInterval(loadCount, 30000);
    function onVisible() { if (document.visibilityState === 'visible') loadCount(); }
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVisible); };
  }, []);

  // Outside click + Esc to close.
  useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);

  function toggle() {
    setOpen((o) => {
      const next = !o;
      if (next) loadList();
      return next;
    });
  }

  async function openItem(n) {
    if (!n.read) {
      try { await api.post(`/notifications/${n._id}/read`); } catch {}
      setItems((prev) => prev.map((x) => x._id === n._id ? { ...x, read: true } : x));
      setUnread((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) navigate(n.link);
    else navigate('/notifications');
  }

  async function markAll() {
    try { await api.post('/notifications/mark-all-read'); } catch {}
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
  }

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="bell-btn"
        onClick={toggle}
        aria-label={visibleUnread ? `${visibleUnread} unread notifications` : 'Notifications'}
        title="Notifications"
      >
        <span aria-hidden="true">🔔</span>
        {visibleUnread > 0 && <span className="bell-badge">{visibleUnread > 99 ? '99+' : visibleUnread}</span>}
      </button>
      {open && (
        <div className="bell-pop" role="dialog" aria-label="Notifications">
          <div className="bell-pop-head">
            <strong>Notifications</strong>
            {visibleUnread > 0 && (
              <button type="button" className="btn ghost" onClick={markAll}>Mark all read</button>
            )}
          </div>
          <div className="bell-pop-list">
            {loading && <div className="bell-empty">Loading…</div>}
            {!loading && visibleItems.length === 0 && <div className="bell-empty">No notifications yet.</div>}
            {!loading && visibleItems.map((n) => (
              <button
                key={n._id}
                type="button"
                className={`bell-item ${n.read ? '' : 'unread'} sev-${n.severity || 'INFO'}`}
                onClick={() => openItem(n)}
              >
                <div className="bell-item-title">{n.title}</div>
                {n.body && <div className="bell-item-body">{n.body}</div>}
                <div className="bell-item-meta">{new Date(n.createdAt).toLocaleString()}</div>
              </button>
            ))}
          </div>
          <div className="bell-pop-foot">
            <button type="button" className="btn secondary" onClick={() => { setOpen(false); navigate('/notifications'); }}>
              See all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
