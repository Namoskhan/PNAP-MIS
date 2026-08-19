import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import { BuildingIcon, GlobeIcon, ScaleIcon, TagIcon, TrashIcon, XIcon } from '../../../components/icons';

import dialog from '../../../components/dialog';
// Unit Policies — full CRUD over GLOBAL / TIER / UNIT scopes.
// Editor exposes the four slices (member / meeting / finance /
// transfer); each is rendered as a small focused field group.

const SCOPES = ['GLOBAL', 'TIER', 'UNIT'];
const TIER_CODES = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];
const TRANSFER_DIRECTIONS = ['UP', 'DOWN', 'SAME_TIER'];

export default function UnitPoliciesPage() {
  const { user } = useAuth();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = hasPermission(user, 'MANAGE_UNIT_CONFIG');

  const [policies, setPolicies] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setBusy(true); setErr('');
    try {
      const r = await api.get('/admin/units/policies');
      setPolicies(r.data?.data || []);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function deletePolicy(p) {
    if (p.isSystem) return;
    if (!await dialog.confirm(`Delete this ${p.scope} policy? Records resolving to it will fall back to GLOBAL.`)) return;
    try {
      await api.delete(`/admin/units/policies/${p._id}`);
      toast.success?.('Policy deleted.');
      load();
    } catch (e) { toast.error?.(errorMessage(e)); }
  }

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><ScaleIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Unit Policies</h2>
            <div className="rm-hero-sub">
              Quorum, attendance, finance thresholds, and transfer rules.
              Resolution: UNIT → TIER → GLOBAL — most specific wins per leaf field.
            </div>
          </div>
          <div className="rm-hero-actions">
            <button className="rm-hero-btn outline" onClick={load}>⟳ Refresh</button>
            {canWrite && (
              <button className="rm-hero-btn solid" onClick={() => setCreateOpen(true)}>＋ New Override</button>
            )}
          </div>
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}

      {busy && (
        <div className="rm-loading">
          <span className="scope-spinner" aria-hidden="true" />
          <span className="muted">Loading…</span>
        </div>
      )}

      {!busy && policies.map((p) => (
        <div key={p._id} className={`rm-card ${p.isSystem ? '' : ''}`} style={{ marginBottom: 12 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-icon" aria-hidden="true">{p.scope === 'GLOBAL' ? <GlobeIcon size={15} /> : p.scope === 'TIER' ? <TagIcon size={15} /> : <BuildingIcon size={15} />}</span>
            <span className="rm-card-bar-label">
              {p.scope}
              {p.tierCode ? ` · ${p.tierCode}` : ''}
              {p.unitId ? ` · unit ${String(p.unitId).slice(-6)}` : ''}
              {p.isSystem && ' · built-in'}
              {!p.isActive && ' · inactive'}
            </span>
            <span className="rm-card-bar-count">v{p.policyVersion || 1}</span>
          </div>
          <div className="rm-card-body">
            <PolicySummary policy={p} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="rm-action edit" onClick={() => setEditing(p)} disabled={!canWrite}>Edit</button>
              {!p.isSystem && canWrite && (
                <button className="rm-action delete" onClick={() => deletePolicy(p)}><TrashIcon size={13} /> Delete</button>
              )}
            </div>
          </div>
        </div>
      ))}

      {createOpen && (
        <PolicyDialog
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load(); toast.success?.('Override created.'); }}
        />
      )}
      {editing && (
        <PolicyDialog
          mode="edit"
          policy={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast.success?.('Policy updated.'); }}
        />
      )}
    </div>
  );
}

