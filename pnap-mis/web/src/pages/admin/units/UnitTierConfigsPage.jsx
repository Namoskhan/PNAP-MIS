import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import { BuildingIcon, GearIcon, TagIcon, TrashIcon, XIcon } from '../../../components/icons';

// Unit Type Manager — edit the 5 built-in tier configs (labels,
// capabilities, body policy, custom fields). Tiers themselves are
// immutable (the hierarchy is load-bearing); admin can only tune
// what's editable per row.

const CAPABILITY_KEYS = [
  { key: 'meetings',         label: 'Meetings' },
  { key: 'activities',       label: 'Activities' },
  { key: 'finance',          label: 'Finance' },
  { key: 'cabinet',          label: 'Cabinet' },
  { key: 'committee',        label: 'Committee body' },
  { key: 'transfers',        label: 'Fund transfers' },
  { key: 'performance',      label: 'Performance' },
  { key: 'responsibilities', label: 'Responsibilities' },
];

export default function UnitTierConfigsPage() {
  const { user } = useAuth();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = hasPermission(user, 'MANAGE_UNIT_CONFIG');

  const [tiers, setTiers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);

  async function load() {
    setBusy(true); setErr('');
    try {
      const r = await api.get('/admin/units/tier-configs');
      setTiers(r.data?.data || []);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><BuildingIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Unit Type Manager</h2>
            <div className="rm-hero-sub">
              Configure label, plural label, capabilities, and body policy for each of the 5 hierarchy tiers.
              The tier codes themselves are locked — only the editable surface is tunable.
            </div>
          </div>
          <div className="rm-hero-actions">
            <button className="rm-hero-btn outline" onClick={load}>⟳ Refresh</button>
          </div>
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}

      <div className="rm-card">
        <div className="rm-card-head">
          <span className="rm-card-head-icon" aria-hidden="true"><TagIcon size={15} /></span>
          <span className="rm-card-head-label">Tier</span>
          <span className="rm-card-head-actions">
            <span className="rm-card-head-icon" aria-hidden="true"><GearIcon size={15} /></span>
            <span>Actions</span>
          </span>
        </div>

        {busy && (
          <div className="rm-loading">
            <span className="scope-spinner" aria-hidden="true" />
            <span className="muted">Loading…</span>
          </div>
        )}

        {!busy && tiers.map((t) => {
          const enabledCount = CAPABILITY_KEYS.filter((c) => t.capabilities?.[c.key]).length;
          const bodyCount = (t.bodyPolicy?.executive ? 1 : 0) + (t.bodyPolicy?.committee ? 1 : 0);
          return (
            <div key={t._id} className="rm-row locked">
              <div className="rm-row-avatar">
                <span aria-hidden="true">{t.label.charAt(0).toUpperCase()}</span>
                <span className="rm-row-avatar-badge" title="Built-in">🔒</span>
              </div>
              <div className="rm-row-meta">
                <div className="rm-row-name">
                  {t.label}
                  <span className="rm-row-tag custom">v{t.configVersion || 1}</span>
                </div>
                <div className="rm-row-sub">
                  <code>{t.tierCode}</code>
                  <span className="muted">·</span>
                  <span>{t.pluralLabel}</span>
                  <span className="muted">·</span>
                  <span>{enabledCount}/{CAPABILITY_KEYS.length} capabilities</span>
                  <span className="muted">·</span>
                  <span>{bodyCount === 2 ? 'Both bodies' : bodyCount === 1 ? '1 body' : 'no bodies'}</span>
                  <span className="muted">·</span>
                  <span>{(t.customFields || []).length} custom fields</span>
                </div>
              </div>
              <div className="rm-row-actions">
                <button
                  className="rm-action edit"
                  onClick={() => setEditing(t)}
                  disabled={!canWrite}
                  title={canWrite ? 'Edit this tier' : 'Read-only — needs MANAGE_UNIT_CONFIG'}
                >Edit</button>
              </div>
            </div>
          );
        })}
      </div>

      {editing && (
        <EditTierDialog
          tier={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast.success?.('Tier updated.'); }}
        />
      )}
    </div>
  );
}

