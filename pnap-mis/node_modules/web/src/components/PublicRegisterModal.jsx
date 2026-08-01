import { useEffect, useMemo, useState } from 'react';
import { publicApi, publicErrorMessage } from '../api/publicClient';
import { useToast } from './Toast';
import { formatCnic, isCompleteCnic } from '../utils/formatters';

const CNIC_RX = /^\d{5}-\d{7}-\d$/;
const PHONE_RX = /^(\+92|0)?3\d{2}[- ]?\d{7}$/;
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const LANGUAGES = ['Urdu', 'English', 'Pashto', 'Sindhi', 'Punjabi', 'Balochi', 'Saraiki'];

const initialForm = {
  fullName: '',
  fatherOrHusbandName: '',
  cnic: '',
  phone: '',
  email: '',
  password: '',
  passwordConfirm: '',
  dateOfBirth: '',
  gender: 'MALE',
  address: '',
  basicUnitId: '',
  bloodGroup: '',
  education: '',
  occupation: '',
  dateJoined: '',
  languagesSpoken: [],
};

export default function PublicRegisterModal({ open, onClose }) {
  const toast = useToast();
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [units, setUnits] = useState([]);

  const [provinceId, setProvinceId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [areaId, setAreaId] = useState('');

  const [form, setForm] = useState(initialForm);
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [agree, setAgree] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [submitted, setSubmitted] = useState(null);
  // null = not checked, true = taken, false = available
  const [cnicTaken, setCnicTaken] = useState(null);

  useEffect(() => {
    if (!open) return;
    setErr('');
    setSubmitted(null);
    setForm(initialForm);
    setPhoto(null);
    setPhotoPreview('');
    setAgree(false);
    setProvinceId('');
    setDistrictId('');
    setAreaId('');
    publicApi.get('/provinces')
      .then((r) => setProvinces(r.data.data))
      .catch((ex) => setErr(`Could not load provinces: ${publicErrorMessage(ex)}`));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setDistricts([]); setAreas([]); setUnits([]);
    setDistrictId(''); setAreaId('');
    setForm((f) => ({ ...f, basicUnitId: '' }));
    if (!provinceId) return;
    publicApi.get('/districts', { params: { provinceId } })
      .then((r) => setDistricts(r.data.data))
      .catch((ex) => setErr(`Could not load districts: ${publicErrorMessage(ex)}`));
  }, [provinceId, open]);

  useEffect(() => {
    if (!open) return;
    setAreas([]); setUnits([]); setAreaId('');
    setForm((f) => ({ ...f, basicUnitId: '' }));
    if (!districtId) return;
    publicApi.get('/areas', { params: { districtId } })
      .then((r) => setAreas(r.data.data))
      .catch((ex) => setErr(`Could not load areas: ${publicErrorMessage(ex)}`));
  }, [districtId, open]);

  useEffect(() => {
    if (!open) return;
    setUnits([]);
    setForm((f) => ({ ...f, basicUnitId: '' }));
    if (!areaId) return;
    publicApi.get('/basic-units', { params: { areaId } })
      .then((r) => setUnits(r.data.data))
      .catch((ex) => setErr(`Could not load basic units: ${publicErrorMessage(ex)}`));
  }, [areaId, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape' && !busy) onClose?.(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  useEffect(() => {
    return () => { if (photoPreview) URL.revokeObjectURL(photoPreview); };
  }, [photoPreview]);

  // Live duplicate check — as soon as the 13th digit lands, ask the
  // public status endpoint whether this CNIC is already registered.
  // 200 → taken, 404 → available, other failures → unknown (server
  // still enforces uniqueness on submit).
  useEffect(() => {
    if (!isCompleteCnic(form.cnic)) { setCnicTaken(null); return; }
    let stale = false;
    publicApi.get('/status', { params: { cnic: form.cnic } })
      .then(() => { if (!stale) setCnicTaken(true); })
      .catch((ex) => { if (!stale) setCnicTaken(ex?.response?.status === 404 ? false : null); });
    return () => { stale = true; };
  }, [form.cnic]);

  const fieldErrors = useMemo(() => {
    const e = {};
    if (form.fullName && form.fullName.trim().length < 3) e.fullName = 'At least 3 characters';
    if (form.fatherOrHusbandName && form.fatherOrHusbandName.trim().length < 3) e.fatherOrHusbandName = 'At least 3 characters';
    if (form.cnic && !CNIC_RX.test(form.cnic)) e.cnic = 'Enter all 13 digits of your CNIC';
    if (cnicTaken) e.cnic = 'This CNIC is already registered. Use "Check status" to see your application.';
    if (form.phone && !PHONE_RX.test(form.phone)) e.phone = 'Use 03XX-XXXXXXX or +92 3XX XXXXXXX';
    if (form.dateOfBirth) {
      const dob = new Date(form.dateOfBirth);
      if (dob > new Date()) e.dateOfBirth = 'Date of birth must be in the past';
    }
    if (form.address && form.address.trim().length < 5) e.address = 'Please enter full address';
    if (form.password && form.password.length < 6) e.password = 'At least 6 characters';
    if (form.passwordConfirm && form.password !== form.passwordConfirm) e.passwordConfirm = 'Passwords do not match';
    return e;
  }, [form, cnicTaken]);

  if (!open) return null;

  function setField(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function toggleLanguage(lang) {
    setForm((f) => {
      const has = f.languagesSpoken.includes(lang);
      return {
        ...f,
        languagesSpoken: has
          ? f.languagesSpoken.filter((l) => l !== lang)
          : [...f.languagesSpoken, lang],
      };
    });
  }

  function onPhotoChange(file) {
    setPhoto(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(file ? URL.createObjectURL(file) : '');
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (Object.keys(fieldErrors).length) {
      setErr('Please fix the highlighted fields.');
      return;
    }
    if (!form.basicUnitId) {
      setErr('Please select your Province → District → Area → Basic Unit.');
      return;
    }
    if (!form.password || form.password.length < 6) {
      setErr('Set a password (at least 6 characters) so you can sign in later.');
      return;
    }
    if (form.password !== form.passwordConfirm) {
      setErr('Password and confirmation do not match.');
      return;
    }
    if (!agree) {
      setErr('You must accept the data-handling consent to register.');
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => {
        if (v == null || v === '') return;
        if (k === 'passwordConfirm') return; // client-side only
        if (Array.isArray(v)) v.forEach((item) => fd.append(`${k}[]`, item));
        else fd.append(k, v);
      });
      if (photo) fd.append('photo', photo);
      const res = await publicApi.post('/register', fd);
      setSubmitted(res.data.data);
      toast.success('Application received', { title: 'Submitted to local Basic Unit Secretary' });
    } catch (ex) {
      const msg = publicErrorMessage(ex);
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
      <div className="modal" style={{ maxWidth: 920 }} role="dialog" aria-modal="true" aria-label="Register as a member">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Become a Party Worker</h2>
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

        {submitted ? (
          <div>
            <p className="muted">
              Thank you, <strong>{submitted.fullName}</strong>. Your membership
              application has been recorded and sent to your local Basic Unit
              Secretary for approval.
            </p>
            <div className="alert success">
              <div><strong>Reference ID:</strong> {submitted._id}</div>
              <div><strong>Status:</strong> {submitted.status}</div>
              <div><strong>Submitted:</strong> {new Date(submitted.submittedAt).toLocaleString()}</div>
            </div>
            <p className="muted">Save your CNIC to check the status of your application later.</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn secondary" type="button" onClick={() => { setSubmitted(null); }}>
                Register another
              </button>
              <button className="btn" type="button" onClick={() => onClose?.()}>Done</button>
            </div>
          </div>
        ) : (
          <>
            <p className="muted" style={{ marginTop: 0 }}>
              Fill in this form to apply for PKNAP membership. Your application will be
              reviewed by the Secretary of your local Basic Unit. Fields marked
              <span style={{ color: 'var(--danger)' }}> *</span> are required.
            </p>

            {err && <div className="alert error">{err}</div>}

            <form onSubmit={onSubmit} noValidate>
              <h3 className="section-title">1. Personal Information</h3>
              <div className="form-grid">
                <div className="field">
                  <label>Full Name <span className="req">*</span></label>
                  <input value={form.fullName} onChange={(e) => setField('fullName', e.target.value)} required />
                  {fieldErrors.fullName && <div className="error">{fieldErrors.fullName}</div>}
                </div>
                <div className="field">
                  <label>Father / Husband Name <span className="req">*</span></label>
                  <input value={form.fatherOrHusbandName} onChange={(e) => setField('fatherOrHusbandName', e.target.value)} required />
                  {fieldErrors.fatherOrHusbandName && <div className="error">{fieldErrors.fatherOrHusbandName}</div>}
                </div>
                <div className="field">
                  <label>CNIC <span className="req">*</span></label>
                  <input value={form.cnic} placeholder="42101-1234567-1"
                    inputMode="numeric" maxLength={15}
                    onChange={(e) => setField('cnic', formatCnic(e.target.value))} required />
                  {fieldErrors.cnic
                    ? <div className="error">{fieldErrors.cnic}</div>
                    : isCompleteCnic(form.cnic) && cnicTaken === false
                      ? <div className="ok">✓ CNIC available</div>
                      : <span className="hint">Just type the 13 digits — dashes are added for you.</span>}
                </div>
                <div className="field">
                  <label>Mobile Phone <span className="req">*</span></label>
                  <input value={form.phone} placeholder="03001234567"
                    onChange={(e) => setField('phone', e.target.value)} required />
                  {fieldErrors.phone && <div className="error">{fieldErrors.phone}</div>}
                </div>
                <div className="field">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} />
                </div>
                <div className="field">
                  <label>Date of Birth <span className="req">*</span></label>
                  <input type="date" value={form.dateOfBirth} onChange={(e) => setField('dateOfBirth', e.target.value)} required />
                  {fieldErrors.dateOfBirth && <div className="error">{fieldErrors.dateOfBirth}</div>}
                </div>
                <div className="field">
                  <label>Gender <span className="req">*</span></label>
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
                    {BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}
                  </select>
                </div>
                <div className="field full">
                  <label>Residential Address <span className="req">*</span></label>
                  <input value={form.address} onChange={(e) => setField('address', e.target.value)} required />
                  {fieldErrors.address && <div className="error">{fieldErrors.address}</div>}
                </div>

                <div className="field">
                  <label>Password <span className="req">*</span></label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setField('password', e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                  />
                  {fieldErrors.password && <div className="error">{fieldErrors.password}</div>}
                  <span className="hint">You'll use this with your CNIC to sign in once approved.</span>
                </div>
                <div className="field">
                  <label>Confirm Password <span className="req">*</span></label>
                  <input
                    type="password"
                    value={form.passwordConfirm}
                    onChange={(e) => setField('passwordConfirm', e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="Re-enter password"
                  />
                  {fieldErrors.passwordConfirm && <div className="error">{fieldErrors.passwordConfirm}</div>}
                </div>
              </div>

              <h3 className="section-title">2. Organizational Mapping</h3>
              <div className="form-grid">
                <div className="field">
                  <label>Province <span className="req">*</span></label>
                  <select value={provinceId} onChange={(e) => setProvinceId(e.target.value)} required>
                    <option value="">Select province</option>
                    {provinces.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>District <span className="req">*</span></label>
                  <select value={districtId} onChange={(e) => setDistrictId(e.target.value)} required disabled={!provinceId}>
                    <option value="">{provinceId ? 'Select district' : 'Select province first'}</option>
                    {districts.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Area <span className="req">*</span></label>
                  <select value={areaId} onChange={(e) => setAreaId(e.target.value)} required disabled={!districtId}>
                    <option value="">{districtId ? 'Select area' : 'Select district first'}</option>
                    {areas.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Basic Unit <span className="req">*</span></label>
                  <select value={form.basicUnitId} onChange={(e) => setField('basicUnitId', e.target.value)} required disabled={!areaId}>
                    <option value="">{areaId ? 'Select unit' : 'Select area first'}</option>
                    {units.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                  </select>
                </div>
              </div>

              <h3 className="section-title">3. Background (optional)</h3>
              <div className="form-grid">
                <div className="field">
                  <label>Highest Education</label>
                  <input value={form.education} onChange={(e) => setField('education', e.target.value)} />
                </div>
                <div className="field">
                  <label>Occupation</label>
                  <input value={form.occupation} onChange={(e) => setField('occupation', e.target.value)} />
                </div>
                <div className="field">
                  <label>Date Joined Party (if previously associated)</label>
                  <input type="date" value={form.dateJoined} onChange={(e) => setField('dateJoined', e.target.value)} />
                </div>
                <div className="field full">
                  <label>Languages Spoken</label>
                  <div className="chip-row">
                    {LANGUAGES.map((l) => (
                      <label key={l} className={`chip ${form.languagesSpoken.includes(l) ? 'on' : ''}`}>
                        <input
                          type="checkbox"
                          checked={form.languagesSpoken.includes(l)}
                          onChange={() => toggleLanguage(l)}
                        />
                        {l}
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <h3 className="section-title">4. Profile Photo</h3>
              <div className="form-grid">
                <div className="field full photo-field">
                  {photoPreview && <img src={photoPreview} alt="preview" className="photo-preview" />}
                  <input type="file" accept="image/*" onChange={(e) => onPhotoChange(e.target.files?.[0] || null)} />
                  <span className="hint">JPEG / PNG / WebP, max 5 MB.</span>
                </div>
              </div>

              <div className="consent">
                <label>
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  <span>
                    I confirm the information above is true and I authorize PKNAP to
                    process my personal data for membership administration in
                    accordance with Pakistan Personal Data Protection rules.
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 18, justifyContent: 'flex-end' }}>
                <button className="btn secondary" type="button" onClick={() => !busy && onClose?.()} disabled={busy}>Cancel</button>
                <button className="btn" type="submit" disabled={busy}>
                  {busy ? 'Submitting…' : 'Submit Application'}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