// Compact at-a-glance summary of which slices have rules set.
function PolicySummary({ policy }) {
  const m = policy.meeting || {};
  const f = policy.finance || {};
  const t = policy.transfer || {};
  const mb = policy.member || {};
  const lines = [];
  if (m.quorumMin) lines.push(`Quorum ≥ ${m.quorumMin}`);
  if (m.quorumWarn) lines.push(`Quorum warn @ ${m.quorumWarn}`);
  if (m.minAttendancePercent) lines.push(`Attendance ≥ ${m.minAttendancePercent}%`);
  if (m.requirePreviousReport) lines.push('Require previous report');
  if (f.expenseAutoApproveBelow) lines.push(`Auto-approve expense < Rs ${f.expenseAutoApproveBelow.toLocaleString()}`);
  if (f.expenseRequireSecondApproverAbove) lines.push(`2nd approver above Rs ${f.expenseRequireSecondApproverAbove.toLocaleString()}`);
  if (f.donationCnicRequiredAbove) lines.push(`Donation CNIC above Rs ${f.donationCnicRequiredAbove.toLocaleString()}`);
  if (Array.isArray(t.allowedDirections) && t.allowedDirections.length) lines.push(`Transfer: ${t.allowedDirections.join(', ')}`);
  if (t.requirePresidentApprovalAbove) lines.push(`President approval above Rs ${t.requirePresidentApprovalAbove.toLocaleString()}`);
  if (mb.requireApprovalAtTier) lines.push(`Member approval at ${mb.requireApprovalAtTier}`);
  if ((mb.minimumProfileFields || []).length) lines.push(`Profile fields: ${mb.minimumProfileFields.join(', ')}`);
  if (lines.length === 0) return <p className="muted" style={{ margin: 0, fontSize: 13 }}>No rules set — falls through to less-specific scope.</p>;
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
      {lines.map((l, i) => <li key={i}>{l}</li>)}
    </ul>
  );
}