function EditTierDialog({ tier, onClose, onSaved }) {
  const [label, setLabel] = useState(tier.label || '');
  const [pluralLabel, setPluralLabel] = useState(tier.pluralLabel || '');
  const [description, setDescription] = useState(tier.description || '');
  const [capabilities, setCapabilities] = useState({
    meetings: tier.capabilities?.meetings !== false,
    activities: tier.capabilities?.activities !== false,
    finance: tier.capabilities?.finance !== false,
    cabinet: tier.capabilities?.cabinet !== false,
    committee: tier.capabilities?.committee !== false,
    transfers: tier.capabilities?.transfers !== false,
    performance: tier.capabilities?.performance !== false,
    responsibilities: tier.capabilities?.responsibilities !== false,
  });
  const [bodyPolicy, setBodyPolicy] = useState({
    executive: tier.bodyPolicy?.executive !== false,
    committee: tier.bodyPolicy?.committee !== false,
  });
  // customFields is populated as full FieldDefinition docs; we keep
  // the local state as an ordered array of ids and a lookup table.
  const [fieldLibrary, setFieldLibrary] = useState([]);
  const [pickedFieldIds, setPickedFieldIds] = useState(
    () => (tier.customFields || []).map((f) => f._id || f),
  );
  const [fieldsBusy, setFieldsBusy] = useState(false);
  const [fieldsErr, setFieldsErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFieldsBusy(true); setFieldsErr('');
      try {
        const r = await api.get('/admin/events/fields');
        if (!cancelled) setFieldLibrary(r.data?.data || []);
      } catch (e) { if (!cancelled) setFieldsErr(errorMessage(e)); }
      finally { if (!cancelled) setFieldsBusy(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  const fieldsByIdInLibrary = useMemo(() => {
    const m = new Map();
    for (const f of fieldLibrary) m.set(String(f._id), f);
    return m;
  }, [fieldLibrary]);
  // Merge the tier's populated custom fields into the lookup so that
  // freshly-attached fields render immediately, even before the
  // library finishes loading.
  const fieldLookup = useMemo(() => {
    const m = new Map(fieldsByIdInLibrary);
    for (const f of (tier.customFields || [])) {
      const id = String(f._id || f);
      if (!m.has(id) && f.key) m.set(id, f);
    }
    return m;
  }, [fieldsByIdInLibrary, tier.customFields]);

  function toggleField(id) {
    setPickedFieldIds((arr) => arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  }
  function moveField(idx, dir) {
    setPickedFieldIds((arr) => {
      const next = arr.slice();
      const j = idx + dir;
      if (j < 0 || j >= next.length) return arr;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }

  async function save() {
    setErr(''); setBusy(true);
    try {
      const payload = {
        label, pluralLabel, description: description || undefined,
        capabilities, bodyPolicy,
        customFields: pickedFieldIds,
      };
      await api.patch(`/admin/units/tier-configs/${tier.tierCode}`, payload);
      onSaved();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  const unpickedFields = fieldLibrary.filter((f) => f.isActive !== false && !pickedFieldIds.includes(String(f._id)));

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Edit tier · <code className="exec-login">{tier.tierCode}</code></h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
        </div>
        {err && <div className="alert error">{err}</div>}

        <div className="form-grid">
          <div className="field">
            <label>Display label</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} />
          </div>
          <div className="field">
            <label>Plural label</label>
            <input value={pluralLabel} onChange={(e) => setPluralLabel(e.target.value)} maxLength={80} />
          </div>
          <div className="field full">
            <label>Description (optional)</label>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          </div>
        </div>

        <div className="rm-card" style={{ marginTop: 14 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-label">Capabilities</span>
            <span className="rm-card-bar-count">
              {CAPABILITY_KEYS.filter((c) => capabilities[c.key]).length} / {CAPABILITY_KEYS.length}
            </span>
          </div>
          <div className="rm-card-body">
            <div className="rm-perm-grid">
              {CAPABILITY_KEYS.map((c) => {
                const on = capabilities[c.key];
                return (
                  <label key={c.key} className={`rm-perm-tile ${on ? 'on' : ''}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setCapabilities((p) => ({ ...p, [c.key]: e.target.checked }))}
                    />
                    <span className="rm-perm-tile-label">{c.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="rm-card" style={{ marginTop: 12 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-label">Body policy</span>
          </div>
          <div className="rm-card-body">
            <div className="form-grid">
              <div className="field">
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={bodyPolicy.executive}
                    onChange={(e) => setBodyPolicy((p) => ({ ...p, executive: e.target.checked }))}
                  />
                  Executive body allowed
                </label>
              </div>
              <div className="field">
                <label className="toggle-row">
                  <input
                    type="checkbox"
                    checked={bodyPolicy.committee}
                    onChange={(e) => setBodyPolicy((p) => ({ ...p, committee: e.target.checked }))}
                  />
                  Committee body allowed
                </label>
              </div>
              <p className="muted" style={{ fontSize: 12, gridColumn: '1 / -1', margin: 0 }}>
                Below Area level there's typically only the Executive body — switching off Committee here
                hides committee meetings/activities at this tier.
              </p>
            </div>
          </div>
        </div>

        <div className="rm-card" style={{ marginTop: 12 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-label">Custom fields</span>
            <span className="rm-card-bar-count">{pickedFieldIds.length}</span>
          </div>
          <div className="rm-card-body">
            {fieldsErr && <div className="alert error">{fieldsErr}</div>}
            {fieldsBusy && (
              <div className="rm-loading" style={{ padding: 8 }}>
                <span className="scope-spinner" aria-hidden="true" />
                <span className="muted">Loading field library…</span>
              </div>
            )}

            <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
              Fields are pinned into the snapshot at unit-instance save time, so changes here apply forward only.
            </p>

            {pickedFieldIds.length === 0 && (
              <p className="muted" style={{ fontSize: 13, margin: '4px 0 8px' }}>No custom fields attached.</p>
            )}

            {pickedFieldIds.map((id, idx) => {
              const f = fieldLookup.get(String(id));
              if (!f) {
                return (
                  <div key={id} style={{
                    border: '1px solid var(--border)',
                    borderRadius: 6,
                    padding: '6px 10px',
                    marginBottom: 6,
                    fontSize: 13,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <span className="muted">Field {String(id).slice(-6)} (unavailable)</span>
                    <div style={{ flex: 1 }} />
                    <button type="button" className="rm-action delete" onClick={() => toggleField(String(id))}><TrashIcon size={14} /></button>
                  </div>
                );
              }
              return (
                <div key={id} style={{
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '6px 10px',
                  marginBottom: 6,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}>
                  <span style={{ fontWeight: 600 }}>{idx + 1}.</span>
                  <span>{f.label}</span>
                  <code style={{ fontSize: 11 }}>{f.key}</code>
                  <span className="muted" style={{ fontSize: 11 }}>· {f.type}{f.required ? ' · required' : ''}</span>
                  <div style={{ flex: 1 }} />
                  <button type="button" className="rm-action edit" onClick={() => moveField(idx, -1)} disabled={idx === 0}>↑</button>
                  <button type="button" className="rm-action edit" onClick={() => moveField(idx, +1)} disabled={idx === pickedFieldIds.length - 1}>↓</button>
                  <button type="button" className="rm-action delete" onClick={() => toggleField(String(id))}><TrashIcon size={14} /></button>
                </div>
              );
            })}

            {unpickedFields.length > 0 && (
              <details style={{ marginTop: 10 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 500 }}>
                  ＋ Add from library ({unpickedFields.length} available)
                </summary>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {unpickedFields.map((f) => (
                    <button
                      key={f._id}
                      type="button"
                      className="btn secondary"
                      onClick={() => toggleField(String(f._id))}
                      style={{ fontSize: 12 }}
                      title={f.helpText || f.label}
                    >
                      ＋ {f.label} <code style={{ fontSize: 10, opacity: 0.7 }}>{f.key}</code>
                    </button>
                  ))}
                </div>
              </details>
            )}

            {!fieldsBusy && fieldLibrary.length === 0 && (
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Field library is empty. Define fields under Event Config → Fields first.
              </p>
            )}
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
