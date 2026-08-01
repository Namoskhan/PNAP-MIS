import { useEffect, useMemo, useRef, useState } from 'react';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage } from '../../api/client';

// SRS §3.3 / §3.4 — at province and central, two distinct bodies
// coexist with the same composition rules but separate Permanent
// Member lists. Title flips per (level, body) pair.
const BODY_LABEL = {
  AREA: { COMMITTEE: 'Elaqayi Committee', JIRGA: 'Elaqayi Committee' },
  DISTRICT: { COMMITTEE: 'Zilla Committee', JIRGA: 'Zilla Committee' },
  PROVINCE: { COMMITTEE: 'Sobayi Committee', JIRGA: 'Sobayi Jirga' },
  CENTRAL: { COMMITTEE: 'Central Committee', JIRGA: 'National / Qomi Jirga' },
};
// Below province there's only one body per level — no toggle needed.
function bodyTabsSupported(level) {
  return level === 'PROVINCE' || level === 'CENTRAL';
}
const SUB_HEADING = {
  AREA: 'Basic Unit Secretaries & Senior Mawin Secretaries',
  DISTRICT: 'Area Secretaries & Senior Mawin Secretaries',
  PROVINCE: 'District Secretaries & Senior Mawin Secretaries',
  CENTRAL: 'Provincial Presidents & General/First Secretaries',
};
const OWN_HEADING = {
  AREA: 'Elaqayi Executive',
  DISTRICT: 'Zilla Cabinet (District Executive)',
  PROVINCE: 'Sobayi Cabinet (Province Executive)',
  CENTRAL: 'Central Executive Cabinet',
};

