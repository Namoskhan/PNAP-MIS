import { useEffect, useState } from 'react';
import { useUnit } from '../context/UnitContext';
import { api } from '../api/client';

const LEVELS = [
  { code: 'CENTRAL', label: 'Central' },
  { code: 'PROVINCE', label: 'Province' },
  { code: 'DISTRICT', label: 'District' },
  { code: 'AREA', label: 'Area' },
  { code: 'BASIC_UNIT', label: 'Basic Unit' },
];

export default function UnitSwitcher() {
  const u = useUnit();
  const [level, setLevel] = useState(u.ctx?.unitLevel || 'BASIC_UNIT');
  const [provinceId, setProvinceId] = useState('');
  const [districtId, setDistrictId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [unitId, setUnitId] = useState('');
  const [unitName, setUnitName] = useState('');

  useEffect(() => {
    if (provinceId) u.loadDistricts(provinceId);
    setDistrictId(''); setAreaId(''); setUnitId('');
  }, [provinceId]);
  useEffect(() => {
    if (districtId) u.loadAreas(districtId);
    setAreaId(''); setUnitId('');
  }, [districtId]);
  useEffect(() => {
    if (areaId) u.loadUnits(areaId);
    setUnitId('');
  }, [areaId]);

  async function apply() {
    if (level === 'CENTRAL') {
      // Resolve the real Central singleton ObjectId so CabinetSlot /
      // RoleAssignment / Permanent Member queries find the right rows.
      try {
        const r = await api.get('/org/central');
        return u.setCtx({ unitLevel: 'CENTRAL', unitId: r.data.data._id, unitName: r.data.data.name || 'PKNAP Central' });
      } catch {
        return;
      }
    }
    let id = null, name = '';
    if (level === 'PROVINCE') { id = provinceId; name = u.provinces.find((p) => p._id === id)?.name; }
    if (level === 'DISTRICT') { id = districtId; name = u.districts.find((d) => d._id === id)?.name; }
    if (level === 'AREA') { id = areaId; name = u.areas.find((a) => a._id === id)?.name; }
    if (level === 'BASIC_UNIT') { id = unitId; name = u.units.find((b) => b._id === id)?.name; }
    if (!id) return;
    u.setCtx({ unitLevel: level, unitId: id, unitName: name || unitName });
  }

  return (
    <div className="unit-switcher card">
      <h3 style={{ marginTop: 0 }}>Unit Context</h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Choose which unit you want to operate in. All meeting / activity / finance
        records you create will be owned by this unit.
      </p>
      <div className="form-grid">
        <div className="field">
          <label>Level</label>
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVELS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        {['PROVINCE','DISTRICT','AREA','BASIC_UNIT'].includes(level) && (
          <div className="field">
            <label>Province</label>
            <select value={provinceId} onChange={(e) => setProvinceId(e.target.value)}>
              <option value="">Select province</option>
              {u.provinces.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
          </div>
        )}
        {['DISTRICT','AREA','BASIC_UNIT'].includes(level) && (
          <div className="field">
            <label>District</label>
            <select value={districtId} onChange={(e) => setDistrictId(e.target.value)} disabled={!provinceId}>
              <option value="">Select district</option>
              {u.districts.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
          </div>
        )}
        {['AREA','BASIC_UNIT'].includes(level) && (
          <div className="field">
            <label>Area</label>
            <select value={areaId} onChange={(e) => setAreaId(e.target.value)} disabled={!districtId}>
              <option value="">Select area</option>
              {u.areas.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
            </select>
          </div>
        )}
        {level === 'BASIC_UNIT' && (
          <div className="field">
            <label>Basic Unit</label>
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} disabled={!areaId}>
              <option value="">Select unit</option>
              {u.units.map((b) => <option key={b._id} value={b._id}>{b.name}</option>)}
            </select>
          </div>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="btn" onClick={apply}>Apply</button>
        {u.ctx && (
          <span style={{ marginLeft: 12, color: 'var(--muted)' }}>
            Currently: <strong>{u.ctx.unitLevel}</strong> · {u.ctx.unitName}
          </span>
        )}
      </div>
    </div>
  );
}
