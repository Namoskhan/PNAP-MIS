import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import { TagIcon, TrashIcon, UsersIcon, XIcon } from '../../../components/icons';

import dialog from '../../../components/dialog';
// Cabinet Structure — full CRUD for CabinetTemplate. Built-in slots
// from the SRS-defined templates are isSystem (locked from delete);
// admin can edit isMandatory / sortOrder / forward-compat fields,
// add custom slots, and roll out new slots to existing units.

const TIER_CODES = ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'];
const APPLIES_TO_BODY = ['BOTH', 'EXECUTIVE', 'COMMITTEE'];

export default function CabinetTemplatesPage() {
  const { user } = useAuth();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = hasPermission(user, 'MANAGE_UNIT_CONFIG');

  const [templates, setTemplates] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [tierFilter, setTierFilter] = useState('');

  async function load() {
    setBusy(true); setErr('');
    try {
      const params = tierFilter ? { tier: tierFilter } : {};
      const r = await api.get('/admin/units/cabinet-templates', { params });
      setTemplates(r.data?.data || []);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, [tierFilter]);

  async function rollout(t) {
    try {
      const r = await api.post(`/admin/units/cabinet-templates/${t._id}/rollout`);
      const n = r.data?.data?.rolledOutTo || 0;
      toast.success?.(n > 0 ? `Rolled out to ${n} unit(s).` : 'Already present on all units.');
      load();
    } catch (e) { toast.error?.(errorMessage(e)); }
  }

  async function deleteTemplate(t) {
    if (t.isSystem) return;
    if (!await dialog.confirm(`Delete custom slot "${t.roleCode}" at ${t.tierCode}? Vacant slots on units will also be removed.`)) return;
    try {
      const r = await api.delete(`/admin/units/cabinet-templates/${t._id}`);
      const removed = r.data?.data?.vacantSlotsRemoved || 0;
      toast.success?.(removed ? `Template deleted; ${removed} vacant slot(s) removed.` : 'Template deleted.');
      load();
    } catch (e) { toast.error?.(errorMessage(e)); }
  }

  // Group by tier for display
  const groups = useMemo(() => {
    const g = {};
    for (const t of templates) {
      (g[t.tierCode] = g[t.tierCode] || []).push(t);
    }
    return g;
  }, [templates]);

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><UsersIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Cabinet Structure</h2>
            <div className="rm-hero-sub">
              Cabinet slots per tier — required vs optional, term length, body applicability, propose/decide gating.
            </div>
          </div>
          <div className="rm-hero-actions">
            <select
              value={tierFilter}
              onChange={(e) => setTierFilter(e.target.value)}
              style={{ padding: '7px 10px', borderRadius: 8 }}
            >
              <option value="">All tiers</option>
              {TIER_CODES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <button className="rm-hero-btn outline" onClick={load}>⟳ Refresh</button>
            {canWrite && (
              <button className="rm-hero-btn solid" onClick={() => setCreateOpen(true)}>＋ New Slot</button>
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

      {!busy && TIER_CODES.filter((t) => groups[t]?.length > 0).map((tierCode) => (
        <div key={tierCode} className="rm-card" style={{ marginBottom: 14 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-icon" aria-hidden="true"><TagIcon size={15} /></span>
            <span className="rm-card-bar-label">{tierCode}</span>
            <span className="rm-card-bar-count">{groups[tierCode].length} slot(s)</span>
          </div>
          {groups[tierCode].map((t) => (
            <div key={t._id} className={`rm-row ${t.isSystem ? 'locked' : ''}`}>
              <div className="rm-row-avatar">
                <span aria-hidden="true">{t.roleCode.charAt(0)}</span>
                {t.isSystem && <span className="rm-row-avatar-badge" title="Built-in">🔒</span>}
              </div>
              <div className="rm-row-meta">
                <div className="rm-row-name">
                  {t.roleCode}
                  {t.isMandatory && <span className="rm-row-tag custom">required</span>}
                  {!t.isSystem && <span className="rm-row-tag custom">custom</span>}
                  {!t.isActive && <span className="rm-row-tag inactive">inactive</span>}
                </div>
                <div className="rm-row-sub">
                  <span>order {t.sortOrder}</span>
                  <span className="muted">·</span>
                  <span>{t.appliesToBody}</span>
                  <span className="muted">·</span>
                  <span>{t.termDays > 0 ? `${t.termDays}-day term` : 'indefinite'}</span>
                </div>
              </div>
              <div className="rm-row-actions">
                <button
                  className="rm-action perms"
                  onClick={() => rollout(t)}
                  disabled={!canWrite || !t.isActive}
                  title="Backfill this slot to every existing unit at the tier"
                >Rollout</button>
                <button
                  className="rm-action edit"
                  onClick={() => setEditing(t)}
                  disabled={!canWrite}
                >Edit</button>
                {!t.isSystem && canWrite && (
                  <button className="rm-action delete" onClick={() => deleteTemplate(t)}><TrashIcon size={13} /> Delete</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {!busy && Object.keys(groups).length === 0 && (
        <div className="rm-card">
          <div className="rm-empty">No cabinet templates match the current filter.</div>
        </div>
      )}

      {createOpen && (
        <CabinetTemplateDialog
          mode="create"
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load(); toast.success?.('Slot created.'); }}
        />
      )}
      {editing && (
        <CabinetTemplateDialog
          mode="edit"
          template={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast.success?.('Slot updated.'); }}
        />
      )}
    </div>
  );
}

function CabinetTemplateDialog({ mode, template, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [tierCode, setTierCode] = useState(template?.tierCode || 'AREA');
  const [roleCode, setRoleCode] = useState(template?.roleCode || '');
  const [isMandatory, setIsMandatory] = useState(!!template?.isMandatory);
  const [sortOrder, setSortOrder] = useState(template?.sortOrder ?? 100);
  const [appliesToBody, setAppliesToBody] = useState(template?.appliesToBody || 'BOTH');
  const [termDays, setTermDays] = useState(template?.termDays ?? 0);
  const [isActive, setIsActive] = useState(template?.isActive !== false);
  const [rolloutToExistingUnits, setRolloutToExistingUnits] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function save() {
    setErr(''); setBusy(true);
    try {
      const payload = {
        isMandatory: !!isMandatory,
        sortOrder: parseInt(sortOrder, 10) || 100,
        appliesToBody,
        termDays: parseInt(termDays, 10) || 0,
        isActive: !!isActive,
      };
      if (isEdit) {
        await api.patch(`/admin/units/cabinet-templates/${template._id}`, payload);
      } else {
        payload.tierCode = tierCode;
        payload.roleCode = roleCode.toUpperCase();
        payload.rolloutToExistingUnits = !!rolloutToExistingUnits;
        await api.post('/admin/units/cabinet-templates', payload);
      }
      onSaved();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 580 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{isEdit ? 'Edit cabinet slot' : 'New cabinet slot'}</h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
        </div>
        {err && <div className="alert error">{err}</div>}
        {isEdit && (
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>
            <code>{template.tierCode}:{template.roleCode}</code> — tier and role code are locked once created.
          </p>
        )}
        <div className="form-grid">
          <div className="field">
            <label>Tier</label>
            <select value={tierCode} onChange={(e) => setTierCode(e.target.value)} disabled={isEdit}>
              {TIER_CODES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Role code</label>
            <input
              value={roleCode}
              onChange={(e) => setRoleCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
              disabled={isEdit}
              placeholder="YOUTH_COORDINATOR"
              maxLength={60}
            />
            <div className="hint">{isEdit ? 'Locked.' : 'Must already exist in the Role catalogue.'}</div>
          </div>
          <div className="field">
            <label>Sort order</label>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </div>
          <div className="field">
            <label>Applies to body</label>
            <select value={appliesToBody} onChange={(e) => setAppliesToBody(e.target.value)}>
              {APPLIES_TO_BODY.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Term (days)</label>
            <input type="number" min="0" value={termDays} onChange={(e) => setTermDays(e.target.value)} />
            <div className="hint">0 = indefinite. Enforcement lands in a follow-up PR.</div>
          </div>
          <div className="field">
            <label className="toggle-row">
              <input type="checkbox" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} />
              Mandatory slot (cabinet must fill this)
            </label>
          </div>
          <div className="field">
            <label className="toggle-row">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
          </div>
          {!isEdit && (
            <div className="field full">
              <label className="toggle-row">
                <input type="checkbox" checked={rolloutToExistingUnits} onChange={(e) => setRolloutToExistingUnits(e.target.checked)} />
                Roll out to all existing units at this tier immediately
              </label>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || (!isEdit && !roleCode)} onClick={save}>
            {busy ? 'Saving…' : (isEdit ? 'Save' : 'Create')}
          </button>
        </div>
      </div>
    </div>
  );
}
