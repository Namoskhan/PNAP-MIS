import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import { BarChartIcon, GlobeIcon, ScaleIcon, TagIcon, TrashIcon, XIcon } from '../../../components/icons';

import dialog from '../../../components/dialog';
// Performance Rules — list + full create/edit dialog (PR F2).
// Default GLOBAL ruleset uses SRS §10 weights. Component editor
// enforces weight-sum=1.0 with a normalize helper so admins don't
// have to do floating-point math themselves.

const METRIC_LABELS = {
  MEETING_ATTENDANCE: 'Meeting attendance',
  ACTIVITY_PARTICIPATION: 'Activity participation',
  RESPONSIBILITY_COMPLETION: 'Responsibility completion',
  DONATION_CONTRIBUTION: 'Donation contribution',
  STUDY_CONTRIBUTION: 'Study contribution',
};
const ALL_METRICS = Object.keys(METRIC_LABELS);
const TIER_CODES = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];

export default function PerformanceRuleSetsPage() {
  const { user } = useAuth();
  const toast = useToast?.() || { success: () => { }, error: () => { } };
  const canWrite = hasPermission(user, 'MANAGE_UNIT_CONFIG');

  const [items, setItems] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setBusy(true); setErr('');
    try {
      const [r, m] = await Promise.all([
        api.get('/admin/units/performance-rulesets'),
        api.get('/admin/units/performance-rulesets/metrics'),
      ]);
      setItems(r.data?.data || []);
      setMetrics(m.data?.data || []);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function deleteOne(r) {
    if (r.isSystem) return;
    if (!await dialog.confirm(`Delete TIER ruleset for ${r.tierCode}?`)) return;
    try {
      await api.delete(`/admin/units/performance-rulesets/${r._id}`);
      toast.success?.('Ruleset deleted.');
      load();
    } catch (e) { toast.error?.(errorMessage(e)); }
  }

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><BarChartIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Performance Rules</h2>
            <div className="rm-hero-sub">
              Weighted scoring formula for member performance.
              Resolution: TIER override → GLOBAL fallback. Weights must sum to 100%.
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

      {!busy && items.map((r) => {
        const total = (r.components || []).reduce((s, c) => s + (c.weight || 0), 0);
        return (
          <div key={r._id} className="rm-card" style={{ marginBottom: 12 }}>
            <div className="rm-card-bar">
              <span className="rm-card-bar-icon" aria-hidden="true">{r.scope === 'GLOBAL' ? <GlobeIcon size={15} /> : <TagIcon size={15} />}</span>
              <span className="rm-card-bar-label">
                {r.name} · {r.scope}{r.tierCode ? ` · ${r.tierCode}` : ''}
                {r.isSystem && ' · built-in'}
                {!r.isActive && ' · inactive'}
              </span>
              <span className="rm-card-bar-count">v{r.rulesetVersion || 1}</span>
            </div>
            <div className="rm-card-body">
              {r.description && <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{r.description}</p>}
              {(r.components || []).length === 0 ? (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>No components — no scoring active.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px', fontSize: 13 }}>
                  {r.components.map((c, i) => (
                    <PerfBar key={i} metric={c.metric} weight={c.weight} />
                  ))}
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, fontWeight: 600 }}>Total</div>
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, fontWeight: 600, textAlign: 'right' }}>
                    {(total * 100).toFixed(0)}%
                  </div>
                </div>
              )}
              {canWrite && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                  <button className="rm-action edit" onClick={() => setEditing(r)}>Edit components</button>
                  {!r.isSystem && (
                    <button className="rm-action delete" onClick={() => deleteOne(r)}><TrashIcon size={13} /> Delete</button>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {!busy && items.length === 0 && (
        <div className="rm-card">
          <div className="rm-empty">No rulesets configured.</div>
        </div>
      )}

      {createOpen && (
        <RulesetDialog
          mode="create"
          metrics={metrics}
          existing={items}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load(); toast.success?.('Ruleset created.'); }}
        />
      )}
      {editing && (
        <RulesetDialog
          mode="edit"
          ruleset={editing}
          metrics={metrics}
          existing={items}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast.success?.('Ruleset updated.'); }}
        />
      )}
    </div>
  );
}

