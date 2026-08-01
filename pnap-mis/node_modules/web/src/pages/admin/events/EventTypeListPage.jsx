import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import { FolderIcon, GearIcon, CameraIcon } from '../../../components/icons';

// Shared list page used by both MeetingTypesPage and ActivityTypesPage
// (`entity` prop selects which catalogue to show). Mirrors the
// Roles page layout — hero + card with one row per type, action
// buttons inline. Delegates the actual editor to /admin/events/types/:id.
export default function EventTypeListPage({ entity, title, subtitle, icon }) {
  const { user } = useAuth();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = hasPermission(user, 'MANAGE_EVENT_CONFIG');
  const nav = useNavigate();

  const [types, setTypes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setBusy(true); setErr('');
    try {
      const r = await api.get('/admin/events/types', { params: { entity } });
      setTypes(r.data?.data || []);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, [entity]);

  async function deleteType(t) {
    if (!canWrite) return;
    if (t.isSystem) return;
    if (!confirm(`Delete custom type "${t.label}" (${t.code})? This cannot be undone.`)) return;
    try {
      await api.delete(`/admin/events/types/${t._id}`);
      toast.success?.('Type deleted.');
      load();
    } catch (e) { toast.error?.(errorMessage(e)); }
  }

  const sorted = useMemo(() => {
    return [...types].sort((a, b) => {
      if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
      if (a.sortOrder !== b.sortOrder) return (a.sortOrder || 0) - (b.sortOrder || 0);
      return (a.label || '').localeCompare(b.label || '');
    });
  }, [types]);

  return (
    <div>
      {/* Hero */}
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true">{icon || <FolderIcon size={22} />}</div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">{title}</h2>
            <div className="rm-hero-sub">{subtitle}</div>
          </div>
          {canWrite && (
            <div className="rm-hero-actions">
              <button className="rm-hero-btn outline" onClick={load} title="Reload">⟳ Refresh</button>
              <button className="rm-hero-btn solid" onClick={() => setCreateOpen(true)}>
                <span aria-hidden="true">＋</span> New Type
              </button>
            </div>
          )}
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}

      <div className="rm-card">
        <div className="rm-card-head">
          <span className="rm-card-head-icon" aria-hidden="true"><FolderIcon size={15} /></span>
          <span className="rm-card-head-label">Type</span>
          <span className="rm-card-head-actions">
            <span className="rm-card-head-icon" aria-hidden="true"><GearIcon size={15} /></span>
            <span>Actions</span>
          </span>
        </div>

        {busy && (
          <div className="rm-loading">
            <span className="scope-spinner" aria-hidden="true" />
            <span className="muted">Loading types…</span>
          </div>
        )}

        {!busy && sorted.length === 0 && (
          <div className="rm-empty">No types defined yet.</div>
        )}

        {!busy && sorted.map((t) => {
          const initial = (t.label || t.code || '?').charAt(0).toUpperCase();
          const fieldCount = (t.fields || []).length;
          const photoBadge = t.photoPolicy?.required
            ? `photos ≥${t.photoPolicy.minCount || 1}`
            : 'photos optional';
          return (
            <div key={t._id} className={`rm-row ${t.isSystem ? 'locked' : ''}`}>
              <div className="rm-row-avatar">
                <span aria-hidden="true">{initial}</span>
                {t.isSystem && <span className="rm-row-avatar-badge" title="Built-in">🔒</span>}
              </div>
              <div className="rm-row-meta">
                <div className="rm-row-name">
                  {t.label}
                  {!t.isSystem && <span className="rm-row-tag custom">Custom</span>}
                  {!t.isActive && <span className="rm-row-tag inactive">Inactive</span>}
                </div>
                <div className="rm-row-sub">
                  <code>{t.code}</code>
                  <span className="muted">·</span>
                  <span>{fieldCount} custom field{fieldCount === 1 ? '' : 's'}</span>
                  <span className="muted">·</span>
                  <span>{photoBadge}</span>
                  <span className="muted">·</span>
                  <span>v{t.configVersion || 1}</span>
                  {t.description && <span className="rm-row-desc"> · {t.description}</span>}
                </div>
              </div>
              <div className="rm-row-actions">
                <Link
                  to={`/admin/events/types/${t._id}`}
                  className="rm-action perms"
                  style={{ textDecoration: 'none' }}
                  title="Open the full editor (workflow, fields, photo policy)"
                >Configure</Link>
                {!t.isSystem && canWrite && (
                  <button
                    className="rm-action delete"
                    onClick={() => deleteType(t)}
                    title="Delete this custom type (only when no records use it)"
                  >Delete</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {createOpen && (
        <CreateTypeDialog
          entity={entity}
          onClose={() => setCreateOpen(false)}
          onCreated={(doc) => {
            setCreateOpen(false);
            toast.success?.('Type created.');
            if (doc?._id) nav(`/admin/events/types/${doc._id}`);
            else load();
          }}
        />
      )}
    </div>
  );
}

function CreateTypeDialog({ entity, onClose, onCreated }) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Auto-uppercase the code as the admin types — matches the regex
  // the server enforces (`/^[A-Z][A-Z0-9_]{1,29}$/`).
  function onCodeChange(e) {
    setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''));
  }

  async function save() {
    setErr(''); setBusy(true);
    try {
      const r = await api.post('/admin/events/types', {
        entity,
        code,
        label,
        description: description || undefined,
      });
      onCreated(r.data?.data);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Create {entity === 'MEETING' ? 'meeting' : 'activity'} type</h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        {err && <div className="alert error">{err}</div>}
        <div className="form-grid">
          <div className="field">
            <label>Code</label>
            <input
              value={code}
              onChange={onCodeChange}
              maxLength={30}
              placeholder="e.g. WORKSHOP"
              autoFocus
            />
            <div className="hint">Uppercase letters, digits, and underscores. 2–30 chars.</div>
          </div>
          <div className="field">
            <label>Display label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="e.g. Workshop" />
          </div>
          <div className="field full">
            <label>Description (optional)</label>
            <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} placeholder="What this type is used for…" />
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
          After creating, you'll go straight to the configurator (photo policy, workflow extras, fields).
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !code || !label} onClick={save}>{busy ? 'Creating…' : 'Create & configure'}</button>
        </div>
      </div>
    </div>
  );
}