function PolicyDialog({ mode, policy, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [scope, setScope] = useState(policy?.scope || 'TIER');
  const [tierCode, setTierCode] = useState(policy?.tierCode || 'AREA');
  const [unitId, setUnitId] = useState(policy?.unitId ? String(policy.unitId) : '');
  const [meeting, setMeeting] = useState({
    quorumMin: policy?.meeting?.quorumMin ?? '',
    quorumWarn: policy?.meeting?.quorumWarn ?? '',
    minAttendancePercent: policy?.meeting?.minAttendancePercent ?? '',
    requirePreviousReport: !!policy?.meeting?.requirePreviousReport,
  });
  const [finance, setFinance] = useState({
    expenseAutoApproveBelow: policy?.finance?.expenseAutoApproveBelow ?? '',
    expenseRequireSecondApproverAbove: policy?.finance?.expenseRequireSecondApproverAbove ?? '',
    donationCnicRequiredAbove: policy?.finance?.donationCnicRequiredAbove ?? '',
  });
  const [transfer, setTransfer] = useState({
    allowedDirections: policy?.transfer?.allowedDirections || ['UP'],
    requirePresidentApprovalAbove: policy?.transfer?.requirePresidentApprovalAbove ?? '',
  });
  const [isActive, setIsActive] = useState(policy?.isActive !== false);
  const [note, setNote] = useState(policy?.note || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function _num(v) { return v === '' || v == null ? undefined : Number(v); }

  async function save() {
    setErr(''); setBusy(true);
    try {
      const meetingClean = {};
      if (meeting.quorumMin !== '') meetingClean.quorumMin = _num(meeting.quorumMin);
      if (meeting.quorumWarn !== '') meetingClean.quorumWarn = _num(meeting.quorumWarn);
      if (meeting.minAttendancePercent !== '') meetingClean.minAttendancePercent = _num(meeting.minAttendancePercent);
      if (meeting.requirePreviousReport) meetingClean.requirePreviousReport = true;

      const financeClean = {};
      if (finance.expenseAutoApproveBelow !== '') financeClean.expenseAutoApproveBelow = _num(finance.expenseAutoApproveBelow);
      if (finance.expenseRequireSecondApproverAbove !== '') financeClean.expenseRequireSecondApproverAbove = _num(finance.expenseRequireSecondApproverAbove);
      if (finance.donationCnicRequiredAbove !== '') financeClean.donationCnicRequiredAbove = _num(finance.donationCnicRequiredAbove);

      const transferClean = {};
      if ((transfer.allowedDirections || []).length) transferClean.allowedDirections = transfer.allowedDirections;
      if (transfer.requirePresidentApprovalAbove !== '') transferClean.requirePresidentApprovalAbove = _num(transfer.requirePresidentApprovalAbove);

      const payload = {
        member: {},
        meeting: meetingClean,
        finance: financeClean,
        transfer: transferClean,
        isActive,
        note: note || undefined,
      };

      if (isEdit) {
        await api.patch(`/admin/units/policies/${policy._id}`, payload);
      } else {
        payload.scope = scope;
        if (scope === 'TIER' || scope === 'UNIT') payload.tierCode = tierCode;
        if (scope === 'UNIT') payload.unitId = unitId;
        await api.post('/admin/units/policies', payload);
      }
      onSaved();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  function toggleDirection(d) {
    setTransfer((p) => {
      const has = p.allowedDirections.includes(d);
      return { ...p, allowedDirections: has ? p.allowedDirections.filter((x) => x !== d) : [...p.allowedDirections, d] };
    });
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 720, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{isEdit ? 'Edit policy' : 'New policy override'}</h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
        </div>
        {err && <div className="alert error">{err}</div>}

        {!isEdit && (
          <div className="form-grid" style={{ marginBottom: 8 }}>
            <div className="field">
              <label>Scope</label>
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                {SCOPES.filter((s) => s !== 'GLOBAL' || true).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <div className="hint">GLOBAL is seeded — admin only creates TIER / UNIT overrides.</div>
            </div>
            {(scope === 'TIER' || scope === 'UNIT') && (
              <div className="field">
                <label>Tier</label>
                <select value={tierCode} onChange={(e) => setTierCode(e.target.value)}>
                  {TIER_CODES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            )}
            {scope === 'UNIT' && (
              <div className="field full">
                <label>Unit</label>
                <UnitDrillDownPicker
                  tierCode={tierCode}
                  value={unitId}
                  onChange={setUnitId}
                />
              </div>
            )}
          </div>
        )}

        <div className="rm-card" style={{ marginTop: 8 }}>
          <div className="rm-card-bar"><span className="rm-card-bar-label">Meeting rules</span></div>
          <div className="rm-card-body">
            <div className="form-grid">
              <div className="field">
                <label>Quorum minimum (hard fail)</label>
                <input type="number" min="0" value={meeting.quorumMin} onChange={(e) => setMeeting((p) => ({ ...p, quorumMin: e.target.value }))} />
              </div>
              <div className="field">
                <label>Quorum warning (soft)</label>
                <input type="number" min="0" value={meeting.quorumWarn} onChange={(e) => setMeeting((p) => ({ ...p, quorumWarn: e.target.value }))} />
              </div>
              <div className="field">
                <label>Min attendance %</label>
                <input type="number" min="0" max="100" value={meeting.minAttendancePercent} onChange={(e) => setMeeting((p) => ({ ...p, minAttendancePercent: e.target.value }))} />
              </div>
              <div className="field">
                <label className="toggle-row">
                  <input type="checkbox" checked={meeting.requirePreviousReport} onChange={(e) => setMeeting((p) => ({ ...p, requirePreviousReport: e.target.checked }))} />
                  Require previous report attached
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="rm-card" style={{ marginTop: 12 }}>
          <div className="rm-card-bar"><span className="rm-card-bar-label">Finance rules</span></div>
          <div className="rm-card-body">
            <div className="form-grid">
              <div className="field">
                <label>Auto-approve below (PKR)</label>
                <input type="number" min="0" value={finance.expenseAutoApproveBelow} onChange={(e) => setFinance((p) => ({ ...p, expenseAutoApproveBelow: e.target.value }))} />
              </div>
              <div className="field">
                <label>Second approver above (PKR)</label>
                <input type="number" min="0" value={finance.expenseRequireSecondApproverAbove} onChange={(e) => setFinance((p) => ({ ...p, expenseRequireSecondApproverAbove: e.target.value }))} />
              </div>
              <div className="field">
                <label>Donation CNIC above (PKR)</label>
                <input type="number" min="0" value={finance.donationCnicRequiredAbove} onChange={(e) => setFinance((p) => ({ ...p, donationCnicRequiredAbove: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>

        <div className="rm-card" style={{ marginTop: 12 }}>
          <div className="rm-card-bar"><span className="rm-card-bar-label">Transfer rules</span></div>
          <div className="rm-card-body">
            <div className="form-grid">
              <div className="field full">
                <label>Allowed directions</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {TRANSFER_DIRECTIONS.map((d) => {
                    const on = transfer.allowedDirections.includes(d);
                    return (
                      <label key={d} className={`rm-perm-tile ${on ? 'on' : ''}`} style={{ flex: 1 }}>
                        <input type="checkbox" checked={on} onChange={() => toggleDirection(d)} />
                        <span className="rm-perm-tile-label">{d}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <div className="field">
                <label>President approval above (PKR)</label>
                <input type="number" min="0" value={transfer.requirePresidentApprovalAbove} onChange={(e) => setTransfer((p) => ({ ...p, requirePresidentApprovalAbove: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="field">
            <label className="toggle-row">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={policy?.isSystem} />
              Active
            </label>
          </div>
          <div className="field full">
            <label>Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Why this override exists" />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : (isEdit ? 'Save' : 'Create')}</button>
        </div>
      </div>
    </div>
  );
}

// Drill-down picker — Province → District → Area → Basic Unit.
// Lazily fetches each level when its parent is chosen so we never
// pull a giant list up-front. Emits the leaf ObjectId via onChange
// once tierCode is reached.
function UnitDrillDownPicker({ tierCode, value, onChange }) {
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [basicUnits, setBasicUnits] = useState([]);
  const [pId, setPId] = useState('');
  const [dId, setDId] = useState('');
  const [aId, setAId] = useState('');
  const [bId, setBId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // Tiers we still need to descend through
  const needs = useMemo(() => {
    switch (tierCode) {
      case 'CENTRAL': return [];
      case 'PROVINCE': return ['province'];
      case 'DISTRICT': return ['province', 'district'];
      case 'AREA': return ['province', 'district', 'area'];
      case 'BASIC_UNIT': return ['province', 'district', 'area', 'basicUnit'];
      default: return [];
    }
  }, [tierCode]);

  // Initial load: provinces (always needed unless tier=CENTRAL)
  useEffect(() => {
    if (!needs.includes('province')) return;
    let cancelled = false;
    setBusy(true); setErr('');
    api.get('/org/provinces')
      .then((r) => { if (!cancelled) setProvinces(r.data?.data || []); })
      .catch((e) => { if (!cancelled) setErr(errorMessage(e)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [needs]);

  // Cascade fetches
  useEffect(() => {
    if (!pId || !needs.includes('district')) { setDistricts([]); return; }
    let cancelled = false;
    api.get('/org/districts', { params: { provinceId: pId } })
      .then((r) => { if (!cancelled) setDistricts(r.data?.data || []); })
      .catch(() => { if (!cancelled) setDistricts([]); });
    return () => { cancelled = true; };
  }, [pId, needs]);
  useEffect(() => {
    if (!dId || !needs.includes('area')) { setAreas([]); return; }
    let cancelled = false;
    api.get('/org/areas', { params: { districtId: dId } })
      .then((r) => { if (!cancelled) setAreas(r.data?.data || []); })
      .catch(() => { if (!cancelled) setAreas([]); });
    return () => { cancelled = true; };
  }, [dId, needs]);
  useEffect(() => {
    if (!aId || !needs.includes('basicUnit')) { setBasicUnits([]); return; }
    let cancelled = false;
    api.get('/org/basic-units', { params: { areaId: aId } })
      .then((r) => { if (!cancelled) setBasicUnits(r.data?.data || []); })
      .catch(() => { if (!cancelled) setBasicUnits([]); });
    return () => { cancelled = true; };
  }, [aId, needs]);

  // Reset descendant selections when an ancestor changes
  useEffect(() => { setDId(''); setAId(''); setBId(''); }, [pId]);
  useEffect(() => { setAId(''); setBId(''); }, [dId]);
  useEffect(() => { setBId(''); }, [aId]);

  // Emit the leaf id matching tierCode whenever it changes
  useEffect(() => {
    let leaf = '';
    if (tierCode === 'PROVINCE') leaf = pId;
    else if (tierCode === 'DISTRICT') leaf = dId;
    else if (tierCode === 'AREA') leaf = aId;
    else if (tierCode === 'BASIC_UNIT') leaf = bId;
    if (leaf !== (value || '')) onChange(leaf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierCode, pId, dId, aId, bId]);

  if (tierCode === 'CENTRAL') {
    return <div className="hint">CENTRAL is a singleton — no unit selection needed.</div>;
  }

  return (
    <div>
      {err && <div className="alert error" style={{ marginBottom: 8 }}>{err}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
        {needs.includes('province') && (
          <select value={pId} onChange={(e) => setPId(e.target.value)} disabled={busy}>
            <option value="">— Province —</option>
            {provinces.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
        )}
        {needs.includes('district') && (
          <select value={dId} onChange={(e) => setDId(e.target.value)} disabled={!pId}>
            <option value="">— District —</option>
            {districts.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
        )}
        {needs.includes('area') && (
          <select value={aId} onChange={(e) => setAId(e.target.value)} disabled={!dId}>
            <option value="">— Area —</option>
            {areas.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>
        )}
        {needs.includes('basicUnit') && (
          <select value={bId} onChange={(e) => setBId(e.target.value)} disabled={!aId}>
            <option value="">— Basic Unit —</option>
            {basicUnits.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
          </select>
        )}
      </div>
      {value && (
        <div className="hint" style={{ marginTop: 4 }}>
          Selected: <code>{String(value).slice(-8)}</code>
        </div>
      )}
    </div>
  );
}
