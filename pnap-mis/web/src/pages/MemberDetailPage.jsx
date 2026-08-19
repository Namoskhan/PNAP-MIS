import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { isSuperAdmin } from '../utils/permissions';
import { useToast } from '../components/Toast';

import dialog from '../components/dialog';
export default function MemberDetailPage() {
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

  async function load() {
    setErr('');
    try {
      const r = await api.get(`/members/${id}`);
      setM(r.data.data);
    } catch (e) { setErr(errorMessage(e)); }
  }

  useEffect(() => { load(); }, [id]);

  async function approve() {
    setBusy(true);
    try {
      await api.post(`/members/${id}/approve`);
      await load();
      toast.success(`${m.fullName} approved. They can now log in with their CNIC.`, { title: 'Member approved' });
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Could not approve member', duration: 7000 });
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
      toast.success('Profile updated.');
    } catch (e) {
      // Duplicate email / phone come back as 409s here — worth longer
      // than the default so the reason is readable before it fades.
      toast.error(errorMessage(e), { title: 'Could not save profile', duration: 9000 });
    } finally { setBusy(false); }
  }

  async function reject() {
    // Validation stays inline, beside the textarea being corrected —
    // a toast would fade while the user is still typing the reason.
    if (!rejectReason.trim()) { setRejectErr('Reason is required'); return; }
    setRejectErr('');
    setBusy(true);
    try {
      await api.post(`/members/${id}/reject`, { reason: rejectReason });
      setShowReject(false);
      await load();
      toast.success(`${m.fullName}'s application was rejected.`, { title: 'Member rejected' });
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Could not reject member', duration: 7000 });
    } finally { setBusy(false); }
  }

  // Only reached when the profile itself could not be fetched — there
  // is no member to render around. Action failures no longer land here.
  if (err) return <div className="alert error">{err}</div>;
  if (!m) return <p>Loading…</p>;

  return (
    <div>
      <div className="page-header">
        <h2>{m.fullName}</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {canEdit && !editing && (
            <button className="btn" onClick={startEdit}>Edit Profile</button>
          )}
          {!isOwner && <Link className="btn secondary" to="/members">← Back to list</Link>}
        </div>
      </div>


      {editing && (
        <div className="card" style={{ marginBottom: 16, borderTop: '3px solid var(--primary)' }}>
          <h3 style={{ marginTop: 0 }}>Edit Profile</h3>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Locked fields (Name, Father/Husband, CNIC, Basic Unit) cannot be self-changed once your account is active. Contact your Area Admin if these need to change.
          </p>
          <div className="form-grid">
            <div className="field">
              <label>Phone</label>
              <input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div className="field full">
              <label>Address</label>
              <textarea rows={2} value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
            </div>
            <div className="field">
              <label>Date of Birth</label>
              <input type="date" value={editForm.dateOfBirth} onChange={(e) => setEditForm({ ...editForm, dateOfBirth: e.target.value })} />
            </div>
            <div className="field">
              <label>Gender</label>
              <select value={editForm.gender} onChange={(e) => setEditForm({ ...editForm, gender: e.target.value })}>
                <option value="">—</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div className="field full">
              <label>Photo (optional — upload a new one to replace)</label>
              <input type="file" accept="image/*" onChange={(e) => setEditPhoto(e.target.files?.[0] || null)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            <button className="btn" disabled={busy} onClick={saveEdit}>{busy ? 'Saving…' : 'Save Changes'}</button>
            <button className="btn secondary" disabled={busy} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          {m.photoUrl && <img src={m.photoUrl} alt="" style={{ width: 140, height: 140, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />}
          <div style={{ flex: 1, minWidth: 320 }}>
            <Row k="Status" v={<span className={`badge ${m.status}`}>{m.status}</span>} />
            <Row k="Member ID" v={m.memberId || '— (will be issued on approval)'} />
            <Row k="CNIC" v={m.cnic} />
            <Row k="Phone" v={m.phone} />
            <Row k="Email" v={m.email || '—'} />
            <Row k="Father/Husband" v={m.fatherOrHusbandName} />
            <Row k="Date of Birth" v={m.dateOfBirth ? new Date(m.dateOfBirth).toLocaleDateString() : '—'} />
            <Row k="Gender" v={m.gender} />
            <Row k="Address" v={m.address} />
            <Row k="Province" v={m.provinceId?.name} />
            <Row k="District" v={m.districtId?.name} />
            <Row k="Area" v={m.areaId?.name} />
            <Row k="Basic Unit" v={m.basicUnitId?.name} />
            <Row k="Submitted" v={new Date(m.createdAt).toLocaleString()} />
            {m.status === 'REJECTED' && <Row k="Rejection Reason" v={m.statusReason} />}
          </div>
        </div>

        {m.status === 'PENDING_APPROVAL' && (
          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button className="btn" disabled={busy} onClick={approve}>Approve</button>
            <button className="btn danger" disabled={busy} onClick={() => setShowReject(true)}>Reject</button>
          </div>
        )}

        {showReject && (
          <div className="card" style={{ marginTop: 14, background: 'var(--danger-bg)' }}>
            <div className="field">
              <label>Rejection Reason</label>
              <textarea rows={3} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
              {rejectErr && <div className="error">{rejectErr}</div>}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
              <button className="btn danger" disabled={busy} onClick={reject}>Confirm Reject</button>
              <button className="btn secondary" onClick={() => { setShowReject(false); setRejectErr(''); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {sup && (
        <div className="card" style={{ marginTop: 16, borderTop: '3px solid var(--danger)' }}>
          <h3 style={{ marginTop: 0 }}>Super Admin Actions</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Privileged actions. Audited. Last-Super-Admin guard prevents accidental lockout.
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn secondary" disabled={busy} onClick={async () => {
              const pw = await dialog.prompt(`Set new login password for ${m.fullName}:`, '123456');
              if (!pw) return;
              setBusy(true);
              try {
                await api.post(`/admin/members/${id}/reset-password`, { newPassword: pw });
                toast.success(`Password reset for ${m.fullName}.`);
              } catch (e) {
                toast.error(errorMessage(e), { title: 'Could not reset password', duration: 7000 });
              } finally { setBusy(false); }
            }}>Reset Password</button>

            <button className="btn danger" disabled={busy || m.status === 'EXPELLED'} onClick={async () => {
              const reason = await dialog.prompt(`Remove ${m.fullName}? This will end every active role they hold and deactivate their login. Type a reason:`);
              if (!reason) return;
              setBusy(true);
              try {
                const r = await api.post(`/admin/members/${id}/remove`, { reason });
                const ended = r.data.data.cascadedRoles;
                await load();
                toast.success(
                  `${m.fullName} removed — ${ended} role${ended === 1 ? '' : 's'} ended and login deactivated.`,
                  { title: 'Member removed', duration: 7000 }
                );
              } catch (e) {
                toast.error(errorMessage(e), { title: 'Could not remove member', duration: 7000 });
              } finally { setBusy(false); }
            }}>Remove Member</button>
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
