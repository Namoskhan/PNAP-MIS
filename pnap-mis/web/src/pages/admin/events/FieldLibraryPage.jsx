import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import { PuzzleIcon, GearIcon, TrashIcon, XIcon } from '../../../components/icons';
import dialog from '../../../components/dialog';

// Field Library — CRUD for FieldDefinition. Each field has a machine
// `key` that's locked after creation; everything else (label,
// validation, visibility, reporting flags) is editable.

const FIELD_TYPES = [
  'TEXT', 'TEXTAREA',
  'NUMBER', 'INT', 'CURRENCY',
  'DATE', 'BOOL',
  'SELECT', 'MULTISELECT',
  'MEMBER_REF',
];

const TYPE_HINT = {
  TEXT: 'Single-line text',
  TEXTAREA: 'Multi-line text',
  NUMBER: 'Decimal number',
  INT: 'Whole number',
  CURRENCY: 'Money (rendered with units)',
  DATE: 'Date / date-time',
  BOOL: 'Yes / no toggle',
  SELECT: 'One-of dropdown',
  MULTISELECT: 'Pick multiple values',
  MEMBER_REF: 'Reference to a member',
};

export default function FieldLibraryPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = hasPermission(user, 'MANAGE_EVENT_CONFIG');

  const [fields, setFields] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setBusy(true); setErr('');
    try {
      const r = await api.get('/admin/events/fields');
      setFields(r.data?.data || []);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function deleteField(f) {
    if (!canWrite || f.isSystem) return;
    const confirmMsg = t('admin.deleteFieldConfirm', {
      label: f.label,
      key: f.key,
      defaultValue: `Delete field "${f.label}" (${f.key})? Only safe if no event type currently uses it.`,
    });
    if (!await dialog.confirm(confirmMsg)) return;
    try {
      await api.delete(`/admin/events/fields/${f._id}`);
      toast.success?.(t('admin.fieldDeleted', 'Field deleted.'));
      load();
    } catch (e) { toast.error?.(errorMessage(e)); }
  }

  const sorted = useMemo(() => {
    return [...fields].sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      if ((a.sortOrder || 0) !== (b.sortOrder || 0)) return (a.sortOrder || 0) - (b.sortOrder || 0);
      return (a.label || '').localeCompare(b.label || '');
    });
  }, [fields]);

  return (
    <div>
      {/* Hero */}
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><PuzzleIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">{t('admin.fieldLibrary', 'Field Library')}</h2>
            <div className="rm-hero-sub">{t('admin.fieldLibrarySubtitle', 'Reusable fields you can attach to meeting / activity types.')}</div>
          </div>
          {canWrite && (
            <div className="rm-hero-actions">
              <button className="rm-hero-btn outline" onClick={load}>⟳ {t('common.refresh', 'Refresh')}</button>
              <button className="rm-hero-btn solid" onClick={() => setCreateOpen(true)}>
                <span aria-hidden="true">＋</span> {t('admin.newField', 'New Field')}
              </button>
            </div>
          )}
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}

      <div className="rm-card">
        <div className="rm-card-head">
          <span className="rm-card-head-icon" aria-hidden="true"><PuzzleIcon size={15} /></span>
          <span className="rm-card-head-label">{t('admin.fieldName', 'Field')}</span>
          <span className="rm-card-head-actions">
            <span className="rm-card-head-icon" aria-hidden="true"><GearIcon size={15} /></span>
            <span>{t('admin.actions', 'Actions')}</span>
          </span>
        </div>

        {busy && (
          <div className="rm-loading">
            <span className="scope-spinner" aria-hidden="true" />
            <span className="muted">{t('admin.loadingFields', 'Loading fields…')}</span>
          </div>
        )}

        {!busy && sorted.length === 0 && (
          <div className="rm-empty">
            {t('admin.noFieldsDefined', 'No fields defined yet.')}
          </div>
        )}

        {!busy && sorted.map((f) => (
          <div key={f._id} className={`rm-row ${f.isSystem ? 'locked' : ''}`}>
            <div className="rm-row-avatar">
              <span aria-hidden="true">{(f.label || '?').charAt(0).toUpperCase()}</span>
              {f.isSystem && <span className="rm-row-avatar-badge" title={t('admin.builtInLocked', 'Built-in (System locked)')}>🔒</span>}
            </div>
            <div className="rm-row-meta">
              <div className="rm-row-name">
                {f.label}
                <span className="rm-row-tag custom">{f.type}</span>
                {f.required && <span className="rm-row-tag custom">{t('common.required', 'required')}</span>}
                {!f.isActive && <span className="rm-row-tag inactive">{t('admin.inactive', 'Inactive')}</span>}
              </div>
              <div className="rm-row-sub">
                <code>{f.key}</code>
                <span className="muted">·</span>
                <span>{t(`admin.fieldType_${f.type}`, TYPE_HINT[f.type] || f.type)}</span>
                {f.reporting?.includeInExport && (
                  <>
                    <span className="muted">·</span>
                    <span>📄 {t('common.export', 'export')}</span>
                  </>
                )}
                {f.helpText && <span className="rm-row-desc"> · {f.helpText}</span>}
              </div>
            </div>
            <div className="rm-row-actions">
              <button
                className="rm-action edit"
                onClick={() => setEditing(f)}
                disabled={!canWrite}
                title={canWrite ? t('common.edit', 'Edit') : 'Read-only'}
              >✎ {t('common.edit', 'Edit')}</button>
              {!f.isSystem && canWrite && (
                <button
                  className="rm-action delete"
                  onClick={() => deleteField(f)}
                  title={t('common.delete', 'Delete')}
                ><TrashIcon size={13} /> {t('common.delete', 'Delete')}</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {createOpen && (
        <FieldDialog
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load(); toast.success?.(t('admin.fieldCreated', 'Field created.')); }}
        />
      )}
      {editing && (
        <FieldDialog
          mode="edit"
          field={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast.success?.(t('admin.fieldUpdated', 'Field updated.')); }}
        />
      )}
    </div>
  );
}

