import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import {
  ClipboardIcon, TargetIcon, CameraIcon, RepeatIcon,
  PuzzleIcon, InfoIcon, UsersIcon, TrashIcon, XIcon } from '../../../components/icons';

// Full editor for a single EventTypeConfig — basic info, body
// applicability, photo policy, workflow extras, and field selection.
// Loads the type by id, and the full FieldDefinition library on
// mount so the field-picker doesn't make a second round trip.

const CORE_STATES = {
  MEETING: ['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'PENDING_REPORT', 'FINALIZED', 'CANCELLED'],
  ACTIVITY: ['PLANNED', 'COMPLETED', 'CANCELLED'],
};

export default function EventTypeEditorPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = hasPermission(user, 'MANAGE_EVENT_CONFIG');

  const [doc, setDoc] = useState(null);
  const [library, setLibrary] = useState([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [snapshotOpen, setSnapshotOpen] = useState(false);

  // Editable form state
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(100);
  const [appliesTo, setAppliesTo] = useState({ executive: true, committee: true });
  const [photoPolicy, setPhotoPolicy] = useState({ required: false, minCount: 0, requireGps: true, requireExif: true });
  const [workflow, setWorkflow] = useState({ extraStates: [], finalizeRequiresPhotos: true });
  const [fieldIds, setFieldIds] = useState([]);
  const [baseline, setBaseline] = useState('');

  async function load() {
    setBusy(true); setErr('');
    try {
      const [t, f] = await Promise.all([
        api.get(`/admin/events/types/${id}`),
        api.get('/admin/events/fields', { params: { active: 'true' } }),
      ]);
      const td = t.data?.data;
      setDoc(td);
      setLabel(td.label || '');
      setDescription(td.description || '');
      setIsActive(td.isActive !== false);
      setSortOrder(td.sortOrder ?? 100);
      setAppliesTo({
        executive: td.appliesTo?.executive !== false,
        committee: td.appliesTo?.committee !== false,
      });
      setPhotoPolicy({
        required: !!td.photoPolicy?.required,
        minCount: td.photoPolicy?.minCount ?? 0,
        requireGps: td.photoPolicy?.requireGps !== false,
        requireExif: td.photoPolicy?.requireExif !== false,
      });
      setWorkflow({
        extraStates: (td.workflow?.extraStates || []).map((e) => ({ ...e })),
        finalizeRequiresPhotos: td.workflow?.finalizeRequiresPhotos !== false,
      });
      setFieldIds((td.fields || []).map((f) => (typeof f === 'string' ? f : f._id)));
      setLibrary(f.data?.data || []);
      // Baseline for dirty detection - computed from the same shape
      // save() sends, so "dirty" means "this save would change data".
      const req = !!td.photoPolicy?.required;
      let mc = Math.max(0, parseInt(td.photoPolicy?.minCount, 10) || 0);
      if (!req) mc = 0; else if (mc < 1) mc = 1;
      setBaseline(JSON.stringify({
        label: td.label || '',
        description: td.description || undefined,
        isActive: td.isActive !== false,
        sortOrder: td.sortOrder ?? 100,
        appliesTo: {
          executive: td.appliesTo?.executive !== false,
          committee: td.appliesTo?.committee !== false,
        },
        photoPolicy: {
          required: req,
          minCount: mc,
          requireGps: td.photoPolicy?.requireGps !== false,
          requireExif: td.photoPolicy?.requireExif !== false,
        },
        workflow: {
          extraStates: (td.workflow?.extraStates || []).map((s) => ({
            code: String(s.code).toUpperCase(),
            label: s.label,
            after: String(s.after).toUpperCase(),
          })),
          finalizeRequiresPhotos: td.workflow?.finalizeRequiresPhotos !== false,
        },
        fields: (td.fields || []).map((f) => (typeof f === 'string' ? f : f._id)),
      }));
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, [id]);

  const isSystem = !!doc?.isSystem;
  const entity = doc?.entity || 'MEETING';
  const coreStates = CORE_STATES[entity];

  function addExtraState() {
    setWorkflow((w) => ({ ...w, extraStates: [...w.extraStates, { code: '', label: '', after: coreStates[0] }] }));
  }
  function updateExtraState(idx, patch) {
    setWorkflow((w) => ({
      ...w,
      extraStates: w.extraStates.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }
  function removeExtraState(idx) {
    setWorkflow((w) => ({ ...w, extraStates: w.extraStates.filter((_, i) => i !== idx) }));
  }

  function toggleField(fid) {
    setFieldIds((cur) => {
      if (cur.includes(fid)) return cur.filter((x) => x !== fid);
      return [...cur, fid];
    });
  }

  function buildPayload() {
    const required = !!photoPolicy.required;
    let minCount = Math.max(0, parseInt(photoPolicy.minCount, 10) || 0);
    if (!required) minCount = 0; else if (minCount < 1) minCount = 1;
    return {
      label,
      description: description || undefined,
      isActive,
      sortOrder,
      appliesTo,
      photoPolicy: {
        required,
        minCount,
        requireGps: !!photoPolicy.requireGps,
        requireExif: !!photoPolicy.requireExif,
      },
      workflow: {
        extraStates: workflow.extraStates
          .filter((s) => s.code && s.label && s.after)
          .map((s) => ({
            code: String(s.code).toUpperCase(),
            label: s.label,
            after: String(s.after).toUpperCase(),
          })),
        finalizeRequiresPhotos: !!workflow.finalizeRequiresPhotos,
      },
      fields: fieldIds,
    };
  }

  const dirty = useMemo(
    () => baseline !== '' && JSON.stringify(buildPayload()) !== baseline,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseline, label, description, isActive, sortOrder, appliesTo, photoPolicy, workflow, fieldIds],
  );

  async function save() {
    setErr('');
    // A type must stay usable by at least one body - with both off,
    // every record attempt fails BODY_NOT_ALLOWED and the type dies.
    if (!appliesTo.executive && !appliesTo.committee) {
      setErr('Type must apply to at least one body (Executive or Committee).');
      return;
    }
    // Half-filled workflow rows used to be dropped silently on save -
    // surface them instead so the admin input never just vanishes.
    const incomplete = workflow.extraStates.filter((s) => (s.code || s.label) && !(s.code && s.label && s.after));
    if (incomplete.length > 0) {
      setErr('Complete or remove the partially-filled workflow extra state(s) before saving.');
      return;
    }
    setSaving(true);
    try {
      await api.patch(`/admin/events/types/${id}`, buildPayload());
      toast.success?.('Event type saved.');
      load();
    } catch (e) { setErr(errorMessage(e)); toast.error?.(errorMessage(e)); }
    finally { setSaving(false); }
  }

  function showSnapshot() {
    setSnapshotOpen(true);
  }

  if (busy && !doc) {
    return (
      <div className="rm-loading">
        <span className="scope-spinner" aria-hidden="true" />
        <span className="muted">Loading…</span>
      </div>
    );
  }
  if (!doc) {
    return <div className="alert error">Event type not found.</div>;
  }

  const backTo = entity === 'MEETING' ? '/admin/events/meeting-types' : '/admin/events/activity-types';

  return (
    <div>
      {/* Hero */}
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true">{entity === 'MEETING' ? <ClipboardIcon size={22} /> : <TargetIcon size={22} />}</div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">
              {doc.label} <span className="muted" style={{ fontWeight: 400 }}>· <code>{doc.code}</code></span>
            </h2>
            <div className="rm-hero-sub">
              {entity === 'MEETING' ? 'Meeting' : 'Activity'} type · v{doc.configVersion || 1}
              {isSystem && ' · Built-in'}
            </div>
          </div>
          <div className="rm-hero-actions">
            <Link to={backTo} className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>← Back</Link>
            <button className="rm-hero-btn outline" onClick={showSnapshot}>Preview snapshot</button>
            {canWrite && (
              <button className="rm-hero-btn solid" disabled={saving || !dirty} onClick={save}>
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            )}
          </div>
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}
      {isSystem && (
        <div className="alert" style={{ background: 'rgba(217, 119, 6, 0.08)', border: '1px solid rgba(217, 119, 6, 0.2)' }}>
          <strong>Built-in type.</strong> The code stays canonical and the type can't be deactivated, but you can still edit the label, description, photo policy, workflow extras, and field set.
        </div>
      )}

      {/* Basic info */}
      <div className="rm-card">
        <div className="rm-card-bar">
          <span className="rm-card-bar-icon" aria-hidden="true"><InfoIcon size={15} /></span>
          <span className="rm-card-bar-label">Basic info</span>
        </div>
        <div className="rm-card-body">
          <div className="form-grid">
            <div className="field full">
              <label>Display label</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} disabled={!canWrite} />
            </div>
            <div className="field full">
              <label>Description</label>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} disabled={!canWrite} />
            </div>
            <div className="field">
              <label>Sort order</label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
                disabled={!canWrite}
              />
              <div className="hint">Lower numbers appear first.</div>
            </div>
            <div className="field">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={!canWrite || isSystem}
                />
                Active (admin can record records of this type)
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Body applicability */}
      <div className="rm-card">
        <div className="rm-card-bar">
          <span className="rm-card-bar-icon" aria-hidden="true"><UsersIcon size={15} /></span>
          <span className="rm-card-bar-label">Body applicability</span>
        </div>
        <div className="rm-card-body">
          <div className="form-grid">
            <div className="field">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={appliesTo.executive}
                  onChange={(e) => setAppliesTo((p) => ({ ...p, executive: e.target.checked }))}
                  disabled={!canWrite}
                />
                Executive can run this type
              </label>
            </div>
            <div className="field">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={appliesTo.committee}
                  onChange={(e) => setAppliesTo((p) => ({ ...p, committee: e.target.checked }))}
                  disabled={!canWrite}
                />
                Committee can run this type
              </label>
            </div>
            <p className="muted" style={{ fontSize: 12, gridColumn: '1 / -1', margin: 0 }}>
              At Area+ levels both bodies can record meetings/activities; flip these off to restrict a type to one body.
            </p>
          </div>
        </div>
      </div>

      {/* Photo policy */}
      <div className="rm-card">
        <div className="rm-card-bar">
          <span className="rm-card-bar-icon" aria-hidden="true"><CameraIcon size={15} /></span>
          <span className="rm-card-bar-label">Photo policy</span>
        </div>
        <div className="rm-card-body">
          <div className="form-grid">
            <div className="field">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={photoPolicy.required}
                  onChange={(e) => setPhotoPolicy((p) => ({
                    ...p,
                    required: e.target.checked,
                    // Keep the pair coherent: off means no minimum;
                    // on means at least one. Mirrors the server invariant.
                    minCount: e.target.checked ? Math.max(1, p.minCount || 0) : 0,
                  }))}
                  disabled={!canWrite}
                />
                Photos required
              </label>
            </div>
            <div className="field">
              <label>Minimum photo count</label>
              <input
                type="number"
                min="0"
                max="20"
                value={photoPolicy.minCount}
                onChange={(e) => setPhotoPolicy((p) => ({ ...p, minCount: parseInt(e.target.value, 10) || 0 }))}
                disabled={!canWrite || !photoPolicy.required}
              />
            </div>
            <div className="field">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={photoPolicy.requireGps}
                  onChange={(e) => setPhotoPolicy((p) => ({ ...p, requireGps: e.target.checked }))}
                  disabled={!canWrite}
                />
                Require GPS metadata
              </label>
            </div>
            <div className="field">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={photoPolicy.requireExif}
                  onChange={(e) => setPhotoPolicy((p) => ({ ...p, requireExif: e.target.checked }))}
                  disabled={!canWrite}
                />
                Require EXIF metadata
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow extras */}
      <div className="rm-card">
        <div className="rm-card-bar">
          <span className="rm-card-bar-icon" aria-hidden="true"><RepeatIcon size={15} /></span>
          <span className="rm-card-bar-label">Workflow extras</span>
          <span className="rm-card-bar-count">{workflow.extraStates.length} state{workflow.extraStates.length === 1 ? '' : 's'}</span>
        </div>
        <div className="rm-card-body">
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            Extra optional states slot in <em>after</em> a chosen core state. Core states (
            <code>{coreStates.join(' → ')}</code>
            ) and the finalize/cancel sealing cannot be removed.
          </p>
          {entity === 'MEETING' && (
            <div className="field">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={workflow.finalizeRequiresPhotos}
                  onChange={(e) => setWorkflow((w) => ({ ...w, finalizeRequiresPhotos: e.target.checked }))}
                  disabled={!canWrite}
                />
                Finalize requires at least one photo
              </label>
            </div>
          )}

          {workflow.extraStates.length > 0 && (
            <div className="em-extra-table">
              <div className="em-extra-head">
                <span>Code</span><span>Label</span><span>After core state</span><span></span>
              </div>
              {workflow.extraStates.map((s, i) => (
                <div key={i} className="em-extra-row">
                  <input
                    value={s.code}
                    onChange={(e) => updateExtraState(i, { code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                    placeholder="AWAITING_APPROVAL"
                    maxLength={30}
                    disabled={!canWrite}
                  />
                  <input
                    value={s.label}
                    onChange={(e) => updateExtraState(i, { label: e.target.value })}
                    placeholder="Awaiting approval"
                    maxLength={80}
                    disabled={!canWrite}
                  />
                  <select
                    value={s.after}
                    onChange={(e) => updateExtraState(i, { after: e.target.value })}
                    disabled={!canWrite}
                  >
                    {coreStates.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button
                    type="button"
                    className="rm-action delete"
                    onClick={() => removeExtraState(i)}
                    disabled={!canWrite}
                    title="Remove this extra state"
                  ><TrashIcon size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {canWrite && (
            <button type="button" className="btn secondary" onClick={addExtraState} style={{ marginTop: 8 }}>
              ＋ Add extra state
            </button>
          )}
        </div>
      </div>

      {/* Fields */}
      <FieldsCard
        library={library}
        selected={fieldIds}
        onToggle={toggleField}
        canWrite={canWrite}
      />

      {/* Footer */}
      {canWrite && (
        <div className="rm-footer">
          {dirty && <span className="rm-dirty-chip" role="status">Unsaved changes — save to apply</span>}
          <Link to={backTo} className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>× Cancel</Link>
          <button type="button" className="rm-hero-btn solid" disabled={saving || !dirty} onClick={save}>
            {saving ? 'Saving…' : '✓ Save changes'}
          </button>
        </div>
      )}

      {snapshotOpen && (
        <SnapshotPreviewDialog
          typeId={id}
          onClose={() => setSnapshotOpen(false)}
        />
      )}
    </div>
  );
}

function FieldsCard({ library, selected, onToggle, canWrite }) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const ordered = useMemo(() => {
    return [...library].sort((a, b) => {
      // Selected first (in selection order from `selected`), then library by sortOrder
      const aSel = selectedSet.has(a._id);
      const bSel = selectedSet.has(b._id);
      if (aSel !== bSel) return aSel ? -1 : 1;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
  }, [library, selectedSet]);

  return (
    <div className="rm-card">
      <div className="rm-card-bar">
        <span className="rm-card-bar-icon" aria-hidden="true"><PuzzleIcon size={15} /></span>
        <span className="rm-card-bar-label">Custom fields</span>
        <span className="rm-card-bar-count">{selected.length} / {library.length}</span>
      </div>
      <div className="rm-card-body">
        {library.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            No fields in the library yet. Visit the <Link to="/admin/events/fields">Field Library</Link> to add reusable fields.
          </p>
        ) : (
          <>
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
              Tick fields that should appear when recording this {`type`.toLowerCase()}. Field order follows the field-library sort order.
            </p>
            <div className="rm-perm-grid">
              {ordered.map((f) => {
                const on = selectedSet.has(f._id);
                return (
                  <label
                    key={f._id}
                    className={`rm-perm-tile ${on ? 'on' : ''} ${!canWrite ? 'readonly' : ''}`}
                    title={`${f.key} (${f.type})${f.helpText ? '\n' + f.helpText : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!canWrite}
                      onChange={() => onToggle(f._id)}
                    />
                    <span className="rm-perm-tile-text">
                      <span className="rm-perm-tile-name">{f.label}</span>
                      <span className="rm-perm-tile-code">{f.key} · {f.type}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SnapshotPreviewDialog({ typeId, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    let cancel = false;
    api.get(`/admin/events/types/${typeId}/snapshot`)
      .then((r) => { if (!cancel) setData(r.data?.data); })
      .catch((e) => { if (!cancel) setErr(errorMessage(e)); });
    return () => { cancel = true; };
  }, [typeId]);

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Snapshot preview</h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
          Exactly what will be frozen into <code>EventConfigSnapshot</code> on the next record using this type.
        </p>
        {err && <div className="alert error">{err}</div>}
        {!data && !err && <div className="muted">Loading…</div>}
        {data && (
          <pre style={{
            background: 'var(--bg-soft, var(--bg))',
            padding: 12,
            borderRadius: 8,
            maxHeight: '60vh',
            overflow: 'auto',
            fontSize: 12,
            border: '1px solid var(--border)',
          }}>{JSON.stringify(data, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}
