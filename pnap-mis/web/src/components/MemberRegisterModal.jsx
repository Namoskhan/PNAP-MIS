import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useToast } from './Toast';
import { formatCnic, isCompleteCnic } from '../utils/formatters';

export default function MemberRegisterModal({ open, onClose, onSuccess }) {
  const toast = useToast();
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [units, setUnits] = useState([]);

  const [provinceId, setProvinceId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [areaId, setAreaId] = useState('');

  const initialForm = {
    fullName: '',
    fatherOrHusbandName: '',
    cnic: '',
    phone: '',
    email: '',
    dateOfBirth: '',
    gender: 'MALE',
    address: '',
    basicUnitId: '',
    bloodGroup: '',
    education: '',
    occupation: '',
  };
  const [form, setForm] = useState(initialForm);
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // null = not checked, true = taken, false = available
  const [cnicTaken, setCnicTaken] = useState(null);

  // Live duplicate check once all 13 digits are typed. Uses the
  // member-list search the registrar already has access to; the
  // server remains the authority on submit.
  useEffect(() => {
    if (!isCompleteCnic(form.cnic)) { setCnicTaken(null); return; }
    let stale = false;
    api.get('/members', { params: { q: form.cnic, limit: 1 } })
      .then((r) => {
        if (stale) return;
        const items = r.data.data || [];
        setCnicTaken(items.some((m) => m.cnic === form.cnic));
      })
      .catch(() => { if (!stale) setCnicTaken(null); });
    return () => { stale = true; };
  }, [form.cnic]);

  useEffect(() => {
    if (!open) return;
    setErr('');
    setForm(initialForm);
    setPhoto(null);
    setProvinceId('');
    setDistrictId('');
    setAreaId('');
    api.get('/org/provinces').then((r) => setProvinces(r.data.data)).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!provinceId) { setDistricts([]); setDistrictId(''); return; }
    api.get('/org/districts', { params: { provinceId } }).then((r) => setDistricts(r.data.data)).catch(() => {});
  }, [provinceId, open]);

  useEffect(() => {
    if (!open) return;
    if (!districtId) { setAreas([]); setAreaId(''); return; }
    api.get('/org/areas', { params: { districtId } }).then((r) => setAreas(r.data.data)).catch(() => {});
  }, [districtId, open]);

  useEffect(() => {
    if (!open) return;
    if (!areaId) { setUnits([]); setForm((f) => ({ ...f, basicUnitId: '' })); return; }
    api.get('/org/basic-units', { params: { areaId } }).then((r) => setUnits(r.data.data)).catch(() => {});
  }, [areaId, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === 'Escape' && !busy) onClose?.();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  function setField(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (cnicTaken) {
      setErr('A member with this CNIC already exists.');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (v !== '' && v != null) fd.append(k, v);
      });
      if (photo) fd.append('photo', photo);

      const res = await api.post('/members', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onSuccess?.(res.data.data);
      onClose?.();
    } catch (e) {
      const msg = errorMessage(e);
      setErr(msg);
      toast.error(msg, { title: 'Registration failed' });
    } finally {
      setBusy(false);
    }
  }

  function onBackdropClick(e) {
    if (e.target === e.currentTarget && !busy) onClose?.();
  }

  return (
    <div className="modal-backdrop" onClick={onBackdropClick}>
      <div className="modal" style={{ maxWidth: 880 }} role="dialog" aria-modal="true" aria-label="Register Member">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Register Member</h2>
          <button
            type="button"
            className="btn secondary"
            onClick={() => !busy && onClose?.()}
            aria-label="Close"
            style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {err && <div className="alert error">{err}</div>}

        <form onSubmit={onSubmit}>
          <div className="form-grid">
            <div className="field">
              <label>Full Name *</label>
              <input value={form.fullName} onChange={(e) => setField('fullName', e.target.value)} required />
            </div>
            <div className="field">
              <label>Father / Husband Name *</label>
              <input value={form.fatherOrHusbandName} onChange={(e) => setField('fatherOrHusbandName', e.target.value)} required />
            </div>
            <div className="field">
              <label>CNIC * (XXXXX-XXXXXXX-X)</label>
              <input value={form.cnic} inputMode="numeric" maxLength={15}
                onChange={(e) => setField('cnic', formatCnic(e.target.value))} placeholder="42101-1234567-1" required />
              {cnicTaken
                ? <div className="error">A member with this CNIC already exists.</div>
                : isCompleteCnic(form.cnic) && cnicTaken === false
                  ? <div className="ok">✓ CNIC available</div>
                  : <span className="hint">Just type the 13 digits — dashes are added automatically.</span>}
            </div>
            <div className="field">
              <label>Phone *</label>
              <input value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="03001234567" required />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
            </div>
            <div className="field">
              <label>Date of Birth *</label>
              <input type="date" value={form.dateOfBirth} onChange={(e) => setField('dateOfBirth', e.target.value)} required />
            </div>
            <div className="field">
              <label>Gender *</label>
              <select value={form.gender} onChange={(e) => setField('gender', e.target.value)}>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
                <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
              </select>
            </div>
            <div className="field">
              <label>Blood Group</label>
              <select value={form.bloodGroup} onChange={(e) => setField('bloodGroup', e.target.value)}>
                <option value="">—</option>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div className="field full">
              <label>Address *</label>
              <input value={form.address} onChange={(e) => setField('address', e.target.value)} required />
            </div>

            <div className="field">
              <label>Province *</label>
              <select value={provinceId} onChange={(e) => setProvinceId(e.target.value)} required>
                <option value="">Select province</option>
                {provinces.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>District *</label>
              <select value={districtId} onChange={(e) => setDistrictId(e.target.value)} required disabled={!provinceId}>
                <option value="">Select district</option>
                {districts.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Area *</label>
              <select value={areaId} onChange={(e) => setAreaId(e.target.value)} required disabled={!districtId}>
                <option value="">Select area</option>
                {areas.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Basic Unit *</label>
              <select value={form.basicUnitId} onChange={(e) => setField('basicUnitId', e.target.value)} required disabled={!areaId}>
                <option value="">Select unit</option>
                {units.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
              </select>
            </div>

            <div className="field">
              <label>Education</label>
              <input value={form.education} onChange={(e) => setField('education', e.target.value)} />
            </div>
            <div className="field">
              <label>Occupation</label>
              <input value={form.occupation} onChange={(e) => setField('occupation', e.target.value)} />
            </div>

            <div className="field full">
              <label>Profile Photo</label>
              <input type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files[0])} />
              <span className="hint">JPEG / PNG / WebP, max 5 MB.</span>
            </div>
          </div>

          <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn secondary" type="button" onClick={() => !busy && onClose?.()} disabled={busy}>Cancel</button>
            <button className="btn" disabled={busy} type="submit">
              {busy ? 'Submitting…' : 'Submit for Approval'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
