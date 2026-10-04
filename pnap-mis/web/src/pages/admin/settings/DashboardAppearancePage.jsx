import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSettings, patchSettings } from '../../../api/branding';
import { errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { useBranding } from '../../../context/BrandingContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import { SlidersIcon } from '../../../components/icons';

// Dashboard Appearance — six dashboard-level toggles. Each consumed
// by the relevant component:
//   • enableAnimations        → CSS `data-theme` toggles transition durations
//   • enableCountUpKpis       → CountUp short-circuits to instant when false
//   • chartStyle              → charts.jsx switches between renderers
//   • compactMode             → root `data-compact="true"` adjusts spacing
//   • glassmorphism           → root `data-glass="true"` toggles backdrop blur
//   • sidebarDefaultCollapsed → Layout's initial collapse state
//
// PR B4 ships the editor; component-side consumption lands as a
// follow-up where each consuming component is touched (small, scoped
// changes per-file). Until then these settings persist + audit but
// don't yet wire through.

const TOGGLES = [
  { key: 'enableAnimations',
    labelKey: 'admin.settings.animToggle',
    label: 'Animations',
    descKey: 'admin.settings.animToggleDesc',
    description: 'Page transitions, modal slide-ins, hover effects, count-up tweens.' },
  { key: 'enableCountUpKpis',
    labelKey: 'admin.settings.kpiCountUp',
    label: 'KPI count-up',
    descKey: 'admin.settings.kpiCountUpDesc',
    description: 'Animated number counters on dashboards. Disable for instant rendering.' },
  { key: 'compactMode',
    labelKey: 'admin.settings.compactMode',
    label: 'Compact mode',
    descKey: 'admin.settings.compactModeDesc',
    description: 'Tighter padding + smaller row heights across tables and cards.' },
  { key: 'glassmorphism',
    labelKey: 'admin.settings.glassmorphism',
    label: 'Glassmorphism',
    descKey: 'admin.settings.glassmorphismDesc',
    description: 'Translucent cards with backdrop blur. Looks modern but heavier on low-end devices.' },
  { key: 'sidebarDefaultCollapsed',
    labelKey: 'admin.settings.sidebarDefaultCollapsed',
    label: 'Sidebar collapsed by default',
    descKey: 'admin.settings.sidebarDefaultCollapsedDesc',
    description: 'New sessions start with the sidebar collapsed. Per-user preference still wins.' },
];

const CHART_STYLES = [
  { value: 'MODERN',  labelKey: 'admin.settings.chartStyleModern',  label: 'Modern',  description: 'Soft gradients, rounded bars, generous spacing.' },
  { value: 'CLASSIC', labelKey: 'admin.settings.chartStyleClassic', label: 'Classic', description: 'Flat fills, sharper bars, denser layout.' },
];

export default function DashboardAppearancePage() {
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
      const d = s?.dashboard || {};
      setForm({
        enableAnimations:        d.enableAnimations !== false,
        enableCountUpKpis:       d.enableCountUpKpis !== false,
        chartStyle:              d.chartStyle || 'MODERN',
        compactMode:             !!d.compactMode,
        glassmorphism:           !!d.glassmorphism,
        sidebarDefaultCollapsed: !!d.sidebarDefaultCollapsed,
      });
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setErr('');
    try {
      await patchSettings({ dashboard: form, changeNote: 'Dashboard appearance updated' });
      toast.success?.(t('admin.settings.appearanceSaved', 'Dashboard preferences saved.'));
      branding.refresh?.();
      load();
    } catch (e) { setErr(errorMessage(e)); toast.error?.(errorMessage(e)); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><SlidersIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">{t('admin.settings.dashboardAppearance', 'UI Preferences')}</h2>
            <div className="rm-hero-sub">
              {t('admin.settings.dashboardAppearanceSub', 'Dashboard-level toggles for animations, density, chart style, and glassmorphism. Settings persist + audit; component cutover lands incrementally.')}
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
          <div className="rm-card">
            <div className="rm-card-bar">
              <span className="rm-card-bar-label">{t('admin.settings.toggles', 'Toggles')}</span>
            </div>
            <div className="rm-card-body">
              {TOGGLES.map((item) => (
                <label
                  key={item.key}
                  className={`rm-perm-tile ${form[item.key] ? 'on' : ''} ${!canWrite ? 'readonly' : ''}`}
                  style={{ display: 'block', padding: 14, marginBottom: 8 }}
                >
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <input
                      type="checkbox"
                      checked={form[item.key]}
                      disabled={!canWrite}
                      onChange={(e) => setForm((p) => ({ ...p, [item.key]: e.target.checked }))}
                      style={{ marginTop: 2 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{t(item.labelKey, item.label)}</div>
                      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{t(item.descKey, item.description)}</div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="rm-card" style={{ marginTop: 12 }}>
            <div className="rm-card-bar">
              <span className="rm-card-bar-label">{t('admin.settings.chartStyle', 'Chart style')}</span>
            </div>
            <div className="rm-card-body">
              <div style={{ display: 'flex', gap: 10 }}>
                {CHART_STYLES.map((s) => {
                  const on = form.chartStyle === s.value;
                  return (
                    <label
                      key={s.value}
                      className={`rm-perm-tile ${on ? 'on' : ''} ${!canWrite ? 'readonly' : ''}`}
                      style={{ flex: 1, padding: 14 }}
                    >
                      <input
                        type="radio"
                        name="chartStyle"
                        value={s.value}
                        checked={on}
                        disabled={!canWrite}
                        onChange={() => setForm((p) => ({ ...p, chartStyle: s.value }))}
                      />
                      <span className="rm-perm-tile-label">
                        {t(s.labelKey, `${s.label} — ${s.description}`)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {canWrite && (
            <div className="rm-footer">
              <Link to="/admin/settings" className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>{t('common.cancel', '× Cancel')}</Link>
              <button className="rm-hero-btn solid" disabled={saving} onClick={save}>
                {saving ? t('common.saving', 'Saving…') : `✓ ${t('admin.settings.savePreferences', 'Save preferences')}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