export default function CommitteePage() {
  const { ctx } = useUnit();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  // Active body tab — drives both the composition fetch (which
  // permanent-member list to show) and the bodyType used when
  // nominating new permanent members.
  const [bodyType, setBodyType] = useState('COMMITTEE');
  const [note, setNote] = useState('');
  const [nominateOpen, setNominateOpen] = useState(false);
  const [err, setErr] = useState('');

  // Resolve which level/unit the committee should belong to. SRS §3.1
  // says Basic Units have no committee — when ctx is a Basic Unit
  // we redirect the view to the parent Area's Elaqayi Committee so a
  // BU-level Senior Mawin can still see the body they're a member of.
  const [resolved, setResolved] = useState(null);
  useEffect(() => {
    if (!ctx) { setResolved(null); return; }
    if (ctx.unitLevel !== 'BASIC_UNIT') {
      setResolved({ unitLevel: ctx.unitLevel, unitId: ctx.unitId, unitName: ctx.unitName });
      return;
    }
    // Look up the parent Area for this Basic Unit. user.scope?.areaId
    // is set for any role-bound user (Senior Mawin / Secretary /
    // Finance Sec.) registered under a basic unit.
    const areaId = user?.scope?.areaId;
    const districtId = user?.scope?.districtId;
    if (!areaId || !districtId) { setResolved(null); return; }
    api.get('/org/areas', { params: { districtId } })
      .then((r) => {
        const a = r.data.data.find((x) => String(x._id) === String(areaId));
        if (a) setResolved({ unitLevel: 'AREA', unitId: a._id, unitName: a.name });
      })
      .catch(() => {});
  }, [ctx, user]);

  // Latest-fetch guard — drop stale composition responses from a
  // previous resolved unit / bodyType.
  const fetchIdRef = useRef(0);

  async function reload() {
    if (!resolved) return;
    const myId = ++fetchIdRef.current;
    setErr('');
    try {
      const r = await api.get('/committee/composition', {
        params: { unitLevel: resolved.unitLevel, unitId: resolved.unitId, bodyType },
      });
      if (myId === fetchIdRef.current) setData(r.data.data);
    } catch (e) {
      if (myId === fetchIdRef.current) setErr(errorMessage(e));
    }
  }

  // Refetch when the user switches between Committee and Jirga tabs
  // (bodyType change) so the Selective Members list updates.
  useEffect(() => { reload(); }, [resolved, bodyType]);

  useEffect(() => {
    if (!resolved) return;
    const params = { status: 'ACTIVE', limit: 500 };
    if (resolved.unitLevel === 'AREA') params.areaId = resolved.unitId;
    if (resolved.unitLevel === 'DISTRICT') params.districtId = resolved.unitId;
    if (resolved.unitLevel === 'PROVINCE') params.provinceId = resolved.unitId;
    api.get('/members', { params }).then((r) => setMembers(r.data.data)).catch(() => {});
  }, [resolved]);

  async function nominate() {
    setErr('');
    if (!memberId) { setErr('Pick a member.'); return; }
    try {
      await api.post('/committee/permanent', {
        unitLevel: resolved.unitLevel, unitId: resolved.unitId,
        memberId, bodyType, nominationNote: note,
      });
      setMemberId(''); setNote('');
      setNominateOpen(false);
      reload();
    } catch (e) { setErr(errorMessage(e)); }
  }

  async function removePerm(id) {
    if (!confirm('Remove this permanent member?')) return;
    try {
      await api.post(`/committee/permanent/${id}/remove`);
      reload();
    } catch (e) { alert(errorMessage(e)); }
  }

  // Members already in groups (a) or (b) shouldn't be re-nominated as
  // permanent — they're already members by virtue of their role.
  const alreadyInBody = useMemo(() => {
    if (!data) return new Set();
    const ids = new Set();
    (data.ownCabinet || []).forEach((c) => c.memberId?._id && ids.add(String(c.memberId._id)));
    (data.subordinates || []).forEach((s) => s.roles.forEach((r) => r.memberId?._id && ids.add(String(r.memberId._id))));
    (data.permanentMembers || []).forEach((p) => p.memberId?._id && ids.add(String(p.memberId._id)));
    return ids;
  }, [data]);

  const eligibleMembers = useMemo(() => members.filter((m) => !alreadyInBody.has(String(m._id))), [members, alreadyInBody]);

  if (!ctx) return <p>Select a unit context first.</p>;
  if (!resolved) {
    return (
      <p className="muted">
        Loading committee context… Basic Units have no committee of their own — the
        view is redirected to the parent Area's Elaqayi Committee.
      </p>
    );
  }

  const totalMembers = data
    ? (data.ownCabinet?.length || 0)
      + (data.subordinates || []).reduce((a, s) => a + (s.roles?.length || 0), 0)
      + (data.permanentMembers?.length || 0)
    : 0;

  const canManage = !!data?.canManage;

  return (
    <div>
      <div className="page-header">
        <h2>{BODY_LABEL[resolved.unitLevel]?.[bodyType] || 'Committee'} · {resolved.unitName}</h2>
      </div>

      {bodyTabsSupported(resolved.unitLevel) && (
        <div className="toolbar" style={{ marginBottom: 12 }}>
          <button
            className={`btn ${bodyType === 'COMMITTEE' ? '' : 'secondary'}`}
            onClick={() => setBodyType('COMMITTEE')}
          >{BODY_LABEL[resolved.unitLevel].COMMITTEE}</button>
          <button
            className={`btn ${bodyType === 'JIRGA' ? '' : 'secondary'}`}
            onClick={() => setBodyType('JIRGA')}
          >{BODY_LABEL[resolved.unitLevel].JIRGA}</button>
        </div>
      )}

      {ctx.unitLevel === 'BASIC_UNIT' && (
        <div className="alert" style={{ background: 'var(--info-bg)', color: 'var(--info-strong)', border: '1px solid var(--info-border)' }}>
          You are pinned to a Basic Unit. Showing the parent Area's Elaqayi Committee in <strong>read-only</strong> mode — you are a member of this body via your Basic-Unit role.
        </div>
      )}

      {data && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <p className="muted" style={{ margin: 0 }}>
              <strong>{totalMembers}</strong> total members =
              {' '}{data.ownCabinet?.length || 0} from the Area Executive
              {' '}+ {(data.subordinates || []).reduce((a, s) => a + (s.roles?.length || 0), 0)} Basic-Unit office-holders
              {' '}+ {data.permanentMembers?.length || 0} Selective Members.
            </p>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>{OWN_HEADING[resolved.unitLevel]}</h3>
            <table className="list">
              <thead><tr><th>Role</th><th>Member</th><th>Member ID</th><th>Phone</th></tr></thead>
              <tbody>
                {data.ownCabinet.length === 0 && <tr><td colSpan="4" className="muted">Cabinet not formed yet.</td></tr>}
                {data.ownCabinet.map((c) => (
                  <tr key={c._id}>
                    <td><strong>{c.roleCode}</strong>{c.customRoleName ? ` (${c.customRoleName})` : ''}</td>
                    <td>{c.memberId?.fullName}</td>
                    <td>{c.memberId?.memberId || '—'}</td>
                    <td>{c.memberId?.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>{SUB_HEADING[resolved.unitLevel]}</h3>
            {data.subordinates.length === 0 && <p className="muted">No subordinate units yet.</p>}
            {data.subordinates.map((s) => (
              <div key={s.unit._id} style={{ marginBottom: 12 }}>
                <div className="muted" style={{ fontWeight: 600, marginBottom: 4 }}>
                  {s.unit.level.replace('_', ' ')} · {s.unit.name}{s.unit.code ? ` (${s.unit.code})` : ''}
                </div>
                {s.roles.length === 0 ? (
                  <div className="muted small">No key office-holders assigned.</div>
                ) : (
                  <table className="list">
                    <thead><tr><th>Role</th><th>Member</th><th>Phone</th></tr></thead>
                    <tbody>
                      {s.roles.map((r) => (
                        <tr key={r._id}>
                          <td>{r.roleCode}</td>
                          <td>{r.memberId?.fullName}</td>
                          <td>{r.memberId?.phone}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ margin: 0 }}>Selective Members</h3>
              {canManage && (
                <button className="btn" onClick={() => setNominateOpen(true)}>+ Nominate</button>
              )}
            </div>
            {err && <div className="alert error">{err}</div>}

            {canManage && nominateOpen && (
              <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setNominateOpen(false); }}>
              <div className="modal" style={{ maxWidth: 560 }} role="dialog" aria-modal="true" aria-label="Nominate Selective Member">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h3 style={{ margin: 0 }}>Nominate Selective Member</h3>
                  <button type="button" className="btn secondary" onClick={() => setNominateOpen(false)} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>
                <div className="form-grid">
                  <div className="field full">
                    <label>Member *</label>
                    <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                      <option value="">— pick a member —</option>
                      {eligibleMembers.map((m) => (
                        <option key={m._id} value={m._id}>{m.fullName} · {m.memberId || m.cnic}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field full">
                    <label>Nomination Note</label>
                    <input value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                </div>
                <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn secondary" type="button" onClick={() => setNominateOpen(false)}>Cancel</button>
                  <button className="btn" disabled={!memberId} onClick={nominate}>Nominate</button>
                </div>
              </div>
              </div>
            )}
            <table className="list" style={{ marginTop: 12 }}>
              <thead><tr><th>Body</th><th>Member</th><th>Phone</th><th>Note</th>{canManage && <th></th>}</tr></thead>
              <tbody>
                {data.permanentMembers.length === 0 && <tr><td colSpan={canManage ? 5 : 4} className="muted">None nominated.</td></tr>}
                {data.permanentMembers.map((p) => (
                  <tr key={p._id}>
                    <td>{p.bodyType}</td>
                    <td>{p.memberId?.fullName}</td>
                    <td>{p.memberId?.phone}</td>
                    <td>{p.nominationNote || '—'}</td>
                    {canManage && <td><button className="btn danger" onClick={() => removePerm(p._id)}>Remove</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
