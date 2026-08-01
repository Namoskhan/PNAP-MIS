import { useEffect, useMemo, useRef, useState } from 'react';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import {
  hasRole, isHigherAdmin, isSecretaryOnly,
  isPresidentPersona, isOperatorPersona, roleLabel,
} from '../../utils/permissions';
import { api, errorMessage } from '../../api/client';

const ROLE_LABEL = {
  SECRETARY: 'Secretary',
  SENIOR_MAWIN: 'Senior Mawin Secretary',
  FINANCE_SECRETARY: 'Finance Secretary',
  PRESS_SECRETARY: 'Press Secretary',
  CULTURE_SECRETARY: 'Culture Secretary',
  SPORTS_SECRETARY: 'Sports Secretary',
  GENERAL_SECRETARY: 'General Secretary (Secretary General)',
  FIRST_SECRETARY: 'First Secretary',
  PRESIDENT: 'President / Saddar',
  VICE_PRESIDENT: 'Vice President',
  SR_VICE_PRESIDENT: 'Senior Vice President',
  CHAIRMAN: 'Chairman',
  CO_CHAIRMAN: 'Co-Chairman',
  VICE_CHAIRMAN: 'Vice Chairman',
  SR_VICE_CHAIRMAN: 'Senior Vice Chairman',
  OTHER: 'Other',
};

