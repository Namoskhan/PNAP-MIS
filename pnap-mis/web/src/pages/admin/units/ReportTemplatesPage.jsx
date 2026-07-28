import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import { FileTextIcon, PuzzleIcon, TrashIcon } from '../../../components/icons';

// Report Templates — list + render + full composer dialog (PR F2).
// Sections registry is locked in code; admin composes pre-built
// sections into a template (sortOrder, title, per-section config).

const TIER_CODES = ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'];
const FORMATS = ['PDF', 'XLSX', 'BOTH'];

export default function ReportTemplatesPage() {
  const { user } = useAuth();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = hasPermission(user, 'MANAGE_UNIT_CONFIG');

  const [templates, setTemplates] = useState([]);
  const [sections, setSections] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [renderingFor, setRenderingFor] = useState(null);
  const [editing, setEditing] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    setBusy(true); setErr('');
    try {
      const [tplRes, secRes] = await Promise.all([
        api.get('/admin/units/report-templates'),
        api.get('/admin/units/report-templates/sections'),
      ]);
      setTemplates(tplRes.data?.data || []);
      setSections(secRes.data?.data || []);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function deleteTemplate(t) {
    if (t.isSystem) return;
    if (!confirm(`Delete template "${t.name}"?`)) return;
    try {
      await api.delete(`/admin/units/report-templates/${t._id}`);
      toast.success?.('Template deleted.');
      load();
    } catch (e) { toast.error?.(errorMessage(e)); }
  }

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><FileTextIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Report Templates</h2>
            <div className="rm-hero-sub">
              Composable PDF / XLSX reports built from pre-built sections.
              New section kinds need a code review; templates compose existing ones.
            </div>
          </div>
          <div className="rm-hero-actions">
            <button className="rm-hero-btn outline" onClick={load}>⟳ Refresh</button>
            {canWrite && (
              <button className="rm-hero-btn solid" onClick={() => setCreateOpen(true)}>＋ New template</button>
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

      {/* Available sections — read-only reference for admin */}
      <div className="rm-card" style={{ marginBottom: 12 }}>
        <div className="rm-card-bar">
          <span className="rm-card-bar-icon" aria-hidden="true"><PuzzleIcon size={15} /></span>
          <span className="rm-card-bar-label">Available section kinds</span>
          <span className="rm-card-bar-count">{sections.length}</span>
        </div>
        <div className="rm-card-body">
          <div className="rm-perm-grid">
            {sections.map((s) => (
              <div key={s.kind} className="rm-perm-tile" title={s.description}>
                <span className="rm-perm-tile-label">
                  <code>{s.kind}</code> · {s.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Templates */}
      {!busy && templates.length === 0 && (
        <div className="rm-card">
          <div className="rm-empty">No report templates yet — click "＋ New template" to compose one.</div>
        </div>
      )}

      {!busy && templates.map((t) => (
        <div key={t._id} className="rm-card" style={{ marginBottom: 12 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-icon" aria-hidden="true"><FileTextIcon size={15} /></span>
            <span className="rm-card-bar-label">
              {t.name} · {t.format}
              {t.isSystem && ' · built-in'}
              {!t.isActive && ' · inactive'}
            </span>
            <span className="rm-card-bar-count">v{t.templateVersion || 1} · {t.sections?.length || 0} section(s)</span>
          </div>
          <div className="rm-card-body">
            {t.description && <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{t.description}</p>}
            {(t.tierScope || []).length > 0 && (
              <p style={{ fontSize: 13, margin: '4px 0' }}>
                Scope: {t.tierScope.map((s) => <code key={s} style={{ marginRight: 6 }}>{s}</code>)}
              </p>
            )}
            <ol style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 13 }}>
              {(t.sections || [])
                .slice()
                .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0))
                .map((s, i) => (
                  <li key={i}>
                    <code>{s.kind}</code>
                    {s.title && <> · "{s.title}"</>}
                    {s.config && Object.keys(s.config).length > 0 && (
                      <span className="muted"> · {Object.entries(s.config).map(([k, v]) => `${k}=${v == null ? 'any' : v}`).join(', ')}</span>
                    )}
                  </li>
                ))}
            </ol>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
              <button
                className="rm-action perms"
                onClick={() => setRenderingFor(t)}
                disabled={!t.isActive}
                title="Render this template against a unit"
              >Render</button>
              {canWrite && (
                <button className="rm-action edit" onClick={() => setEditing(t)}>Edit</button>
              )}
              {!t.isSystem && canWrite && (
                <button className="rm-action delete" onClick={() => deleteTemplate(t)}><TrashIcon size={13} /> Delete</button>
              )}
            </div>
          </div>
        </div>
      ))}

      {createOpen && (
        <TemplateDialog
          mode="create"
          sectionRegistry={sections}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); load(); toast.success?.('Template created.'); }}
        />
      )}
      {editing && (
        <TemplateDialog
          mode="edit"
          template={editing}
          sectionRegistry={sections}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast.success?.('Template updated.'); }}
        />
      )}
      {renderingFor && (
        <RenderDialog template={renderingFor} onClose={() => setRenderingFor(null)} />
      )}
    </div>
  );
}

