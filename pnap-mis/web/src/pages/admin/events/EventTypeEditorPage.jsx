import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import {
  ClipboardIcon, TargetIcon, CameraIcon, RepeatIcon,
  PuzzleIcon, InfoIcon, UsersIcon, TrashIcon, XIcon,
} from '../../../components/icons';

// Full editor for a single EventTypeConfig — basic info, body
// applicability, photo policy, workflow extras, and field selection.

const CORE_STATES = {
  MEETING: ['DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'PENDING_REPORT', 'FINALIZED', 'CANCELLED'],
  ACTIVITY: ['PLANNED', 'COMPLETED', 'CANCELLED'],
};

export default function EventTypeEditorPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();
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
      const [tRes, fRes] = await Promise.all([
        api.get(`/admin/events/types/${id}`),
        api.get('/admin/events/fields', { params: { active: 'true' } }),
      ]);
      const td = tRes.data?.data;
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
      setLibrary(fRes.data?.data || []);
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

  function toggleField(fId) {
    setFieldIds((prev) => (prev.includes(fId) ? prev.filter((x) => x !== fId) : [...prev, fId]));
  }

  const currentPayload = useMemo(() => {
    let mc = Math.max(0, parseInt(photoPolicy.minCount, 10) || 0);
    if (!photoPolicy.required) mc = 0; else if (mc < 1) mc = 1;
    return {
      label,
      description: description || undefined,
      isActive,
      sortOrder: parseInt(sortOrder, 10) || 0,
      appliesTo,
      photoPolicy: {
        required: photoPolicy.required,
        minCount: mc,
        requireGps: photoPolicy.requireGps,
        requireExif: photoPolicy.requireExif,
      },
      workflow: {
        extraStates: workflow.extraStates
          .filter((s) => s.code && s.label)
          .map((s) => ({
            code: s.code.toUpperCase().trim(),
            label: s.label.trim(),
            after: s.after || coreStates[0],
          })),
        finalizeRequiresPhotos: workflow.finalizeRequiresPhotos,
      },
      fields: fieldIds,
    };
  }, [label, description, isActive, sortOrder, appliesTo, photoPolicy, workflow, fieldIds, coreStates]);

  const dirty = useMemo(() => {
    if (!baseline) return false;
    return JSON.stringify(currentPayload) !== baseline;
  }, [currentPayload, baseline]);

  async function save() {
    if (!canWrite) return;
    setSaving(true); setErr('');
    try {
      await api.patch(`/admin/events/types/${id}`, currentPayload);
      toast.success?.(t('admin.changesSaved', 'Changes saved successfully.'));
      await load();
    } catch (e) {
      setErr(errorMessage(e));
      toast.error?.(errorMessage(e));
    } finally { setSaving(false); }
  }

  function showSnapshot() {
    setSnapshotOpen(true);
  }

  if (busy) {
    return (
      <div className="rm-loading">
        <span className="scope-spinner" aria-hidden="true" />
        <span className="muted">{t('common.loading', 'Loading…')}</span>
      </div>
    );
  }
  if (!doc) {
    return <div className="alert error">{t('admin.noTypesDefined', 'Event type not found.')}</div>;
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
              {entity === 'MEETING' ? t('nav.meetings', 'Meeting') : t('nav.activities', 'Activity')} {t('admin.type', 'type')} · v{doc.configVersion || 1}
              {isSystem && ` · ${t('admin.builtInLocked', 'Built-in')}`}
            </div>
          </div>
          <div className="rm-hero-actions">
            <Link to={backTo} className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>← {t('common.back', 'Back')}</Link>
            <button className="rm-hero-btn outline" onClick={showSnapshot}>{t('admin.viewSnapshot', 'Preview snapshot')}</button>
            {canWrite && (
              <button className="rm-hero-btn solid" disabled={saving || !dirty} onClick={save}>
                {saving ? t('admin.saving', 'Saving…') : t('admin.saveChanges', 'Save changes')}
              </button>
            )}
          </div>
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}
      {isSystem && (
        <div className="alert" style={{ background: 'rgba(217, 119, 6, 0.08)', border: '1px solid rgba(217, 119, 6, 0.2)' }}>
          <strong>{t('admin.builtInLocked', 'Built-in type.')}</strong> {t('admin.systemTypeNotice', 'This is a built-in system type. Core identifiers are locked.')}
        </div>
      )}

      {/* Basic info */}
      <div className="rm-card">
        <div className="rm-card-bar">
          <span className="rm-card-bar-icon" aria-hidden="true"><InfoIcon size={15} /></span>
          <span className="rm-card-bar-label">{t('admin.basicInformation', 'Basic info')}</span>
        </div>
        <div className="rm-card-body">
          <div className="form-grid">
            <div className="field full">
              <label>{t('admin.displayLabel', 'Display label')}</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} disabled={!canWrite} />
            </div>
            <div className="field full">
              <label>{t('admin.descriptionOptional', 'Description')}</label>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} disabled={!canWrite} />
            </div>
            <div className="field">
              <label>{t('admin.sortOrder', 'Sort order')}</label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
                disabled={!canWrite}
              />
              <div className="hint">{t('admin.sortOrderHint', 'Lower numbers appear first.')}</div>
            </div>
            <div className="field">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  disabled={!canWrite || isSystem}
                />
                {t('common.active', 'Active')}
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Body applicability */}
      <div className="rm-card">
        <div className="rm-card-bar">
          <span className="rm-card-bar-icon" aria-hidden="true"><UsersIcon size={15} /></span>
          <span className="rm-card-bar-label">{t('admin.appliesToBodies', 'Body applicability')}</span>
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
                {t('admin.executiveCabinet', 'Executive can run this type')}
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
                {t('admin.committee', 'Committee can run this type')}
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Photo policy */}
      <div className="rm-card">
        <div className="rm-card-bar">
          <span className="rm-card-bar-icon" aria-hidden="true"><CameraIcon size={15} /></span>
          <span className="rm-card-bar-label">{t('admin.photoPolicy', 'Photo policy')}</span>
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
                    minCount: e.target.checked ? Math.max(1, p.minCount || 0) : 0,
                  }))}
                  disabled={!canWrite}
                />
                {t('admin.requirePhotos', 'Photos required')}
              </label>
            </div>
            <div className="field">
              <label>{t('admin.minPhotos', 'Minimum photo count')}</label>
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
                {t('admin.requireGps', 'Require GPS metadata')}
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
                {t('admin.requireExif', 'Require EXIF metadata')}
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow extras */}
      <div className="rm-card">
        <div className="rm-card-bar">
          <span className="rm-card-bar-icon" aria-hidden="true"><RepeatIcon size={15} /></span>
          <span className="rm-card-bar-label">{t('admin.workflowStages', 'Workflow extras')}</span>
          <span className="rm-card-bar-count">{workflow.extraStates.length}</span>
        </div>
        <div className="rm-card-body">
          {entity === 'MEETING' && (
            <div className="field">
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={workflow.finalizeRequiresPhotos}
                  onChange={(e) => setWorkflow((w) => ({ ...w, finalizeRequiresPhotos: e.target.checked }))}
                  disabled={!canWrite}
                />
                {t('admin.finalizeRequiresPhotos', 'Finalize requires at least one photo')}
              </label>
            </div>
          )}

          {workflow.extraStates.length > 0 && (
            <div className="em-extra-table">
              <div className="em-extra-head">
                <span>{t('admin.code', 'Code')}</span>
                <span>{t('admin.displayLabel', 'Label')}</span>
                <span>{t('admin.afterCoreState', 'After core state')}</span>
                <span></span>
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
                    title={t('common.delete', 'Delete')}
                  ><TrashIcon size={14} /></button>
                </div>
              ))}
            </div>
          )}

          {canWrite && (
            <button type="button" className="btn secondary" onClick={addExtraState} style={{ marginTop: 8 }}>
              {t('admin.addState', '＋ Add extra state')}
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
        t={t}
      />

      {/* Footer */}
      {canWrite && (
        <div className="rm-footer">
          {dirty && <span className="rm-dirty-chip" role="status">{t('admin.discardChanges', 'Unsaved changes')}</span>}
          <Link to={backTo} className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>× {t('common.cancel', 'Cancel')}</Link>
          <button type="button" className="rm-hero-btn solid" disabled={saving || !dirty} onClick={save}>
            {saving ? t('admin.saving', 'Saving…') : `✓ ${t('admin.saveChanges', 'Save changes')}`}
          </button>
        </div>
      )}

      {snapshotOpen && (
        <SnapshotPreviewDialog
          typeId={id}
          onClose={() => setSnapshotOpen(false)}
          t={t}
        />
      )}
    </div>
  );
}

function FieldsCard({ library, selected, onToggle, canWrite, t }) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const ordered = useMemo(() => {
    return [...library].sort((a, b) => {
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
        <span className="rm-card-bar-label">{t('admin.customFields', 'Custom fields')}</span>
        <span className="rm-card-bar-count">{selected.length} / {library.length}</span>
      </div>
      <div className="rm-card-body">
        {library.length === 0 ? (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            {t('admin.noFieldsAttached', 'No fields in the library yet.')}
          </p>
        ) : (
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
        )}
      </div>
    </div>
  );
}

function SnapshotPreviewDialog({ typeId, onClose, t }) {
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
          <h3 style={{ margin: 0 }}>{t('admin.schemaSnapshot', 'Snapshot preview')}</h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label={t('common.close', 'Close')} style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
        </div>
        {err && <div className="alert error">{err}</div>}
        {!data && !err && <div className="muted">{t('common.loading', 'Loading…')}</div>}
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
