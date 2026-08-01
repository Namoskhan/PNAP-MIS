import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

// Static navigation actions, gated by role where appropriate.
function buildActions(user, nav, openRegisterMember) {
  const roles = user?.roles || [];
  const has = (...rs) => rs.some((r) => roles.includes(r));
  const isAdmin = has('SUPER_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN');

  const items = [
    { group: 'Navigate', icon: '⌂', title: 'Dashboard', sub: 'Home', action: () => nav('/') },
    { group: 'Navigate', icon: 'U', title: 'Unit Dashboard', sub: 'Your unit overview', action: () => nav('/unit') },
    { group: 'Navigate', icon: 'M', title: 'Members', sub: 'Member directory', action: () => nav('/members') },
    { group: 'Navigate', icon: '#', title: 'Meetings', sub: 'Meeting log', action: () => nav('/unit/meetings') },
    { group: 'Navigate', icon: 'A', title: 'Activities', sub: 'Activities log', action: () => nav('/unit/activities') },
    { group: 'Navigate', icon: '$', title: 'Finance', sub: 'Donations & expenses', action: () => nav('/unit/finance') },
    { group: 'Navigate', icon: 'C', title: 'Cabinet & Roles', sub: 'Role assignments', action: () => nav('/unit/cabinet') },
    { group: 'Navigate', icon: 'R', title: 'Reports', sub: 'Performance reports', action: () => nav('/unit/reports') },
    { group: 'Navigate', icon: 'T', title: 'Fund Transfers', sub: 'Inter-tier transfers', action: () => nav('/unit/transfers') },
  ];

  if (isAdmin) {
    items.push({ group: 'Admin', icon: 'P', title: 'Pending Approvals', sub: 'Member approvals', action: () => nav('/admin/pending-approvals') });
    items.push({ group: 'Admin', icon: 'U', title: 'Users & Credentials', sub: 'Manage user accounts', action: () => nav('/admin/users') });
    items.push({ group: 'Admin', icon: 'O', title: 'Unit Proposals', sub: 'Propose / approve units', action: () => nav('/admin/unit-proposals') });
    items.push({ group: 'Admin', icon: 'F', title: 'Finance Overview', sub: 'Cross-unit finance', action: () => nav('/admin/finance-overview') });
    items.push({ group: 'Admin', icon: 'L', title: 'Audit Log', sub: 'System activity log', action: () => nav('/admin/audit') });
  }

  if (has('SUPER_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN')) {
    items.push({ group: 'Quick Action', icon: '+', title: 'Register a Member', sub: 'Open registration form', action: openRegisterMember });
  }

  return items;
}

function fuzzyScore(query, text) {
  if (!query) return 1;
  const q = query.toLowerCase();
  const t = (text || '').toLowerCase();
  if (t.includes(q)) return 100 - t.indexOf(q);
  // simple subsequence match
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length ? 1 : 0;
}

export default function CommandPalette({ open, onClose, onRequestRegisterMember }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [members, setMembers] = useState([]);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActiveIdx(0);
      setMembers([]);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Live member search (debounced)
  useEffect(() => {
    if (!open || !q || q.length < 2) {
      setMembers([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      api.get('/members', { params: { q, limit: 6 } })
        .then((r) => setMembers(r.data.data || []))
        .catch(() => setMembers([]));
    }, 200);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, open]);

  const actions = useMemo(
    () => buildActions(user, nav, () => { onClose?.(); onRequestRegisterMember?.(); }),
    [user, nav, onRequestRegisterMember, onClose]
  );

  const filteredActions = useMemo(() => {
    if (!q) return actions;
    return actions
      .map((a) => ({ ...a, _score: Math.max(fuzzyScore(q, a.title), fuzzyScore(q, a.sub) * 0.6) }))
      .filter((a) => a._score > 0)
      .sort((a, b) => b._score - a._score);
  }, [q, actions]);

  const memberItems = useMemo(() => members.map((m) => ({
    group: 'Members',
    icon: (m.fullName || '?').charAt(0).toUpperCase(),
    title: m.fullName,
    sub: `${m.cnic || '—'} · ${m.basicUnitId?.name || '—'}`,
    action: () => { onClose?.(); nav(`/members/${m._id}`); },
  })), [members, nav, onClose]);

  const allItems = useMemo(() => [...filteredActions, ...memberItems], [filteredActions, memberItems]);

  // Group rendering
  const grouped = useMemo(() => {
    const map = new Map();
    allItems.forEach((it) => {
      if (!map.has(it.group)) map.set(it.group, []);
      map.get(it.group).push(it);
    });
    return Array.from(map.entries());
  }, [allItems]);

  useEffect(() => {
    if (activeIdx >= allItems.length) setActiveIdx(0);
  }, [allItems.length, activeIdx]);

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = allItems[activeIdx];
      if (item) item.action();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose?.();
    }
  }

  if (!open) return null;

  let runningIdx = 0;
  return (
    <div className="cmdk-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className="cmdk" onKeyDown={onKeyDown} role="dialog" aria-label="Command palette">
        <div className="cmdk-input-row">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <path d="m21 21-4.3-4.3"></path>
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search members, jump to pages, run actions…"
            aria-label="Command search"
          />
          <span className="cmdk-kbd">Esc</span>
        </div>
        <ul className="cmdk-list" role="listbox">
          {allItems.length === 0 ? (
            <li className="cmdk-empty">No results for "{q}"</li>
          ) : (
            grouped.map(([group, items]) => (
              <div key={group}>
                <div className="cmdk-group-label">{group}</div>
                {items.map((it) => {
                  const idx = runningIdx++;
                  return (
                    <li
                      key={`${group}-${idx}`}
                      className={`cmdk-item${idx === activeIdx ? ' active' : ''}`}
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => it.action()}
                      role="option"
                      aria-selected={idx === activeIdx}
                    >
                      <div className="cmdk-item-icon">{it.icon}</div>
                      <div className="cmdk-item-body">
                        <div className="cmdk-item-title">{it.title}</div>
                        {it.sub && <div className="cmdk-item-sub">{it.sub}</div>}
                      </div>
                    </li>
                  );
                })}
              </div>
            ))
          )}
        </ul>
        <div className="cmdk-footer">
          <span>PKNAP Quick Search</span>
          <div className="cmdk-keys">
            <span><kbd>↑↓</kbd> Navigate</span>
            <span><kbd>↵</kbd> Open</span>
            <span><kbd>Esc</kbd> Close</span>
          </div>
        </div>
      </div>
    </div>
  );
}
