import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/permissions';
import { useToast } from '../../components/Toast';

const ROLE_OPTIONS = [
  'SUPER_ADMIN', 'CENTRAL_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN',
  'SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY',
  'PRESS_SECRETARY', 'CULTURE_SECRETARY', 'SPORTS_SECRETARY',
  'PRESIDENT', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY',
  'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN', 'FIRST_SECRETARY',
  'OTHER', 'MEMBER',
];

const PAGE_SIZE = 20;

// Deterministic avatar colour based on the user's name. Tuned to the
// brand blue palette so avatars sit alongside the rest of the UI.
const AVATAR_COLORS = ['#1e3a8a', '#1e40af', '#2563eb', '#172554', '#1d4ed8', '#3b82f6'];
function avatarColor(name) {
  if (!name) return AVATAR_COLORS[0];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export default function UsersPage() {
  const { user: viewer } = useAuth();
  const canWrite = isSuperAdmin(viewer);
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const nav = useNavigate();
  // Deep-linkable role filter. The sidebar's "Central Admins" entry
  // lands here as /admin/users?role=CENTRAL_ADMIN — without this the
  // param was accepted by the URL and silently ignored by the page.
  const [searchParams, setSearchParams] = useSearchParams();
  const roleParam = searchParams.get('role') || '';
  const [createOpen, setCreateOpen] = useState(false);

  // ─── Filters (committed) — applied state used to fetch ───────────
  const [filters, setFilters] = useState({
    q: '', role: roleParam, isActive: '', provinceId: '', districtId: '', areaId: '',
  });
  // ─── Filter form (draft) — what the user is editing pre-Apply ────
  const [draft, setDraft] = useState({
    q: '', role: roleParam, isActive: '', provinceId: '', districtId: '', areaId: '',
  });
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);

  // Cascading scope option lists.
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);

  // Load top-level provinces once.
  useEffect(() => {
    api.get('/org/provinces').then((r) => setProvinces(r.data.data || [])).catch(() => {});
  }, []);
  // Districts depend on province selection.
  useEffect(() => {
    if (!draft.provinceId) { setDistricts([]); return; }
    api.get('/org/districts', { params: { provinceId: draft.provinceId } })
      .then((r) => setDistricts(r.data.data || []))
      .catch(() => setDistricts([]));
  }, [draft.provinceId]);
  // Areas depend on district selection.
  useEffect(() => {
    if (!draft.districtId) { setAreas([]); return; }
    api.get('/org/areas', { params: { districtId: draft.districtId } })
      .then((r) => setAreas(r.data.data || []))
      .catch(() => setAreas([]));
  }, [draft.districtId]);

  // ─── Live cross-cutting search dropdown (existing /admin/search) ─
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchBoxRef = useRef(null);
  const debounceRef = useRef(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (searchQ.trim().length < 2) {
      setSearchResults([]); setShowDropdown(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await api.get('/admin/search', { params: { q: searchQ.trim() } });
        setSearchResults(r.data.data || []);
        setShowDropdown(true);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 220);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [searchQ]);
  useEffect(() => {
    function onDoc(e) {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  function pickResult(r) {
    setShowDropdown(false);
    setSearchQ('');
    if (r.kind === 'ADMIN') {
      setEditing({
        _id: r.userId, fullName: r.fullName, username: r.username,
        email: r.email, cnic: r.cnic, roles: r.roles, isActive: r.isActive,
      });
    } else {
      nav(`/members/${r.memberId}`);
    }
  }

  // ─── Fetch the user list ─────────────────────────────────────────
  async function load() {
    setBusy(true); setErr('');
    try {
      const params = {
        page, limit: PAGE_SIZE,
      };
      if (filters.q)         params.q = filters.q;
      if (filters.role)      params.role = filters.role;
      if (filters.isActive)  params.isActive = filters.isActive;
      if (filters.provinceId) params.provinceId = filters.provinceId;
      if (filters.districtId) params.districtId = filters.districtId;
      if (filters.areaId)     params.areaId = filters.areaId;
      const r = await api.get('/admin/users', { params });
      const data = r.data.data || {};
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filters, page]);

  // Follow later navigations to ?role=… (clicking the sidebar entry
  // while already on this page changes only the query string, which
  // would otherwise leave the previous filter applied).
  useEffect(() => {
    setDraft((d) => (d.role === roleParam ? d : { ...d, role: roleParam }));
    setFilters((f) => (f.role === roleParam ? f : { ...f, role: roleParam }));
    setPage(1);
  }, [roleParam]);

  function applyFilters() { setPage(1); setFilters(draft); }
  function clearFilters() {
    const empty = { q: '', role: '', isActive: '', provinceId: '', districtId: '', areaId: '' };
    setDraft(empty);
    setFilters(empty);
    setPage(1);
  }

  // ─── Per-row actions ─────────────────────────────────────────────
  async function resetPwd(u) {
    if (!canWrite) return;
    const pw = prompt(`Set new password for "${u.fullName}":`, '123456');
    if (!pw) return;
    try {
      await api.post(`/admin/users/${u._id}/reset-password`, { newPassword: pw });
      toast.success?.(`Password reset for ${u.fullName}.`);
    } catch (e) { toast.error?.(errorMessage(e)); }
  }
  async function toggleActive(u) {
    if (!canWrite) return;
    const next = !u.isActive;
    if (!confirm(`${next ? 'Activate' : 'Deactivate'} ${u.fullName}?`)) return;
    // Optimistic flip — patch the local row immediately, revert on error.
    setItems((prev) => prev.map((x) => x._id === u._id ? { ...x, isActive: next } : x));
    try {
      await api.post(`/admin/users/${u._id}/${u.isActive ? 'deactivate' : 'activate'}`);
      toast.success?.(`${u.fullName} is now ${next ? 'active' : 'inactive'}.`);
    } catch (e) {
      // Revert on failure.
      setItems((prev) => prev.map((x) => x._id === u._id ? { ...x, isActive: u.isActive } : x));
      toast.error?.(errorMessage(e));
    }
  }

  const totalPages = Math.max(1, Math.ceil((total || 0) / PAGE_SIZE));
  const activeFilterCount =
    (filters.role ? 1 : 0) +
    (filters.isActive ? 1 : 0) +
    (filters.provinceId ? 1 : 0) +
    (filters.districtId ? 1 : 0) +
    (filters.areaId ? 1 : 0) +
    (filters.q ? 1 : 0);

  return (
    <div>
      {/* ─── Hero ────────────────────────────────────────────── */}
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true">👥</div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Users &amp; Credentials</h2>
            <div className="rm-hero-sub">Search, filter, and manage every user account in the system</div>
          </div>
          <div className="rm-hero-actions">
            {/* Central Admin is the one admin tier with no org unit of
                its own — Central is a pre-existing singleton, so it
                cannot be created through ManageOrgPage, which creates
                an admin alongside a NEW child unit. This is its only
                creation path. */}
            {canWrite && (
              <button
                type="button"
                className="rm-hero-btn solid"
                onClick={() => setCreateOpen(true)}
              >+ Create Central Admin</button>
            )}
            <button
              type="button"
              className="rm-hero-btn outline"
              onClick={() => {
                const next = { ...draft, isActive: 'false' };
                setDraft(next);
                setPage(1);
                setFilters(next);
              }}
              title="Filter to inactive users"
            >🗂 Inactive Users</button>
            <button type="button" className="rm-hero-btn solid" onClick={load} title="Reload">⟳ Refresh</button>
          </div>
        </div>
      </div>

      {/* ─── Filter card ─────────────────────────────────────── */}
      <div className="users-filter-card">
        <div className="users-filter-row">
          <div ref={searchBoxRef} className="users-search-wrap" style={{ flex: 2 }}>
            <span className="users-search-icon" aria-hidden="true">🔍</span>
            <input
              type="search"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onFocus={() => searchResults.length && setShowDropdown(true)}
              placeholder="Search anything (name, CNIC, phone, role, email)…"
              className="users-search-input"
              autoComplete="off"
            />
            {searchQ && (
              <button
                type="button"
                className="users-search-clear"
                onClick={() => { setSearchQ(''); setShowDropdown(false); }}
                aria-label="Clear search"
              >×</button>
            )}
            {showDropdown && (
              <div className="users-search-pop">
                {searching && <div className="users-search-empty">Searching…</div>}
                {!searching && searchResults.length === 0 && (
                  <div className="users-search-empty">No matches.</div>
                )}
                {!searching && searchResults.map((r) => (
                  <button
                    key={r.kind + r._id}
                    onClick={() => pickResult(r)}
                    className="users-search-result"
                  >
                    <div className="users-search-result-row">
                      <SmallAvatar name={r.fullName} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="users-search-result-head">
                          <strong>{r.fullName}</strong>
                          <span className={`badge ${r.kind === 'ADMIN' ? 'APPROVED' : r.kind === 'CABINET' ? 'ACTIVE' : 'DRAFT'}`}>{r.kind}</span>
                          {r.memberCode && <span className="muted">#{r.memberCode}</span>}
                        </div>
                        <div className="users-search-result-meta">
                          {r.roleLabel}
                          {r.cnic && <> · {r.cnic}</>}
                          {r.username && <> · @{r.username}</>}
                          {r.email && <> · {r.email}</>}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <select
            className="users-filter-select"
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
          >
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>

          <select
            className="users-filter-select"
            value={draft.provinceId}
            onChange={(e) => setDraft({ ...draft, provinceId: e.target.value, districtId: '', areaId: '' })}
          >
            <option value="">All provinces</option>
            {provinces.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>

          <select
            className="users-filter-select"
            value={draft.districtId}
            disabled={!draft.provinceId}
            onChange={(e) => setDraft({ ...draft, districtId: e.target.value, areaId: '' })}
          >
            <option value="">All districts</option>
            {districts.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>

          <select
            className="users-filter-select"
            value={draft.areaId}
            disabled={!draft.districtId}
            onChange={(e) => setDraft({ ...draft, areaId: e.target.value })}
          >
            <option value="">All areas</option>
            {areas.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>

          <select
            className="users-filter-select status"
            value={draft.isActive}
            onChange={(e) => setDraft({ ...draft, isActive: e.target.value })}
          >
            <option value="">Any status</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>

        <div className="users-filter-actions">
          <button type="button" className="users-apply-btn" onClick={applyFilters}>
            <span aria-hidden="true">🔎</span> Apply Filters
            {activeFilterCount > 0 && <span className="users-apply-count">{activeFilterCount}</span>}
          </button>
          {(activeFilterCount > 0) && (
            <button type="button" className="users-clear-btn" onClick={clearFilters}>Clear all</button>
          )}
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}

      {/* ─── All Users card ──────────────────────────────────── */}
      <div className="rm-card">
        <div className="rm-card-bar">
          <span className="rm-card-bar-icon" aria-hidden="true">📋</span>
          <span className="rm-card-bar-label">All Users</span>
          <span className="rm-card-bar-count">{total} TOTAL</span>
        </div>

        <div className="users-pagination-row">
          <span className="muted" style={{ fontSize: 13 }}>
            Page {page} of {totalPages} ({total} {total === 1 ? 'user' : 'users'})
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className="users-page-btn"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >Previous</button>
            <button
              type="button"
              className="users-page-btn"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >Next</button>
          </div>
        </div>

        <div className="users-table-wrap" style={{ borderRadius: 0, border: 0 }}>
          <table className="users-table users-table-flat">
            <thead>
              <tr>
                <th>User</th>
                <th>Tier</th>
                <th>Roles</th>
                <th>Login</th>
                <th>Status</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {busy && <tr><td colSpan={6} className="users-loading-cell"><span className="scope-spinner" /> <span className="muted">Loading users…</span></td></tr>}
              {!busy && items.length === 0 && (
                <tr><td colSpan={6} className="users-loading-cell muted">No users match your filters.</td></tr>
              )}
              {!busy && items.map((u) => <UserRow key={u._id} u={u} canWrite={canWrite} onEdit={setEditing} onResetPwd={resetPwd} onToggle={toggleActive} />)}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EditUserDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast.success?.('User updated.'); }}
        />
      )}

      {createOpen && (
        <CreateCentralAdminDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            // Drop the user into the Central Admin view so the new
            // account is visible immediately.
            setSearchParams({ role: 'CENTRAL_ADMIN' });
            load();
            toast.success?.('Central Admin created.');
          }}
        />
      )}
    </div>
  );
}

// ─── Create Central Admin ──────────────────────────────────────────
// The Central Admin is the only administrative tier without an org
// unit of its own: Super Admin creates the person, and that person
// then creates the Provinces. Every other tier's admin is created
// alongside its unit in ManageOrgPage, which is why this dialog is
// here and not there.
//
// No scope is collected — Central Admin is national by definition, and
// the server ignores any scope sent for this role (see
// adminUserController.create).
function CreateCentralAdminDialog({ onClose, onCreated }) {
  const [form, setForm] = useState({ fullName: '', username: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const canSubmit = form.fullName.trim()
    && (form.username.trim() || form.email.trim())
    && form.password.length >= 6;

  async function submit() {
    setErr('');
    setBusy(true);
    try {
      const body = {
        fullName: form.fullName.trim(),
        password: form.password,
        role: 'CENTRAL_ADMIN',
      };
      if (form.username.trim()) body.username = form.username.trim();
      if (form.email.trim()) body.email = form.email.trim();
      await api.post('/admin/users', body);
      onCreated?.();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose?.(); }}>
      <div className="modal" style={{ maxWidth: 480 }} role="dialog" aria-modal="true" aria-label="Create Central Admin">
        <h3 style={{ marginTop: 0 }}>Create Central Admin</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          A Central Admin structures the Provinces and administers the Province Admins.
          The account is national — it carries no territorial scope.
        </p>

        {err && <div className="alert error">{err}</div>}

        <div className="form-grid">
          <div className="field full">
            <label>Full name <span className="req">*</span></label>
            <input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Username</label>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="field full">
            <label>Password <span className="req">*</span></label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <span className="hint">
              At least 6 characters. Provide a username or an email — either can be used to sign in.
            </span>
          </div>
        </div>

        <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button className="btn secondary" type="button" disabled={busy} onClick={onClose}>Cancel</button>
          <button className="btn" type="button" disabled={!canSubmit || busy} onClick={submit}>
            {busy ? 'Creating…' : 'Create Central Admin'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Row ───────────────────────────────────────────────────────────
function UserRow({ u, canWrite, onEdit, onResetPwd, onToggle }) {
  const [menuOpen, setMenuOpen] = useState(false);
  // Menu coordinates in viewport space — recalculated each time the
  // menu opens. Portaling the menu to document.body sidesteps any
  // ancestor `overflow: hidden` clipping (the All Users card has it
  // for the rounded corners) which would otherwise eat the dropdown.
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  function toggleMenu() {
    setMenuOpen((open) => {
      if (!open && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setMenuPos({
          top: rect.bottom + 4,
          right: Math.max(8, window.innerWidth - rect.right),
        });
      }
      return !open;
    });
  }

  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e) {
      // Click stays open if it lands on either the trigger button or
      // the portaled menu itself; everywhere else closes.
      if (buttonRef.current?.contains(e.target)) return;
      if (menuRef.current?.contains(e.target)) return;
      setMenuOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setMenuOpen(false); }
    function onScroll() { setMenuOpen(false); } // close on scroll so the menu doesn't float
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [menuOpen]);

  const tier = u.scope?.basicUnitId ? 'BASIC UNIT'
    : u.scope?.areaId ? 'AREA'
    : u.scope?.districtId ? 'DISTRICT'
    : u.scope?.provinceId ? 'PROVINCE'
    : 'CENTRAL';

  return (
    <tr>
      <td>
        <div className="exec-cell">
          <div
            className="user-avatar"
            style={{ width: 36, height: 36, fontSize: 14, background: avatarColor(u.fullName) }}
            aria-hidden="true"
          >
            {(u.fullName || '?').charAt(0).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div className="exec-name">{u.fullName}</div>
            {u.lastLoginAt && <div className="exec-meta">last login {new Date(u.lastLoginAt).toLocaleDateString()}</div>}
          </div>
        </div>
      </td>
      <td>
        <span className={`tier-pill tier-${tier.replace(' ', '-').toLowerCase()}`}>{tier}</span>
      </td>
      <td>
        <div className="exec-roles">
          {(u.roles || []).map((r) => (
            <span key={r} className="exec-role-pill">{r}</span>
          ))}
        </div>
      </td>
      <td>
        {u.username && <div><code className="exec-login">{u.username}</code></div>}
        {u.email && <div className="exec-meta">{u.email}</div>}
        {u.cnic && <div className="exec-meta">{u.cnic}</div>}
      </td>
      <td>
        {canWrite ? (
          <button
            type="button"
            className={`status-toggle ${u.isActive ? 'on' : 'off'}`}
            onClick={() => onToggle(u)}
            title={u.isActive ? 'Click to deactivate' : 'Click to activate'}
          >
            <span className="status-toggle-dot" aria-hidden="true" />
            <span className="status-toggle-label">{u.isActive ? 'Active' : 'Inactive'}</span>
          </button>
        ) : (
          <span className={`badge ${u.isActive ? 'ACTIVE' : 'INACTIVE'}`}>{u.isActive ? 'Active' : 'Inactive'}</span>
        )}
      </td>
      <td className="exec-actions">
        <button
          ref={buttonRef}
          type="button"
          className="users-kebab"
          onClick={toggleMenu}
          aria-label={`Actions for ${u.fullName}`}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
        >⋮</button>
        {menuOpen && createPortal(
          <div
            ref={menuRef}
            className="users-kebab-menu"
            role="menu"
            style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
          >
            <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onEdit(u); }}>
              ✎ {canWrite ? 'Edit user' : 'View user'}
            </button>
            {canWrite && (
              <>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onResetPwd(u); }}>🔑 Reset password</button>
                <button
                  type="button"
                  role="menuitem"
                  className={u.isActive ? 'danger' : 'success'}
                  onClick={() => { setMenuOpen(false); onToggle(u); }}
                >
                  {u.isActive ? '⏻ Deactivate' : '✓ Activate'}
                </button>
              </>
            )}
          </div>,
          document.body
        )}
      </td>
    </tr>
  );
}

function SmallAvatar({ name }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="user-avatar" style={{ width: 28, height: 28, fontSize: 12, background: avatarColor(name) }} aria-hidden="true">
      {initial}
    </div>
  );
}

// ─── Edit dialog (unchanged behaviour, polished pill grid) ─────────
function EditUserDialog({ user, onClose, onSaved }) {
  const [form, setForm] = useState({
    fullName: user.fullName || '',
    username: user.username || '',
    email: user.email || '',
    cnic: user.cnic || '',
    isActive: user.isActive,
  });
  const [selectedRoles, setSelectedRoles] = useState(new Set(user.roles || []));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function toggleRole(r) {
    const s = new Set(selectedRoles);
    if (s.has(r)) s.delete(r); else s.add(r);
    setSelectedRoles(s);
  }

  async function save() {
    setErr(''); setBusy(true);
    try {
      await api.patch(`/admin/users/${user._id}`, {
        fullName: form.fullName, username: form.username, email: form.email, cnic: form.cnic,
        roles: Array.from(selectedRoles),
        isActive: form.isActive,
      });
      onSaved();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Edit user</h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        {err && <div className="alert error">{err}</div>}
        <div className="form-grid">
          <div className="field"><label>Full name</label>
            <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
          <div className="field"><label>Username</label>
            <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
          <div className="field"><label>Email</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field"><label>CNIC</label>
            <input value={form.cnic} onChange={(e) => setForm({ ...form, cnic: e.target.value })} /></div>
          <div className="field full">
            <label>Roles</label>
            <div className="role-pill-grid">
              {ROLE_OPTIONS.map((r) => (
                <label key={r} className={`role-pill ${selectedRoles.has(r) ? 'on' : ''}`}>
                  <input type="checkbox" checked={selectedRoles.has(r)} onChange={() => toggleRole(r)} />
                  <span>{r}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="toggle-row">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Account active
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}
