import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isSuperAdmin } from '../utils/permissions';
import { useToast } from '../components/Toast';

import dialog from '../components/dialog';
export default function MemberDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const sup = isSuperAdmin(user);
  const [m, setM] = useState(null);
  // `err` is now ONLY for the page-load failure below, which renders
  // instead of the profile. Action outcomes (approve / reject / edit /
  // remove) go to toasts — routing them through this state used to
  // blank the whole page on a failed button press.
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectErr, setRejectErr] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    phone: '', email: '', address: '', dateOfBirth: '', gender: '',
  });
  const [editPhoto, setEditPhoto] = useState(null);

  // Owner = the logged-in member themselves. Owner OR any admin can
  // edit; backend enforces scope for admins.
  const isOwner = user?.memberId && String(user.memberId) === String(id);
  const isAdmin = (user?.roles || []).some((r) => [
    'SUPER_ADMIN',
    'PROVINCE_ADMIN','DISTRICT_ADMIN','AREA_ADMIN',
  ].includes(r));
  const canEdit = isOwner || isAdmin;

  const [donations, setDonations] = useState([]);
  const [donationsLoading, setDonationsLoading] = useState(false);

  async function load() {
    setErr('');
    try {
      const r = await api.get(`/members/${id}`);
      setM(r.data.data);
    } catch (e) { setErr(errorMessage(e)); }
  }

  async function loadDonations() {
    setDonationsLoading(true);
    try {
      const r = await api.get(`/members/${id}/donations`);
      setDonations(r.data.data || []);
    } catch {
      // Access denied or none found
    } finally {
      setDonationsLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadDonations();
  }, [id]);

  async function approve() {
    setBusy(true);
    try {
      await api.post(`/members/${id}/approve`);
      await load();
      toast.success(t('members.memberApproved', '{{name}} approved — they can now log in with their CNIC.', { name: m.fullName }), { title: t('members.memberApprovedTitle', 'Member approved') });
    } catch (e) {
      toast.error(errorMessage(e), { title: t('members.couldNotApprove', 'Could not approve member'), duration: 7000 });
    } finally { setBusy(false); }
  }

  function startEdit() {
    setEditForm({
      phone: m.phone || '',
      email: m.email || '',
      address: m.address || '',
      dateOfBirth: m.dateOfBirth ? new Date(m.dateOfBirth).toISOString().slice(0, 10) : '',
      gender: m.gender || '',
    });
    setEditPhoto(null);
    setEditing(true);
  }

  async function saveEdit() {
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(editForm).forEach(([k, v]) => {
        if (v !== '' && v != null) fd.append(k, v);
      });
      if (editPhoto) fd.append('photo', editPhoto);
      await api.patch(`/members/${id}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setEditing(false);
      await load();
      toast.success(t('members.profileUpdated', 'Profile updated.'));
    } catch (e) {
      // Duplicate email / phone come back as 409s here — worth longer
      // than the default so the reason is readable before it fades.
      toast.error(errorMessage(e), { title: t('members.couldNotSaveProfile', 'Could not save profile'), duration: 9000 });
    } finally { setBusy(false); }
  }

  async function reject() {
    // Validation stays inline, beside the textarea being corrected —
    // a toast would fade while the user is still typing the reason.
    if (!rejectReason.trim()) { setRejectErr(t('members.reasonRequired', 'Reason is required')); return; }
    setRejectErr('');
    setBusy(true);
    try {
      await api.post(`/members/${id}/reject`, { reason: rejectReason });
      setShowReject(false);
      await load();
      toast.success(t('members.memberRejected', '{{name}}\'s application was rejected.', { name: m.fullName }), { title: t('members.memberRejectedTitle', 'Member rejected') });
    } catch (e) {
      toast.error(errorMessage(e), { title: t('members.couldNotReject', 'Could not reject member'), duration: 7000 });
    } finally { setBusy(false); }
  }

  // Only reached when the profile itself could not be fetched — there
  // is no member to render around. Action failures no longer land here.
  if (err) return <div className="alert error">{err}</div>;
  if (!m) return <p>{t('common.loading', 'Loading…')}</p>;

  return (
    <div>
      <div className="page-header">
        <h2>{m.fullName}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && !editing && (
            <button className="btn" onClick={startEdit}>{t('members.editProfile', 'Edit Profile')}</button>
          )}
          {!isOwner && <Link className="btn secondary" to="/members">{t('members.backToList', '← Back to list')}</Link>}
        </div>
      </div>


      {editing && (
        <div className="card" style={{ marginBottom: 16, borderTop: '3px solid var(--primary)' }}>
          <h3 style={{ marginTop: 0 }}>{t('members.editProfile', 'Edit Profile')}</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            {t('members.lockedFieldsNote', 'Locked fields (Name, Father/Husband, CNIC, Basic Unit) cannot be self-changed once your account is active. Contact your Area Admin if these need to change.')}
          </p>
          <div className="form-grid">
            <div className="field">
              <label>{t('members.phone', 'Phone')}</label>
              <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('members.email', 'Email')}</label>
              <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div className="field full">
              <label>{t('members.address', 'Address')}</label>
              <textarea rows={2} value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('members.dateOfBirth', 'Date of Birth')}</label>
              <input type="date" value={editForm.dateOfBirth} onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('members.gender', 'Gender')}</label>
              <select value={editForm.gender} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}>
                <option value="">—</option>
                <option value="MALE">{t('members.male', 'Male')}</option>
                <option value="FEMALE">{t('members.female', 'Female')}</option>
                <option value="OTHER">{t('members.other', 'Other')}</option>
              </select>
            </div>
            <div className="field full">
              <label>{t('members.photoReplaceHelp', 'Photo (optional — upload a new one to replace)')}</label>
              <input type="file" accept="image/*" onChange={(e) => setEditPhoto(e.target.files?.[0] || null)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn" disabled={busy} onClick={saveEdit}>{busy ? t('common.saving', 'Saving…') : t('common.saveChanges', 'Save Changes')}</button>
            <button className="btn secondary" disabled={busy} onClick={() => setEditing(false)}>{t('common.cancel', 'Cancel')}</button>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {m.photoUrl && <img src={m.photoUrl} alt="" style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />}
          <div style={{ flex: 1, minWidth: 320 }}>
            <Row k={t('members.status', 'Status')} v={<span className={`badge ${m.status}`}>{m.status}</span>} />
            <Row k={t('members.memberId', 'Member ID')} v={m.memberId || t('members.willBeIssuedOnApproval', '— (will be issued on approval)')} />
            <Row k={t('members.cnic', 'CNIC')} v={m.cnic} />
            <Row k={t('members.phone', 'Phone')} v={m.phone} />
            <Row k={t('members.email', 'Email')} v={m.email || '—'} />
            <Row k={t('members.fatherHusbandName', 'Father/Husband')} v={m.fatherOrHusbandName} />
            <Row k={t('members.dateOfBirth', 'Date of Birth')} v={m.dateOfBirth ? new Date(m.dateOfBirth).toLocaleDateString() : '—'} />
            <Row k={t('members.gender', 'Gender')} v={m.gender} />
            <Row k={t('members.address', 'Address')} v={m.address} />
            <Row k={t('common.province', 'Province')} v={m.provinceId?.name} />
            <Row k={t('common.district', 'District')} v={m.districtId?.name} />
            <Row k={t('common.area', 'Area')} v={m.areaId?.name} />
            <Row k={t('common.basicUnit', 'Basic Unit')} v={m.basicUnitId?.name} />
            <Row k={t('members.submitted', 'Submitted')} v={new Date(m.createdAt).toLocaleString()} />
            {m.status === 'REJECTED' && <Row k={t('members.rejectionReason', 'Rejection Reason')} v={m.statusReason} />}
          </div>
        </div>

        {m.status === 'PENDING_APPROVAL' && (
          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button className="btn" disabled={busy} onClick={approve}>{t('members.approve', 'Approve')}</button>
            <button className="btn danger" disabled={busy} onClick={() => setShowReject(true)}>{t('members.reject', 'Reject')}</button>
          </div>
        )}

        {showReject && (
          <div className="card" style={{ marginTop: 14, background: 'var(--danger-bg)' }}>
            <div className="field">
              <label>{t('members.rejectionReason', 'Rejection Reason')}</label>
              <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              {rejectErr && <div className="error">{rejectErr}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button className="btn danger" disabled={busy} onClick={reject}>{t('members.confirmReject', 'Confirm Reject')}</button>
              <button className="btn secondary" onClick={() => { setShowReject(false); setRejectErr(''); }}>{t('common.cancel', 'Cancel')}</button>
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h3 style={{ margin: 0 }}>{t('finance.contributionsAndReceipts', 'Financial Contributions & Receipts')}</h3>
            <p className="muted" style={{ margin: '3px 0 0 0', fontSize: 13 }}>
              {t('finance.memberDonationHistoryDesc', 'Official party donation receipts and contribution history.')}
            </p>
          </div>
          {donations.length > 0 && (
            <div style={{ fontWeight: 700, fontSize: 15, color: '#15803d' }}>
              {t('finance.totalContributed', 'Total: ')}
              {new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(
                donations.filter((d) => d.state === 'APPROVED' || !d.state).reduce((sum, d) => sum + (d.amount || 0), 0)
              )}
            </div>
          )}
        </div>

        {donationsLoading ? (
          <p className="muted">{t('common.loading', 'Loading records…')}</p>
        ) : donations.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>{t('finance.noMemberDonationsYet', 'No financial contributions recorded yet.')}</p>
        ) : (
          <div className="table-responsive">
            <table className="list">
              <thead>
                <tr>
                  <th>{t('finance.receipt', 'Receipt')}</th>
                  <th>{t('common.date', 'Date')}</th>
                  <th>{t('finance.mode', 'Mode')}</th>
                  <th style={{ textAlign: 'right' }}>{t('finance.amount', 'Amount')}</th>
                  <th>{t('finance.status', 'Status')}</th>
                </tr>
              </thead>
              <tbody>
                {donations.map((d) => (
                  <tr key={d._id}>
                    <td style={{ fontWeight: 600 }}>{d.receiptNo}</td>
                    <td>{new Date(d.receivedAt || d.createdAt).toLocaleDateString()}</td>
                    <td>{d.paymentMode}</td>
                    <td style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: '#15803d' }}>
                        {new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(d.amount || 0)}
                      </span>
                      {d.amount >= 5000 && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: '#15803d', fontWeight: 700 }}>
                          ★ {t('finance.majorContribution', '5,000+ Major')}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${d.state || 'APPROVED'}`}>{d.state || 'APPROVED'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {sup && (
        <div className="card" style={{ marginTop: 16, borderTop: '3px solid var(--danger)' }}>
          <h3 style={{ marginTop: 0 }}>{t('admin.superAdminActions', 'Super Admin Actions')}</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            {t('admin.superAdminActionsDesc', 'Privileged actions. Audited. Last-Super-Admin guard prevents accidental lockout.')}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn secondary" disabled={busy} onClick={async () => {
              const pw = await dialog.prompt(t('admin.setNewPasswordPrompt', `Set new login password for ${m.fullName}:`), '123456');
              if (!pw) return;
              setBusy(true);
              try {
                await api.post(`/admin/members/${id}/reset-password`, { newPassword: pw });
                toast.success(t('admin.passwordResetSuccess', `Password reset for ${m.fullName}.`));
              } catch (e) {
                toast.error(errorMessage(e), { title: t('admin.couldNotResetPassword', 'Could not reset password'), duration: 7000 });
              } finally { setBusy(false); }
            }}>{t('admin.resetPassword', 'Reset Password')}</button>

            <button className="btn danger" disabled={busy || m.status === 'EXPELLED'} onClick={async () => {
              const reason = await dialog.prompt(t('admin.removeMemberPrompt', `Remove ${m.fullName}? This will end every active role they hold and deactivate their login. Type a reason:`));
              if (!reason) return;
              setBusy(true);
              try {
                const r = await api.post(`/admin/members/${id}/remove`, { reason });
                const ended = r.data.data.cascadedRoles;
                await load();
                toast.success(
                  t('admin.memberRemovedSuccess', `${m.fullName} removed — ${ended} role${ended === 1 ? '' : 's'} ended and login deactivated.`),
                  { title: t('admin.memberRemoved', 'Member removed'), duration: 7000 }
                );
              } catch (e) {
                toast.error(errorMessage(e), { title: t('admin.couldNotRemoveMember', 'Could not remove member'), duration: 7000 });
              } finally { setBusy(false); }
            }}>{t('admin.removeMember', 'Remove Member')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div style={{ display: 'flex', padding: '5px 0', borderBottom: '1px dashed var(--border)' }}>
      <div style={{ width: 160, color: 'var(--muted)', fontSize: 13 }}>{k}</div>
      <div style={{ flex: 1, fontSize: 14 }}>{v}</div>
    </div>
  );
}