function TemplateDialog({ mode, template, sectionRegistry, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const [name, setName] = useState(template?.name || '');
  const [description, setDescription] = useState(template?.description || '');
  const [format, setFormat] = useState(template?.format || 'PDF');
  const [tierScope, setTierScope] = useState(template?.tierScope || []);
  const [isActive, setIsActive] = useState(template?.isActive !== false);
  const [pickedSections, setPickedSections] = useState(() => {
    const src = (template?.sections || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    return src.map((s) => ({
      kind: s.kind,
      title: s.title || '',
      config: { ...(s.config || {}) },
    }));
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const registryByKind = useMemo(() => {
    const m = new Map();
    for (const s of sectionRegistry) m.set(s.kind, s);
    return m;
  }, [sectionRegistry]);

  function addSection(kind) {
    const def = registryByKind.get(kind);
    if (!def) return;
    setPickedSections((arr) => [
      ...arr,
      { kind, title: '', config: { ...(def.defaultConfig || {}) } },
    ]);
  }
  function removeSection(idx) {
    setPickedSections((arr) => arr.filter((_, i) => i !== idx));
  }
  function moveSection(idx, dir) {
    setPickedSections((arr) => {
      const next = arr.slice();
      const j = idx + dir;
      if (j < 0 || j >= next.length) return arr;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  }
  function updateSection(idx, patch) {
    setPickedSections((arr) => arr.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }
  function toggleTier(t) {
    setTierScope((arr) => arr.includes(t) ? arr.filter((x) => x !== t) : [...arr, t]);
  }

  async function save() {
    setErr(''); setBusy(true);
    try {
      if (!name.trim() || name.trim().length < 2) throw new Error('Name must be at least 2 characters');
      if (pickedSections.length === 0) throw new Error('Add at least one section');

      const cleanSections = pickedSections.map((s, i) => {
        const out = {
          kind: s.kind,
          sortOrder: (i + 1) * 10,
        };
        if (s.title?.trim()) out.title = s.title.trim();
        // Strip empty-string values from config so server-side
        // defaultConfig merge can apply its defaults instead.
        if (s.config && Object.keys(s.config).length > 0) {
          const cfg = {};
          for (const [k, v] of Object.entries(s.config)) {
            if (v === '' || v == null) continue;
            cfg[k] = v;
          }
          if (Object.keys(cfg).length > 0) out.config = cfg;
        }
        return out;
      });

      const payload = {
        name: name.trim(),
        sections: cleanSections,
        format,
        isActive,
      };
      if (description.trim()) payload.description = description.trim();
      if (tierScope.length > 0) payload.tierScope = tierScope;

      if (isEdit) {
        await api.patch(`/admin/units/report-templates/${template._id}`, payload);
      } else {
        await api.post('/admin/units/report-templates', payload);
      }
      onSaved();
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 820, maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>{isEdit ? `Edit template · ${template.name}` : 'New report template'}</h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        {err && <div className="alert error">{err}</div>}

        <div className="rm-card">
          <div className="rm-card-bar">
            <span className="rm-card-bar-icon" aria-hidden="true"><FileTextIcon size={15} /></span>
            <span className="rm-card-bar-label">Template</span>
          </div>
          <div className="rm-card-body">
            <div className="form-grid">
              <div className="field full">
                <label>Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Monthly Area summary" />
              </div>
              <div className="field full">
                <label>Description (optional)</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
              </div>
              <div className="field">
                <label>Format</label>
                <select value={format} onChange={(e) => setFormat(e.target.value)}>
                  {FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="field full">
                <label>Tier scope (optional)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {TIER_CODES.map((t) => (
                    <label key={t} className="toggle-row" style={{
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      cursor: 'pointer',
                      background: tierScope.includes(t) ? 'var(--primary)' : 'transparent',
                      color: tierScope.includes(t) ? '#fff' : 'inherit',
                    }}>
                      <input
                        type="checkbox"
                        checked={tierScope.includes(t)}
                        onChange={() => toggleTier(t)}
                        style={{ marginRight: 4 }}
                      />
                      {t}
                    </label>
                  ))}
                </div>
                <div className="hint">Empty = available to all tiers.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rm-card" style={{ marginTop: 12 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-icon" aria-hidden="true"><PuzzleIcon size={15} /></span>
            <span className="rm-card-bar-label">Sections</span>
            <span className="rm-card-bar-count">{pickedSections.length}</span>
          </div>
          <div className="rm-card-body">
            {pickedSections.length === 0 && (
              <p className="muted" style={{ fontSize: 13, margin: '0 0 10px' }}>No sections added. Pick from below.</p>
            )}

            {pickedSections.map((s, idx) => {
              const def = registryByKind.get(s.kind);
              const configKeys = Object.keys(def?.defaultConfig || {});
              return (
                <div key={idx} style={{
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <strong style={{ fontSize: 13 }}>{idx + 1}. {def?.label || s.kind}</strong>
                    <code style={{ fontSize: 11 }}>{s.kind}</code>
                    <div style={{ flex: 1 }} />
                    <button type="button" className="rm-action edit" onClick={() => moveSection(idx, -1)} disabled={idx === 0}>↑</button>
                    <button type="button" className="rm-action edit" onClick={() => moveSection(idx, +1)} disabled={idx === pickedSections.length - 1}>↓</button>
                    <button type="button" className="rm-action delete" onClick={() => removeSection(idx)}><TrashIcon size={14} /></button>
                  </div>
                  <div className="form-grid">
                    <div className="field full">
                      <label>Title override (optional)</label>
                      <input
                        value={s.title || ''}
                        onChange={(e) => updateSection(idx, { title: e.target.value })}
                        maxLength={120}
                        placeholder={def?.defaultTitle || 'Section title'}
                      />
                    </div>
                    {configKeys.map((k) => {
                      const fallback = def.defaultConfig[k];
                      const isBool = typeof fallback === 'boolean';
                      const isNum = typeof fallback === 'number';
                      return (
                        <div key={k} className="field">
                          <label>{k}</label>
                          {isBool ? (
                            <select
                              value={s.config?.[k] == null ? '' : String(s.config[k])}
                              onChange={(e) => updateSection(idx, {
                                config: { ...(s.config || {}), [k]: e.target.value === '' ? null : e.target.value === 'true' },
                              })}
                            >
                              <option value="">Default ({String(fallback)})</option>
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          ) : (
                            <input
                              type={isNum ? 'number' : 'text'}
                              value={s.config?.[k] ?? ''}
                              placeholder={fallback == null ? '(any)' : String(fallback)}
                              onChange={(e) => updateSection(idx, {
                                config: {
                                  ...(s.config || {}),
                                  [k]: e.target.value === '' ? '' : (isNum ? Number(e.target.value) : e.target.value),
                                },
                              })}
                            />
                          )}
                          <div className="hint">Default: {fallback == null ? '(any/null)' : String(fallback)}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {sectionRegistry.map((def) => (
                <button
                  key={def.kind}
                  type="button"
                  className="btn secondary"
                  onClick={() => addSection(def.kind)}
                  title={def.description}
                  disabled={pickedSections.length >= 20}
                >
                  ＋ {def.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="form-grid" style={{ marginTop: 12 }}>
          <div className="field">
            <label className="toggle-row">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              Active
            </label>
            <div className="hint">Inactive templates can't be rendered but stay editable.</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || pickedSections.length === 0} onClick={save}>
            {busy ? 'Saving…' : (isEdit ? 'Save changes' : 'Create template')}
          </button>
        </div>
      </div>
    </div>
  );
}

function RenderDialog({ template, onClose }) {
  const [unitLevel, setUnitLevel] = useState('AREA');
  const [unitId, setUnitId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [format, setFormat] = useState(
    template.format === 'BOTH' ? 'PDF' : template.format,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function go() {
    setErr(''); setBusy(true);
    try {
      const params = new URLSearchParams({ unitLevel, unitId, format });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const url = `/api/reports/templates/${template._id}/render?${params}`;
      const token = localStorage.getItem('pnap_token');
      const res = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `Render failed (${res.status})`);
      }
      const blob = await res.blob();
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl;
      a.download = `${template.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.${format.toLowerCase()}`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(dlUrl);
      onClose();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Render "{template.name}"</h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}>×</button>
        </div>
        {err && <div className="alert error">{err}</div>}
        <div className="form-grid">
          <div className="field">
            <label>Unit level</label>
            <select value={unitLevel} onChange={(e) => setUnitLevel(e.target.value)}>
              {TIER_CODES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Unit ID</label>
            <input
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              placeholder="ObjectId of the unit"
              pattern="[a-fA-F0-9]{24}"
            />
          </div>
          <div className="field">
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="field">
            <label>Format</label>
            <select value={format} onChange={(e) => setFormat(e.target.value)} disabled={template.format !== 'BOTH'}>
              <option value="PDF">PDF</option>
              <option value="XLSX">XLSX</option>
            </select>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy || !unitId} onClick={go}>{busy ? 'Rendering…' : 'Download'}</button>
        </div>
      </div>
    </div>
  );
}
