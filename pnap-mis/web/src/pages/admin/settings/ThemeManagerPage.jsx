import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSettings, patchSettings, listPresets, applyPreset } from '../../../api/branding';
import { errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { useBranding } from '../../../context/BrandingContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import ColorPicker from '../../../components/branding/ColorPicker';
import ThemePreviewPane from '../../../components/branding/ThemePreviewPane';
import PresetGallery from '../../../components/branding/PresetGallery';
import { CameraIcon, FolderIcon, MoonIcon, PaletteIcon, TargetIcon, XIcon } from '../../../components/icons';

import dialog from '../../../components/dialog';
// Theme Manager — full color editor + light/dark mode toggle + preset
// gallery + side-by-side preview. Color tokens are grouped by purpose
// (Brand / Surfaces / Text / Borders / Status / Tiers) so admins can
// reason about contrast invariants.
//
// Save semantics: PATCH the full theme block with both light + dark
// palettes. Server validates WCAG contrast on the merged result; if
// any pair fails, the response includes structured errors which we
// surface inline under the offending tokens.

const TOKEN_GROUPS = [
  { title: 'Brand', tokens: [
    { key: 'primary',     label: 'Primary',     contrastWith: 'textInverse', contrastLabel: 'button label' },
    { key: 'primaryDark', label: 'Primary dark' },
    { key: 'secondary',   label: 'Secondary' },
    { key: 'accent',      label: 'Accent' },
  ]},
  { title: 'Surfaces', tokens: [
    { key: 'background', label: 'Page background' },
    { key: 'surface',    label: 'Card surface',     contrastWith: 'textPrimary', contrastLabel: 'body text' },
    { key: 'sidebarBg',  label: 'Sidebar background', contrastWith: 'sidebarFg', contrastLabel: 'sidebar text' },
    { key: 'sidebarFg',  label: 'Sidebar text' },
    { key: 'navbarBg',   label: 'Top-bar background' },
  ]},
  { title: 'Text', tokens: [
    { key: 'textPrimary', label: 'Primary text', contrastWith: 'background', contrastLabel: 'body on bg' },
    { key: 'textMuted',   label: 'Muted text',   contrastWith: 'background', contrastLabel: 'muted on bg', contrastTarget: 3 },
    { key: 'textInverse', label: 'Inverse text', contrastWith: 'primary',    contrastLabel: 'button label' },
  ]},
  { title: 'Borders', tokens: [
    { key: 'borderSoft',   label: 'Soft border' },
    { key: 'borderStrong', label: 'Strong border' },
  ]},
  { title: 'Status', tokens: [
    { key: 'success', label: 'Success' },
    { key: 'warning', label: 'Warning' },
    { key: 'danger',  label: 'Danger' },
    { key: 'info',    label: 'Info' },
  ]},
  { title: 'Tier badges', tokens: [
    { key: 'tierCentral',   label: 'Central',    contrastWith: 'surface', contrastLabel: 'pill on card', contrastTarget: 3 },
    { key: 'tierProvince',  label: 'Province',   contrastWith: 'surface', contrastLabel: 'pill on card', contrastTarget: 3 },
    { key: 'tierDistrict',  label: 'District',   contrastWith: 'surface', contrastLabel: 'pill on card', contrastTarget: 3 },
    { key: 'tierArea',      label: 'Area',       contrastWith: 'surface', contrastLabel: 'pill on card', contrastTarget: 3 },
    { key: 'tierBasicUnit', label: 'Basic Unit', contrastWith: 'surface', contrastLabel: 'pill on card', contrastTarget: 3 },
  ]},
];

// The settings endpoints do NOT all answer in the same shape:
//
//   PATCH /settings                     -> { settings, versionNumber, diffSize }
//   POST  /settings/theme/apply-preset  -> { settings, versionNumber }
//
// Reading `res.theme` off either of those yields undefined, and feeding
// that back into state used to blank the page — the render guard below
// treats a missing theme as "still loading", so the editor would sit on
// its spinner forever even though the save had succeeded and the new
// colors were already live. Every response is funnelled through here so
// one endpoint changing shape can never wedge the editor again.
function themeFromResponse(res) {
  return res?.settings?.theme || res?.theme || null;
}

const EMPTY_THEME = { activeMode: 'LIGHT', presetName: 'PKNAP_DEFAULT', light: {}, dark: {} };

export default function ThemeManagerPage() {
  const { user } = useAuth();
  const branding = useBranding();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = hasPermission(user, 'MANAGE_SYSTEM_BRANDING');

  const [theme, setTheme] = useState(null); // { activeMode, presetName, light, dark }
  // The last palette known to be persisted. Compared against `theme` to
  // decide whether Save has anything to do.
  const [savedTheme, setSavedTheme] = useState(null);
  const [presets, setPresets] = useState([]);
  const [editingMode, setEditingMode] = useState('LIGHT'); // which palette tab is being edited
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serverErrors, setServerErrors] = useState([]);
  const [err, setErr] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  // Commit a theme that came back from the server. Refuses to install a
  // null — a write that answered in an unexpected shape leaves the
  // admin's current edits on screen with an error, rather than wiping
  // the editor.
  function commitTheme(next, context) {
    if (!next) {
      setErr(
        `The server saved your changes but answered in an unexpected shape (${context}). ` +
        'Press Refresh to reload the stored theme.'
      );
      return false;
    }
    setTheme(next);
    setSavedTheme(next);
    return true;
  }

  async function load() {
    setBusy(true); setErr(''); setServerErrors([]);
    try {
      const [s, p] = await Promise.all([fetchSettings(), listPresets()]);
      const t = s?.theme || EMPTY_THEME;
      setTheme(t);
      setSavedTheme(t);
      setPresets(p);
    } catch (e) {
      setErr(errorMessage(e));
      // Without this the catch would leave `theme` null and the render
      // guard would show "Loading theme…" instead of the error we just
      // set — a failed fetch has to look like a failure, not a hang.
      setTheme((prev) => prev || EMPTY_THEME);
    }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  // Save is only meaningful when the editor differs from what is stored.
  const dirty = useMemo(
    () => Boolean(theme && savedTheme) && JSON.stringify(theme) !== JSON.stringify(savedTheme),
    [theme, savedTheme]
  );

  // Map of token key → array of error messages, indexed by editing mode
  const errorsByToken = useMemo(() => {
    const out = {};
    for (const e of serverErrors) {
      // err.path looks like 'light.primary' or 'light.textPrimary/surface'
      const m = String(e.path || '').match(/^(light|dark)\.([a-zA-Z]+)/);
      if (!m) continue;
      const mode = m[1].toUpperCase();
      const token = m[2];
      const key = `${mode}::${token}`;
      (out[key] = out[key] || []).push(e.message);
    }
    return out;
  }, [serverErrors]);

  function setToken(key, value) {
    setTheme((prev) => {
      const slot = editingMode === 'DARK' ? 'dark' : 'light';
      return {
        ...prev,
        presetName: 'CUSTOM',
        [slot]: { ...prev[slot], [key]: value },
      };
    });
  }

  function setActiveMode(mode) {
    setTheme((prev) => ({ ...prev, activeMode: mode }));
  }

  async function applyPresetByCode(code) {
    if (!await dialog.confirm(`Apply preset "${code}"? This overwrites the current theme. You can rollback from Settings History after saving.`)) return;
    setSaving(true); setServerErrors([]);
    try {
      const updated = await applyPreset(code);
      // apply-preset answers { settings, versionNumber } — NOT { theme }.
      commitTheme(themeFromResponse(updated), 'apply preset');
      branding.refresh?.();
      toast.success?.(`Preset "${code}" applied.`);
    } catch (e) {
      // Surface the validator's per-token detail like the save path
      // does — a bare "failed validation" gives the admin nothing
      // to act on.
      const details = e?.response?.data?.error?.details;
      if (details?.errors) {
        setServerErrors(details.errors);
        toast.error?.(`Preset "${code}" failed validation — ${details.errors.length} issue(s) below`);
      } else {
        toast.error?.(errorMessage(e));
      }
    }
    finally { setSaving(false); }
  }

  function exportTheme() {
    // Theme-only export (not the full settings dump). Keeps the
    // shape narrow so admins can hand-edit, swap presets across
    // installs, or rollback to a known palette.
    const payload = {
      kind: 'pnap-mis.theme',
      version: 1,
      exportedAt: new Date().toISOString(),
      theme: {
        activeMode: theme.activeMode,
        presetName: theme.presetName,
        light: theme.light || {},
        dark: theme.dark || {},
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `pnap-theme-${(theme.presetName || 'custom').toLowerCase()}-${stamp}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    toast.success?.('Theme exported.');
  }

  async function applyImportedTheme(parsed) {
    setSaving(true); setServerErrors([]); setErr('');
    try {
      const t = parsed?.theme || parsed; // accept bare-theme JSON too
      if (!t || typeof t !== 'object') throw new Error('Invalid theme file');
      const updated = await patchSettings({
        theme: {
          activeMode: t.activeMode || theme.activeMode,
          presetName: t.presetName || 'CUSTOM',
          light: t.light || theme.light,
          dark: t.dark || theme.dark,
        },
        changeNote: 'Theme imported from JSON',
      });
      commitTheme(themeFromResponse(updated), 'import theme');
      branding.refresh?.();
      toast.success?.('Theme imported & saved.');
      setImportOpen(false);
    } catch (e) {
      const details = e?.response?.data?.error?.details;
      if (details?.errors) {
        setServerErrors(details.errors);
        toast.error?.(`Imported theme failed validation — ${details.errors.length} issue(s)`);
      } else {
        toast.error?.(errorMessage(e));
      }
    } finally { setSaving(false); }
  }

  async function save() {
    setSaving(true); setErr(''); setServerErrors([]);
    try {
      const updated = await patchSettings({
        theme: {
          activeMode: theme.activeMode,
          // presetName: server flips to CUSTOM automatically when palette
          // drifts from any locked preset; we just send our local view.
          presetName: theme.presetName,
          light: theme.light,
          dark: theme.dark,
        },
        changeNote: 'Theme updated',
      });
      commitTheme(themeFromResponse(updated), 'save theme');
      branding.refresh?.();
      toast.success?.('Theme saved.');
    } catch (e) {
      // The themeValidator returns a structured error list under
      // err.response.data.error.details.errors. Surface it inline.
      const details = e?.response?.data?.error?.details;
      if (details?.errors) {
        setServerErrors(details.errors);
        toast.error?.(`Theme failed validation — ${details.errors.length} issue(s) below`);
      } else {
        setErr(errorMessage(e));
        toast.error?.(errorMessage(e));
      }
    } finally { setSaving(false); }
  }

  // The spinner is tied to an in-flight load and NOTHING else. It used
  // to also fire on `!theme`, which meant any write that returned an
  // unrecognised shape put the page into a "loading" state it could
  // never leave — the request had already finished, so nothing was ever
  // going to clear it.
  if (busy) {
    return (
      <div className="rm-loading">
        <span className="scope-spinner" aria-hidden="true" />
        <span className="muted">Loading theme…</span>
      </div>
    );
  }

  if (!theme) {
    return (
      <div className="rm-card">
        <div className="rm-card-body">
          <div className="alert error" style={{ marginBottom: 12 }}>
            {err || 'The theme could not be loaded.'}
          </div>
          <button className="rm-hero-btn outline" onClick={load}>⟳ Retry</button>
        </div>
      </div>
    );
  }

  const editingPalette = editingMode === 'DARK' ? (theme.dark || {}) : (theme.light || {});

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><PaletteIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Theme Manager</h2>
            <div className="rm-hero-sub">
              Edit color palettes for light + dark modes. WCAG contrast checks run server-side at save —
              tokens that fail are highlighted inline.
            </div>
          </div>
          <div className="rm-hero-actions">
            <Link to="/admin/settings" className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>← Back</Link>
            <button className="rm-hero-btn outline" onClick={load} disabled={saving}>⟳ Refresh</button>
            <button className="rm-hero-btn outline" onClick={exportTheme} disabled={saving || !theme}>⤓ Export</button>
            {canWrite && (
              <button className="rm-hero-btn outline" onClick={() => setImportOpen(true)} disabled={saving}>⤒ Import</button>
            )}
          </div>
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}
      {serverErrors.length > 0 && (
        <div className="alert error">
          <strong>Theme failed validation.</strong>{' '}
          Fix the highlighted tokens and save again.
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
            {serverErrors.slice(0, 6).map((e, i) => (
              <li key={i}><code>{e.path}</code>: {e.message}</li>
            ))}
            {serverErrors.length > 6 && <li>…and {serverErrors.length - 6} more</li>}
          </ul>
        </div>
      )}

      {/* Mode selector */}
      <div className="rm-card">
        <div className="rm-card-bar">
          <span className="rm-card-bar-icon" aria-hidden="true"><MoonIcon size={15} /></span>
          <span className="rm-card-bar-label">Active mode</span>
        </div>
        <div className="rm-card-body">
          <div style={{ display: 'flex', gap: 8 }}>
            {['LIGHT', 'DARK', 'AUTO'].map((m) => {
              const on = theme.activeMode === m;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setActiveMode(m)}
                  disabled={!canWrite}
                  className={`rm-perm-tile ${on ? 'on' : ''} ${!canWrite ? 'readonly' : ''}`}
                  style={{ flex: 1, padding: 14, fontFamily: 'inherit', fontSize: 13, cursor: 'pointer' }}
                >
                  <span className="rm-perm-tile-label">
                    <strong>{m}</strong>
                    {' — '}
                    {m === 'LIGHT' ? 'force light palette'
                      : m === 'DARK' ? 'force dark palette'
                      : 'follow OS preference'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Preset gallery */}
      <div className="rm-card" style={{ marginTop: 12 }}>
        <div className="rm-card-bar">
          <span className="rm-card-bar-icon" aria-hidden="true"><PaletteIcon size={15} /></span>
          <span className="rm-card-bar-label">Presets</span>
          <span className="rm-card-bar-count">{theme.presetName}</span>
        </div>
        <div className="rm-card-body">
          <PresetGallery
            presets={presets}
            currentPresetName={theme.presetName}
            onApply={applyPresetByCode}
            disabled={!canWrite || saving}
          />
        </div>
      </div>

      {/* Editor + preview side-by-side on wide screens */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 380px)',
        gap: 14,
        marginTop: 12,
      }}>
        {/* Editor */}
        <div>
          <div className="rm-card">
            <div className="rm-card-bar">
              <span className="rm-card-bar-icon" aria-hidden="true"><TargetIcon size={15} /></span>
              <span className="rm-card-bar-label">Editing palette</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {['LIGHT', 'DARK'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setEditingMode(m)}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      border: editingMode === m ? '2px solid var(--primary)' : '1px solid var(--border-soft)',
                      background: editingMode === m ? 'rgba(30, 64, 175, 0.06)' : 'transparent',
                      color: editingMode === m ? 'var(--primary)' : 'inherit',
                      cursor: 'pointer',
                    }}
                  >{m}</button>
                ))}
              </div>
            </div>
          </div>

          {TOKEN_GROUPS.map((group) => (
            <div key={group.title} className="rm-card" style={{ marginTop: 10 }}>
              <div className="rm-card-bar">
                <span className="rm-card-bar-label">{group.title}</span>
              </div>
              <div className="rm-card-body">
                <div className="form-grid">
                  {group.tokens.map((t) => {
                    const errKey = `${editingMode}::${t.key}`;
                    const tokenErrors = errorsByToken[errKey] || [];
                    return (
                      <div key={t.key} className="field full">
                        <ColorPicker
                          label={t.label}
                          value={editingPalette[t.key] || ''}
                          onChange={(v) => setToken(t.key, v)}
                          contrastWith={t.contrastWith ? editingPalette[t.contrastWith] : undefined}
                          contrastTarget={t.contrastTarget}
                          contrastLabel={t.contrastLabel}
                          disabled={!canWrite}
                        />
                        {tokenErrors.length > 0 && (
                          <div className="hint" style={{ color: 'var(--danger)' }}>
                            {tokenErrors.map((m, i) => <div key={i}>⚠ {m}</div>)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Preview */}
        <div>
          <div className="rm-card" style={{ position: 'sticky', top: 16 }}>
            <div className="rm-card-bar">
              <span className="rm-card-bar-icon" aria-hidden="true"><CameraIcon size={15} /></span>
              <span className="rm-card-bar-label">Preview · {editingMode}</span>
            </div>
            <div className="rm-card-body" style={{ padding: 8 }}>
              <ThemePreviewPane palette={editingPalette} />
              <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                Scoped sample — your color edits don't affect the rest of the page until you click Save.
              </p>
            </div>
          </div>
        </div>
      </div>

      {canWrite && (
        <div className="rm-footer">
          {/* Whether Save will do anything is otherwise invisible: the
              editor looks identical before and after a successful save,
              so without this the only way to tell was to press it and
              watch for a toast. */}
          <span className="muted" style={{ marginRight: 'auto', fontSize: 12.5, alignSelf: 'center' }}>
            {dirty ? 'Unsaved changes' : 'All changes saved'}
          </span>
          <Link to="/admin/settings" className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>× Cancel</Link>
          <button
            className="rm-hero-btn solid"
            disabled={saving || !dirty}
            onClick={save}
            title={dirty ? 'Save the current palette' : 'No changes to save'}
          >
            {saving ? 'Saving…' : '✓ Save theme'}
          </button>
        </div>
      )}

      {importOpen && (
        <ThemeImportDialog
          onClose={() => setImportOpen(false)}
          onApply={applyImportedTheme}
          busy={saving}
        />
      )}
    </div>
  );
}

function ThemeImportDialog({ onClose, onApply, busy }) {
  const [parsed, setParsed] = useState(null);
  const [fileName, setFileName] = useState('');
  const [err, setErr] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  async function handleFile(file) {
    setErr(''); setParsed(null); setFileName(file.name);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      // Accept both the wrapped export shape (`{theme: {...}}`) and a
      // bare `{light, dark}` payload from older / hand-rolled files.
      const t = json?.theme || json;
      if (!t || typeof t !== 'object') throw new Error('File is not a valid theme JSON');
      if (!t.light && !t.dark) throw new Error('Theme must include "light" and/or "dark" palettes');
      setParsed(json);
    } catch (e) {
      setErr(e.message);
    }
  }

  function onDrop(e) {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer?.files?.[0];
    if (f) handleFile(f);
  }

  const t = parsed?.theme || parsed;
  const lightKeys = t?.light ? Object.keys(t.light).length : 0;
  const darkKeys = t?.dark ? Object.keys(t.dark).length : 0;

  return (
    <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <h3 style={{ margin: 0 }}>Import theme</h3>
          <button type="button" className="btn secondary" onClick={onClose} aria-label="Close" style={{ padding: '4px 10px', fontSize: 18, lineHeight: 1 }}><XIcon size={16} /></button>
        </div>
        {err && <div className="alert error">{err}</div>}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          style={{
            border: `2px dashed ${dragOver ? 'var(--primary)' : 'var(--border-strong)'}`,
            borderRadius: 10,
            padding: '32px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? 'rgba(185, 28, 28, 0.04)' : 'transparent',
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 6 }}><FolderIcon size={15} /></div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {fileName ? fileName : 'Drop a theme JSON here or click to browse'}
          </div>
          <div className="muted" style={{ fontSize: 12 }}>
            Files exported from this Theme Manager are accepted as-is.
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
        </div>

        {parsed && (
          <div className="rm-card" style={{ marginTop: 12 }}>
            <div className="rm-card-bar">
              <span className="rm-card-bar-icon" aria-hidden="true"><FolderIcon size={15} /></span>
              <span className="rm-card-bar-label">Preview</span>
              <span className="rm-card-bar-count">{t?.presetName || 'CUSTOM'}</span>
            </div>
            <div className="rm-card-body">
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
                <li>Active mode: <code>{t?.activeMode || '—'}</code></li>
                <li>Light palette tokens: {lightKeys}</li>
                <li>Dark palette tokens: {darkKeys}</li>
              </ul>
              <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Server runs WCAG contrast checks on apply — any failures will be highlighted on the editor.
              </p>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="btn secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn"
            disabled={!parsed || busy}
            onClick={() => onApply(parsed)}
          >
            {busy ? 'Applying…' : 'Apply & save'}
          </button>
        </div>
      </div>
    </div>
  );
}
