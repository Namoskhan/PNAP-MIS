import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage } from '../../api/client';
import { useToast } from '../../components/Toast';
import dialog from '../../components/dialog';
import { XIcon, UsersIcon, BuildingIcon } from '../../components/icons';
import { SkeletonRows } from '../../components/Skeleton';

export default function JirgaPage() {
  const { t } = useTranslation();
  const { ctx, setCtx, provinces } = useUnit();
  const { user } = useAuth();
  const toast = useToast();

  const roleOptions = useMemo(() => [
    { value: 'ALL', label: t('roles.all', 'All Roles') },
    { value: 'GENERAL_SECRETARY', label: t('roles.GENERAL_SECRETARY', 'General Secretary') },
    { value: 'PRESIDENT', label: t('roles.PRESIDENT', 'President / Saddar') },
    { value: 'SECRETARY', label: t('roles.SECRETARY', 'Secretary') },
    { value: 'SENIOR_MAWIN', label: t('roles.SENIOR_MAWIN', 'Senior Mawin Secretary') },
    { value: 'FINANCE_SECRETARY', label: t('roles.FINANCE_SECRETARY', 'Finance Secretary') },
    { value: 'SR_VICE_PRESIDENT', label: t('roles.SR_VICE_PRESIDENT', 'Sr. Vice President') },
    { value: 'VICE_PRESIDENT', label: t('roles.VICE_PRESIDENT', 'Vice President') },
    { value: 'CHAIRMAN', label: t('roles.CHAIRMAN', 'Chairman') },
    { value: 'CO_CHAIRMAN', label: t('roles.CO_CHAIRMAN', 'Co-Chairman') },
    { value: 'FIRST_SECRETARY', label: t('roles.FIRST_SECRETARY', 'First Secretary') },
    { value: 'OTHER', label: t('roles.otherCabinetRoles', 'Other Cabinet Roles') },
    { value: 'NO_ROLE', label: t('roles.generalWorkersNoRole', 'General Workers (No Role)') },
  ], [t]);

  const unitLevelOptions = useMemo(() => [
    { value: 'ALL', label: t('units.allTiers', 'All Tiers') },
    { value: 'CENTRAL', label: t('units.CENTRAL', 'Central Tier') },
    { value: 'PROVINCE', label: t('units.PROVINCE', 'Province Tier') },
    { value: 'DISTRICT', label: t('units.DISTRICT', 'District Tier') },
    { value: 'AREA', label: t('units.AREA', 'Area Tier') },
    { value: 'BASIC_UNIT', label: t('units.BASIC_UNIT', 'Basic Unit Tier') },
  ], [t]);

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // Roster filters
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterRoleFilter, setRosterRoleFilter] = useState('ALL');

  // Assign modal state
  const [assignOpen, setAssignOpen] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateRole, setCandidateRole] = useState('ALL');
  const [candidateUnitLevel, setCandidateUnitLevel] = useState('ALL');
  const [candidateProvId, setCandidateProvId] = useState('');
  const [candidateDistId, setCandidateDistId] = useState('');
  const [districtsList, setDistrictsList] = useState([]);

  const [selectedMember, setSelectedMember] = useState(null);
  const [nominationNote, setNominationNote] = useState('');
  const [assigning, setAssigning] = useState(false);

  const isCentralOrProvince = ctx && (ctx.unitLevel === 'CENTRAL' || ctx.unitLevel === 'PROVINCE');

  // Tier filter options: remove Central tier when on Provincial Jirga
  const tierOptions = useMemo(() => {
    if (ctx?.unitLevel === 'PROVINCE') {
      return unitLevelOptions.filter((opt) => opt.value !== 'CENTRAL');
    }
    return unitLevelOptions;
  }, [ctx?.unitLevel, unitLevelOptions]);
  const fetchIdRef = useRef(0);

  // Load Jirga composition
  async function reload() {
    if (!ctx || !isCentralOrProvince) {
      setLoading(false);
      return;
    }
    const myId = ++fetchIdRef.current;
    setLoading(true);
    setErr('');
    try {
      const res = await api.get('/jirga/composition', {
        params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId },
      });
      if (myId === fetchIdRef.current) {
        setData(res.data.data);
      }
    } catch (e) {
      if (myId === fetchIdRef.current) {
        setErr(errorMessage(e));
      }
    } finally {
      if (myId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    reload();
  }, [ctx?.unitLevel, ctx?.unitId]);

  // Load candidates when modal is open or candidate filters change
  useEffect(() => {
    if (!assignOpen || !ctx || !isCentralOrProvince) return;

    let active = true;
    setCandidatesLoading(true);

    const params = {
      unitLevel: ctx.unitLevel,
      unitId: ctx.unitId,
      search: candidateSearch.trim() || undefined,
      roleCode: candidateRole !== 'ALL' ? candidateRole : undefined,
      filterUnitLevel: candidateUnitLevel !== 'ALL' ? candidateUnitLevel : undefined,
      provinceId: candidateProvId || (ctx.unitLevel === 'PROVINCE' ? ctx.unitId : undefined),
      districtId: candidateDistId || undefined,
      limit: 100,
    };

    api.get('/jirga/eligible-members', { params })
      .then((res) => {
        if (active) {
          setCandidates(res.data.data?.candidates || []);
        }
      })
      .catch((e) => {
        if (active) {
          toast.error(errorMessage(e), { title: 'Could not load candidates' });
        }
      })
      .finally(() => {
        if (active) setCandidatesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [
    assignOpen,
    ctx?.unitLevel,
    ctx?.unitId,
    candidateSearch,
    candidateRole,
    candidateUnitLevel,
    candidateProvId,
    candidateDistId,
  ]);

  // Load districts when province filter changes
  useEffect(() => {
    const provId = candidateProvId || (ctx?.unitLevel === 'PROVINCE' ? ctx?.unitId : '');
    if (!provId) {
      setDistrictsList([]);
      setCandidateDistId('');
      return;
    }
    api.get('/org/districts', { params: { provinceId: provId } })
      .then((res) => setDistrictsList(res.data.data || []))
      .catch(() => setDistrictsList([]));
  }, [candidateProvId, ctx?.unitLevel, ctx?.unitId]);

  // Handle member assignment
  async function handleAssign() {
    if (!selectedMember) {
      toast.error(t('jirga.pickMemberError', 'Please pick a member to assign.'));
      return;
    }
    setAssigning(true);
    try {
      await api.post('/jirga/members', {
        unitLevel: ctx.unitLevel,
        unitId: ctx.unitId,
        memberId: selectedMember._id,
        nominationNote: nominationNote.trim() || undefined,
      });

      toast.success(
        t('jirga.memberAssignedSuccess', '{{name}} successfully assigned to {{title}}.', {
          name: selectedMember.fullName,
          title: data?.unit?.jirgaTitle || t('units.jirga', 'Jirga'),
        }),
        { title: t('jirga.memberAssignedTitle', 'Jirga Member Assigned') }
      );
      setSelectedMember(null);
      setNominationNote('');
      setAssignOpen(false);
      reload();
    } catch (e) {
      toast.error(errorMessage(e), { title: t('jirga.assignmentFailed', 'Assignment Failed'), duration: 7000 });
    } finally {
      setAssigning(false);
    }
  }

  // Handle member removal
  async function handleRemove(jirgaRecordId, memberName) {
    const confirmed = await dialog.confirm(
      t('jirga.confirmRemoveMember', 'Are you sure you want to remove {{name}} from the Jirga?', {
        name: memberName || t('common.thisMember', 'this member'),
      }),
      { title: t('jirga.removeMemberTitle', 'Remove Jirga Member') }
    );
    if (!confirmed) return;

    try {
      await api.post(`/jirga/members/${jirgaRecordId}/remove`);
      toast.success(t('jirga.memberRemovedSuccess', '{{name}} removed from Jirga.', { name: memberName || t('common.member', 'Member') }));
      reload();
    } catch (e) {
      toast.error(errorMessage(e), { title: t('jirga.removeFailed', 'Could not remove member'), duration: 7000 });
    }
  }

  // Filter roster members for display
  const filteredRoster = useMemo(() => {
    if (!data?.members) return [];
    return data.members.filter((m) => {
      // Search
      if (rosterSearch.trim()) {
        const q = rosterSearch.trim().toLowerCase();
        const matchName = m.fullName?.toLowerCase().includes(q);
        const matchCnic = m.cnic?.toLowerCase().includes(q);
        const matchPhone = m.phone?.toLowerCase().includes(q);
        const matchId = m.memberId?.toLowerCase().includes(q);
        const matchUnit = (m.homeUnit?.districtName || '').toLowerCase().includes(q);
        const matchRole = (m.primaryRole?.roleCode || '').toLowerCase().includes(q);
        if (!matchName && !matchCnic && !matchPhone && !matchId && !matchUnit && !matchRole) return false;
      }
      // Role Filter
      if (rosterRoleFilter !== 'ALL') {
        if (rosterRoleFilter === 'NO_ROLE') {
          if (m.activeRoles && m.activeRoles.length > 0) return false;
        } else {
          const hasRole = m.activeRoles?.some((r) => r.roleCode === rosterRoleFilter);
          if (!hasRole) return false;
        }
      }
      return true;
    });
  }, [data?.members, rosterSearch, rosterRoleFilter]);

  // Statistics
  const stats = useMemo(() => {
    if (!data?.members) return { total: 0, officeHolders: 0, workers: 0, districts: 0 };
    const total = data.members.length;
    let officeHolders = 0;
    let workers = 0;
    const distSet = new Set();

    data.members.forEach((m) => {
      if (m.activeRoles && m.activeRoles.length > 0) {
        officeHolders++;
      } else {
        workers++;
      }
      if (m.homeUnit?.districtName) distSet.add(m.homeUnit.districtName);
    });

    return { total, officeHolders, workers, districts: distSet.size };
  }, [data?.members]);

  if (!ctx) return <p>{t('common.selectUnitContext', 'Select a unit context first.')}</p>;

  // If user is at District, Area, or Basic Unit context, explain and offer jump
  if (!isCentralOrProvince) {
    return (
      <div>
        <div className="page-header">
          <h2>{t('units.jirgaAssembly', 'Jirga · Consultative Assembly')}</h2>
        </div>
        <div className="card" style={{ maxWidth: 680, margin: '20px auto', textAlign: 'center', padding: '32px 24px' }}>
          <div style={{ display: 'inline-flex', padding: 14, borderRadius: '50%', background: 'var(--surface-alt)', marginBottom: 16 }}>
            <UsersIcon size={36} />
          </div>
          <h3 style={{ marginTop: 0 }}>{t('jirga.provincialOnlyTitle', 'Jirga is available at Provincial and Central tiers')}</h3>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            {t('jirga.provincialOnlyText', 'Under party constitution, the Sobayi Jirga (صوبايي جرګه) operates at the Province level, and the Qomi Jirga / National Jirga (قومي جرګه) operates at the Central level. District and Area units operate via Zilla & Elaqayi Committees.')}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn secondary"
              onClick={() => {
                api.get('/org/central')
                  .then((r) => setCtx({ unitLevel: 'CENTRAL', unitId: r.data.data._id, unitName: r.data.data.name || 'PKNAP Central' }))
                  .catch(() => {});
              }}
            >
              {t('jirga.openQomiJirga', 'Open Qomi Jirga (Central)')}
            </button>
            {user?.scope?.provinceId && (
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setCtx({ unitLevel: 'PROVINCE', unitId: user.scope.provinceId, unitName: 'Province' });
                }}
              >
                {t('jirga.openMySobayiJirga', 'Open My Sobayi Jirga')}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const jirgaTitle = data?.unit?.jirgaTitle || (ctx.unitLevel === 'CENTRAL' ? t('units.qomiJirga', 'National / Qomi Jirga') : t('units.sobayiJirga', 'Sobayi Jirga'));
  const canManage = Boolean(data?.canManage);

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>{jirgaTitle}</h2>
          <div className="muted small" style={{ marginTop: 4 }}>
            {ctx.unitLevel === 'CENTRAL'
              ? t('jirga.centralSubtitle', 'Central Supreme Consultative & Legislative Body')
              : t('jirga.provincialSubtitle', 'Provincial Legislative & Consultative Assembly · {{name}}', { name: data?.unit?.unitName || ctx.unitName })}
          </div>
        </div>
        {canManage && (
          <button
            type="button"
            className="btn"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            onClick={() => {
              setSelectedMember(null);
              setNominationNote('');
              setAssignOpen(true);
            }}
          >
            {t('jirga.assignMembersBtn', '+ Assign Members to Jirga')}
          </button>
        )}
      </div>

      {err && <div className="alert error" style={{ marginBottom: 16 }}>{err}</div>}

      {/* KPI Stats */}
      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <div className="kpi">
          <div className="label">{t('jirga.totalMembers', 'Total Jirga Members')}</div>
          <div className="value">{loading ? '…' : stats.total}</div>
        </div>
        <div className="kpi">
          <div className="label">{t('jirga.officeHolders', 'Office Holders (Cabinet / Key Roles)')}</div>
          <div className="value">{loading ? '…' : stats.officeHolders}</div>
        </div>
        <div className="kpi">
          <div className="label">{t('jirga.generalWorkers', 'General Party Workers')}</div>
          <div className="value">{loading ? '…' : stats.workers}</div>
        </div>
        <div className="kpi">
          <div className="label">{t('jirga.districtsRepresented', 'Districts Represented')}</div>
          <div className="value">{loading ? '…' : stats.districts}</div>
        </div>
      </div>

      {/* Roster Card */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{t('jirga.activeRoster', 'Active Jirga Roster')}</h3>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="text"
              placeholder={t('jirga.searchPlaceholder', 'Search member, CNIC, phone, district…')}
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              style={{ minWidth: 240, padding: '6px 12px' }}
            />
            <select
              value={rosterRoleFilter}
              onChange={(e) => setRosterRoleFilter(e.target.value)}
              style={{ padding: '6px 10px' }}
            >
              {roleOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <table className="list">
            <thead>
              <tr><th>{t('common.member', 'Member')}</th><th>{t('jirga.roleAndUnit', 'Role & Unit')}</th><th>{t('jirga.homeHierarchy', 'Home Hierarchy')}</th><th>{t('jirga.appointed', 'Appointed')}</th><th>{t('common.notes', 'Remarks')}</th>{canManage && <th></th>}</tr>
            </thead>
            <tbody>
              <SkeletonRows cols={canManage ? 6 : 5} rows={5} />
            </tbody>
          </table>
        ) : filteredRoster.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
            {data?.members?.length === 0 ? (
              <>
                <p style={{ margin: 0, fontWeight: 500, fontSize: 16 }}>{t('jirga.noMembersAssigned', 'No members assigned to this Jirga yet.')}</p>
                <p className="small muted" style={{ marginTop: 6 }}>
                  {canManage ? t('jirga.useAssignPrompt', 'Use the "+ Assign Members to Jirga" button above to nominate members with their roles and units.') : t('jirga.noMembersLeadership', 'The General Secretary or leadership has not assigned members yet.')}
                </p>
              </>
            ) : (
              <p style={{ margin: 0 }}>{t('jirga.noMembersMatch', 'No Jirga members match your search or role filter.')}</p>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="list">
              <thead>
                <tr>
                  <th>{t('common.member', 'Member')}</th>
                  <th>{t('jirga.activeRoleAndUnit', 'Current Active Role & Unit')}</th>
                  <th>{t('jirga.homeHierarchy', 'Home Unit Hierarchy')}</th>
                  <th>{t('jirga.appointed', 'Appointed')}</th>
                  <th>{t('common.notes', 'Notes')}</th>
                  {canManage && <th style={{ textAlign: 'right' }}>{t('common.actions', 'Actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRoster.map((m) => {
                  const hasRoles = m.activeRoles && m.activeRoles.length > 0;
                  return (
                    <tr key={m.jirgaRecordId || m._id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {m.photoUrl ? (
                            <img src={m.photoUrl} alt="" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--surface-alt)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}>
                              {(m.fullName || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{m.fullName}</div>
                            <div className="muted small" style={{ fontSize: 11 }}>
                              {m.memberId || 'ID —'} · {m.cnic} · {m.phone}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td>
                        {hasRoles ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {m.activeRoles.map((r) => (
                              <div key={r._id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                <span className="badge ACTIVE" style={{ fontSize: 11, padding: '2px 6px', fontWeight: 600 }}>
                                  {r.customRoleName || t('roles.' + r.roleCode, r.roleCode.replace(/_/g, ' '))}
                                </span>
                                <span className="muted small" style={{ fontSize: 12, fontWeight: 500 }}>
                                  · {r.unitName} ({t('units.' + r.unitLevel, r.unitLevel.replace(/_/g, ' '))})
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : m.assignedRoleSnapshot?.roleCode ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <span className="badge PENDING" style={{ fontSize: 11, padding: '2px 6px' }}>
                                {m.assignedRoleSnapshot.customRoleName || t('roles.' + m.assignedRoleSnapshot.roleCode, m.assignedRoleSnapshot.roleCode.replace(/_/g, ' '))}
                              </span>
                              <span className="muted small" style={{ fontSize: 11 }}>
                                · {m.assignedRoleSnapshot.unitName || t('units.' + m.assignedRoleSnapshot.unitLevel, m.assignedRoleSnapshot.unitLevel)}
                              </span>
                            </div>
                            <span className="muted small" style={{ fontSize: 10 }}>{t('jirga.snapshotAtNomination', '(Snapshot at nomination)')}</span>
                          </div>
                        ) : (
                          <span className="muted small" style={{ fontStyle: 'italic' }}>{t('jirga.generalPartyWorkerNoRole', 'General Party Worker (No cabinet role)')}</span>
                        )}
                      </td>

                      <td>
                        <div style={{ fontSize: 12 }}>
                          {m.homeUnit?.provinceName && <span>{m.homeUnit.provinceName}</span>}
                          {m.homeUnit?.districtName && <span> &gt; {m.homeUnit.districtName}</span>}
                          {m.homeUnit?.areaName && <span> &gt; {m.homeUnit.areaName}</span>}
                          {m.homeUnit?.basicUnitName && <span className="muted"> &gt; {m.homeUnit.basicUnitName}</span>}
                        </div>
                      </td>

                      <td>
                        <div style={{ fontSize: 12 }}>
                          {m.assignedAt ? new Date(m.assignedAt).toLocaleDateString() : '—'}
                        </div>
                        {m.assignedBy?.fullName && (
                          <div className="muted small" style={{ fontSize: 11 }}>
                            {t('common.byAuthor', 'by {{name}}', { name: m.assignedBy.fullName })}
                          </div>
                        )}
                      </td>

                      <td>
                        <span style={{ fontSize: 12, color: m.nominationNote ? 'var(--text)' : 'var(--text-muted)' }}>
                          {m.nominationNote || '—'}
                        </span>
                      </td>

                      {canManage && (
                        <td style={{ textAlign: 'right' }}>
                          <button
                            type="button"
                            className="btn danger"
                            style={{ padding: '4px 10px', fontSize: 12 }}
                            onClick={() => handleRemove(m.jirgaRecordId, m.fullName)}
                          >
                            {t('common.remove', 'Remove')}
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Assign Member Modal (Portalled to document.body to prevent transform hover clip) */}
      {canManage && assignOpen && createPortal((
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !assigning) setAssignOpen(false);
          }}
        >
          <div
            className="modal"
            style={{ maxWidth: 840, width: '92vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
            role="dialog"
            aria-modal="true"
            aria-label={t('jirga.assignMembersModalTitle', 'Assign Members to Jirga')}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 18 }}>{t('jirga.assignMemberToTitle', 'Assign Member to {{title}}', { title: jirgaTitle })}</h3>
                <p className="muted small" style={{ margin: '4px 0 0' }}>
                  {t('jirga.modalSubtitle', 'Filter party members across units and roles to assign to the Jirga assembly.')}
                </p>
              </div>
              <button
                type="button"
                className="btn secondary"
                disabled={assigning}
                onClick={() => setAssignOpen(false)}
                aria-label={t('common.close', 'Close')}
                style={{ padding: '4px 10px', fontSize: 16, lineHeight: 1 }}
              >
                <XIcon size={16} />
              </button>
            </div>

            {/* Filter Bar */}
            <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)', margin: '0 -20px', paddingLeft: 20, paddingRight: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                {/* Search */}
                <div>
                  <label className="small muted" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>{t('common.searchMember', 'Search Member')}</label>
                  <input
                    type="text"
                    placeholder={t('common.searchMemberPlaceholder', 'Name, CNIC, Phone, ID…')}
                    value={candidateSearch}
                    onChange={(e) => setCandidateSearch(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
                  />
                </div>

                {/* Role Filter */}
                <div>
                  <label className="small muted" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>{t('common.filterByRole', 'Filter by Role')}</label>
                  <select
                    value={candidateRole}
                    onChange={(e) => setCandidateRole(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
                  >
                    {roleOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Role Unit Level */}
                <div>
                  <label className="small muted" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>{t('common.roleLevel', 'Role Level')}</label>
                  <select
                    value={candidateUnitLevel}
                    onChange={(e) => setCandidateUnitLevel(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
                  >
                    {tierOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Province Filter (Central Jirga only) */}
                {ctx.unitLevel === 'CENTRAL' && (
                  <div>
                    <label className="small muted" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>{t('common.province', 'Province')}</label>
                    <select
                      value={candidateProvId}
                      onChange={(e) => setCandidateProvId(e.target.value)}
                      style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
                    >
                      <option value="">{t('common.allProvinces', 'All Provinces')}</option>
                      {(provinces || []).map((p) => (
                        <option key={p._id} value={p._id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* District Filter */}
                <div>
                  <label className="small muted" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>{t('common.district', 'District')}</label>
                  <select
                    value={candidateDistId}
                    onChange={(e) => setCandidateDistId(e.target.value)}
                    style={{ width: '100%', padding: '6px 10px', fontSize: 13 }}
                  >
                    <option value="">{t('common.allDistricts', 'All Districts')}</option>
                    {districtsList.map((d) => (
                      <option key={d._id} value={d._id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Candidate List (Scrollable Area) */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0', minHeight: 220, maxHeight: 340 }}>
              {candidatesLoading ? (
                <div style={{ padding: '24px 16px' }}>
                  <SkeletonRows cols={4} rows={4} />
                </div>
              ) : candidates.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-muted)' }}>
                  <p style={{ margin: 0, fontWeight: 500 }}>{t('jirga.noCandidatesFound', 'No candidates found matching the selected filters.')}</p>
                  <p className="small muted" style={{ marginTop: 4 }}>{t('jirga.tryClearingFilters', 'Try clearing search keywords or widening territorial & role filters.')}</p>
                </div>
              ) : (
                <table className="list" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}></th>
                      <th>{t('common.candidate', 'Candidate')}</th>
                      <th>{t('jirga.activeRoleAndUnit', 'Current Active Role & Unit')}</th>
                      <th>{t('jirga.homeTerritory', 'Home Territory')}</th>
                      <th>{t('common.status', 'Status')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => {
                      const isSelected = selectedMember?._id === c._id;
                      const hasRoles = c.activeRoles && c.activeRoles.length > 0;
                      return (
                        <tr
                          key={c._id}
                          onClick={() => {
                            if (!c.isAssignedToJirga) setSelectedMember(c);
                          }}
                          style={{
                            cursor: c.isAssignedToJirga ? 'not-allowed' : 'pointer',
                            background: isSelected ? 'var(--primary-subtle, #f0fdf4)' : undefined,
                            opacity: c.isAssignedToJirga ? 0.6 : 1,
                          }}
                        >
                          <td>
                            <input
                              type="radio"
                              name="selectedCandidate"
                              checked={isSelected}
                              disabled={c.isAssignedToJirga}
                              onChange={() => setSelectedMember(c)}
                              aria-label={`Select ${c.fullName}`}
                            />
                          </td>
                          <td>
                            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{c.fullName}</div>
                            <div className="muted small" style={{ fontSize: 11 }}>
                              {c.memberId || 'ID —'} · {c.cnic} · {c.phone}
                            </div>
                          </td>
                          <td>
                            {hasRoles ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {c.activeRoles.map((r) => (
                                  <div key={r._id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <span className="badge ACTIVE" style={{ fontSize: 10, padding: '1px 5px', fontWeight: 600 }}>
                                      {r.customRoleName || t('roles.' + r.roleCode, r.roleCode.replace(/_/g, ' '))}
                                    </span>
                                    <span className="muted small" style={{ fontSize: 11 }}>
                                      {t('common.inUnit', 'in {{unit}} ({{level}})', { unit: r.unitName, level: t('units.' + r.unitLevel, r.unitLevel.replace(/_/g, ' ')) })}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="muted small" style={{ fontStyle: 'italic' }}>{t('jirga.partyWorkerNoRole', 'Party Worker (No role)')}</span>
                            )}
                          </td>
                          <td>
                            <div className="small" style={{ fontSize: 11 }}>
                              {c.homeUnit?.provinceName}
                              {c.homeUnit?.districtName && ` > ${c.homeUnit.districtName}`}
                              {c.homeUnit?.areaName && ` > ${c.homeUnit.areaName}`}
                            </div>
                          </td>
                          <td>
                            {c.isAssignedToJirga ? (
                              <span className="badge" style={{ background: 'var(--surface-alt)', color: 'var(--text-muted)', fontSize: 11 }}>
                                {t('jirga.inJirga', 'In jirga')}
                              </span>
                            ) : (
                              <span className="badge ACTIVE" style={{ fontSize: 11 }}>{t('jirga.eligible', 'Eligible')}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Nomination Note & Action Footer */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 'auto' }}>
              {selectedMember && (
                <div style={{ background: 'var(--surface-alt)', padding: '10px 14px', borderRadius: 6, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span className="muted small">{t('jirga.selectedCandidate', 'Selected Candidate:')} </span>
                    <strong style={{ color: 'var(--primary-strong, #15803d)' }}>{selectedMember.fullName}</strong>
                    {selectedMember.primaryRole && (
                      <span className="muted small" style={{ marginLeft: 6 }}>
                        ({t('roles.' + selectedMember.primaryRole.roleCode, selectedMember.primaryRole.roleCode.replace(/_/g, ' '))} · {selectedMember.primaryRole.unitName})
                      </span>
                    )}
                  </div>
                  <button type="button" className="btn secondary" style={{ padding: '2px 8px', fontSize: 11 }} onClick={() => setSelectedMember(null)}>
                    {t('common.clearSelection', 'Clear Selection')}
                  </button>
                </div>
              )}

              <div className="field full" style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                  {t('jirga.nominationNoteLabel', 'Nomination Note / Terms (Optional)')}
                </label>
                <input
                  type="text"
                  placeholder={t('jirga.nominationNotePlaceholder', 'e.g. Assigned as district representative or special delegate for legislative assembly…')}
                  value={nominationNote}
                  onChange={(e) => setNominationNote(e.target.value)}
                  style={{ width: '100%', padding: '7px 10px', fontSize: 13 }}
                  disabled={assigning}
                />
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn secondary"
                  disabled={assigning}
                  onClick={() => setAssignOpen(false)}
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={!selectedMember || assigning}
                  onClick={handleAssign}
                >
                  {assigning ? t('common.assigning', 'Assigning…') : t('jirga.assignToJirgaBtn', 'Assign to Jirga')}
                </button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