function FieldDialog({ mode, field, onClose, onSaved }) {
  const { t } = useTranslation();
  const isEdit = mode === 'edit';
  const [key, setKey] = useState(field?.key || '');
  const [label, setLabel] = useState(field?.label || '');
  const [helpText, setHelpText] = useState(field?.helpText || '');
  const [type, setType] = useState(field?.type || 'TEXT');
  const [required, setRequired] = useState(!!field?.required);
  const [isActive, setIsActive] = useState(field?.isActive !== false);
  const [sortOrder, setSortOrder] = useState(field?.sortOrder ?? 100);

  const [validation, setValidation] = useState({
    min: field?.validation?.min ?? '',
    max: field?.validation?.max ?? '',
    minLength: field?.validation?.minLength ?? '',
    maxLength: field?.validation?.maxLength ?? '',
    regex: field?.validation?.regex || '',
    options: field?.validation?.options || [],
  });
  const [visibility, setVisibility] = useState({
    showOnCreate: field?.visibility?.showOnCreate !== false,
    showOnDetail: field?.visibility?.showOnDetail !== false,
    showOnList: !!field?.visibility?.showOnList,
  });
  const [reporting, setReporting] = useState({
    includeInExport: !!field?.reporting?.includeInExport,
    exportLabel: field?.reporting?.exportLabel || '',
    exportOrder: field?.reporting?.exportOrder ?? 100,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Auto-prefill the key from the label on first character. Once the
  // admin touches the key field manually we leave it alone.
  const [keyTouched, setKeyTouched] = useState(isEdit);
  function onLabelChange(v) {
    setLabel(v);
    if (!keyTouched && !isEdit) {
      const slug = v
        .trim()
        .replace(/[^a-zA-Z0-9 ]+/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .map((w, i) => i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase())
        .join('');
      setKey(slug.slice(0, 50));
    }
  }

  function addOption() {
    setValidation((v) => ({ ...v, options: [...v.options, { value: '', label: '' }] }));
  }
  function updateOption(i, patch) {
    setValidation((v) => ({ ...v, options: v.options.map((o, idx) => idx === i ? { ...o, ...patch } : o) }));
  }
  function removeOption(i) {
    setValidation((v) => ({ ...v, options: v.options.filter((_, idx) => idx !== i) }));
  }

  const needsOptions = type === 'SELECT' || type === 'MULTISELECT';
  const isString = type === 'TEXT' || type === 'TEXTAREA';
  const isNumber = type === 'NUMBER' || type === 'INT' || type === 'CURRENCY';

  async function save() {
    setErr(''); setBusy(true);
    try {
      const v = {};
      if (isString) {
        if (validation.minLength !== '') v.minLength = parseInt(validation.minLength, 10);
        if (validation.maxLength !== '') v.maxLength = parseInt(validation.maxLength, 10);
        if (validation.regex) v.regex = validation.regex;
      }
      if (isNumber) {
        if (validation.min !== '') v.min = Number(validation.min);
        if (validation.max !== '') v.max = Number(validation.max);
      }
      if (needsOptions) {
        v.options = validation.options
          .filter((o) => o.value && o.label)
          .map((o) => ({ value: String(o.value), label: String(o.label) }));
      }
      const payload = {
        label, helpText: helpText || undefined, type, required,
        validation: v,
        visibility,
        reporting: {
          includeInExport: !!reporting.includeInExport,
          exportLabel: reporting.exportLabel || undefined,
          exportOrder: parseInt(reporting.exportOrder, 10) || 100,
        },
        isActive, sortOrder: parseInt(sortOrder, 10) || 100,
      };
      if (!isEdit) payload.key = key;
      if (isEdit) {
        await api.patch(`/admin/events/fields/${field._id}`, payload);
      } else {
        await api.post('/admin/events/fields', payload);
      }
      onSaved();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 720 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{isEdit ? t('admin.editField', 'Edit field') : t('admin.createField', 'New field')}</h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label={t('common.close', 'Close')} style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
        </div>
        {isEdit && (
          <p className="muted" style={{ fontSize: 12, margin: '0 0 8px' }}>
            <code>{field.key}</code> — {t('admin.machineKeyHint', 'the key is locked after creation.')}
          </p>
        )}
        {err && <div className="alert error">{err}</div>}
        <div className="form-grid">
          <div className="field">
            <label>{t('admin.displayLabel', 'Display label')}</label>
            <input value={label} onChange={(e) => onLabelChange(e.target.value)} maxLength={120} autoFocus />
          </div>
          <div className="field">
            <label>{t('admin.machineKey', 'Key (machine name)')}</label>
            <input
              value={key}
              onChange={(e) => { setKeyTouched(true); setKey(e.target.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 50)); }}
              maxLength={50}
              disabled={isEdit}
              placeholder="attendeeCount"
            />
            <div className="hint">{isEdit ? t('admin.machineKeyHint', 'Locked after creation.') : 'lowercase camelCase, ≤50 chars'}</div>
          </div>
          <div className="field full">
            <label>{t('admin.helpText', 'Help text')}</label>
            <input value={helpText} onChange={(e) => setHelpText(e.target.value)} maxLength={500} placeholder="Short explanation shown under the input." />
          </div>
          <div className="field">
            <label>{t('admin.type', 'Type')}</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {FIELD_TYPES.map((ft) => (
                <option key={ft} value={ft}>
                  {ft} — {t(`admin.fieldType_${ft}`, TYPE_HINT[ft])}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>{t('admin.sortOrder', 'Sort order')}</label>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </div>
          <div className="field">
            <label className="toggle-row">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              {t('common.required', 'Required')}
            </label>
          </div>
          <div className="field">
            <label className="toggle-row">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={field?.isSystem} />
              {t('common.active', 'Active')}
            </label>
          </div>
        </div>

        {/* Validation block */}
        {(isString || isNumber || needsOptions) && (
          <div className="rm-card" style={{ marginTop: 12 }}>
            <div className="rm-card-bar">
              <span className="rm-card-bar-label">{t('admin.validation', 'Validation Rules')}</span>
            </div>
            <div className="rm-card-body">
              {isString && (
                <div className="form-grid">
                  <div className="field">
                    <label>{t('admin.min', 'Min length')}</label>
                    <input type="number" value={validation.minLength} onChange={(e) => setValidation((v) => ({ ...v, minLength: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>{t('admin.max', 'Max length')}</label>
                    <input type="number" value={validation.maxLength} onChange={(e) => setValidation((v) => ({ ...v, maxLength: e.target.value }))} />
                  </div>
                  <div className="field full">
                    <label>{t('admin.regexPattern', 'Regex (optional)')}</label>
                    <input value={validation.regex} onChange={(e) => setValidation((v) => ({ ...v, regex: e.target.value }))} placeholder="^[A-Z]{3}-\d+$" />
                  </div>
                </div>
              )}
              {isNumber && (
                <div className="form-grid">
                  <div className="field">
                    <label>{t('admin.min', 'Min')}</label>
                    <input type="number" value={validation.min} onChange={(e) => setValidation((v) => ({ ...v, min: e.target.value }))} />
                  </div>
                  <div className="field">
                    <label>{t('admin.max', 'Max')}</label>
                    <input type="number" value={validation.max} onChange={(e) => setValidation((v) => ({ ...v, max: e.target.value }))} />
                  </div>
                </div>
              )}
              {needsOptions && (
                <div>
                  <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
                    {type} fields require at least one option.
                  </p>
                  {validation.options.map((o, i) => (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 60px', gap: 8, marginBottom: 6 }}>
                      <input
                        value={o.value}
                        onChange={(e) => updateOption(i, { value: e.target.value })}
                        placeholder={t('admin.optionValue', 'value')}
                      />
                      <input
                        value={o.label}
                        onChange={(e) => updateOption(i, { label: e.target.value })}
                        placeholder={t('admin.optionLabel', 'Display label')}
                      />
                      <button type="button" className="rm-action delete" onClick={() => removeOption(i)} title={t('common.delete', 'Delete')}><TrashIcon size={14} /></button>
                    </div>
                  ))}
                  <button type="button" className="btn secondary" onClick={addOption}>{t('admin.addOption', '＋ Add option')}</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Visibility */}
        <div className="rm-card" style={{ marginTop: 12 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-label">Visibility</span>
          </div>
          <div className="rm-card-body">
            <div className="form-grid">
              <div className="field">
                <label className="toggle-row">
                  <input type="checkbox" checked={visibility.showOnCreate} onChange={(e) => setVisibility((v) => ({ ...v, showOnCreate: e.target.checked }))} />
                  Show on create form
                </label>
              </div>
              <div className="field">
                <label className="toggle-row">
                  <input type="checkbox" checked={visibility.showOnDetail} onChange={(e) => setVisibility((v) => ({ ...v, showOnDetail: e.target.checked }))} />
                  Show on detail page
                </label>
              </div>
              <div className="field">
                <label className="toggle-row">
                  <input type="checkbox" checked={visibility.showOnList} onChange={(e) => setVisibility((v) => ({ ...v, showOnList: e.target.checked }))} />
                  Show in list view
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Reporting */}
        <div className="rm-card" style={{ marginTop: 12 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-label">{t('nav.reports', 'Reporting')}</span>
          </div>
          <div className="rm-card-body">
            <div className="form-grid">
              <div className="field">
                <label className="toggle-row">
                  <input type="checkbox" checked={reporting.includeInExport} onChange={(e) => setReporting((p) => ({ ...p, includeInExport: e.target.checked }))} />
                  Include in PDF / Excel exports
                </label>
              </div>
              <div className="field">
                <label>Export label</label>
                <input value={reporting.exportLabel} onChange={(e) => setReporting((p) => ({ ...p, exportLabel: e.target.value }))} placeholder="(defaults to display label)" maxLength={120} />
              </div>
              <div className="field">
                <label>Export order</label>
                <input type="number" value={reporting.exportOrder} onChange={(e) => setReporting((p) => ({ ...p, exportOrder: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn secondary" onClick={onClose}>{t('common.cancel', 'Cancel')}</button>
          <button className="btn" disabled={busy || !label || !key} onClick={save}>
            {busy ? t('admin.saving', 'Saving…') : (isEdit ? t('common.save', 'Save') : t('common.create', 'Create'))}
          </button>
        </div>
      </div>
    </div>
  );
}