export default function CabinetPage() {
  const { ctx, setCtx } = useUnit();
  const { user } = useAuth();
  const [cabinet, setCabinet] = useState([]);
  const [pending, setPending] = useState([]);
  const [members, setMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [assignFor, setAssignFor] = useState(null); // roleCode being assigned
  const [pickedMemberId, setPickedMemberId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  // "Other / custom" role state (the 7th category in the SRS template).
  const [showCustom, setShowCustom] = useState(false);
  const [customMemberId, setCustomMemberId] = useState('');
  const [customRoleName, setCustomRoleName] = useState('');
  // Custom-role mode: 'catalog' picks from Role Management, 'freeform'
  // accepts a one-off typed name (legacy "Other" path).
  const [customMode, setCustomMode] = useState('catalog');
  const [pickedCatalogCode, setPickedCatalogCode] = useState('');

  // Catalog of dynamically-defined roles from Role Management. Anyone
  // authenticated may read this list (the catalog endpoint returns
  // labels + codes — only writes are Super-locked). Filtered here to
  // non-built-in active roles for the assignment dropdown.
  const [catalogRoles, setCatalogRoles] = useState([]);
  useEffect(() => {
    api.get('/admin/roles').then((r) => {
      const data = r.data.data;
      const list = Array.isArray(data) ? data : (data?.roles || []);
      setCatalogRoles(list.filter((x) => !x.isSystem && x.isActive));
    }).catch(() => setCatalogRoles([]));
  }, []);

  // Inline picker so the Area Admin can switch between their area's
  // own cabinet and the cabinet of any basic unit under it without
  // hunting for a sidebar widget. List is fetched once the user is
  // known and re-used for both the picker and the unit-name labels.
  const [areaName, setAreaName] = useState('');
  const [basicUnitsInArea, setBasicUnitsInArea] = useState([]);
  useEffect(() => {
    if (!user?.scope?.areaId) return;
    api.get('/org/areas', { params: { districtId: user.scope.districtId } })
      .then((r) => {
        const a = r.data.data.find((x) => String(x._id) === String(user.scope.areaId));
        if (a) setAreaName(a.name);
      })
      .catch(() => {});
    api.get('/org/basic-units', { params: { areaId: user.scope.areaId } })
      .then((r) => setBasicUnitsInArea(r.data.data))
      .catch(() => {});
  }, [user]);

  // District Admin picker — list every Area in their district. They
  // assign the Area cabinet (Elaqai executive) for any of these.
  const [areasInDistrict, setAreasInDistrict] = useState([]);
  const isDistrictAdminUser = user?.roles?.includes('DISTRICT_ADMIN') &&
    !user.roles.includes('SUPER_ADMIN') &&
    !user.roles.includes('PROVINCE_ADMIN');
  useEffect(() => {
    if (!isDistrictAdminUser || !user?.scope?.districtId) return;
    api.get('/org/areas', { params: { districtId: user.scope.districtId } })
      .then((r) => setAreasInDistrict(r.data.data))
      .catch(() => {});
  }, [user, isDistrictAdminUser]);

  // Province Admin picker — list every District in their province.
  // They assign the District cabinet (Zilla executive) for any of
  // these. Same shape as District-Admin's area picker.
  const [districtsInProvince, setDistrictsInProvince] = useState([]);
  const isProvinceAdminUser = user?.roles?.includes('PROVINCE_ADMIN') &&
    !user.roles.includes('SUPER_ADMIN');
  useEffect(() => {
    if (!isProvinceAdminUser || !user?.scope?.provinceId) return;
    api.get('/org/districts', { params: { provinceId: user.scope.provinceId } })
      .then((r) => setDistrictsInProvince(r.data.data))
      .catch(() => {});
  }, [user, isProvinceAdminUser]);

  // Super Admin picker — list every Province. Super Admin assigns
  // the Province cabinet (Sobayi executive) per SRS §3.3 for any of
  // these and also manages the Central Cabinet per SRS §3.4.
  const [allProvinces, setAllProvinces] = useState([]);
  const [centralUnit, setCentralUnit] = useState(null);
  const isCentralAdminUser = user?.roles?.includes('SUPER_ADMIN');
  useEffect(() => {
    if (!isCentralAdminUser) return;
    api.get('/org/provinces')
      .then((r) => setAllProvinces(r.data.data))
      .catch(() => {});
    api.get('/org/central')
      .then((r) => setCentralUnit(r.data.data))
      .catch(() => {});
  }, [user, isCentralAdminUser]);

  // Read-only "Area Cabinets in this district" panel — when ctx is at
  // DISTRICT level, fetch each area + its cabinet so the Province
  // Admin can see the existing area-level executives at a glance.
  const [areaCabinetsBelow, setAreaCabinetsBelow] = useState([]);
  useEffect(() => {
    if (!ctx || ctx.unitLevel !== 'DISTRICT') { setAreaCabinetsBelow([]); return; }
    let cancelled = false;
    api.get('/org/areas', { params: { districtId: ctx.unitId } })
      .then(async (r) => {
        const areas = r.data.data || [];
        const rows = await Promise.all(areas.map(async (a) => {
          try {
            const cab = await api.get('/roles/cabinet', { params: { unitLevel: 'AREA', unitId: a._id } });
            return { area: a, cabinet: (cab.data.data || []).filter((row) => row.state === 'FILLED') };
          } catch { return { area: a, cabinet: [] }; }
        }));
        if (!cancelled) setAreaCabinetsBelow(rows);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ctx]);

  // Read-only "Basic Unit Cabinets in this area" panel — analogous
  // to the District-level panel above. Lets the Area Secretary /
  // Senior Mawin / Area Admin see the BU executives below them at
  // a glance.
  const [buCabinetsBelow, setBuCabinetsBelow] = useState([]);
  useEffect(() => {
    if (!ctx || ctx.unitLevel !== 'AREA') { setBuCabinetsBelow([]); return; }
    let cancelled = false;
    api.get('/org/basic-units', { params: { areaId: ctx.unitId } })
      .then(async (r) => {
        const units = r.data.data || [];
        const rows = await Promise.all(units.map(async (u) => {
          try {
            const cab = await api.get('/roles/cabinet', { params: { unitLevel: 'BASIC_UNIT', unitId: u._id } });
            return { unit: u, cabinet: (cab.data.data || []).filter((row) => row.state === 'FILLED') };
          } catch { return { unit: u, cabinet: [] }; }
        }));
        if (!cancelled) setBuCabinetsBelow(rows);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ctx]);

  function pickUnit(value) {
    if (!value) return;
    if (value === 'AREA') {
      setCtx({
        unitLevel: 'AREA',
        unitId: user.scope.areaId,
        unitName: areaName || 'My Area',
      });
    } else {
      const u = basicUnitsInArea.find((b) => String(b._id) === value);
      if (u) {
        setCtx({ unitLevel: 'BASIC_UNIT', unitId: u._id, unitName: u.name });
      }
    }
  }

  // Latest-fetch guard — drop stale cabinet/pending responses from
  // a previous ctx so drilling between subordinates doesn't show
  // mismatched data.
  const fetchIdRef = useRef(0);

  async function reload() {
    if (!ctx) return;
    const myId = ++fetchIdRef.current;
    const params = { unitLevel: ctx.unitLevel, unitId: ctx.unitId };
    const [c, p] = await Promise.all([
      api.get('/roles/cabinet', { params }),
      api.get('/roles', { params: { ...params, state: 'PROPOSED' } }),
    ]);
    if (myId !== fetchIdRef.current) return;
    setCabinet(c.data.data);
    setPending(p.data.data);
  }

  useEffect(() => {
    if (!ctx) return;
    reload();
    // Eligible members are scoped strictly to the currently-selected
    // unit. So when the picker is on "Basic Unit: abc1", only members
    // whose basicUnitId === abc1 appear; switching to "My Area"
    // widens to everyone in the area; etc.
    const params = { status: 'ACTIVE', limit: 200 };
    if (ctx.unitLevel === 'BASIC_UNIT') params.basicUnitId = ctx.unitId;
    else if (ctx.unitLevel === 'AREA') params.areaId = ctx.unitId;
    else if (ctx.unitLevel === 'DISTRICT') params.districtId = ctx.unitId;
    else if (ctx.unitLevel === 'PROVINCE') params.provinceId = ctx.unitId;
    // Central has no unit key of its own on Member — every member is
    // eligible for a Central seat (Chairman, Co-Chairman, Sr./Vice
    // Chairman, First Secretary). scope:'all' is the explicit opt-in
    // the members endpoint requires when no unit filter is sent.
    else if (ctx.unitLevel === 'CENTRAL') params.scope = 'all';
    api.get('/members', { params })
      .then((r) => setMembers(r.data.data))
      .catch((e) => setErr(errorMessage(e)));
  }, [ctx, user]);

  // Local typed filter for the assignment dropdown — quickly find
  // a member by name / CNIC / Member ID without re-querying.
  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const q = memberSearch.trim().toLowerCase();
    return members.filter((m) =>
      (m.fullName || '').toLowerCase().includes(q) ||
      (m.cnic || '').toLowerCase().includes(q) ||
      (m.memberId || '').toLowerCase().includes(q) ||
      (m.phone || '').toLowerCase().includes(q)
    );
  }, [memberSearch, members]);

  async function propose(roleCode, memberId) {
    setErr(''); setMsg(''); setBusy(true);
    try {
      // Single-shot assign: propose then immediately approve. Admins
      // can do both since canInitiateRole + canApprove cover them.
      const r = await api.post('/roles', {
        unitLevel: ctx.unitLevel,
        unitId: ctx.unitId,
        memberId,
        roleCode,
      });
      await api.post(`/roles/${r.data.data._id}/decide`, { decision: 'APPROVED' });
      setMsg(`${ROLE_LABEL[roleCode] || roleLabel(user, roleCode)} assigned. The member can now log in with their CNIC.`);
      setAssignFor(null);
      setPickedMemberId('');
      await reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally { setBusy(false); }
  }

  async function decide(id, decision) {
    if (!confirm(`Confirm ${decision}?`)) return;
    try {
      await api.post(`/roles/${id}/decide`, { decision });
      await reload();
    } catch (e) { alert(errorMessage(e)); }
  }

  async function proposeCustom() {
    if (!customMemberId) {
      setErr('Pick a member first.'); return;
    }
    let payload;
    if (customMode === 'catalog') {
      const cat = catalogRoles.find((c) => c.code === pickedCatalogCode);
      if (!cat) { setErr('Pick a custom role from the catalog.'); return; }
      payload = {
        unitLevel: ctx.unitLevel,
        unitId: ctx.unitId,
        memberId: customMemberId,
        // Use the catalog's actual code so the dynamic permission
        // resolver carries the role's grants through to the member's
        // User.roles on next login.
        roleCode: cat.code,
        // Stash the human label too so the cabinet view can display
        // it as "Custom · <Label>" without a second lookup.
        customRoleName: cat.label,
      };
    } else {
      if (!customRoleName.trim()) { setErr('Type a role name.'); return; }
      payload = {
        unitLevel: ctx.unitLevel,
        unitId: ctx.unitId,
        memberId: customMemberId,
        roleCode: 'OTHER',
        customRoleName: customRoleName.trim(),
      };
    }
    setErr(''); setMsg(''); setBusy(true);
    try {
      const r = await api.post('/roles', payload);
      await api.post(`/roles/${r.data.data._id}/decide`, { decision: 'APPROVED' });
      setMsg(`Custom role "${payload.customRoleName}" assigned.`);
      setShowCustom(false);
      setCustomMemberId('');
      setCustomRoleName('');
      setPickedCatalogCode('');
      await reload();
    } catch (e) {
      setErr(errorMessage(e));
    } finally { setBusy(false); }
  }

  async function endRole(assignmentId) {
    const reason = prompt('End reason (RESIGNED, EXPELLED, TERM_ENDED, TRANSFERRED, DECEASED, REPLACED):');
    if (!reason) return;
    try {
      await api.post(`/roles/${assignmentId}/end`, { endReason: reason.toUpperCase() });
      await reload();
    } catch (e) { alert(errorMessage(e)); }
  }

  if (!ctx) return <p>Select a unit context first.</p>;

  // Picker is shown for the AREA_ADMIN so they can switch between
  // their area-cabinet and any basic unit beneath it. SENIOR_MAWIN
  // is intentionally excluded — their unit is fixed (the unit they
  // hold the SENIOR_MAWIN assignment in). Higher admins use the
  // global UnitSwitcher on the dashboard.
  const roles = user?.roles || [];
  const hasHigherAdmin = ['SUPER_ADMIN','PROVINCE_ADMIN','DISTRICT_ADMIN']
    .some((r) => roles.includes(r));
  const showAreaPicker = !!user?.scope?.areaId &&
    roles.includes('AREA_ADMIN') &&
    !hasHigherAdmin;
  // Province Admin's picker shows when they're the only writable
  // admin role on the user (mirroring District Admin pattern).
  const showProvincePicker = isProvinceAdminUser && !roles.includes('SUPER_ADMIN');
  // Central Admin's picker — assign Province Cabinet roles per SRS
  // §3.3 + §5.1 ("province will be structured by the Central Admin").
  const showCentralPicker = isCentralAdminUser;
  // Secretary (and higher admin) can assign roles directly via the
  // existing single-shot assign flow OR approve proposals raised by
  // Senior Mawin. SECRETARY-only users see read-only cabinet rows
  // plus the Pending Approvals section. Initiator-only users
  // (SENIOR_MAWIN) are blocked from the inline Assign UI but their
  // route is via this page for role proposals.
  // Persona detection — single source of truth in utils/permissions.js.
  // Secretary-only is view-only on the Cabinet page per product
  // directive. Higher admins, AREA_ADMIN, operator personas and the
  // GENERAL_SECRETARY (per directive) keep their write powers.
  const secretaryReadOnly = isSecretaryOnly(user);
  const isGeneralSec = hasRole(user, 'GENERAL_SECRETARY')
    && !isHigherAdmin(user) && !hasRole(user, 'AREA_ADMIN');
  // Senior Mawin and General Secretary now have full assign powers
  // alongside higher admins / Area Admin / Secretary.
  const isSeniorMawinAssigner = hasRole(user, 'SENIOR_MAWIN');
  const canAssignDirectly = (isHigherAdmin(user)
    || hasRole(user, 'AREA_ADMIN', 'SECRETARY')
    || isGeneralSec
    || isSeniorMawinAssigner) && !secretaryReadOnly;
  // Senior-Mawin-style operator persona — uses the inline assign
  // path but doesn't need the verbose helper copy.
  const isSeniorMawinOp = isOperatorPersona(user);
  // President-style personas (PRESIDENT / SR_VP / VP / GS / Chairman
  // variants) — read-mostly sidebar; inline Pending approvals card
  // on the cabinet page is hidden for all of them.
  const isPresidentOnly = isPresidentPersona(user);

  return (
    <div>
      <div className="page-header"><h2>Cabinet · {ctx.unitName}</h2></div>

      {showCentralPicker && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 600 }}>Central Cabinet (SRS §3.4):</label>
            <button
              type="button"
              className={`btn ${ctx.unitLevel === 'CENTRAL' ? '' : 'secondary'}`}
              disabled={!centralUnit}
              onClick={() => centralUnit && setCtx({ unitLevel: 'CENTRAL', unitId: centralUnit._id, unitName: centralUnit.name || 'PKNAP Central' })}
            >
              {ctx.unitLevel === 'CENTRAL' ? '✓ Open: Central Cabinet' : 'Open Central Cabinet'}
            </button>
            <span className="muted" style={{ fontSize: 13 }}>
              Assign the Central Executive (Chairman, Co-Chairman, Sr.&nbsp;Vice Chairman, Vice Chairman, Secretary General, First Secretary, Finance Secretary, etc.) — auto-forms the Central Committee + unlocks the Qomi Jirga tab on first approval.
            </span>
          </div>
        </div>
      )}

      {showProvincePicker && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 600 }}>Assign District Cabinet for:</label>
            <select
              value={ctx.unitLevel === 'DISTRICT' ? String(ctx.unitId) : ''}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                const d = districtsInProvince.find((x) => String(x._id) === id);
                if (d) setCtx({ unitLevel: 'DISTRICT', unitId: d._id, unitName: d.name });
              }}
              style={{ minWidth: 280 }}
            >
              <option value="">— pick a district in your province —</option>
              {districtsInProvince.length === 0 && <option disabled>(no districts yet)</option>}
              {districtsInProvince.map((d) => (
                <option key={d._id} value={String(d._id)}>{d.name}{d.code ? ` (${d.code})` : ''}</option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: 13 }}>
              Pick a District to assign its Zilla cabinet (Secretary, Senior Mawin Sec., Finance Sec., etc.).
              Members shown are everyone registered under any area/BU within that district.
            </span>
          </div>
        </div>
      )}

      {isDistrictAdminUser && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 600 }}>Assign Area Cabinet for:</label>
            <select
              value={ctx.unitLevel === 'AREA' ? String(ctx.unitId) : ''}
              onChange={(e) => {
                const id = e.target.value;
                if (!id) return;
                const a = areasInDistrict.find((x) => String(x._id) === id);
                if (a) setCtx({ unitLevel: 'AREA', unitId: a._id, unitName: a.name });
              }}
              style={{ minWidth: 280 }}
            >
              <option value="">— pick an area in your district —</option>
              {areasInDistrict.length === 0 && <option disabled>(no areas yet)</option>}
              {areasInDistrict.map((a) => (
                <option key={a._id} value={String(a._id)}>{a.name}</option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: 13 }}>
              Pick an Area to assign its Elaqai (Area) cabinet. Members shown are those registered under that area.
            </span>
          </div>
        </div>
      )}

      {showAreaPicker && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 600 }}>Cabinet for:</label>
            <select
              value={
                ctx.unitLevel === 'AREA' && String(ctx.unitId) === String(user.scope.areaId)
                  ? 'AREA'
                  : ctx.unitLevel === 'BASIC_UNIT'
                    ? String(ctx.unitId)
                    : ''
              }
              onChange={(e) => pickUnit(e.target.value)}
              style={{ minWidth: 280 }}
            >
              <option value="AREA">My Area: {areaName || 'My Area'} (area cabinet)</option>
              <optgroup label="Basic Units in my area">
                {basicUnitsInArea.length === 0 && <option disabled>(no basic units yet)</option>}
                {basicUnitsInArea.map((b) => (
                  <option key={b._id} value={String(b._id)}>{b.name}</option>
                ))}
              </optgroup>
            </select>
            <span className="muted" style={{ fontSize: 13 }}>
              {ctx.unitLevel === 'AREA'
                ? 'Area-level cabinet (Secretary, Senior Mawin, Finance Sec., etc.).'
                : 'Basic-Unit cabinet — assign Secretary / Senior Mawin / Finance Sec. and the optional roles.'}
            </span>
          </div>
        </div>
      )}

      {err && <div className="alert error">{err}</div>}
      {msg && <div className="alert success">{msg}</div>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Cabinet roles</h3>
        <div className="toolbar" style={{ marginBottom: 10 }}>
          <input
            type="search"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            placeholder="Filter members in dropdowns by name, CNIC or phone…"
            style={{ minWidth: 320, flex: 1 }}
          />
          <span className="muted" style={{ alignSelf: 'center', fontSize: 13 }}>
            {filteredMembers.length} of {members.length} active members
          </span>
        </div>
        <table className="list">
          <thead>
            <tr>
              <th>Role</th>
              <th>Required?</th>
              <th>Member</th>
              <th>Phone</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cabinet.length === 0 && <tr><td colSpan="6" className="muted">No cabinet template for this level.</td></tr>}
            {cabinet.map((row) => (
              <CabinetRow
                key={row._id}
                row={row}
                canManage={canAssignDirectly}
                isAssigning={assignFor === row.roleCode}
                pickedMemberId={pickedMemberId}
                setPickedMemberId={setPickedMemberId}
                members={filteredMembers}
                allMembersCount={members.length}
                busy={busy}
                onAssignClick={() => { setAssignFor(row.roleCode); setPickedMemberId(''); }}
                onCancelAssign={() => { setAssignFor(null); setPickedMemberId(''); }}
                onConfirmAssign={() => propose(row.roleCode, pickedMemberId)}
                onEnd={() => endRole(row.assignment._id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      {canAssignDirectly && (
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Add a one-off role</h3>
        <p className="muted" style={{ marginTop: -6, fontSize: 13 }}>
          Roles defined in <strong>Role Management</strong> already appear in the table above with their own Assign buttons.
          Use this only for one-off ad-hoc role names you don't want in the catalogue.
        </p>
        {!showCustom && (
          <button className="btn secondary" onClick={() => {
            setShowCustom(true);
            setCustomMemberId('');
            setCustomRoleName('');
            setCustomMode('freeform');
          }}>
            + Add one-off role
          </button>
        )}
        {showCustom && (
          <div className="form-grid" style={{ alignItems: 'end' }}>
            <div className="field">
              <label>Member</label>
              <select value={customMemberId} onChange={(e) => setCustomMemberId(e.target.value)}>
                <option value="">Choose member</option>
                {filteredMembers.map((m) => (
                  <option key={m._id} value={m._id}>{m.fullName} · {m.memberId || m.cnic}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Role name</label>
              <input
                value={customRoleName}
                onChange={(e) => setCustomRoleName(e.target.value)}
                placeholder="e.g. Acting Coordinator"
                maxLength={80}
              />
              <div className="hint">One-off — won't appear as a permanent slot.</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn"
                disabled={busy || !customMemberId || !customRoleName.trim()}
                onClick={() => { setCustomMode('freeform'); proposeCustom(); }}
              >
                Add role
              </button>
              <button className="btn secondary" onClick={() => setShowCustom(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>
      )}

      {ctx?.unitLevel === 'DISTRICT' && areaCabinetsBelow.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Area Cabinets in this District</h3>
          {areaCabinetsBelow.map(({ area, cabinet }) => (
            <div key={area._id} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Area · {area.name}{' '}
                <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
                  ({cabinet.length} role{cabinet.length === 1 ? '' : 's'} filled)
                </span>
              </div>
              {cabinet.length === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>No cabinet roles assigned yet.</div>
              ) : (
                <table className="list">
                  <thead><tr><th>Role</th><th>Member</th><th>Phone</th></tr></thead>
                  <tbody>
                    {cabinet.map((row) => (
                      <tr key={row._id}>
                        <td>{ROLE_LABEL[row.roleCode] || row.customRoleName || roleLabel(user, row.roleCode)}</td>
                        <td>{row.member?.fullName || '—'}</td>
                        <td>{row.member?.phone || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {ctx?.unitLevel === 'AREA' && buCabinetsBelow.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Basic Unit Cabinets in this Area</h3>
          {buCabinetsBelow.map(({ unit, cabinet }) => (
            <div key={unit._id} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                Basic Unit · {unit.name}{' '}
                <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
                  ({cabinet.length} role{cabinet.length === 1 ? '' : 's'} filled)
                </span>
              </div>
              {cabinet.length === 0 ? (
                <div className="muted" style={{ fontSize: 13 }}>No cabinet roles assigned yet.</div>
              ) : (
                <table className="list">
                  <thead><tr><th>Role</th><th>Member</th><th>Phone</th></tr></thead>
                  <tbody>
                    {cabinet.map((row) => (
                      <tr key={row._id}>
                        <td>{ROLE_LABEL[row.roleCode] || row.customRoleName || roleLabel(user, row.roleCode)}</td>
                        <td>{row.member?.fullName || '—'}</td>
                        <td>{row.member?.phone || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ))}
        </div>
      )}

      {!secretaryReadOnly && !isSeniorMawinOp && !isPresidentOnly && (
      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Pending approvals</h3>
        <p className="muted" style={{ marginTop: 0 }}>
          Proposals raised by a Senior Mawin Secretary waiting for the Secretary's decision.
        </p>
        {pending.length === 0 && <p className="muted">No proposals waiting.</p>}
        {pending.length > 0 && (
          <table className="list">
            <thead>
              <tr><th>Role</th><th>Member</th><th>Initiator</th><th>Proposed at</th><th></th></tr>
            </thead>
            <tbody>
              {pending.map((p) => (
                <tr key={p._id}>
                  <td>{ROLE_LABEL[p.roleCode] || p.customRoleName || roleLabel(user, p.roleCode)}</td>
                  <td>{p.memberId?.fullName}</td>
                  <td>{p.initiatedBy?.fullName}</td>
                  <td>{new Date(p.createdAt).toLocaleString()}</td>
                  <td>
                    <button className="btn" onClick={() => decide(p._id, 'APPROVED')}>Approve</button>{' '}
                    <button className="btn danger" onClick={() => decide(p._id, 'REJECTED')}>Reject</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      )}
    </div>
  );
}

function CabinetRow({ row, canManage, isAssigning, pickedMemberId, setPickedMemberId, members, allMembersCount, busy, onAssignClick, onCancelAssign, onConfirmAssign, onEnd }) {
  const filled = row.state === 'FILLED';
  // Built-in roles use ROLE_LABEL; custom catalog roles carry their
  // human label in `customRoleName` (the catalogue's `label` field).
  // Fall through to the raw code only if neither is available.
  const builtin = ROLE_LABEL[row.roleCode];
  const primary = builtin || row.customRoleName || row.roleCode;
  return (
    <tr>
      <td>
        <strong>{primary}</strong>
        {builtin && row.customRoleName ? <span className="muted"> ({row.customRoleName})</span> : null}
        {row.isCustom && <span className="badge ACTIVE" style={{ marginLeft: 8, fontSize: 10, padding: '1px 7px' }}>CUSTOM</span>}
      </td>
      <td>{row.isMandatory ? <span className="badge ACTIVE">Required</span> : <span className="badge INACTIVE">Optional</span>}</td>
      <td>{filled ? row.member?.fullName : <span className="muted">— vacant —</span>}</td>
      <td>{filled ? row.member?.phone : '—'}</td>
      <td>
        {filled
          ? <span className="badge ACTIVE">Filled</span>
          : <span className="badge PENDING_APPROVAL">Vacant</span>}
      </td>
      <td style={{ whiteSpace: 'nowrap' }}>
        {canManage && !filled && !isAssigning && <button className="btn" onClick={onAssignClick}>Assign</button>}
        {canManage && !filled && isAssigning && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <select value={pickedMemberId} onChange={(e) => setPickedMemberId(e.target.value)}>
              <option value="">Choose member</option>
              {members.map((m) => (
                <option key={m._id} value={m._id}>{m.fullName} · {m.memberId || m.cnic}</option>
              ))}
            </select>
            {allMembersCount === 0 && (
              <span className="muted" style={{ fontSize: 12 }}>
                No approved members in this unit yet. Either approve someone who registered
                here, or pick a different unit from the "Cabinet for:" picker above.
              </span>
            )}
            {allMembersCount > 0 && members.length === 0 && (
              <span className="muted" style={{ fontSize: 12 }}>
                No matches for the search filter above. Clear it to see all {allMembersCount} members.
              </span>
            )}
            <button className="btn" disabled={!pickedMemberId || busy} onClick={onConfirmAssign}>Confirm</button>
            <button className="btn secondary" onClick={onCancelAssign}>Cancel</button>
          </div>
        )}
        {canManage && filled && <button className="btn danger" onClick={onEnd}>End role</button>}
      </td>
    </tr>
  );
}
