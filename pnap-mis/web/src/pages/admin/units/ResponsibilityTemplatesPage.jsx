import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import { ClipboardIcon, FileTextIcon, TrashIcon, UserIcon, ZapIcon, XIcon } from '../../../components/icons';

import dialog from '../../../components/dialog';
// Responsibility Manager — list + full create/edit dialog (PR F2).
// Auto-task templates: fire when meetings/activities/roles transition.
// Auto-created Responsibility documents are never cascaded on delete —
// they stay as historical artifacts of work that was assigned.

const TRIGGER_EVENTS = [
  { code: 'MEETING_FINALIZED', label: 'Meeting finalized' },
  { code: 'MEETING_CREATED', label: 'Meeting created' },
  { code: 'ACTIVITY_COMPLETED', label: 'Activity completed' },
  { code: 'ROLE_APPROVED', label: 'Role approved' },
  { code: 'CABINET_APPOINTED', label: 'Cabinet appointed' },
];
const TARGETS = [
  { code: 'CREATOR', label: 'Creator (meeting/activity)' },
  { code: 'CHAIRPERSON', label: 'Chairperson (meeting)' },
  { code: 'LEAD', label: 'Lead member (activity)' },
  { code: 'CABINET_ROLE', label: 'Cabinet role holder' },
];
const TIER_CODES = ['', 'BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];
const BODIES = ['', 'EXECUTIVE', 'COMMITTEE'];

export default function ResponsibilityTemplatesPage() {
  const { user } = useAuth();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = hasPermission(user, 'MANAGE_UNIT_CONFIG');

  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setBusy(true); setErr('');
    try {
      const r = await api.get('/admin/units/responsibility-templates');
      setItems(r.data?.data || []);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function deleteTpl(t) {
    if (!await dialog.confirm(`Delete "${t.name}"? Responsibility documents already created from this template stay in place.`)) return;
    try {
      const r = await api.delete(`/admin/units/responsibility-templates/${t._id}`);
      const inFlight = r.data?.data?.inFlightResponsibilities || 0;
      toast.success?.(inFlight > 0
        ? `Template deleted; ${inFlight} in-flight responsibility/ies remain in place.`
        : 'Template deleted.');
      load();
    } catch (e) { toast.error?.(errorMessage(e)); }
  }

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><ClipboardIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Responsibility Manager</h2>
            <div className="rm-hero-sub">
              Auto-assign tasks when meetings are finalized or activities completed.
              Templates fire idempotently — same (template, source) won't double-create.
            </div>
          </div>
          <div className="rm-hero-actions">
            <button className="rm-hero-btn outline" onClick={load}>⟳ Refresh</button>
            {canWrite && (
              <button className="rm-hero-btn solid" onClick={() => setCreateOpen(true)}>＋ New template</button>
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

      {!busy && items.length === 0 && (
        <div className="rm-card">
          <div className="rm-empty">No templates configured. Auto-task creation is opt-in — system has no behavior change until admin adds the first template.</div>
        </div>
      )}

      {!busy && items.map((t) => (
        <div key={t._id} className="rm-card" style={{ marginBottom: 12 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-icon" aria-hidden="true"><ClipboardIcon size={15} /></span>
            <span className="rm-card-bar-label">
              {t.name}
              {!t.isActive && ' · inactive'}
            </span>
            <span className="rm-card-bar-count">{t.trigger?.event}</span>
          </div>
          <div className="rm-card-body">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              <li>Trigger: <code>{t.trigger?.event}</code>
                {t.trigger?.conditions?.tierCode && <> · tier <code>{t.trigger.conditions.tierCode}</code></>}
                {t.trigger?.conditions?.typeCode && <> · type <code>{t.trigger.conditions.typeCode}</code></>}
                {t.trigger?.conditions?.body && <> · body <code>{t.trigger.conditions.body}</code></>}
              </li>
              <li>Assign to: <code>{t.assignment?.target}</code>
                {t.assignment?.roleCode && <> · role <code>{t.assignment.roleCode}</code></>}
              </li>
              <li>Due: {t.dueDateOffsetDays > 0 ? `${t.dueDateOffsetDays} days after trigger` : 'no due date'}</li>
              {t.titleTemplate && <li>Title template: "{t.titleTemplate}"</li>}
              {t.description && <li className="muted">{t.description}</li>}
            </ul>
            {canWrite && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <button className="rm-action edit" onClick={() => setEditing(t)}>Edit</button>
                <button className="rm-action delete" onClick={() => deleteTpl(t)}><TrashIcon size={13} /> Delete</button>
              </div>
            )}
          </div>
        </div>
      ))}

      {createOpen && (
        <ResponsibilityTemplateDialog
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load(); toast.success?.('Template created.'); }}
        />
      )}
      {editing && (
        <ResponsibilityTemplateDialog
          mode="edit"
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast.success?.('Template updated.'); }}
        />
      )}
    </div>
  );
}

