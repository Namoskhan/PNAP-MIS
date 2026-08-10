import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/permissions';
import { useToast } from '../../components/Toast';
import dialog from '../../components/dialog';
import {
  UsersIcon, WalletIcon, CalendarIcon, ShieldIcon,
  MegaphoneIcon, BuildingIcon, GearIcon,
} from '../../components/icons';

// Map a category string to a small icon. Falls back to a generic
// shield. Order is also defined here so the rendered grid follows
// a meaningful sequence regardless of catalogue insertion order.
const CATEGORY_ICON = {
  Members:           <UsersIcon size={16} />,
  Finance:           <WalletIcon size={16} />,
  Meetings:          <CalendarIcon size={16} />,
  Roles:             <ShieldIcon size={16} />,
  Communication:     <MegaphoneIcon size={16} />,
  'Org Structure':   <BuildingIcon size={16} />,
  System:            <GearIcon size={16} />,
};
const CATEGORY_ORDER = [
  'Members', 'Finance', 'Meetings', 'Roles', 'Communication', 'Org Structure', 'System',
];

export default function RolePermissionsPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user, refreshMe } = useAuth();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = isSuperAdmin(user);

  const [role, setRole] = useState(null);
  const [allRoles, setAllRoles] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [original, setOriginal] = useState(new Set());
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setBusy(true); setErr('');
    try {
      const r = await api.get('/admin/roles');
      const data = r.data.data;
      const roles = Array.isArray(data) ? data : (data?.roles || []);
      const perms = Array.isArray(data) ? [] : (data?.permissions || []);
      setAllRoles(roles);
      // Super-reserved codes (System / Org Structure) are not
      // grantable to other roles — the server strips them on save
      // and purges them at boot. Hide them here so the editor only
      // ever shows checkboxes that actually do something.
      setCatalog(perms.filter((x) => !x.superOnly));
      const found = roles.find((x) => String(x._id) === String(id));
      if (!found) {
        setErr('Role not found.');
        setRole(null);
      } else {
        setRole(found);
        const set = new Set(found.permissions || []);
        setSelected(set);
        setOriginal(new Set(set));
      }
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, [id]);

  // Group catalog by category, then sort categories by CATEGORY_ORDER.
  const grouped = useMemo(() => {
    const out = {};
    for (const p of catalog) {
      (out[p.category] = out[p.category] || []).push(p);
    }
    const ordered = [];
    for (const c of CATEGORY_ORDER) if (out[c]) ordered.push([c, out[c]]);
    for (const [c, list] of Object.entries(out)) {
      if (!CATEGORY_ORDER.includes(c)) ordered.push([c, list]);
    }
    return ordered;
  }, [catalog]);

  function togglePerm(code) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  function selectCategory(perms, on) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of perms) {
        if (on) next.add(p.code); else next.delete(p.code);
      }
      return next;
    });
  }

  function categoryAllSelected(perms) {
    return perms.every((p) => selected.has(p.code));
  }

  const dirty = useMemo(() => {
    if (selected.size !== original.size) return true;
    for (const c of selected) if (!original.has(c)) return true;
    return false;
  }, [selected, original]);

  async function save() {
    if (!role) return;
    setSaving(true); setErr('');
    try {
      await api.patch(`/admin/roles/${role._id}`, { permissions: [...selected] });
      toast.success?.('Permissions saved.');
      setOriginal(new Set(selected));
      // Refresh in two places so the new state is visible immediately:
      //   (a) the role's local copy (so the chip + sort reflect the save)
      //   (b) the current user's payload (in case the editor themselves
      //       holds the role being changed — their UI gates need the
      //       fresh permissions list).
      load();
      refreshMe?.();
    } catch (e) { setErr(errorMessage(e)); toast.error?.(errorMessage(e)); }
    finally { setSaving(false); }
  }

  function cancel() {
    nav('/admin/roles');
  }

  async function switchRole(rid) {
    if (dirty && !await dialog.confirm('Discard unsaved changes?')) return;
    nav(`/admin/roles/${rid}/permissions`);
  }

  const totalPerms = catalog.length;
  const isLocked = role?.code === 'SUPER_ADMIN';
  const readOnly = !canWrite || isLocked;

  return (
    <div>
      {/* ─── Hero ────────────────────────────────────────────── */}
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><ShieldIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Role Permissions</h2>
            <div className="rm-hero-sub">Manage role-based access control and permissions</div>
          </div>
          <div className="rm-hero-actions">
            <Link to="/admin/roles" className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>← Back to Roles</Link>
            {canWrite && (
              <button className="rm-hero-btn solid" disabled={!dirty || saving || readOnly} onClick={save}>
                {saving ? 'Saving…' : 'Save Permissions'}
              </button>
            )}
          </div>
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}
      {busy && (
        <div className="rm-loading">
          <span className="scope-spinner" aria-hidden="true" />
          <span className="muted">Loading…</span>
        </div>
      )}

      {!busy && role && (
        <>
          {/* ─── Select Role card ─────────────────────────────── */}
          <div className="rm-card">
            <div className="rm-card-bar">
              <span className="rm-card-bar-icon" aria-hidden="true"><UsersIcon size={15} /></span>
              <span className="rm-card-bar-label">Select Role</span>
            </div>
            <div className="rm-card-body">
              <div className="field" style={{ maxWidth: 520 }}>
                <label>Role name</label>
                <select value={role._id} onChange={(e) => switchRole(e.target.value)}>
                  {allRoles.map((r) => (
                    <option key={r._id} value={r._id}>
                      {r.label}{r.code === 'SUPER_ADMIN' ? '  🔒' : ''}
                    </option>
                  ))}
                </select>
                <div className="hint">
                  <code>{role.code}</code>
                  {role.description && <> · {role.description}</>}
                </div>
              </div>
            </div>
          </div>

          {/* ─── Permissions for [role] header ────────────────── */}
          <div className="rm-card">
            <div className="rm-card-bar">
              <span className="rm-card-bar-icon" aria-hidden="true"><ShieldIcon size={15} /></span>
              <span className="rm-card-bar-label">Permissions for {role.label}</span>
              <span className="rm-card-bar-count">
                {selected.size} / {totalPerms}
              </span>
            </div>
            {!isLocked && selected.size === 0 && (
              <div className="rm-card-body">
                <div className="alert warning" style={{ margin: 0 }}>
                  <strong>This role grants nothing yet.</strong>{' '}
                  Holders will see only the member portal until you tick at
                  least one permission below and save.
                </div>
              </div>
            )}
            {isLocked && (
              <div className="rm-card-body">
                <div className="alert" style={{ background: 'rgba(30, 64, 175, 0.06)', border: '1px solid rgba(30, 64, 175, 0.2)', margin: 0 }}>
                  <strong>Super Admin is built-in and locked.</strong>{' '}
                  <span className="muted">It always carries every permission — this is the bootstrap / break-glass guarantee.</span>
                </div>
              </div>
            )}
          </div>

          {/* ─── Category cards ───────────────────────────────── */}
          {grouped.map(([cat, perms]) => {
            const allOn = categoryAllSelected(perms);
            const someOn = perms.some((p) => selected.has(p.code));
            return (
              <div key={cat} className="rm-cat">
                <div className="rm-cat-bar">
                  <span className="rm-cat-icon" aria-hidden="true">{CATEGORY_ICON[cat] || <ShieldIcon size={16} />}</span>
                  <div className="rm-cat-titles">
                    <div className="rm-cat-title">{cat}</div>
                    <div className="rm-cat-sub">{perms.length} permission{perms.length === 1 ? '' : 's'}</div>
                  </div>
                  <label className="rm-select-all">
                    <input
                      type="checkbox"
                      checked={allOn}
                      ref={(el) => { if (el) el.indeterminate = !allOn && someOn; }}
                      disabled={readOnly}
                      onChange={(e) => selectCategory(perms, e.target.checked)}
                    />
                    <span>Select All</span>
                  </label>
                </div>
                <div className="rm-cat-body">
                  <div className="rm-perm-grid">
                    {perms.map((p) => {
                      const on = selected.has(p.code);
                      return (
                        <label
                          key={p.code}
                          className={`rm-perm-tile ${on ? 'on' : ''} ${readOnly ? 'readonly' : ''}`}
                          title={`${p.code}\n${p.label}`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={readOnly}
                            onChange={() => togglePerm(p.code)}
                          />
                          <span className="rm-perm-tile-text">
                            <span className="rm-perm-tile-name">{p.label}</span>
                            <span className="rm-perm-tile-code">{p.code}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

          {/* ─── Footer (Cancel / Save) ───────────────────────── */}
          {canWrite && !isLocked && (
            <div className="rm-footer">
              {dirty && (
                <span className="rm-dirty-chip" role="status">
                  Unsaved changes — {selected.size < original.size ? 'permissions will be revoked on save' : 'save to apply'}
                </span>
              )}
              <button type="button" className="rm-hero-btn outline" onClick={cancel}>× Cancel</button>
              <button type="button" className="rm-hero-btn solid" disabled={!dirty || saving} onClick={save}>
                {saving ? 'Saving…' : '✓ Save Permissions'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
