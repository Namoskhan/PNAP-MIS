import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
    const actionText = decision === 'APPROVED' ? t('common.approve', 'Approve') : t('common.reject', 'Reject');
    if (!await dialog.confirm(t('roles.confirmDecision', '{{action}} this role assignment?', { action: actionText }))) return;
    setBusy(true);
    try {
      await api.post(`/roles/${id}/decide`, { decision });
      toast.success(
        t('roles.decisionSuccess', 'Role {{status}}.', {
          status: decision === 'APPROVED' ? t('common.approved', 'approved') : t('common.rejected', 'rejected'),
        })
      );
      await reload();
    } catch (e) {
      toast.error(errorMessage(e), {
        title: t('roles.decisionFailed', 'Could not {{action}} role', { action: decision.toLowerCase() }),
        duration: 7000,
      });
    } finally {
      setBusy(false);
    }
  }

  if (!ctx) return <p>{t('common.selectUnitContext', 'Select a unit context first.')}</p>;

  return (
    <div>
      <div className="page-header">
        <h2>{t('roles.pendingApprovalsHeader', 'Pending Role Approvals · {{unitName}}', { unitName: ctx.unitName })}</h2>
      </div>
      <p className="muted">
        {t('roles.pendingApprovalsSubtitle', 'Role assignments proposed by the Senior Mawin Secretary (or higher initiator) waiting for your decision.')}
      </p>

      {items.length === 0 ? (
        <div className="card"><p className="muted" style={{ margin: 0 }}>{t('roles.noProposalsWaiting', 'No proposals waiting. New ones will appear here.')}</p></div>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>{t('common.role', 'Role')}</th>
              <th>{t('common.member', 'Member')}</th>
              <th>{t('roles.initiatedBy', 'Initiated by')}</th>
              <th>{t('roles.proposedAt', 'Proposed at')}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p._id}>
                <td>
                  <strong>{t(`roles.${p.roleCode.toLowerCase()}`, ROLE_LABEL[p.roleCode] || p.roleCode)}</strong>
                  {p.customRoleName && <span className="muted"> ({p.customRoleName})</span>}
                </td>
                <td>{p.memberId?.fullName} <span className="muted">{p.memberId?.memberId || p.memberId?.cnic}</span></td>
                <td>{p.initiatedBy?.fullName || '—'}</td>
                <td>{new Date(p.createdAt).toLocaleString()}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn" disabled={busy} onClick={() => decide(p._id, 'APPROVED')}>{t('common.approve', 'Approve')}</button>{' '}
                  <button className="btn danger" disabled={busy} onClick={() => decide(p._id, 'REJECTED')}>{t('common.reject', 'Reject')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
