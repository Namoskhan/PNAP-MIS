import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSettings, patchSettings } from '../../../api/branding';
import { errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { useBranding } from '../../../context/BrandingContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import { CameraIcon, TypeIcon } from '../../../components/icons';

// Typography editor — five tunable typography vars. Curated font
// family list (no admin font upload — security/legal reasons).
// Numeric ranges match server validation: baseFontSize 12–18,
// borderRadius 0–24, spacingScale 0.8–1.5.
//
// Live preview block at the top reflects current edits via inline
// `style` so admin sees the impact before saving.

const FONT_FAMILY_PRESETS = [
  { value: 'Inter, system-ui, sans-serif',         label: 'Inter (default)' },
  { value: 'system-ui, sans-serif',                label: 'System UI' },
  { value: 'Roboto, system-ui, sans-serif',        label: 'Roboto' },
  { value: '"Open Sans", system-ui, sans-serif',   label: 'Open Sans' },
  { value: 'Poppins, system-ui, sans-serif',       label: 'Poppins' },
  { value: 'Nunito, system-ui, sans-serif',        label: 'Nunito' },
  { value: 'Georgia, serif',                       label: 'Georgia (serif)' },
];

export default function TypographyPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const branding = useBranding();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = hasPermission(user, 'MANAGE_SYSTEM_BRANDING');

  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setBusy(true); setErr('');
    try {
      const s = await fetchSettings();
      const t = s?.typography || {};
      setForm({
        fontFamily:        t.fontFamily        || 'Inter, system-ui, sans-serif',
        headingFontFamily: t.headingFontFamily || t.fontFamily || 'Inter, system-ui, sans-serif',
        baseFontSize:      typeof t.baseFontSize === 'number' ? t.baseFontSize : 14,
        headingScale:      typeof t.headingScale === 'number' ? t.headingScale : 1.2,
        borderRadius:      typeof t.borderRadius === 'number' ? t.borderRadius : 8,
        spacingScale:      typeof t.spacingScale === 'number' ? t.spacingScale : 1.0,
      });
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setErr('');
    try {
      await patchSettings({ typography: form, changeNote: 'Typography updated' });
      toast.success?.(t('admin.settings.typographySaved', 'Typography saved.'));
      branding.refresh?.();
      load();
    } catch (e) { setErr(errorMessage(e)); toast.error?.(errorMessage(e)); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><TypeIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">{t('admin.settings.typography', 'Typography')}</h2>
            <div className="rm-hero-sub">
              {t('admin.settings.typographySub', 'Font family, base size, border radius, and spacing scale. Applied globally on save.')}
            </div>
          </div>
          <div className="rm-hero-actions">
            <Link to="/admin/settings" className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>{t('admin.settings.backToSettings', '← Back')}</Link>
            <button className="rm-hero-btn outline" onClick={load} disabled={saving}>⟳ {t('common.refresh', 'Refresh')}</button>
          </div>
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}
      {busy && (
        <div className="rm-loading">
          <span className="scope-spinner" aria-hidden="true" />
          <span className="muted">{t('common.loading', 'Loading…')}</span>
        </div>
      )}

      {!busy && form && (
        <>
          {/* Live preview reflecting current form state */}
          <div className="rm-card">
            <div className="rm-card-bar">
              <span className="rm-card-bar-icon" aria-hidden="true"><CameraIcon size={15} /></span>
              <span className="rm-card-bar-label">{t('admin.settings.preview', 'Preview')}</span>
            </div>
            <div className="rm-card-body" style={{
              fontFamily: form.fontFamily,
              fontSize: `${form.baseFontSize}px`,
            }}>
              <div style={{
                fontFamily: form.headingFontFamily,
                fontSize: `${form.baseFontSize * form.headingScale}px`,
                fontWeight: 700,
                marginBottom: 4,
              }}>
                {t('admin.settings.headingSample', 'Heading sample')}
              </div>
              <div style={{ marginBottom: 8 }}>
                {t('admin.settings.bodySample', 'The quick brown fox jumps over the lazy dog. 1234567890.')}
              </div>
              <button style={{
                background: 'var(--primary)',
                color: 'var(--text-inverse, #fff)',
                border: 'none',
                padding: `${6 * form.spacingScale}px ${14 * form.spacingScale}px`,
                borderRadius: `${form.borderRadius}px`,
                fontSize: `${form.baseFontSize}px`,
                fontWeight: 600,
                cursor: 'pointer',
              }}>
                {t('admin.settings.sampleButton', 'Sample button')}
              </button>
            </div>
          </div>

          <div className="rm-card" style={{ marginTop: 12 }}>
            <div className="rm-card-bar">
              <span className="rm-card-bar-label">{t('admin.settings.fonts', 'Fonts')}</span>
            </div>
            <div className="rm-card-body">
              <div className="form-grid">
                <div className="field full">
                  <label>{t('admin.settings.bodyFontFamily', 'Body font family')}</label>
                  <select
                    value={form.fontFamily}
                    onChange={(e) => setForm((p) => ({ ...p, fontFamily: e.target.value }))}
                    disabled={!canWrite}
                  >
                    {FONT_FAMILY_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <div className="hint">{t('admin.settings.bodyFontFamilyHelp', "Curated list. Custom-uploaded fonts aren't supported (legal/security).")}</div>
                </div>
                <div className="field full">
                  <label>{t('admin.settings.headingFontFamily', 'Heading font family')}</label>
                  <select
                    value={form.headingFontFamily}
                    onChange={(e) => setForm((p) => ({ ...p, headingFontFamily: e.target.value }))}
                    disabled={!canWrite}
                  >
                    {FONT_FAMILY_PRESETS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  <div className="hint">{t('admin.settings.headingFontFamilyHelp', 'Pair with the body font or pick a contrasting display face for headings.')}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rm-card" style={{ marginTop: 12 }}>
            <div className="rm-card-bar">
              <span className="rm-card-bar-label">{t('admin.settings.sizing', 'Sizing')}</span>
            </div>
            <div className="rm-card-body">
              <div className="form-grid">
                <div className="field">
                  <label>{t('admin.settings.baseFontSize', 'Base font size: {{size}}px', { size: form.baseFontSize })}</label>
                  <input
                    type="range" min="12" max="18" step="1"
                    value={form.baseFontSize}
                    onChange={(e) => setForm((p) => ({ ...p, baseFontSize: Number(e.target.value) }))}
                    disabled={!canWrite}
                  />
                  <div className="hint">{t('admin.settings.baseFontSizeHelp', 'Default 14px. Affects every body-text style.')}</div>
                </div>
                <div className="field">
                  <label>{t('admin.settings.headingScale', 'Heading scale: {{scale}}×', { scale: form.headingScale.toFixed(2) })}</label>
                  <input
                    type="range" min="1" max="1.5" step="0.05"
                    value={form.headingScale}
                    onChange={(e) => setForm((p) => ({ ...p, headingScale: Number(e.target.value) }))}
                    disabled={!canWrite}
                  />
                  <div className="hint">{t('admin.settings.headingScaleHelp', 'Multiplier applied to base font size for headings.')}</div>
                </div>
                <div className="field">
                  <label>{t('admin.settings.borderRadius', 'Border radius: {{radius}}px', { radius: form.borderRadius })}</label>
                  <input
                    type="range" min="0" max="24" step="1"
                    value={form.borderRadius}
                    onChange={(e) => setForm((p) => ({ ...p, borderRadius: Number(e.target.value) }))}
                    disabled={!canWrite}
                  />
                  <div className="hint">{t('admin.settings.borderRadiusHelp', '0 = square corners. 24 = very rounded.')}</div>
                </div>
                <div className="field">
                  <label>{t('admin.settings.spacingScale', 'Spacing scale: {{scale}}×', { scale: form.spacingScale.toFixed(2) })}</label>
                  <input
                    type="range" min="0.8" max="1.5" step="0.05"
                    value={form.spacingScale}
                    onChange={(e) => setForm((p) => ({ ...p, spacingScale: Number(e.target.value) }))}
                    disabled={!canWrite}
                  />
                  <div className="hint">{t('admin.settings.spacingScaleHelp', 'Compresses or expands button and card padding globally.')}</div>
                </div>
              </div>
            </div>
          </div>

          {canWrite && (
            <div className="rm-footer">
              <Link to="/admin/settings" className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>{t('common.cancel', '× Cancel')}</Link>
              <button className="rm-hero-btn solid" disabled={saving} onClick={save}>
                {saving ? t('common.saving', 'Saving…') : `✓ ${t('admin.settings.saveTypography', 'Save typography')}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