function ResponsibilityTemplateDialog({ mode, template, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [event, setEvent] = useState(template?.trigger?.event || 'MEETING_FINALIZED');
  const [condTier, setCondTier] = useState(template?.trigger?.conditions?.tierCode || '');
  const [condType, setCondType] = useState(template?.trigger?.conditions?.typeCode || '');
  const [condBody, setCondBody] = useState(template?.trigger?.conditions?.body || '');
  const [target, setTarget] = useState(template?.assignment?.target || 'CREATOR');
  const [roleCode, setRoleCode] = useState(template?.assignment?.roleCode || '');
  const [titleTemplate, setTitleTemplate] = useState(template?.titleTemplate || '');
  const [descriptionTemplate, setDescriptionTemplate] = useState(template?.descriptionTemplate || '');
  const [dueDateOffsetDays, setDueDateOffsetDays] = useState(template?.dueDateOffsetDays || 0);
  const [isActive, setIsActive] = useState(template?.isActive !== false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Body condition only applies to meeting/activity events
  const bodyApplies = ['MEETING_FINALIZED', 'MEETING_CREATED', 'ACTIVITY_COMPLETED'].includes(event);
  // Target options depend on event domain
  const targetOpts = (() => {
    if (event === 'ROLE_APPROVED' || event === 'CABINET_APPOINTED') {
      return TARGETS.filter((t) => t.code === 'CABINET_ROLE');
    }
    if (event === 'ACTIVITY_COMPLETED') {
      return TARGETS.filter((t) => t.code !== 'CHAIRPERSON');
    }
    return TARGETS;
  })();

  // Re-snap target if event change made it incompatible
  useEffect(() => {
    if (!targetOpts.some((o) => o.code === target)) {
      setTarget(targetOpts[0]?.code || 'CREATOR');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event]);

  async function save() {
    setErr(''); setBusy(true);
    try {
      if (!name.trim() || name.trim().length < 2) {
        throw new Error('Name must be at least 2 characters');
      }
      if (target === 'CABINET_ROLE' && !roleCode.trim()) {
        throw new Error('Cabinet role code is required when target is CABINET_ROLE');
      }
      const conditions = {};
      if (condTier) conditions.tierCode = condTier;
      if (condType) conditions.typeCode = condType.toUpperCase();
      if (condBody && bodyApplies) conditions.body = condBody;

      const payload = {
        name: name.trim(),
        trigger: {
          event,
          ...(Object.keys(conditions).length > 0 ? { conditions } : {}),
        },
        assignment: {
          target,
          ...(target === 'CABINET_ROLE' ? { roleCode: roleCode.trim().toUpperCase() } : {}),
        },
        dueDateOffsetDays: Number(dueDateOffsetDays) || 0,
        isActive,
      };
      if (description.trim()) payload.description = description.trim();
      if (titleTemplate.trim()) payload.titleTemplate = titleTemplate.trim();
      if (descriptionTemplate.trim()) payload.descriptionTemplate = descriptionTemplate.trim();

      if (isEdit) {
        await api.patch(`/admin/units/responsibility-templates/${template._id}`, payload);
      } else {
        await api.post('/admin/units/responsibility-templates', payload);
      }
      onSaved();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{isEdit ? `Edit template · ${template.name}` : 'New responsibility template'}</h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
        </div>
        {err && <div className="alert error">{err}</div>}

        <div className="rm-card">
          <div className="rm-card-bar">
            <span className="rm-card-bar-icon" aria-hidden="true"><ClipboardIcon size={15} /></span>
            <span className="rm-card-bar-label">Template</span>
          </div>
          <div className="rm-card-body">
            <div className="form-grid">
              <div className="field full">
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Draft minutes after monthly meeting" />
              </div>
              <div className="field full">
                <label>Internal description (optional)</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
                <div className="hint">For admin reference. Not shown to assignees.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rm-card" style={{ marginTop: 12 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-icon" aria-hidden="true"><ZapIcon size={15} /></span>
            <span className="rm-card-bar-label">Trigger</span>
          </div>
          <div className="rm-card-body">
            <div className="form-grid">
              <div className="field">
                <label>Event</label>
                <select value={event} onChange={(e) => setEvent(e.target.value)}>
                  {TRIGGER_EVENTS.map((e) => <option key={e.code} value={e.code}>{e.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Only on tier (optional)</label>
                <select value={condTier} onChange={(e) => setCondTier(e.target.value)}>
                  {TIER_CODES.map((t) => <option key={t || 'any'} value={t}>{t || 'Any tier'}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Only on type code (optional)</label>
                <input
                  value={condType}
                  onChange={(e) => setCondType(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                  placeholder="MONTHLY_MEETING"
                  maxLength={60}
                />
                <div className="hint">Empty = any meeting/activity type.</div>
              </div>
              {bodyApplies && (
                <div className="field">
                  <label>Only on body (optional)</label>
                  <select value={condBody} onChange={(e) => setCondBody(e.target.value)}>
                    {BODIES.map((b) => <option key={b || 'any'} value={b}>{b || 'Any body'}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rm-card" style={{ marginTop: 12 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-icon" aria-hidden="true"><UserIcon size={15} /></span>
            <span className="rm-card-bar-label">Assignment</span>
          </div>
          <div className="rm-card-body">
            <div className="form-grid">
              <div className="field">
                <label>Assign to</label>
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {targetOpts.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
                </select>
              </div>
              {target === 'CABINET_ROLE' && (
                <div className="field">
                  <label>Cabinet role code</label>
                  <input
                    value={roleCode}
                    onChange={(e) => setRoleCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                    placeholder="GENERAL_SECRETARY"
                    maxLength={60}
                  />
                  <div className="hint">Must match a role in the Role catalogue.</div>
                </div>
              )}
              <div className="field">
                <label>Due in days (0 = no due date)</label>
                <input
                  type="number" min="0" max="3650"
                  value={dueDateOffsetDays}
                  onChange={(e) => setDueDateOffsetDays(e.target.value === '' ? 0 : Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="rm-card" style={{ marginTop: 12 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-icon" aria-hidden="true"><FileTextIcon size={15} /></span>
            <span className="rm-card-bar-label">Generated task content</span>
          </div>
          <div className="rm-card-body">
            <div className="form-grid">
              <div className="field full">
                <label>Title template (optional)</label>
                <input
                  value={titleTemplate}
                  onChange={(e) => setTitleTemplate(e.target.value)}
                  maxLength={200}
                  placeholder="Submit minutes for {{eventTitle}}"
                />
                <div className="hint">Placeholders like <code>{'{{eventTitle}}'}</code> are replaced by the hook service.</div>
              </div>
              <div className="field full">
                <label>Description template (optional)</label>
                <textarea
                  rows={3}
                  value={descriptionTemplate}
                  onChange={(e) => setDescriptionTemplate(e.target.value)}
                  maxLength={2000}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="field">
            <label className="toggle-row">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
            <div className="hint">Inactive templates stop firing but remain editable.</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy} onClick={save}>
            {busy ? 'Saving…' : (isEdit ? 'Save changes' : 'Create template')}
          </button>
        </div>
      </div>
    </div>
  );
}
