import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSettings } from '../../../api/branding';
import { errorMessage } from '../../../api/client';
import { useAuth } from '../../../context/AuthContext';
import { useBranding } from '../../../context/BrandingContext';
import { hasPermission } from '../../../utils/permissions';
import LogoUploader from '../../../components/branding/LogoUploader';
import { ImageIcon } from '../../../components/icons';

// Logo Manager — five upload slots driven by the same multipart
// pipeline. Each slot is independent; uploads only touch their
// own settings.logos[slot] entry. After every successful upload /
// reset we refresh the BrandingProvider so the sidebar logo +
// favicon update without a hard reload.

const SLOTS = [
  { slot: 'sidebar', label: 'Sidebar logo',
    description: 'Shown at the top of the sidebar in light mode.',
    recommended: '256×64 PNG, ≤100 KB' },
  { slot: 'sidebarDark', label: 'Sidebar logo (dark mode)',
    description: 'Variant used when the dark theme is active. Optional — falls back to the light-mode logo.',
    recommended: '256×64 PNG, ≤100 KB' },
  { slot: 'login', label: 'Login page logo',
    description: 'Logo above the login form. Often larger than the sidebar version.',
    recommended: '512×512 PNG, ≤200 KB' },
  { slot: 'favicon', label: 'Browser tab favicon',
    description: 'Browser tab icon. Some browsers cache favicons hard — open a new private window to verify.',
    recommended: '32×32 to 64×64 PNG, ≤50 KB' },
  { slot: 'print', label: 'Print / export logo',
    description: 'High-DPI version embedded in PDF / XLSX exports.',
    recommended: '1024×256 PNG, ≤500 KB' },
];

export default function LogoManagerPage() {
  const { user } = useAuth();
  const branding = useBranding();
  const canWrite = hasPermission(user, 'MANAGE_SYSTEM_BRANDING');

  const [logos, setLogos] = useState(null);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState('');

  async function load() {
    setBusy(true); setErr('');
    try {
      const s = await fetchSettings();
      setLogos(s?.logos || {});
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  function onChanged() {
    // Refresh the provider AND reload local state. The provider
    // applies the new favicon URL globally; the local state drives
    // the thumbnails on this page.
    branding.refresh?.();
    load();
  }

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><ImageIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Logo Manager</h2>
            <div className="rm-hero-sub">
              Upload, replace, or reset the five branding logo slots.
              Files are stored in the upload directory and served from <code>/uploads/…</code>.
            </div>
          </div>
          <div className="rm-hero-actions">
            <Link to="/admin/settings" className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>← Back</Link>
            <button className="rm-hero-btn outline" onClick={load}>⟳ Refresh</button>
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

      {!busy && logos && (
        <>
          <div className="alert" style={{
            background: 'rgba(2, 132, 199, 0.06)',
            border: '1px solid rgba(2, 132, 199, 0.2)',
            color: 'var(--info-strong)',
          }}>
            <strong>Format:</strong> JPEG, PNG, or WebP up to 5 MB.
            SVG is not supported — server-side SVG sanitization isn't wired yet (XSS risk).
          </div>
          {SLOTS.map((s) => (
            <LogoUploader
              key={s.slot}
              slot={s.slot}
              label={s.label}
              description={s.description}
              recommended={s.recommended}
              currentUrl={logos[s.slot]?.url || ''}
              onChanged={onChanged}
              disabled={!canWrite}
            />
          ))}
        </>
      )}
    </div>
  );
}
