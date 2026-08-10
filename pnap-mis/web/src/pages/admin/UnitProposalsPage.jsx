import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../components/Toast';

import dialog from '../../components/dialog';
const TARGETS = [
  { code: 'BASIC_UNIT', label: 'Basic Unit', parent: 'Area' },
  { code: 'AREA', label: 'Area / Elaqayi', parent: 'District' },
  { code: 'DISTRICT', label: 'District / Zilla', parent: 'Province' },
  { code: 'PROVINCE', label: 'Province / Subah', parent: '—' },
];

export default function UnitProposalsPage() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [stateFilter, setStateFilter] = useState('PENDING');

  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);

  const [form, setForm] = useState({
    targetLevel: 'BASIC_UNIT', name: '', code: '', parentId: '',
    boundaryDescription: '', note: '',
  });
  const [provinceId, setProvinceId] = useState('');
  const [districtId, setDistrictId] = useState('');

  async function reload() {
    const r = await api.get('/unit-proposals', { params: { state: stateFilter || undefined } });
    setItems(r.data.data);
  }
  useEffect(() => { reload(); }, [stateFilter]);

  useEffect(() => {
    api.get('/org/provinces').then((r) => setProvinces(r.data.data));
  }, []);
  useEffect(() => {
    setDistricts([]); setAreas([]); setDistrictId('');
    setForm((f) => ({ ...f, parentId: '' }));
    if (!provinceId) return;
    api.get('/org/districts', { params: { provinceId } }).then((r) => setDistricts(r.data.data));
  }, [provinceId]);
  useEffect(() => {
    setAreas([]);
    setForm((f) => ({ ...f, parentId: '' }));
    if (!districtId) return;
    api.get('/org/areas', { params: { districtId } }).then((r) => setAreas(r.data.data));
  }, [districtId]);

  function parentDropdown() {
    if (form.targetLevel === 'BASIC_UNIT') {
      return (
        <>
          <div className="field">
            <label>Province</label>
            <select value={provinceId} onChange={(e) => setProvinceId(e.target.value)}>
              <option value="">Select</option>
              {provinces.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>District</label>
            <select value={districtId} onChange={(e) => setDistrictId(e.target.value)} disabled={!provinceId}>
              <option value="">Select</option>
              {districts.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Parent Area</label>
            <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} disabled={!districtId}>
              <option value="">Select</option>
              {areas.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
            </select>
          </div>
        </>
      );
    }
    if (form.targetLevel === 'AREA') {
      return (
        <>
          <div className="field">
            <label>Province</label>
            <select value={provinceId} onChange={(e) => setProvinceId(e.target.value)}>
              <option value="">Select</option>
              {provinces.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Parent District</label>
            <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })} disabled={!provinceId}>
              <option value="">Select</option>
              {districts.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
        </>
      );
    }
    if (form.targetLevel === 'DISTRICT') {
      return (
        <div className="field">
          <label>Parent Province</label>
          <select value={form.parentId} onChange={(e) => setForm({ ...form, parentId: e.target.value })}>
            <option value="">Select</option>
            {provinces.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        </div>
      );
    }
    return null;
  }

  async function submit() {
    try {
      const name = form.name;
      await api.post('/unit-proposals', form);
      setForm({ targetLevel: form.targetLevel, name: '', code: '', parentId: '', boundaryDescription: '', note: '' });
      setProvinceId(''); setDistrictId('');
      reload();
      toast.success(
        `"${name}" proposed. Awaiting approval from the next level above.`,
        { title: 'Unit proposed', duration: 7000 }
      );
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Could not propose unit', duration: 7000 });
    }
  }

  async function decide(id, decision) {
    const note = decision === 'REJECTED' || decision === 'REVISION_REQUESTED'
      ? await dialog.prompt('Note for the proposer:') || ''
      : '';
    try {
      await api.post(`/unit-proposals/${id}/decide`, { decision, decisionNote: note });
      reload();
      toast.success(`Proposal ${decision.toLowerCase().replace(/_/g, ' ')}.`);
    } catch (e) {
      toast.error(errorMessage(e), { title: 'Could not record decision', duration: 7000 });
    }
  }

  return (
    <div>
      <div className="page-header"><h2>Org Structure — Unit Proposals</h2></div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Propose a New Unit</h3>
        <div className="form-grid">
          <div className="field">
            <label>Target Level</label>
            <select value={form.targetLevel} onChange={(e) => {
              setForm({ targetLevel: e.target.value, name: '', code: '', parentId: '', boundaryDescription: '', note: '' });
              setProvinceId(''); setDistrictId('');
            }}>
              {TARGETS.map((t) => <option key={t.code} value={t.code}>{t.label}</option>)}
            </select>
          </div>
          {parentDropdown()}
          <div className="field">
            <label>Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          {(form.targetLevel === 'DISTRICT' || form.targetLevel === 'PROVINCE') && (
            <div className="field">
              <label>Code (e.g. KHE, SD)</label>
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />
            </div>
          )}
          <div className="field full">
            <label>Boundary / Coverage Description</label>
            <input value={form.boundaryDescription} onChange={(e) => setForm({ ...form, boundaryDescription: e.target.value })} />
          </div>
          <div className="field full">
            <label>Note for Approver</label>
            <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
        </div>
        <button className="btn" style={{ marginTop: 10 }} onClick={submit}>Submit Proposal</button>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Proposals</h3>
        <div className="toolbar">
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">All</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="REVISION_REQUESTED">Revision Requested</option>
          </select>
        </div>
        <table className="list">
          <thead>
            <tr>
              <th>Level</th><th>Name</th><th>Parent</th>
              <th>Proposed By</th><th>State</th><th>Created</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan="7" className="muted">No proposals.</td></tr>}
            {items.map((p) => (
              <tr key={p._id}>
                <td>{p.targetLevel}</td>
                <td>{p.name}{p.code ? ` (${p.code})` : ''}</td>
                <td>
                  {p.parentAreaId?.name || p.parentDistrictId?.name || p.parentProvinceId?.name || '—'}
                </td>
                <td>{p.proposedBy?.fullName}</td>
                <td><span className={`badge ${p.state}`}>{p.state}</span></td>
                <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                <td>
                  {(p.state === 'PENDING' || p.state === 'REVISION_REQUESTED') && (
                    <>
                      <button className="btn" onClick={() => decide(p._id, 'APPROVED')}>Approve</button>{' '}
                      <button className="btn warning" onClick={() => decide(p._id, 'REVISION_REQUESTED')}>Revise</button>{' '}
                      <button className="btn danger" onClick={() => decide(p._id, 'REJECTED')}>Reject</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
