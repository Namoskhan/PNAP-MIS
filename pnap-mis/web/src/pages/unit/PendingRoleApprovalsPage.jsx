import { useEffect, useState } from 'react';
import { useUnit } from '../../context/UnitContext';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../components/Toast';

import dialog from '../../components/dialog';
const ROLE_LABEL = {
  SECRETARY: 'Secretary',
  SENIOR_MAWIN: 'Senior Mawin Secretary',
  FINANCE_SECRETARY: 'Finance Secretary',
  PRESS_SECRETARY: 'Press Secretary',
  CULTURE_SECRETARY: 'Culture Secretary',
  SPORTS_SECRETARY: 'Sports Secretary',
  GENERAL_SECRETARY: 'General Secretary',
  PRESIDENT: 'President',
  VICE_PRESIDENT: 'Vice President',
  SR_VICE_PRESIDENT: 'Senior Vice President',
  CHAIRMAN: 'Chairman',
  CO_CHAIRMAN: 'Co-Chairman',
  OTHER: 'Other',
};

// SRS §5.2 — Secretary's role-approval inbox. Senior Mawin / First
// Secretary / Secretary General initiate; Secretary / President /
// Chairman / Co-Chairman approve.
export default function PendingRoleApprovalsPage() {
  const { ctx } = useUnit();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);

  async function reload() {
    if (!ctx) return;
    const r = await api.get('/roles', {
      params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId, state: 'PROPOSED' },
    });
    setItems(r.data.data);
  }

  useEffect(() => { reload(); }, [ctx]);

  async function decide(id, decision) {
    if (!await dialog.confirm(`${decision === 'APPROVED' ? 'Approve' : 'Reject'} this role assignment?`)) return;
    setBusy(true);
    try {
      await api.post(`/roles/${id}/decide`, { decision });
      toast.success(`Role ${decision.toLowerCase()}.`);
      await reload();
    } catch (e) { toast.error(errorMessage(e), { title: `Could not ${decision.toLowerCase()} role`, duration: 7000 }); }
    finally { setBusy(false); }
  }

  if (!ctx) return <p>Select a unit context first.</p>;

  return (
    <div>
      <div className="page-header"><h2>Pending Role Approvals · {ctx.unitName}</h2></div>
      <p className="muted">
        Role assignments proposed by the Senior Mawin Secretary (or higher initiator) waiting for your decision.
      </p>


      {items.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>No proposals waiting. New ones will appear here.</p></div>
      ) : (
        <table className="list">
          <thead>
            <tr><th>Role</th><th>Member</th><th>Initiated by</th><th>Proposed at</th><th></th></tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p._id}>
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
