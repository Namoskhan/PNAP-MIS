import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSettings } from '../../../api/branding';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../utils/permissions';
import { ClockIcon, FileTextIcon, GearIcon, ImageIcon, LogInIcon, PaletteIcon, SlidersIcon, TagIcon, TypeIcon } from '../../../components/icons';

// Branding overview at /admin/settings. Shows current identity at
// a glance + cards for each editable surface. Admin-only;
// VIEW_SYSTEM_BRANDING gates read, MANAGE_SYSTEM_BRANDING gates write
// (the individual editor pages enforce write).

const SURFACES = [
  { key: 'identity', label: 'System Identity', icon: <TagIcon size={20} />,
    description: 'System name, organization name, footer, browser tab title.',
    path: '/admin/settings/identity', shipped: true },
  { key: 'login', label: 'Login Customization', icon: <LogInIcon size={20} />,
    description: 'Login page hero, welcome message, slogan, card style.',
    path: '/admin/settings/login', shipped: true },
  { key: 'logos', label: 'Logo Manager', icon: <ImageIcon size={20} />,
    description: 'Sidebar / login / favicon / print logos. Upload, preview, reset.',
    path: '/admin/settings/logos', shipped: true },
  { key: 'theme', label: 'Theme Manager', icon: <PaletteIcon size={20} />,
    description: 'Colors, dark mode, presets. Preview before apply.',
    path: '/admin/settings/theme', shipped: true },
  { key: 'typography', label: 'Typography', icon: <TypeIcon size={20} />,
    description: 'Font family, base size, border radius, spacing scale.',
    path: '/admin/settings/typography', shipped: true },
  { key: 'dashboard', label: 'UI Preferences', icon: <SlidersIcon size={20} />,
    description: 'Animations, KPI counters, chart style, compact mode, glassmorphism.',
    path: '/admin/settings/dashboard', shipped: true },
  { key: 'reports', label: 'Report Branding', icon: <FileTextIcon size={20} />,
    description: 'PDF / XLSX export header logo, footer text, theme color.',
    path: '/admin/settings/reports', shipped: true },
  { key: 'history', label: 'Settings History', icon: <ClockIcon size={20} />,
    description: 'View / rollback past versions of the branding configuration.',
    path: '/admin/settings/history', shipped: true },
];

export default function SettingsLandingPage() {
  const { user } = useAuth();
  const canRead = hasPermission(user, 'VIEW_SYSTEM_BRANDING') || hasPermission(user, 'MANAGE_SYSTEM_BRANDING');
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!canRead) { setBusy(false); return; }
    let cancel = false;
    fetchSettings()
      .then((s) => { if (!cancel) { setSettings(s); setBusy(false); } })
      .catch(() => { if (!cancel) setBusy(false); });
    return () => { cancel = true; };
  }, [canRead]);

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><GearIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">System Branding & Appearance</h2>
            <div className="rm-hero-sub">
              Configure system identity, theme, logos, and appearance — applied globally across every page,
              report, and export.
            </div>
          </div>
        </div>
      </div>

      {!canRead && (
        <div className="alert error">
          You need <code>VIEW_SYSTEM_BRANDING</code> or <code>MANAGE_SYSTEM_BRANDING</code> to view this section.
        </div>
      )}

      {canRead && settings && (
        <div className="rm-card" style={{ marginBottom: 14 }}>
          <div className="rm-card-bar">
            <span className="rm-card-bar-icon" aria-hidden="true"><TagIcon size={15} /></span>
            <span className="rm-card-bar-label">Current identity</span>
            <span className="rm-card-bar-count">v{settings.settingsVersion || 1}</span>
          </div>
          <div className="rm-card-body">
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13 }}>
              <li><strong>System name:</strong> {settings.identity?.systemName || '—'}</li>
              <li><strong>Short name:</strong> {settings.identity?.shortName || '—'}</li>
              <li><strong>Organization:</strong> {settings.identity?.organizationName || '—'}</li>
              <li><strong>Browser tab title:</strong> {settings.identity?.browserTabTitle || '—'}</li>
              <li><strong>Theme:</strong> {settings.theme?.presetName || '—'} · <code>{settings.theme?.activeMode || '—'}</code> mode</li>
            </ul>
          </div>
        </div>
      )}

      {canRead && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 14,
          marginTop: 12,
        }}>
          {SURFACES.map((s) => {
            const inner = (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--primary)' }} aria-hidden="true">{s.icon}</span>
                  <strong style={{ fontSize: 14 }}>{s.label}</strong>
                  {!s.shipped && <span className="rm-row-tag inactive">Coming in next PR</span>}
                </div>
                <div className="muted" style={{ fontSize: 13 }}>{s.description}</div>
              </>
            );
            const baseStyle = {
              display: 'block',
              padding: 18,
              textDecoration: 'none',
              color: 'inherit',
              border: '1px solid var(--border)',
              borderRadius: 12,
              background: s.shipped ? 'var(--surface)' : 'rgba(148, 163, 184, 0.06)',
              cursor: s.shipped ? 'pointer' : 'not-allowed',
              transition: 'transform .12s ease, box-shadow .12s ease',
            };
            if (!s.shipped) {
              return <div key={s.key} className="rm-card" style={baseStyle}>{inner}</div>;
            }
            return (
              <Link
                key={s.key}
                to={s.path}
                className="rm-card"
                style={baseStyle}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 6px 14px rgba(15, 23, 42, 0.08)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >{inner}</Link>
            );
          })}
        </div>
      )}

      {busy && (
        <div className="rm-loading">
          <span className="scope-spinner" aria-hidden="true" />
          <span className="muted">Loading…</span>
        </div>
      )}
    </div>
  );
}
