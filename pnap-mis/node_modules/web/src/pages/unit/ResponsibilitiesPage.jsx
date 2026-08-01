import { useEffect, useState } from 'react';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { canManageMeetings, isCentralAdminOversight, isSuperAdminOversight } from '../../utils/permissions';
import { api, errorMessage } from '../../api/client';

const STATE_LABEL = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export default function ResponsibilitiesPage() {
  const { ctx } = useUnit();
  const { user } = useAuth();
  const canManage = canManageMeetings(user) && !isCentralAdminOversight(user) && !isSuperAdminOversight(user);
  const [items, setItems] = useState([]);
  const [members, setMembers] = useState([]);
  const [filterState, setFilterState] = useState('');
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', dueDate: '', assignedToMemberId: '' });
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

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
    const params = { status: 'ACTIVE', limit: 500 };
    if (ctx.unitLevel === 'BASIC_UNIT') params.basicUnitId = ctx.unitId;
    else if (ctx.unitLevel === 'AREA') params.areaId = ctx.unitId;
    else if (ctx.unitLevel === 'DISTRICT') params.districtId = ctx.unitId;
    else if (ctx.unitLevel === 'PROVINCE') params.provinceId = ctx.unitId;
    api.get('/members', { params }).then((r) => setMembers(r.data.data)).catch(() => {});
  }, [ctx]);

  async function create() {
    setErr(''); setMsg('');
    if (!form.title.trim() || !form.assignedToMemberId) {
      setErr('Pick a member and enter a title.');
      return;
    }
    try {
      const payload = { ...form, unitLevel: ctx.unitLevel, unitId: ctx.unitId };
      Object.keys(payload).forEach((k) => { if (payload[k] === '') delete payload[k]; });
      await api.post('/responsibilities', payload);
      setMsg('Responsibility assigned.');
      setForm({ title: '', description: '', dueDate: '', assignedToMemberId: '' });
      setShow(false);
      reload();
    } catch (e) { setErr(errorMessage(e)); }
  }

  async function update(id, patch) {
    try {
      await api.patch(`/responsibilities/${id}`, patch);
      reload();
    } catch (e) { alert(errorMessage(e)); }
  }

  async function remove(id) {
    if (!confirm('Delete this responsibility?')) return;
    try {
      await api.delete(`/responsibilities/${id}`);
      reload();
    } catch (e) { alert(errorMessage(e)); }
  }

  if (!ctx) return <p>Select a unit context first.</p>;

  return (
    <div>
      <div className="page-header">
        <h2>Responsibilities · {ctx.unitName}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={filterState} onChange={(e) => setFilterState(e.target.value)}>
            <option value="">All states</option>
            {Object.keys(STATE_LABEL).map((s) => <option key={s} value={s}>{STATE_LABEL[s]}</option>)}
          </select>
          {canManage && <button className="btn" onClick={() => setShow(true)}>+ Assign Responsibility</button>}
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}
      {msg && <div className="alert success">{msg}</div>}

      {show && (
        <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setShow(false); }}>
        <div className="modal" style={{ maxWidth: 640 }} role="dialog" aria-modal="true" aria-label="Assign Responsibility">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Assign a responsibility</h3>
            <button type="button" className="btn secondary" onClick={() => setShow(false)} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}>×</button>
          </div>
          <div className="form-grid">
            <div className="field full">
              <label>Title *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Mobilize voters in Block 4" />
            </div>
            <div className="field">
              <label>Assign to *</label>
              <select value={form.assignedToMemberId} onChange={(e) => setForm({ ...form, assignedToMemberId: e.target.value })}>
                <option value="">— pick a member —</option>
                {members.map((m) => <option key={m._id} value={m._id}>{m.fullName} · {m.memberId || m.cnic}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Due date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div className="field full">
              <label>Description</label>
              <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn secondary" type="button" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn" onClick={create}>Assign</button>
          </div>
        </div>
        </div>
      )}

      <table className="list">
        <thead>
          <tr><th>Title</th><th>Assigned to</th><th>Due</th><th>State</th><th></th></tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan="5">No responsibilities yet.</td></tr>}
          {items.map((r) => (
            <tr key={r._id}>
              <td><strong>{r.title}</strong>{r.description && <div className="muted" style={{ fontSize: 12 }}>{r.description}</div>}</td>
              <td>{r.assignedToMemberId?.fullName || '—'}</td>
              <td>{r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '—'}</td>
              <td><span className={`badge ${r.state}`}>{STATE_LABEL[r.state]}</span></td>
              <td style={{ whiteSpace: 'nowrap' }}>
                {canManage && r.state === 'PENDING' && <button className="btn secondary" onClick={() => update(r._id, { state: 'IN_PROGRESS' })}>Start</button>}{' '}
                {canManage && r.state !== 'COMPLETED' && r.state !== 'CANCELLED' && (
                  <button className="btn" onClick={() => {
                    const note = prompt('Completion note (optional):') || '';
                    update(r._id, { state: 'COMPLETED', completionNote: note });
                  }}>Mark Done</button>
                )}{' '}
                {canManage && r.state !== 'CANCELLED' && r.state !== 'COMPLETED' && (
                  <button className="btn danger" onClick={() => update(r._id, { state: 'CANCELLED' })}>Cancel</button>
                )}{' '}
                {canManage && <button className="btn ghost" onClick={() => remove(r._id)}>Delete</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
