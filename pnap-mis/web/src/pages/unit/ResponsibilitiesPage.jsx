import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { canManageMeetings, isCentralAdminOversight, isSuperAdminOversight } from '../../utils/permissions';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../components/Toast';

import dialog from '../../components/dialog';
import { XIcon } from '../../components/icons';

export default function ResponsibilitiesPage() {
  const { t } = useTranslation();
  const { ctx } = useUnit();
  const { user } = useAuth();
  const toast = useToast();
  const canManage = canManageMeetings(user) && !isCentralAdminOversight(user) && !isSuperAdminOversight(user);
  const [items, setItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [filterState, setFilterState] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', dueDate: '', assignedToMemberId: '' });
  const [err, setErr] = useState('');

  const STATE_LABEL = {
    PENDING: t('status.pending', 'Pending'),
    IN_PROGRESS: t('status.inProgress', 'In Progress'),
    COMPLETED: t('status.completed', 'Completed'),
    CANCELLED: t('status.cancelled', 'Cancelled'),
  };

  async function reload() {
    if (!ctx) return;
    const params = { unitLevel: ctx.unitLevel, unitId: ctx.unitId };
    if (filterState) params.state = filterState;
    const r = await api.get('/responsibilities', { params });
    setItems(r.data.data);
  }

  useEffect(() => { reload(); }, [ctx, filterState]);

  useEffect(() => {
    if (!ctx) return;
    api.get('/meetings/eligible-attendees', {
      params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId, body: 'GENERAL_BODY' },
    })
      .then((r) => setMembers(r.data.data || []))
      .catch(() => {
        const params = { status: 'ACTIVE', limit: 500 };
        if (ctx.unitLevel === 'BASIC_UNIT') params.basicUnitId = ctx.unitId;
        else if (ctx.unitLevel === 'AREA') params.areaId = ctx.unitId;
        else if (ctx.unitLevel === 'DISTRICT') params.districtId = ctx.unitId;
        else if (ctx.unitLevel === 'PROVINCE') params.provinceId = ctx.unitId;
        else if (ctx.unitLevel === 'CENTRAL') params.scope = 'all';
        api.get('/members', { params }).then((r) => setMembers(r.data.data || [])).catch(() => {});
      });
  }, [ctx]);

  async function create() {
    setErr('');
    // Validation stays inline — the form is open and being corrected.
    if (!form.title.trim() || !form.assignedToMemberId) {
      setErr(t('responsibilities.validationErr', 'Pick a member and enter a title.'));
      return;
    }
    try {
      const payload = { ...form, unitLevel: ctx.unitLevel, unitId: ctx.unitId };
      Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k]; });
      const assignee = members.find((m) => m._id === form.assignedToMemberId);
      await api.post('/responsibilities', payload);
      setForm({ title: '', description: '', dueDate: '', assignedToMemberId: '' });
      setShow(false);
      reload();
      toast.success(
        assignee
          ? t('responsibilities.assignedSuccess', '"{{title}}" assigned to {{name}}.', { title: payload.title, name: assignee.fullName })
          : t('responsibilities.assignedGeneric', '"{{title}}" assigned.', { title: payload.title }),
        { title: t('responsibilities.assignedTitle', 'Responsibility assigned') }
      );
    } catch (e) {
      toast.error(errorMessage(e), { title: t('responsibilities.assignErrorTitle', 'Could not assign responsibility'), duration: 7000 });
    }
  }

  async function update(id, patch) {
    try {
      await api.patch(`/responsibilities/${id}`, patch);
      reload();
      toast.success(patch.state ? t('responsibilities.markedState', 'Marked {{state}}.', { state: (STATE_LABEL[patch.state] || patch.state).toLowerCase() }) : t('responsibilities.updated', 'Responsibility updated.'));
    } catch (e) {
      toast.error(errorMessage(e), { title: t('responsibilities.updateError', 'Could not update responsibility'), duration: 7000 });
    }
  }

  async function remove(id) {
    if (!await dialog.confirm(t('responsibilities.deleteConfirm', 'Delete this responsibility?'))) return;
    try {
      await api.delete(`/responsibilities/${id}`);
      reload();
      toast.success(t('responsibilities.deletedSuccess', 'Responsibility deleted.'));
    } catch (e) {
      toast.error(errorMessage(e), { title: t('responsibilities.deleteError', 'Could not delete responsibility'), duration: 7000 });
    }
  }

  if (!ctx) return <p>{t('performance.selectUnitContextFirst', 'Select a unit context first.')}</p>;

  return (
    <div>
      <div className="page-header">
        <h2>{t('responsibilities.responsibilities', 'Responsibilities')} · {ctx.unitName}</h2>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={filterState} onChange={(e) => setFilterState(e.target.value)}>
            <option value="">{t('responsibilities.allStates', 'All states')}</option>
            {Object.keys(STATE_LABEL).map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
          </select>
          {canManage && <button className="btn" onClick={() => setShow(true)}>{t('responsibilities.assignResponsibility', '+ Assign Responsibility')}</button>}
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}

      {show && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShow(false); }}>
          <div className="modal" style={{ maxWidth: 640 }} role="dialog" aria-modal="true" aria-label={t('responsibilities.assignResponsibility', 'Assign Responsibility')}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>{t('responsibilities.assignModalTitle', 'Assign a responsibility')}</h3>
              <button type="button" className="btn secondary" onClick={() => setShow(false)} aria-label={t('common.close', 'Close')} style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
            </div>
            <div className="form-grid">
              <div className="field full">
                <label>{t('common.title', 'Title')} *</label>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('responsibilities.titlePlaceholder', 'e.g. Mobilize voters in Block 4')} />
              </div>
              <div className="field">
                <label>{t('responsibilities.assignTo', 'Assign to')} *</label>
                <select value={form.assignedToMemberId} onChange={(e) => setForm({ ...form, assignedToMemberId: e.target.value })}>
                  <option value="">{t('reports.pickMember', '— pick a member —')}</option>
                  {members.map((m) => {
                    const role = m.roleText || 'Member';
                    const unit = m.unitText || (m.basicUnitId?.name ? `Basic Unit: ${m.basicUnitId.name}` : '');
                    const meta = [role, unit].filter(Boolean).join(' · ');
                    return (
                      <option key={m._id} value={m._id}>
                        {m.fullName} {m.memberId ? `(${m.memberId})` : ''} {meta ? `— ${meta}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="field">
                <label>{t('responsibilities.dueDate', 'Due date')}</label>
                <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
              <div className="field full">
                <label>{t('common.description', 'Description')}</label>
                <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
            <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button className="btn secondary" type="button" onClick={() => setShow(false)}>{t('common.cancel', 'Cancel')}</button>
              <button className="btn" onClick={create}>{t('responsibilities.assign', 'Assign')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="table-responsive">
      <table className="list">
        <thead>
          <tr>
            <th>{t('common.title', 'Title')}</th>
            <th>{t('responsibilities.assignedTo', 'Assigned to')}</th>
            <th>{t('responsibilities.due', 'Due')}</th>
            <th>{t('common.status', 'State')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan="5">{t('responsibilities.noResponsibilities', 'No responsibilities yet.')}</td></tr>}
          {items.map((r) => (
            <tr key={r._id}>
              <td><strong>{r.title}</strong>{r.description && <div className="muted" style={{ fontSize: 12 }}>{r.description}</div>}</td>
              <td>
                <div><strong>{r.assignedToMemberId?.fullName || '—'}</strong></div>
                {r.assignedToMemberId?.roleText && (
                  <div style={{ marginTop: 2 }}>
                    <span
                      className="badge"
                      style={{
                        fontSize: 10,
                        padding: '1px 5px',
                        background: 'var(--primary-subtle, #e0f2fe)',
                        color: 'var(--primary, #0369a1)',
                        fontWeight: 600,
                      }}
                    >
                      {r.assignedToMemberId.roleText}
                    </span>
                  </div>
                )}
                {r.assignedToMemberId?.unitText && (
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    {r.assignedToMemberId.unitText}
                  </div>
                )}
              </td>
              <td>{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'}</td>
              <td><span className={`badge ${r.state}`}>{STATE_LABEL[r.state] || r.state}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {canManage && r.state === 'PENDING' && <button className="btn secondary" onClick={() => update(r._id, { state: 'IN_PROGRESS' })}>{t('responsibilities.start', 'Start')}</button>}{' '}
                {canManage && r.state !== 'COMPLETED' && r.state !== 'CANCELLED' && (
                  <button className="btn" onClick={async () => {
                    const note = await dialog.prompt(t('responsibilities.completionNotePrompt', 'Completion note (optional):')) || '';
                    update(r._id, { state: 'COMPLETED', completionNote: note });
                  }}>{t('responsibilities.markDone', 'Mark Done')}</button>
                )}{' '}
                {canManage && r.state !== 'CANCELLED' && r.state !== 'COMPLETED' && (
                  <button className="btn danger" onClick={() => update(r._id, { state: 'CANCELLED' })}>{t('common.cancel', 'Cancel')}</button>
                )}{' '}
                {canManage && <button className="btn ghost" onClick={() => remove(r._id)}>{t('common.delete', 'Delete')}</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
