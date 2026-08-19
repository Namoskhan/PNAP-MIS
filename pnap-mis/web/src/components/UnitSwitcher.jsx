import { useEffect, useMemo, useState } from 'react';
import { useUnit } from '../context/UnitContext';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { homeTierOf } from '../utils/unitTier';

// Unit Context switcher.
//
// The hierarchy rule: you may operate at your own tier or ANY tier
// BELOW it, never above. A District Admin works in their district, its
// areas and their basic units — not in the province that contains them.
//
// This used to offer all five levels to everybody. Combined with the
// fact that most unit-addressed endpoints did not check territorial
// scope, a District Admin could select "Province", pick the province
// they sit in, and read its finance summary and executive directory.
// The server now rejects that (middleware/unitScopeGuard); this list is
// the matching client half, so the option is never offered rather than
// offered and then refused.
//
// Note this is a convenience boundary, NOT the security boundary. The
// server does not trust it.

const LEVELS = [
  { code: 'CENTRAL', label: 'Central' },
  { code: 'PROVINCE', label: 'Province' },
  { code: 'DISTRICT', label: 'District' },
  { code: 'AREA', label: 'Area' },
  { code: 'BASIC_UNIT', label: 'Basic Unit' },
];

export default function UnitSwitcher() {
  const u = useUnit();
  const { user } = useAuth();

  const home = useMemo(() => homeTierOf(user), [user]);
  // Own tier and everything beneath it.
  const allowedLevels = useMemo(() => {
    const start = LEVELS.findIndex((l) => l.code === home.level);
    return LEVELS.slice(start < 0 ? 0 : start);
  }, [home.level]);

  const [level, setLevel] = useState(() => {
    const current = u.ctx?.unitLevel;
    const ok = LEVELS.findIndex((l) => l.code === current) >= LEVELS.findIndex((l) => l.code === home.level);
    return ok && current ? current : home.level;
  });
  const [provinceId, setProvinceId] = useState(home.fixed.provinceId || '');
  const [districtId, setDistrictId] = useState(home.fixed.districtId || '');
  const [areaId, setAreaId] = useState(home.fixed.areaId || '');
  const [unitId, setUnitId] = useState('');
  const [err, setErr] = useState('');

  // A level above the user's tier can never be selected. Guard the
  // setter too, so a stale ctx or a hand-edited option cannot leave the
  // control in a state the Apply handler would then act on.
  function chooseLevel(next) {
    if (!allowedLevels.some((l) => l.code === next)) return;
    setErr('');
    setLevel(next);
  }

  // Cascade. A fixed segment is never cleared — clearing the district a
  // District Admin is pinned to would empty the Area list and make the
  // card look broken.
  useEffect(() => {
    if (provinceId) u.loadDistricts(provinceId);
    if (!home.fixed.districtId) { setDistrictId(''); setAreaId(''); setUnitId(''); }
  }, [provinceId]);
  useEffect(() => {
    if (districtId) u.loadAreas(districtId);
    if (!home.fixed.areaId) { setAreaId(''); setUnitId(''); }
  }, [districtId]);
  useEffect(() => {
    if (areaId) u.loadUnits(areaId);
    setUnitId('');
  }, [areaId]);

  async function apply() {
    setErr('');
    if (!allowedLevels.some((l) => l.code === level)) {
      setErr('That level is above your own tier.');
      return;
    }
    if (level === 'CENTRAL') {
      try {
        const r = await api.get('/org/central');
        return u.setCtx({
          unitLevel: 'CENTRAL',
          unitId: r.data.data._id,
          unitName: r.data.data.name || 'PKNAP Central',
        });
      } catch {
        setErr('Could not resolve the Central unit.');
        return;
      }
    }
    let id = null, name = '';
    if (level === 'PROVINCE') { id = provinceId; name = u.provinces.find((p) => p._id === id)?.name; }
    if (level === 'DISTRICT') { id = districtId; name = u.districts.find((d) => d._id === id)?.name; }
    if (level === 'AREA') { id = areaId; name = u.areas.find((a) => a._id === id)?.name; }
    if (level === 'BASIC_UNIT') { id = unitId; name = u.units.find((b) => b._id === id)?.name; }
    if (!id) { setErr('Select a unit first.'); return; }
    u.setCtx({ unitLevel: level, unitId: id, unitName: name || '' });
  }

  // A segment the user is pinned to renders as a locked select rather
  // than being hidden: seeing "District: Charsadda (your district)" is
  // clearer than a form that silently has fewer fields than a
  // colleague's.
  const lock = {
    province: Boolean(home.fixed.provinceId),
    district: Boolean(home.fixed.districtId),
    area: Boolean(home.fixed.areaId),
  };

  return (
    <div className="unit-switcher card">
      <h3 style={{ marginTop: 0 }}>Unit Context</h3>
      <p className="hint" style={{ marginTop: 0 }}>
        Choose which unit you want to operate in. All meeting / activity / finance
        records you create will be owned by this unit.
        {home.level !== 'CENTRAL' && ' You can work at your own tier or any tier beneath it.'}
      </p>
      {err && <div className="alert error" style={{ marginBottom: 10 }}>{err}</div>}
      <div className="form-grid">
        <div className="field">
          <label>Level</label>
          <select value={level} onChange={(e) => chooseLevel(e.target.value)}>
            {allowedLevels.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
          </select>
        </div>
        {['PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'].includes(level) && (
          <div className="field">
            <label>Province</label>
            <select
              value={provinceId}
              onChange={(e) => setProvinceId(e.target.value)}
              disabled={lock.province}
            >
              <option value="">Select province</option>
              {u.provinces.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
            </select>
            {lock.province && <div className="hint">Your province.</div>}
          </div>
        )}
        {['DISTRICT', 'AREA', 'BASIC_UNIT'].includes(level) && (
          <div className="field">
            <label>District</label>
            <select
              value={districtId}
              onChange={(e) => setDistrictId(e.target.value)}
              disabled={lock.district || !provinceId}
            >
              <option value="">Select district</option>
              {u.districts.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
            </select>
            {lock.district && <div className="hint">Your district.</div>}
          </div>
        )}
        {['AREA', 'BASIC_UNIT'].includes(level) && (
          <div className="field">
            <label>Area</label>
            <select
              value={areaId}
              onChange={(e) => setAreaId(e.target.value)}
              disabled={lock.area || !districtId}
            >
              <option value="">Select area</option>
              {u.areas.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
            </select>
            {lock.area && <div className="hint">Your area.</div>}
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
