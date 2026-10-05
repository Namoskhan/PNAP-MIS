import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../api/client';
import { useToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';

import dialog from '../components/dialog';
export default function PendingApprovalPage() {
  const { t } = useTranslation();
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
      toast.success(t('members.memberApproved', { name: name || t('members.title', 'Member') }), { title: t('members.approve', 'Member approved') });
    } catch (e) {
      toast.error(errorMessage(e), { title: t('members.couldNotApprove', 'Could not approve member'), duration: 7000 });
    } finally { setBusy(false); }
  }

  async function reject(id, name) {
    const reason = await dialog.prompt(t('members.rejectReasonPrompt', 'Reason for rejection:'));
    if (!reason) return;
    setBusy(true); setErr('');
    try {
      await api.post(`/members/${id}/reject`, { reason });
      await load();
      toast.success(t('members.memberRejected', { name: name || t('members.title', 'Member') }), { title: t('members.reject', 'Member rejected') });
    } catch (e) {
      toast.error(errorMessage(e), { title: t('members.couldNotReject', 'Could not reject member'), duration: 7000 });
    } finally { setBusy(false); }
  }

  return (
    <div>
      <div className="page-header">
        <h2>{isAreaAdminScoped ? t('members.membersAwaitingApproval', 'Members awaiting your approval') : t('members.approvalQueue', 'Approval Queue')}</h2>
      </div>
      {isAreaAdminScoped && (
        <p className="muted" style={{ marginTop: -4 }}>
          {t('members.areaScopedNotice', 'You only see members in your area. Approve or reject each application below.')}
        </p>
      )}
      {err && <div className="alert error">{err}</div>}
      <table className="list">
        <thead>
          <tr>
            <th>{t('members.fullName', 'Name')}</th>
            <th>{t('members.cnic', 'CNIC')}</th>
            <th>{t('members.phone', 'Phone')}</th>
            <th>{t('members.unit', 'Unit')}</th>
            <th>{t('members.submitted', 'Submitted')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan="6" className="muted">{t('members.noPendingMembers', 'No pending members.')}</td></tr>}
          {items.map((m) => (
            <tr key={m._id}>
              <td><Link to={`/members/${m._id}`}>{m.fullName}</Link></td>
              <td>{m.cnic}</td>
              <td>{m.phone}</td>
              <td>{m.basicUnitId?.name}</td>
              <td>{new Date(m.createdAt).toLocaleDateString()}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <button className="btn" disabled={busy} onClick={() => approve(m._id, m.fullName)}>{t('members.approve', 'Approve')}</button>{' '}
                <button className="btn danger" disabled={busy} onClick={() => reject(m._id, m.fullName)}>{t('members.reject', 'Reject')}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
