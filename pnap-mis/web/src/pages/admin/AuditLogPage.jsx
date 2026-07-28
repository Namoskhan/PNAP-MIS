import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';

const ACTIONS = [
  'USER_UPDATE', 'USER_RESET_PASSWORD', 'USER_DEACTIVATE', 'USER_ACTIVATE',
  'MEMBER_ADMIN_EDIT', 'MEMBER_RESET_PASSWORD', 'MEMBER_REMOVE',
  'ROLE_FORCE_END',
];

export default function AuditLogPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [actionFilter, setActionFilter] = useState('');
  const [err, setErr] = useState('');

  async function reload() {
    setErr('');
    try {
      const params = { limit: 200 };
      if (actionFilter) params.action = actionFilter;
      const r = await api.get('/admin/audit', { params });
      setItems(r.data.data.items);
      setTotal(r.data.data.total);
    } catch (e) { setErr(errorMessage(e)); }
  }
  useEffect(() => { reload(); }, [actionFilter]);

  return (
    <div>
      <div className="page-header">
        <h2>Audit Log</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <span className="muted" style={{ alignSelf: 'center' }}>{total} entries</span>
        </div>
      </div>
      <p className="muted">
        Append-only stream of privileged write actions. Read-only — entries cannot be deleted from the system.
      </p>

      {err && <div className="alert error">{err}</div>}

      <table className="list">
        <thead>
          <tr>
            <th>When</th>
            <th>Actor</th>
            <th>Action</th>
            <th>Target</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan="5" className="muted">No audit entries yet.</td></tr>}
          {items.map((e) => (
            <tr key={e._id}>
              <td style={{ fontSize: 12 }}>{new Date(e.createdAt).toLocaleString()}</td>
              <td>
                <div><strong>{e.actorUserId?.fullName || '—'}</strong></div>
                <div className="muted" style={{ fontSize: 12 }}>{e.actorIdentifier}</div>
              </td>
              <td><span className="badge ACTIVE">{e.action}</span></td>
              <td>
                <div>{e.targetType}</div>
                <div className="muted" style={{ fontSize: 12 }}>{e.targetLabel || ''}</div>
              </td>
              <td style={{ fontSize: 12 }}>{e.note || ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
