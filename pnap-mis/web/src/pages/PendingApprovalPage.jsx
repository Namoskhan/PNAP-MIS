import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';

import dialog from '../components/dialog';
export default function PendingApprovalPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // For an AREA_ADMIN we pre-filter the queue to their own area so
  // they only see members they can actually approve. Higher-level
  // admins see the full queue.
  const isAreaAdminScoped = user?.roles?.includes('AREA_ADMIN') &&
    !['SUPER_ADMIN','PROVINCE_ADMIN','DISTRICT_ADMIN'].some((r) => user.roles.includes(r));

  async function load() {
    try {
      // scope:'all' covers the unscoped-admin case — the queue is
      // meant to be cross-unit for higher admins. Anyone with a
      // territorial scope is clamped to it server-side anyway.
      const params = { status: 'PENDING_APPROVAL', limit: 50, scope: 'all' };
      if (isAreaAdminScoped && user?.scope?.areaId) {
        params.areaId = user.scope.areaId;
      }
      const r = await api.get('/members', { params });
      setItems(r.data.data);
    } catch (e) { setErr(errorMessage(e)); }
  }

  useEffect(() => { load(); }, []);

  async function approve(id, name) {
    setBusy(true); setErr('');
    try {
      await api.post(`/members/${id}/approve`);
      await load();
      toast.success(`${name || 'Member'} approved — they can now log in with their CNIC.`, { title: 'Member approved' });
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Could not approve member', duration: 7000 });
    } finally { setBusy(false); }
  }

  async function reject(id, name) {
    const reason = await dialog.prompt('Reason for rejection:');
    if (!reason) return;
    setBusy(true); setErr('');
    try {
      await api.post(`/members/${id}/reject`, { reason });
      await load();
      toast.success(`${name || 'Member'}'s application was rejected.`, { title: 'Member rejected' });
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Could not reject member', duration: 7000 });
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-header">
        <h2>{isAreaAdminScoped ? 'Members awaiting your approval' : 'Approval Queue'}</h2>
      </div>
      {isAreaAdminScoped && (
        <p className="muted" style={{ marginTop: -4 }}>
          You only see members in your area. Approve or reject each application below.
          After approval, you can assign them a cabinet role from <Link to="/unit/cabinet">Assign Cabinet Roles</Link>.
        </p>
      )}
      {err && <div className="alert error">{err}</div>}
      <table className="list">
        <thead>
          <tr>
            <th>Name</th>
            <th>CNIC</th>
            <th>Phone</th>
            <th>Unit</th>
            <th>Submitted</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan="6" className="muted">No pending members.</td></tr>}
          {items.map((m) => (
            <tr key={m._id}>
              <td><Link to={`/members/${m._id}`}>{m.fullName}</Link></td>
              <td>{m.cnic}</td>
              <td>{m.phone}</td>
              <td>{m.basicUnitId?.name}</td>
              <td>{new Date(m.createdAt).toLocaleDateString()}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn" disabled={busy} onClick={() => approve(m._id, m.fullName)}>Approve</button>{' '}
                <button className="btn danger" disabled={busy} onClick={() => reject(m._id, m.fullName)}>Reject</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
