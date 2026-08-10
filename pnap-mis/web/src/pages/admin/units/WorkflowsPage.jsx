import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import { GlobeIcon, RepeatIcon, TagIcon, TrashIcon, XIcon } from '../../../components/icons';

import dialog from '../../../components/dialog';
// Workflow Manager — list + full stage-builder dialog (PR F2).
// Default GLOBAL chains have one stage matching the legacy gate;
// admins can now add stages, attach thresholds, and create TIER
// overrides from this page directly.

const DOMAIN_LABELS = {
  EXPENSE_APPROVAL: 'Expense approval',
  MEMBER_APPROVAL: 'Member approval',
  ROLE_APPROVAL: 'Role approval',
  TRANSFER_APPROVAL: 'Transfer approval',
  CABINET_APPOINTMENT: 'Cabinet appointment',
};
const DOMAINS = Object.keys(DOMAIN_LABELS);
const TIER_CODES = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];

export default function WorkflowsPage() {
  const { user } = useAuth();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = hasPermission(user, 'MANAGE_UNIT_CONFIG');

  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setBusy(true); setErr('');
    try {
      const r = await api.get('/admin/units/workflows');
      setItems(r.data?.data || []);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function deleteOne(w) {
    if (w.isSystem) return;
    if (!await dialog.confirm(`Delete the ${w.scope} workflow for ${w.domain}${w.tierCode ? ' · ' + w.tierCode : ''}?`)) return;
    try {
      await api.delete(`/admin/units/workflows/${w._id}`);
      toast.success?.('Workflow deleted.');
      load();
    } catch (e) { toast.error?.(errorMessage(e)); }
  }

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><RepeatIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Workflow Manager</h2>
            <div className="rm-hero-sub">
              Approval chains per domain. Default GLOBAL chains have one stage matching the legacy gate.
              Add stages or thresholds to chain in second approvers.
            </div>
          </div>
          <div className="rm-hero-actions">
            <button className="rm-hero-btn outline" onClick={load}>⟳ Refresh</button>
            {canWrite && (
              <button className="rm-hero-btn solid" onClick={() => setCreateOpen(true)}>＋ TIER Override</button>
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

      {!busy && items.map((w) => (
        <div key={w._id} className="rm-card" style={{ marginBottom: 12 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-icon" aria-hidden="true">{w.scope === 'GLOBAL' ? <GlobeIcon size={15} /> : <TagIcon size={15} />}</span>
            <span className="rm-card-bar-label">
              {DOMAIN_LABELS[w.domain] || w.domain}
              {' · '}{w.scope}{w.tierCode ? ` · ${w.tierCode}` : ''}
              {w.isSystem && ' · built-in'}
              {!w.isActive && ' · inactive'}
            </span>
            <span className="rm-card-bar-count">v{w.configVersion || 1} · {w.stages?.length || 0} stage(s)</span>
          </div>
          <div className="rm-card-body">
            {(w.stages || []).length === 0 ? (
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>No stages defined.</p>
            ) : (
              <ol style={{ margin: 0, paddingLeft: 20, fontSize: 13 }}>
                {w.stages.map((s, i) => (
                  <li key={s.code || i} style={{ marginBottom: 4 }}>
                    <strong>{s.name}</strong>
                    {' '}<code style={{ fontSize: 11 }}>{s.code}</code>
                    {s.requirePermission && <> · requires <code>{s.requirePermission}</code></>}
                    {s.requireRoleCode && <> · role <code>{s.requireRoleCode}</code></>}
                    {typeof s.thresholdAmount === 'number' && s.thresholdAmount > 0 && (
                      <> · skip below {s.thresholdAmount.toLocaleString()} on <code>{s.thresholdField}</code></>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {w.note && <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>{w.note}</p>}
            {canWrite && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                <button className="rm-action edit" onClick={() => setEditing(w)}>Edit stages</button>
                {!w.isSystem && (
                  <button className="rm-action delete" onClick={() => deleteOne(w)}><TrashIcon size={13} /> Delete</button>
                )}
              </div>
            )}
          </div>
        </div>
      ))}

      {!busy && items.length === 0 && (
        <div className="rm-card">
          <div className="rm-empty">No workflows configured.</div>
        </div>
      )}

      {createOpen && (
        <WorkflowDialog
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load(); toast.success?.('Workflow created.'); }}
        />
      )}
      {editing && (
        <WorkflowDialog
          mode="edit"
          workflow={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast.success?.('Workflow updated.'); }}
        />
      )}
    </div>
  );
}

function WorkflowDialog({ mode, workflow, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [domain, setDomain] = useState(workflow?.domain || 'EXPENSE_APPROVAL');
  const [scope, setScope] = useState(workflow?.scope || 'TIER');
  const [tierCode, setTierCode] = useState(workflow?.tierCode || 'AREA');
  const [isActive, setIsActive] = useState(workflow?.isActive !== false);
  const [note, setNote] = useState(workflow?.note || '');
  const [stages, setStages] = useState(() => {
    const src = workflow?.stages || [];
    return src.length > 0
      ? src.map((s) => ({ ...s }))
      : [{ code: 'STAGE_1', name: 'Initial review', sortOrder: 10, requirePermission: 'APPROVE_EXPENSE' }];
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  function addStage() {
    setStages((arr) => [
      ...arr,
      {
        code: `STAGE_${arr.length + 1}`,
        name: `Stage ${arr.length + 1}`,
        sortOrder: (arr[arr.length - 1]?.sortOrder || 0) + 10,
        requirePermission: '',
      },
    ]);
  }
  function removeStage(idx) {
    setStages((arr) => arr.filter((_, i) => i !== idx));
  }
  function updateStage(idx, patch) {
    setStages((arr) => arr.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }
  function moveStage(idx, dir) {
    setStages((arr) => {
      const next = arr.slice();
      const j = idx + dir;
      if (j < 0 || j >= next.length) return arr;
      [next[idx], next[j]] = [next[j], next[idx]];
      // Re-derive sortOrder from position to keep ordering stable
      return next.map((s, i) => ({ ...s, sortOrder: (i + 1) * 10 }));
    });
  }

  async function save() {
    setErr(''); setBusy(true);
    try {
      // Strip empty optional strings so server-side Zod accepts the
      // payload (regex on permission codes rejects empty strings).
      const cleanStages = stages.map((s) => {
        const out = {
          code: String(s.code || '').toUpperCase(),
          name: s.name || '',
          sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : 100,
        };
        if (s.requirePermission) out.requirePermission = String(s.requirePermission).toUpperCase();
        if (s.requireRoleCode) out.requireRoleCode = String(s.requireRoleCode).toUpperCase();
        if (s.thresholdField) out.thresholdField = s.thresholdField;
        if (typeof s.thresholdAmount === 'number' && s.thresholdAmount > 0) {
          out.thresholdAmount = s.thresholdAmount;
        }
        if (s.skipBelowThreshold != null) out.skipBelowThreshold = !!s.skipBelowThreshold;
        return out;
      });

      if (isEdit) {
        await api.patch(`/admin/units/workflows/${workflow._id}`, {
          stages: cleanStages,
          isActive,
          note: note || undefined,
        });
      } else {
        await api.post('/admin/units/workflows', {
          domain,
          scope,
          tierCode: scope === 'TIER' ? tierCode : undefined,
          stages: cleanStages,
          isActive,
          note: note || undefined,
        });
      }
      onSaved();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 760, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{isEdit ? `Edit workflow · ${workflow.domain}` : 'New workflow (TIER override)'}</h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
        </div>
        {err && <div className="alert error">{err}</div>}

        {!isEdit && (
          <div className="form-grid" style={{ marginBottom: 12 }}>
            <div className="field">
              <label>Domain</label>
              <select value={domain} onChange={(e) => setDomain(e.target.value)}>
                {DOMAINS.map((d) => <option key={d} value={d}>{DOMAIN_LABELS[d]}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Scope</label>
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="TIER">TIER override</option>
                {/* GLOBAL is seeded; no create option */}
              </select>
            </div>
            <div className="field">
              <label>Tier</label>
              <select value={tierCode} onChange={(e) => setTierCode(e.target.value)}>
                {TIER_CODES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
        )}

        <div className="rm-card">
          <div className="rm-card-bar">
            <span className="rm-card-bar-icon" aria-hidden="true"><RepeatIcon size={15} /></span>
            <span className="rm-card-bar-label">Stages</span>
            <span className="rm-card-bar-count">{stages.length}</span>
          </div>
          <div className="rm-card-body">
            {stages.map((s, idx) => (
              <div key={idx} style={{
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: 12,
                marginBottom: 10,
                position: 'relative',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <strong style={{ fontSize: 13 }}>Stage {idx + 1}</strong>
                  <div style={{ flex: 1 }} />
                  <button type="button" className="rm-action edit" onClick={() => moveStage(idx, -1)} disabled={idx === 0}>↑</button>
                  <button type="button" className="rm-action edit" onClick={() => moveStage(idx, +1)} disabled={idx === stages.length - 1}>↓</button>
                  <button type="button" className="rm-action delete" onClick={() => removeStage(idx)} disabled={stages.length <= 1}><TrashIcon size={14} /></button>
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label>Code</label>
                    <input
                      value={s.code || ''}
                      onChange={(e) => updateStage(idx, { code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                      maxLength={60}
                      placeholder="FINANCE_APPROVAL"
                    />
                    <div className="hint">Locked once published. Used as the audit-chain key.</div>
                  </div>
                  <div className="field">
                    <label>Name</label>
                    <input
                      value={s.name || ''}
                      onChange={(e) => updateStage(idx, { name: e.target.value })}
                      maxLength={80}
                    />
                  </div>
                  <div className="field">
                    <label>Require permission</label>
                    <input
                      value={s.requirePermission || ''}
                      onChange={(e) => updateStage(idx, { requirePermission: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                      placeholder="APPROVE_EXPENSE"
                      maxLength={60}
                    />
                  </div>
                  <div className="field">
                    <label>Require role (optional)</label>
                    <input
                      value={s.requireRoleCode || ''}
                      onChange={(e) => updateStage(idx, { requireRoleCode: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
                      placeholder="FINANCE_SECRETARY"
                      maxLength={60}
                    />
                  </div>
                  <div className="field">
                    <label>Threshold field (optional)</label>
                    <input
                      value={s.thresholdField || ''}
                      onChange={(e) => updateStage(idx, { thresholdField: e.target.value })}
                      placeholder="amount"
                      maxLength={40}
                    />
                  </div>
                  <div className="field">
                    <label>Threshold amount (skip below)</label>
                    <input
                      type="number" min="0"
                      value={s.thresholdAmount ?? ''}
                      onChange={(e) => updateStage(idx, { thresholdAmount: e.target.value === '' ? undefined : Number(e.target.value) })}
                    />
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="btn secondary" onClick={addStage}>＋ Add stage</button>
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="field">
            <label className="toggle-row">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={workflow?.isSystem} />
              Active
            </label>
          </div>
          <div className="field full">
            <label>Note (optional)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || stages.length === 0} onClick={save}>
            {busy ? 'Saving…' : (isEdit ? 'Save stages' : 'Create workflow')}
          </button>
        </div>
      </div>
    </div>
  );
}
