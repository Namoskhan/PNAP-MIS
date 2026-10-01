import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../components/Toast';

import dialog from '../../components/dialog';
import { XIcon } from '../../components/icons';

// SRS §3.1–§3.4 — Committee titles per unit tier
const COMMITTEE_LABEL = {
  AREA: 'Elaqayi Committee',
  DISTRICT: 'Zilla Committee',
  PROVINCE: 'Sobayi Committee',
  CENTRAL: 'Central Committee',
};

const SUB_HEADING = {
  AREA: 'Basic Unit Secretaries & Senior Mawin Secretaries',
  DISTRICT: 'Area Secretaries & Senior Mawin Secretaries',
  PROVINCE: 'District Secretaries & Senior Mawin Secretaries',
  CENTRAL: 'Provincial Presidents & General/First Secretaries',
};

const OWN_HEADING = {
  AREA: 'Elaqayi Executive Cabinet',
  DISTRICT: 'Zilla Cabinet (District Executive)',
  PROVINCE: 'Sobayi Cabinet (Province Executive)',
  CENTRAL: 'Central Executive Cabinet',
};

export default function CommitteePage() {
  const { t } = useTranslation();
  const { ctx } = useUnit();
  const { user } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [note, setNote] = useState('');
  const [nominateOpen, setNominateOpen] = useState(false);
  const [err, setErr] = useState('');

  // Resolve which level/unit the committee should belong to. SRS §3.1
  // says Basic Units have no committee — when ctx is a Basic Unit
  // we redirect the view to the parent Area's Elaqayi Committee so a
  // BU-level Senior Mawin can still see the body they're a member of.
  const [resolved, setResolved] = useState(null);
  useEffect(() => {
    if (!ctx && !user?.scope?.districtId && !user?.scope?.provinceId) { setResolved(null); return; }

    const isDistAdmin = user?.roles?.includes('DISTRICT_ADMIN') && !user?.roles?.includes('SUPER_ADMIN') && !user?.roles?.includes('PROVINCE_ADMIN');
    const isProvAdmin = user?.roles?.includes('PROVINCE_ADMIN') && !user?.roles?.includes('SUPER_ADMIN');

    if (isDistAdmin && user?.scope?.districtId && ctx?.unitLevel !== 'DISTRICT') {
      setResolved({ unitLevel: 'DISTRICT', unitId: user.scope.districtId, unitName: user.scope.districtName || 'Zilla Committee' });
      return;
    }

    if (isProvAdmin && user?.scope?.provinceId && ctx?.unitLevel !== 'PROVINCE') {
      setResolved({ unitLevel: 'PROVINCE', unitId: user.scope.provinceId, unitName: user.scope.provinceName || 'Sobayi Committee' });
      return;
    }

    if (ctx && ctx.unitLevel !== 'BASIC_UNIT') {
      setResolved({ unitLevel: ctx.unitLevel, unitId: ctx.unitId, unitName: ctx.unitName });
      return;
    }
    // Look up the parent Area for this Basic Unit.
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

  const fetchIdRef = useRef(0);

  async function reload() {
    if (!resolved) return;
    const myId = ++fetchIdRef.current;
    setErr('');
    try {
      const r = await api.get('/committee/composition', {
        params: { unitLevel: resolved.unitLevel, unitId: resolved.unitId },
      });
      if (myId === fetchIdRef.current) setData(r.data.data);
    } catch (e) {
      if (myId === fetchIdRef.current) setErr(errorMessage(e));
    }
  }

  useEffect(() => { reload(); }, [resolved]);

  useEffect(() => {
    if (!resolved) return;
    const params = { status: 'ACTIVE', limit: 500 };
    if (resolved.unitLevel === 'AREA') params.areaId = resolved.unitId;
    if (resolved.unitLevel === 'DISTRICT') params.districtId = resolved.unitId;
    if (resolved.unitLevel === 'PROVINCE') params.provinceId = resolved.unitId;
    if (resolved.unitLevel === 'CENTRAL' || resolved.unitLevel === 'BASIC_UNIT') params.scope = 'all';
    api.get('/members', { params }).then((r) => setMembers(r.data.data)).catch(() => {});
  }, [resolved]);

  async function nominate() {
    setErr('');
    if (!memberId) { setErr(t('committee.pickMemberError', 'Pick a member.')); return; }
    try {
      const nominee = members.find((m) => m._id === memberId);
      await api.post('/committee/permanent', {
        unitLevel: resolved.unitLevel, unitId: resolved.unitId,
        memberId, nominationNote: note,
      });
      setMemberId(''); setNote('');
      setNominateOpen(false);
      reload();
      toast.success(
        nominee
          ? t('committee.nominatedSuccessWithMember', '{{name}} nominated as a selective member.', { name: nominee.fullName })
          : t('committee.nominatedSuccess', 'Selective member nominated.'),
        { title: t('committee.nominationRecorded', 'Nomination recorded') }
      );
    } catch (e) {
      toast.error(errorMessage(e), { title: t('committee.nominationFailed', 'Could not nominate member'), duration: 7000 });
    }
  }

  async function removePerm(id) {
    if (!await dialog.confirm(t('committee.confirmRemoveSelective', 'Remove this selective member from the committee?'))) return;
    try {
      await api.post(`/committee/permanent/${id}/remove`);
      reload();
      toast.success(t('committee.memberRemovedSuccess', 'Selective member removed.'));
    } catch (e) {
      toast.error(errorMessage(e), { title: t('committee.removeFailed', 'Could not remove member'), duration: 7000 });
    }
  }

  const alreadyInBody = useMemo(() => {
    if (!data) return new Set();
    const ids = new Set();
    (data.ownCabinet || []).forEach((c) => c.memberId?._id && ids.add(String(c.memberId._id)));
    (data.subordinates || []).forEach((s) => s.roles.forEach((r) => r.memberId?._id && ids.add(String(r.memberId._id))));
    (data.permanentMembers || []).forEach((p) => p.memberId?._id && ids.add(String(p.memberId._id)));
    return ids;
  }, [data]);

  const eligibleMembers = useMemo(() => members.filter((m) => !alreadyInBody.has(String(m._id))), [members, alreadyInBody]);

  if (!ctx) return <p>{t('common.selectUnitContext', 'Select a unit context first.')}</p>;
  if (!resolved) {
    return (
      <p className="muted">
        {t('committee.loadingContextRedirect', 'Loading committee context… Basic Units have no committee of their own — the view is redirected to the parent Area\'s Elaqayi Committee.')}
      </p>
    );
  }

  const totalMembers = data
    ? (data.ownCabinet?.length || 0)
      + (data.subordinates || []).reduce((a, s) => a + (s.roles?.length || 0), 0)
      + (data.permanentMembers?.length || 0)
    : 0;

  const canManage = !!data?.canManage;
  const committeeTitle = resolved ? (
    resolved.unitLevel === 'AREA' ? t('committee.label_area', t('units.elaqayiCommittee', 'Elaqayi Committee')) :
    resolved.unitLevel === 'DISTRICT' ? t('committee.label_district', t('units.zillaCommittee', 'Zilla Committee')) :
    resolved.unitLevel === 'PROVINCE' ? t('committee.label_province', t('units.sobayiCommittee', 'Sobayi Committee')) :
    resolved.unitLevel === 'CENTRAL' ? t('committee.label_central', t('units.centralCommittee', 'Central Committee')) :
    (COMMITTEE_LABEL[resolved.unitLevel] || t('committee.title', 'Committee'))
  ) : t('committee.title', 'Committee');

  return (
    <div>
      <div className="page-header">
        <h2>{committeeTitle} · {resolved.unitName}</h2>
      </div>

      {ctx.unitLevel === 'BASIC_UNIT' && (
        <div className="alert" style={{ background: 'var(--info-bg)', color: 'var(--info-strong)', border: '1px solid var(--info-border)', marginBottom: 14 }}>
          {t('committee.pinnedBasicUnitNotice', 'You are pinned to a Basic Unit. Showing the parent Area\'s Elaqayi Committee in read-only mode — you are a member of this body via your Basic-Unit role.')}
        </div>
      )}

      {data && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <p className="muted" style={{ margin: 0 }}>
              <strong>{totalMembers}</strong> {t('committee.totalMembersCount', 'total members')} =
              {' '}{data.ownCabinet?.length || 0} {t('committee.fromCabinet', 'from Executive Cabinet')}
              {' '}+ {(data.subordinates || []).reduce((a, s) => a + (s.roles?.length || 0), 0)} {t('committee.subordinateHolders', 'subordinate key office-holders')}
              {' '}+ {data.permanentMembers?.length || 0} {t('committee.selectiveMembers', 'Selective Members')}.
            </p>
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>{t(`committee.heading_${resolved.unitLevel.toLowerCase()}`, OWN_HEADING[resolved.unitLevel])}</h3>
            <table className="list">
              <thead><tr><th>{t('common.role', 'Role')}</th><th>{t('common.member', 'Member')}</th><th>{t('members.memberId', 'Member ID')}</th><th>{t('common.phone', 'Phone')}</th></tr></thead>
              <tbody>
                {data.ownCabinet.length === 0 && <tr><td colSpan="4" className="muted">{t('committee.cabinetNotFormed', 'Cabinet not formed yet.')}</td></tr>}
                {data.ownCabinet.map((c) => (
                  <tr key={c._id}>
                    <td><strong>{t(`roles.${c.roleCode}`, c.roleCode?.replace(/_/g, ' '))}</strong>{c.customRoleName ? ` (${c.customRoleName})` : ''}</td>
                    <td>{c.memberId?.fullName}</td>
                    <td>{c.memberId?.memberId || '—'}</td>
                    <td>{c.memberId?.phone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card" style={{ marginTop: 16 }}>
            <h3 style={{ marginTop: 0 }}>{t(`committee.subheading_${resolved.unitLevel.toLowerCase()}`, SUB_HEADING[resolved.unitLevel])}</h3>
            {data.subordinates.length === 0 && <p className="muted">{t('committee.noSubordinates', 'No subordinate units yet.')}</p>}
            {data.subordinates.map((s) => (
              <div key={s.unit._id} style={{ marginBottom: 12 }}>
                <div className="muted" style={{ fontWeight: 600, marginBottom: 4 }}>
                  {t(`units.${s.unit.level.toLowerCase()}`, s.unit.level.replace('_', ' '))} · {s.unit.name}{s.unit.code ? ` (${s.unit.code})` : ''}
                </div>
                {s.roles.length === 0 ? (
                  <div className="muted small">{t('committee.noOfficeHoldersAssigned', 'No key office-holders assigned.')}</div>
                ) : (
                  <table className="list">
                    <thead><tr><th>{t('common.role', 'Role')}</th><th>{t('common.member', 'Member')}</th><th>{t('common.phone', 'Phone')}</th></tr></thead>
                    <tbody>
                      {s.roles.map((r) => (
                        <tr key={r._id}>
                          <td>{t(`roles.${r.roleCode}`, r.roleCode?.replace(/_/g, ' '))}</td>
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
              <h3 style={{ margin: 0 }}>{t('committee.selectiveMembers', 'Selective Members')}</h3>
              {canManage && (
                <button className="btn" onClick={() => setNominateOpen(true)}>{t('committee.nominateBtn', '+ Nominate')}</button>
              )}
            </div>
            {err && <div className="alert error">{err}</div>}

            {canManage && nominateOpen && createPortal((
              <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) setNominateOpen(false); }}>
              <div className="modal" style={{ maxWidth: 560 }} role="dialog" aria-modal="true" aria-label={t('committee.nominateSelectiveModal', 'Nominate Selective Member')}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h3 style={{ margin: 0 }}>{t('committee.nominateSelectiveModal', 'Nominate Selective Member')}</h3>
                  <button type="button" className="btn secondary" onClick={() => setNominateOpen(false)} aria-label={t('common.close', 'Close')} style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
                </div>
                <div className="form-grid">
                  <div className="field full">
                    <label>{t('common.member', 'Member')} *</label>
                    <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                      <option value="">{t('common.pickMemberPlaceholder', '— pick a member —')}</option>
                      {eligibleMembers.map((m) => (
                        <option key={m._id} value={m._id}>{m.fullName} · {m.memberId || m.cnic}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field full">
                    <label>{t('committee.nominationNote', 'Nomination Note')}</label>
                    <input value={note} onChange={(e) => setNote(e.target.value)} />
                  </div>
                </div>
                <div style={{ marginTop: 18, display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button className="btn secondary" type="button" onClick={() => setNominateOpen(false)}>{t('common.cancel', 'Cancel')}</button>
                  <button className="btn" disabled={!memberId} onClick={nominate}>{t('committee.nominateAction', 'Nominate')}</button>
                </div>
              </div>
              </div>
            ), document.body)}
            <table className="list" style={{ marginTop: 12 }}>
              <thead><tr><th>{t('common.member', 'Member')}</th><th>{t('common.phone', 'Phone')}</th><th>{t('common.notes', 'Note')}</th>{canManage && <th></th>}</tr></thead>
              <tbody>
                {data.permanentMembers.length === 0 && <tr><td colSpan={canManage ? 4 : 3} className="muted">{t('committee.noneNominated', 'None nominated.')}</td></tr>}
                {data.permanentMembers.map((p) => (
                  <tr key={p._id}>
                    <td>{p.memberId?.fullName}</td>
                    <td>{p.memberId?.phone}</td>
                    <td>{p.nominationNote || '—'}</td>
                    {canManage && <td><button className="btn danger" onClick={() => removePerm(p._id)}>{t('common.remove', 'Remove')}</button></td>}
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
