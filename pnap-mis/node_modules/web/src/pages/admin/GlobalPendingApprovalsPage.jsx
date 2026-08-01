import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';

const ROLE_LABEL = {
  SECRETARY: 'Secretary',
  SENIOR_MAWIN: 'Senior Mawin Sec.',
  FINANCE_SECRETARY: 'Finance Secretary',
  PRESS_SECRETARY: 'Press Secretary',
  CULTURE_SECRETARY: 'Culture Secretary',
  SPORTS_SECRETARY: 'Sports Secretary',
  GENERAL_SECRETARY: 'General Secretary',
  FIRST_SECRETARY: 'First Secretary',
  PRESIDENT: 'President / Saddar',
  VICE_PRESIDENT: 'Vice President',
  SR_VICE_PRESIDENT: 'Senior Vice President',
  CHAIRMAN: 'Chairman',
  CO_CHAIRMAN: 'Co-Chairman',
  VICE_CHAIRMAN: 'Vice Chairman',
  SR_VICE_CHAIRMAN: 'Senior Vice Chairman',
  OTHER: 'Other',
};

// Central Admin's system-wide role-approval inbox. Lists every
// PROPOSED RoleAssignment across the entire party — useful when a
// Senior Mawin somewhere has proposed a role and the local Secretary
// is unavailable. Central Admin can approve as an override.
export default function GlobalPendingApprovalsPage() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [levelFilter, setLevelFilter] = useState('');

  async function reload() {
    setErr('');
    try {
      const params = { state: 'PROPOSED' };
      if (levelFilter) params.unitLevel = levelFilter;
      const r = await api.get('/roles', { params });
      setItems(r.data.data);
    } catch (e) { setErr(errorMessage(e)); }
  }
  useEffect(() => { reload(); }, [levelFilter]);

  async function decide(id, decision) {
    if (!confirm(`${decision === 'APPROVED' ? 'Approve' : 'Reject'} this role assignment?`)) return;
    setBusy(true); setErr(''); setMsg('');
    try {
      await api.post(`/roles/${id}/decide`, { decision });
      setMsg(`Role ${decision.toLowerCase()}.`);
      await reload();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-header">
        <h2>Pending Role Approvals (System-wide)</h2>
        <select value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
          <option value="">All levels</option>
          <option value="BASIC_UNIT">Basic Unit</option>
          <option value="AREA">Area</option>
          <option value="DISTRICT">District</option>
          <option value="PROVINCE">Province</option>
          <option value="CENTRAL">Central</option>
        </select>
      </div>
      <p className="muted">
        Every role assignment proposed across the party that's still waiting for a decision.
        Approving here counts as a PKNAP Admin override per SRS §5.2.
      </p>

      {err && <div className="alert error">{err}</div>}
      {msg && <div className="alert success">{msg}</div>}

      {items.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>No proposals waiting.</p></div>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>Level</th>
              <th>Role</th>
              <th>Member</th>
              <th>Initiated by</th>
              <th>Proposed at</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p._id}>
                <td><span className="badge ACTIVE">{p.unitLevel.replace('_', ' ')}</span></td>
                <td>
                  <strong>{ROLE_LABEL[p.roleCode] || p.roleCode}</strong>
                  {p.customRoleName && <span className="muted"> ({p.customRoleName})</span>}
                </td>
                <td>{p.memberId?.fullName} <span className="muted">{p.memberId?.memberId || p.memberId?.cnic}</span></td>
                <td>{p.initiatedBy?.fullName || '—'}</td>
                <td>{new Date(p.createdAt).toLocaleString()}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn" disabled={busy} onClick={() => decide(p._id, 'APPROVED')}>Approve</button>{' '}
                  <button className="btn danger" disabled={busy} onClick={() => decide(p._id, 'REJECTED')}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