function PerfBar({ metric, weight }) {
  const pct = (weight || 0) * 100;
  const label = METRIC_LABELS[metric] || metric;
  return (
    <>
      <div>
        <div style={{ fontWeight: 500 }}>{label}</div>
        <div style={{ height: 6, background: 'rgba(148, 163, 184, 0.18)', borderRadius: 3, marginTop: 4 }}>
          <div style={{ height: 6, width: `${pct}%`, background: 'var(--primary)', borderRadius: 3 }} />
        </div>
      </div>
      <div style={{ alignSelf: 'center', textAlign: 'right' }}>{pct.toFixed(0)}%</div>
    </>
  );
}

function RulesetDialog({ mode, ruleset, metrics, existing, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [name, setName] = useState(ruleset?.name || '');
  const [description, setDescription] = useState(ruleset?.description || '');
  const [isActive, setIsActive] = useState(ruleset?.isActive !== false);
  const [components, setComponents] = useState(() => {
    if (ruleset?.components?.length) return ruleset.components.map((c) => ({ ...c, params: { ...(c.params || {}) } }));
    return [{ metric: 'MEETING_ATTENDANCE', weight: 1, params: {} }];
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const metricsByCode = useMemo(() => {
    const m = new Map();
    for (const x of metrics) m.set(x.code, x);
    return m;
  }, [metrics]);

  // Tiers already taken (avoid letting admin try to create a dup, then fail at the API)
  const takenTiers = useMemo(() => new Set(
    (existing || []).filter((r) => r.scope === 'TIER' && (!ruleset || r._id !== ruleset._id)).map((r) => r.tierCode),
  ), [existing, ruleset]);

  const availableTiers = useMemo(() => TIER_CODES.filter((t) => !takenTiers.has(t)), [takenTiers]);

  const [tierCode, setTierCode] = useState(() => ruleset?.tierCode || availableTiers[0] || 'AREA');

  useEffect(() => {
    if (!isEdit && availableTiers.length > 0 && !availableTiers.includes(tierCode)) {
      setTierCode(availableTiers[0]);
    }
  }, [availableTiers, isEdit, tierCode]);

  const weightTotal = components.reduce((s, c) => s + Number(c.weight || 0), 0);
  const weightOk = Math.abs(weightTotal - 1) < 0.01;
  const dupMetric = (() => {
    const seen = new Set();
    for (const c of components) {
      if (seen.has(c.metric)) return c.metric;
      seen.add(c.metric);
    }
    return null;
  })();

  function addComponent() {
    const used = new Set(components.map((c) => c.metric));
    const free = ALL_METRICS.find((m) => !used.has(m));
    if (!free) return;
    const def = metricsByCode.get(free);
    setComponents((arr) => [...arr, { metric: free, weight: 0, params: { ...(def?.defaultParams || {}) } }]);
  }
  function removeComponent(idx) {
    setComponents((arr) => arr.filter((_, i) => i !== idx));
  }
  function updateComponent(idx, patch) {
    setComponents((arr) => arr.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }
  function updateWeight(idx, rawValue) {
    const clean = String(rawValue).replace(/[^0-9.]/g, '');
    if (clean === '' || clean === '.') {
      updateComponent(idx, { weight: 0, _rawWeight: clean });
      return;
    }
    const num = parseFloat(clean);
    if (!isNaN(num)) {
      const clamped = Math.max(0, Math.min(1, num));
      updateComponent(idx, { weight: Math.round(clamped * 1000) / 1000, _rawWeight: clean });
    } else {
      updateComponent(idx, { _rawWeight: clean });
    }
  }
  function adjustWeightBy(idx, delta) {
    const cur = Number(components[idx]?.weight || 0);
    const next = Math.max(0, Math.min(1, Math.round((cur + delta) * 1000) / 1000));
    updateComponent(idx, { weight: next, _rawWeight: String(next) });
  }
  function setWeightExact(idx, decimal) {
    const clamped = Math.max(0, Math.min(1, Math.round(decimal * 1000) / 1000));
    updateComponent(idx, { weight: clamped, _rawWeight: String(clamped) });
  }
  function normalize() {
    if (components.length === 0) return;
    const sum = components.reduce((s, c) => s + (Number(c.weight) || 0), 0);
    let scaled;
    if (sum <= 0) {
      // Equal-split fallback
      const w = Math.round((1 / components.length) * 1000) / 1000;
      scaled = components.map((_, i) =>
        i === components.length - 1 ? Math.round((1 - w * (components.length - 1)) * 1000) / 1000 : w
      );
    } else {
      scaled = components.map((c) => Math.round(((Number(c.weight) || 0) / sum) * 1000) / 1000);
      const residue = Math.round((1 - scaled.reduce((s, w) => s + w, 0)) * 1000) / 1000;
      if (Math.abs(residue) > 0) {
        let maxIdx = 0;
        for (let i = 1; i < scaled.length; i++) if (scaled[i] > scaled[maxIdx]) maxIdx = i;
        scaled[maxIdx] = Math.round((scaled[maxIdx] + residue) * 1000) / 1000;
      }
    }
    setComponents((arr) => arr.map((c, i) => ({ ...c, weight: scaled[i], _rawWeight: String(scaled[i]) })));
  }

  async function save() {
    setErr(''); setBusy(true);
    try {
      if (!name.trim() || name.trim().length < 2) throw new Error('Name must be at least 2 characters');
      const targetTier = isEdit ? ruleset?.tierCode : (tierCode || availableTiers[0]);
      if (!isEdit && !targetTier) throw new Error('Please select a valid tier for this ruleset');
      if (!weightOk) throw new Error(`Component weights must sum to 100% (currently ${(weightTotal * 100).toFixed(0)}%)`);
      if (dupMetric) throw new Error(`Duplicate metric "${METRIC_LABELS[dupMetric]}" — each may appear once`);

      const cleanComponents = components.map((c) => {
        const out = { metric: c.metric, weight: Number(c.weight || 0) };
        const def = metricsByCode.get(c.metric);
        const paramKeys = Object.keys(def?.defaultParams || {});
        if (paramKeys.length > 0) {
          const params = {};
          for (const k of paramKeys) {
            const raw = c.params?.[k];
            const fallback = def.defaultParams[k];
            params[k] = typeof fallback === 'number'
              ? (raw === '' || raw == null ? fallback : Number(raw))
              : (raw == null ? fallback : raw);
          }
          out.params = params;
        }
        return out;
      });

      if (isEdit) {
        await api.patch(`/admin/units/performance-rulesets/${ruleset._id}`, {
          name: name.trim(),
          description: description.trim() || undefined,
          components: cleanComponents,
          isActive,
        });
      } else {
        await api.post('/admin/units/performance-rulesets', {
          name: name.trim(),
          description: description.trim() || undefined,
          scope: 'TIER',
          tierCode: targetTier,
          components: cleanComponents,
          isActive,
        });
      }
      onSaved();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 800, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>
            {isEdit ? `Edit ruleset · ${ruleset.scope}${ruleset.tierCode ? ' · ' + ruleset.tierCode : ''}` : 'New TIER ruleset'}
          </h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
        </div>
        {err && <div className="alert error" style={{ marginBottom: 12 }}>{err}</div>}

        <div className="rm-card">
          <div className="rm-card-bar">
            <span className="rm-card-bar-icon" aria-hidden="true"><BarChartIcon size={15} /></span>
            <span className="rm-card-bar-label">Ruleset</span>
          </div>
          <div className="rm-card-body">
            <div className="form-grid">
              <div className="field full">
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Area-level scoring (donor-heavy)" />
              </div>
              {!isEdit && (
                <div className="field">
                  <label>Tier</label>
                  <select value={tierCode} onChange={(e) => setTierCode(e.target.value)} disabled={availableTiers.length === 0}>
                    {availableTiers.length === 0
                      ? <option value="">All tiers have overrides</option>
                      : availableTiers.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div className="hint">One ruleset per tier. GLOBAL is seeded — edit it directly.</div>
                </div>
              )}
              <div className="field full">
                <label>Description (optional)</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
              </div>
            </div>
          </div>
        </div>

        <div className="rm-card" style={{ marginTop: 12 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-icon" aria-hidden="true"><ScaleIcon size={15} /></span>
            <span className="rm-card-bar-label">Components</span>
            <span className="rm-card-bar-count" style={{ color: weightOk ? 'inherit' : 'var(--danger)' }}>
              {(weightTotal * 100).toFixed(0)}% / 100%
            </span>
          </div>
          <div className="rm-card-body">
            {components.map((c, idx) => {
              const def = metricsByCode.get(c.metric);
              const paramKeys = Object.keys(def?.defaultParams || {});
              const used = new Set(components.map((cc, i) => i !== idx ? cc.metric : null).filter(Boolean));
              return (
                <div key={idx} style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <strong style={{ fontSize: 13 }}>Component {idx + 1}</strong>
                    <div style={{ flex: 1 }} />
                    <button type="button" className="rm-action delete" onClick={() => removeComponent(idx)} disabled={components.length <= 1}><TrashIcon size={14} /></button>
                  </div>
                  <div className="form-grid">
                    <div className="field">
                      <label>Metric</label>
                      <select
                        value={c.metric}
                        onChange={(e) => {
                          const newMetric = e.target.value;
                          const newDef = metricsByCode.get(newMetric);
                          updateComponent(idx, { metric: newMetric, params: { ...(newDef?.defaultParams || {}) } });
                        }}
                      >
                        {ALL_METRICS.map((m) => (
                          <option key={m} value={m} disabled={used.has(m)}>{METRIC_LABELS[m]}</option>
                        ))}
                      </select>
                      {def?.description && <div className="hint">{def.description}</div>}
                    </div>
                    <div className="field">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <label style={{ margin: 0 }}>Weight</label>
                        <span style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: 'var(--primary)',
                          background: 'rgba(37, 99, 235, 0.1)',
                          padding: '2px 8px',
                          borderRadius: 4,
                        }}>
                          {(Number(c.weight || 0) * 100).toFixed(1).replace(/\.0$/, '')}%
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: '6px 10px', fontSize: 12 }}
                          onClick={() => adjustWeightBy(idx, -0.05)}
                        >
                          -0.05
                        </button>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={c._rawWeight !== undefined ? c._rawWeight : String(c.weight ?? 0)}
                          onChange={(e) => updateWeight(idx, e.target.value)}
                          placeholder="0.25"
                          style={{ textAlign: 'center', fontWeight: 600 }}
                        />
                        <button
                          type="button"
                          className="btn secondary"
                          style={{ padding: '6px 10px', fontSize: 12 }}
                          onClick={() => adjustWeightBy(idx, 0.05)}
                        >
                          +0.05
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                        {[0.1, 0.2, 0.25, 0.333, 0.5, 1.0].map((preset) => {
                          const isActive = Math.abs((c.weight || 0) - preset) < 0.01;
                          return (
                            <button
                              key={preset}
                              type="button"
                              className={`btn ${isActive ? '' : 'secondary'}`}
                              style={{ padding: '2px 6px', fontSize: 11, minHeight: 'auto' }}
                              onClick={() => setWeightExact(idx, preset)}
                            >
                              {preset === 1 ? '1.0' : preset === 0.333 ? '0.33' : preset.toFixed(2)}
                            </button>
                          );
                        })}
                      </div>
                      <div className="hint">Decimal between 0.0 and 1.0 (e.g. 0.25 = 25%)</div>
                    </div>
                    {paramKeys.map((k) => {
                      const fallback = def.defaultParams[k];
                      const isNum = typeof fallback === 'number';
                      return (
                        <div key={k} className="field">
                          <label>Param · {k}</label>
                          <input
                            type={isNum ? 'number' : 'text'}
                            value={c.params?.[k] ?? ''}
                            placeholder={String(fallback)}
                            onChange={(e) => updateComponent(idx, {
                              params: { ...(c.params || {}), [k]: isNum && e.target.value !== '' ? Number(e.target.value) : e.target.value },
                            })}
                          />
                          <div className="hint">Default: {String(fallback)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
              <button type="button" className="btn secondary" onClick={addComponent} disabled={components.length >= ALL_METRICS.length}>
                ＋ Add component
              </button>
              <button type="button" className="btn secondary" onClick={normalize}>
                Normalize to 100%
              </button>
              {!weightOk && (
                <span style={{ fontSize: 12, color: 'var(--danger)' }}>
                  Weights must sum to 100% (currently {(weightTotal * 100).toFixed(0)}%)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="field">
            <label className="toggle-row">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={ruleset?.isSystem} />
              Active
            </label>
            {ruleset?.isSystem && <div className="hint">Seeded GLOBAL ruleset cannot be deactivated.</div>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn" disabled={busy || !weightOk || dupMetric || components.length === 0} onClick={save}>
            {busy ? 'Saving…' : (isEdit ? 'Save changes' : 'Create ruleset')}
          </button>
        </div>
      </div>
    </div>
  );
}
