import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/permissions';
import { useToast } from '../../components/Toast';

import dialog from '../../components/dialog';
import { XIcon } from '../../components/icons';
const CREATABLE_CATEGORIES = [
  { value: 'CUSTOM',           label: 'Custom (general)' },
  { value: 'BU_AREA_DISTRICT', label: 'Below-Province Cabinet' },
  { value: 'PROVINCE',         label: 'Province Cabinet' },
  { value: 'CENTRAL',          label: 'Central Cabinet' },
];

export default function RolesPage() {
  const { user } = useAuth();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = isSuperAdmin(user);
  const nav = useNavigate();

  const [roles, setRoles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setBusy(true); setErr('');
    try {
      const r = await api.get('/admin/roles');
      const data = r.data.data;
      setRoles(Array.isArray(data) ? data : (data?.roles || []));
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function deleteRole(r) {
    if (!canWrite) return;
    if (!await dialog.confirm(`Delete custom role "${r.label}" (${r.code})? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/roles/${r._id}`);
      toast.success?.('Role deleted.');
      load();
    } catch (e) { toast.error?.(errorMessage(e)); }
  }

  // Sort: built-in first by sort order, custom last alphabetically.
  const sorted = useMemo(() => {
    return [...roles].sort((a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return (a.sortOrder || 0) - (b.sortOrder || 0);
      return (a.label || '').localeCompare(b.label || '');
    });
  }, [roles]);

  return (
    <div>
      {/* ─── Hero ────────────────────────────────────────────── */}
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true">🛡️</div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Roles Management</h2>
            <div className="rm-hero-sub">Manage system roles and permissions</div>
          </div>
          {canWrite && (
            <div className="rm-hero-actions">
              <button className="rm-hero-btn outline" onClick={load} title="Reload">⟳ Refresh</button>
              <button className="rm-hero-btn solid" onClick={() => setCreateOpen(true)}>
                <span aria-hidden="true">＋</span> Create New Role
              </button>
            </div>
          )}
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}

      {/* ─── Roles table card ────────────────────────────────── */}
      <div className="rm-card">
        <div className="rm-card-head">
          <span className="rm-card-head-icon" aria-hidden="true">👤</span>
          <span className="rm-card-head-label">Role Name</span>
          <span className="rm-card-head-actions">
            <span className="rm-card-head-icon" aria-hidden="true">⚙</span>
            <span>Actions</span>
          </span>
        </div>

        {busy && (
          <div className="rm-loading">
            <span className="scope-spinner" aria-hidden="true" />
            <span className="muted">Loading roles…</span>
          </div>
        )}

        {!busy && sorted.length === 0 && (
          <div className="rm-empty">No roles defined yet.</div>
        )}

        {!busy && sorted.map((r) => {
          const locked = r.code === 'SUPER_ADMIN';
          const initial = (r.label || r.code || '?').charAt(0).toUpperCase();
          return (
            <div key={r._id} className={`rm-row ${locked ? 'locked' : ''}`}>
              <div className="rm-row-avatar">
                <span aria-hidden="true">{initial}</span>
                {locked && <span className="rm-row-avatar-badge" title="Built-in, locked">🔒</span>}
              </div>
              <div className="rm-row-meta">
                <div className="rm-row-name">
                  {r.label}
                  {!r.isSystem && <span className="rm-row-tag custom">Custom</span>}
                  {!r.isActive && <span className="rm-row-tag inactive">Inactive</span>}
                </div>
                <div className="rm-row-sub">
                  <code>{r.code}</code>
                  <span className="muted">·</span>
                  {(r.permissions || []).length === 0 && r.code !== 'SUPER_ADMIN' ? (
                    <span
                      className="rm-row-tag"
                      style={{ background: 'var(--warning-bg)', color: 'var(--warning-strong)', border: '1px solid var(--warning-border)' }}
                      title="Holders of this role see only the member portal until you grant permissions."
                    >No permissions — grants nothing</span>
                  ) : (
                    <span>{(r.permissions || []).length} permissions</span>
                  )}
                  {r.description && <span className="rm-row-desc"> · {r.description}</span>}
                </div>
              </div>
              <div className="rm-row-actions">
                {locked ? (
                  <span className="rm-row-locked">🔒 Locked (built-in)</span>
                ) : (
                  <>
                    <button
                      className="rm-action perms"
                      onClick={() => nav(`/admin/roles/${r._id}/permissions`)}
                      title="Edit permissions for this role"
                    >🔐 Permissions</button>
                    <button
                      className="rm-action edit"
                      onClick={() => setEditing(r)}
                      disabled={!canWrite}
                      title={canWrite ? 'Edit label, description, category' : 'Read-only'}
                    >✎ Edit</button>
                    {!r.isSystem && canWrite && (
                      <button
                        className="rm-action delete"
                        onClick={() => deleteRole(r)}
                        title="Delete this custom role"
                      >🗑 Delete</button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <EditRoleDialog
          role={editing}
          onClose={() => setEditing(null)}
          onSaved={(cascade) => {
            setEditing(null); load();
            const renamed = cascade?.renamedAssignments || 0;
            const ended = cascade?.endedAssignments || 0;
            if (ended > 0) {
              toast.success?.(`Role updated. Ended ${ended} active assignment${ended === 1 ? '' : 's'}.`);
            } else if (renamed > 0) {
              toast.success?.(`Role renamed. Updated label on ${renamed} existing assignment${renamed === 1 ? '' : 's'}.`);
            } else {
              toast.success?.('Role updated.');
            }
          }}
        />
      )}
      {createOpen && (
        <CreateRoleDialog
          onClose={() => setCreateOpen(false)}
          onSaved={(newRole) => {
            setCreateOpen(false);
            load();
            toast.success?.('Custom role created.');
            // Jump straight to the permission editor for the new role.
            if (newRole?._id) nav(`/admin/roles/${newRole._id}/permissions`);
          }}
        />
      )}
    </div>
  );
}

// ─── Edit dialog: only label / description / category / sortOrder /
// isActive. Permissions live on their own page now. ─────────────────
function EditRoleDialog({ role, onClose, onSaved }) {
  const [label, setLabel] = useState(role.label || '');
  const [description, setDescription] = useState(role.description || '');
  const [category, setCategory] = useState(role.category || 'CUSTOM');
  const [sortOrder, setSortOrder] = useState(role.sortOrder || 100);
  const [isActive, setIsActive] = useState(role.isActive !== false);
  // When the admin flips Active → Inactive on a role, offer to also
  // force-end every existing assignment (default off — explicit opt-in).
  const [endExistingAssignments, setEndExistingAssignments] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const willDeactivate = role.isActive && !isActive && !role.isSystem;
  const willRename = label.trim() !== (role.label || '');

  async function save() {
    setErr(''); setBusy(true);
    try {
      const payload = { label, description, sortOrder };
      if (!role.isSystem) {
        payload.category = category;
        payload.isActive = isActive;
      }
      if (willDeactivate && endExistingAssignments) payload.endExistingAssignments = true;
      const r = await api.patch(`/admin/roles/${role._id}`, payload);
      const cascade = r?.data?.data?._cascade || {};
      // Surface what changed downstream so the admin sees the impact.
      onSaved(cascade);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Edit role · <code className="exec-login">{role.code}</code></h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
        </div>
        {role.isSystem && (
          <div className="alert" style={{ background: 'rgba(217, 119, 6, 0.08)', border: '1px solid rgba(217, 119, 6, 0.2)', marginBottom: 12 }}>
            <strong>Built-in role.</strong> Code, category, and active state are locked. Use <strong>Permissions</strong> on the row to edit what this role can do.
          </div>
        )}
        {err && <div className="alert error">{err}</div>}
        <div className="form-grid">
          <div className="field full">
            <label>Display label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
          </div>
          <div className="field full">
            <label>Description (optional)</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} />
          </div>
          {!role.isSystem && (
            <div className="field">
              <label>Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {CREATABLE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>Sort order</label>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)} />
            <div className="hint">Lower numbers appear first within a category.</div>
          </div>
          {!role.isSystem && (
            <div className="field">
              <label className="toggle-row">
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                Active (members can be assigned this role)
              </label>
            </div>
          )}
        </div>

        {willRename && !role.isSystem && (
          <div className="alert" style={{ background: 'rgba(2, 132, 199, 0.06)', border: '1px solid rgba(2, 132, 199, 0.25)', color: 'var(--info-strong)', marginTop: 12 }}>
            <strong>Heads up:</strong> renaming will update the label everywhere this role is currently assigned (existing cabinet rows, audit entries, pending approvals).
          </div>
        )}
        {willDeactivate && (
          <div className="alert" style={{ background: 'rgba(217, 119, 6, 0.08)', border: '1px solid rgba(217, 119, 6, 0.25)', color: 'var(--warning-strong)', marginTop: 12 }}>
            <div><strong>Deactivating this role.</strong></div>
            <div style={{ fontSize: 13, marginTop: 6 }}>
              By default the role is <em>frozen</em> — new assignments are blocked but existing holders keep access until you explicitly end their assignment from the Cabinet page.
            </div>
            <label className="toggle-row" style={{ marginTop: 8, fontSize: 13 }}>
              <input type="checkbox" checked={endExistingAssignments} onChange={(e) => setEndExistingAssignments(e.target.checked)} />
              Also end every active assignment of this role <span className="muted">(immediate revoke)</span>
            </label>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function CreateRoleDialog({ onClose, onSaved }) {
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('CUSTOM');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const previewCode = useMemo(() => {
    const slug = label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return slug ? `CUSTOM_${slug}` : '';
  }, [label]);

  async function save() {
    setErr(''); setBusy(true);
    try {
      const r = await api.post('/admin/roles', {
        label,
        description: description || undefined,
        category,
        permissions: [], // start empty; user is taken to the editor next
      });
      onSaved(r.data.data);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Create custom role</h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
        </div>
        {err && <div className="alert error">{err}</div>}
        <div className="form-grid">
          <div className="field full">
            <label>Display label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="e.g., Youth Coordinator" autoFocus />
            {previewCode && (
              <div className="hint">Code will be: <code className="exec-login">{previewCode}</code></div>
            )}
          </div>
          <div className="field full">
            <label>Description (optional)</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="What this role does — appears as a tooltip in the cabinet picker." />
          </div>
          <div className="field">
            <label>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CREATABLE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          After creating, you'll go straight to the permission editor for this role.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !label.trim()} onClick={save}>{busy ? 'Creating…' : 'Create & set permissions'}</button>
        </div>
      </div>
    </div>
  );
}
