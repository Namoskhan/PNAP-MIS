import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSettings, patchSettings } from '../../../api/branding';
import { useAuth } from '../../../context/AuthContext';
import { useBranding } from '../../../context/BrandingContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import { errorMessage } from '../../../api/client';
import { ImageIcon, LogInIcon, SlidersIcon } from '../../../components/icons';

// Login Customization editor — text + card-style knobs that the
// LoginPage consumes from /api/public/branding. Background image
// upload lands in PR B3 alongside the rest of the logo pipeline;
// for now backgroundUrl is a free-text URL field (admin can paste
// a CDN URL or leave blank).

export default function LoginCustomizationPage() {
  const { user } = useAuth();
  const branding = useBranding();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = hasPermission(user, 'MANAGE_SYSTEM_BRANDING');

  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setBusy(true); setErr('');
    try {
      const s = await fetchSettings();
      const lp = s?.loginPage || {};
      setForm({
        backgroundUrl: lp.backgroundUrl || '',
        heroText: lp.heroText || '',
        welcomeMessage: lp.welcomeMessage || '',
        slogan: lp.slogan || '',
        cardStyle: lp.cardStyle || 'SOLID',
      });
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setErr('');
    try {
      await patchSettings({ loginPage: form, changeNote: 'Updated login customization' });
      toast.success?.('Login customization saved.');
      branding.refresh?.();
      load();
    } catch (e) { setErr(errorMessage(e)); toast.error?.(errorMessage(e)); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><LogInIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Login Customization</h2>
            <div className="rm-hero-sub">
              The login page is the first surface a user sees. Customize the title, welcome message,
              slogan, and card style. Visible immediately on /login.
            </div>
          </div>
          <div className="rm-hero-actions">
            <Link to="/admin/settings" className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>← Back</Link>
            <a href="/login" target="_blank" rel="noreferrer" className="rm-hero-btn outline">↗ Open login page</a>
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

      {!busy && form && (
        <>
          <div className="rm-card">
            <div className="rm-card-bar">
              <span className="rm-card-bar-icon" aria-hidden="true"><ImageIcon size={15} /></span>
              <span className="rm-card-bar-label">Hero</span>
            </div>
            <div className="rm-card-body">
              <div className="form-grid">
                <div className="field full">
                  <label>Hero text</label>
                  <input
                    value={form.heroText}
                    onChange={(e) => setForm((p) => ({ ...p, heroText: e.target.value }))}
                    maxLength={300}
                    placeholder="e.g., Manage your organization with confidence"
                    disabled={!canWrite}
                  />
                  <div className="hint">Shown above the login form. Leave blank to hide.</div>
                </div>
                <div className="field full">
                  <label>Welcome message</label>
                  <input
                    value={form.welcomeMessage}
                    onChange={(e) => setForm((p) => ({ ...p, welcomeMessage: e.target.value }))}
                    maxLength={200}
                    placeholder="Sign in to continue"
                    disabled={!canWrite}
                  />
                </div>
                <div className="field full">
                  <label>Slogan / tagline</label>
                  <input
                    value={form.slogan}
                    onChange={(e) => setForm((p) => ({ ...p, slogan: e.target.value }))}
                    maxLength={200}
                    placeholder="Your organization's slogan"
                    disabled={!canWrite}
                  />
                </div>
                <div className="field full">
                  <label>Background image URL (optional)</label>
                  <input
                    value={form.backgroundUrl}
                    onChange={(e) => setForm((p) => ({ ...p, backgroundUrl: e.target.value }))}
                    maxLength={500}
                    placeholder="https://… (upload pipeline lands in PR B3)"
                    disabled={!canWrite}
                  />
                  <div className="hint">Until the upload pipeline ships, paste a CDN URL.</div>
                </div>
              </div>
            </div>
          </div>

          <div className="rm-card" style={{ marginTop: 12 }}>
            <div className="rm-card-bar">
              <span className="rm-card-bar-icon" aria-hidden="true"><SlidersIcon size={15} /></span>
              <span className="rm-card-bar-label">Card style</span>
            </div>
            <div className="rm-card-body">
              <div style={{ display: 'flex', gap: 10 }}>
                {['SOLID', 'GLASS'].map((style) => {
                  const on = form.cardStyle === style;
                  return (
                    <label
                      key={style}
                      className={`rm-perm-tile ${on ? 'on' : ''} ${!canWrite ? 'readonly' : ''}`}
                      style={{ flex: 1, padding: 14 }}
                    >
                      <input
                        type="radio"
                        name="cardStyle"
                        value={style}
                        checked={on}
                        disabled={!canWrite}
                        onChange={() => setForm((p) => ({ ...p, cardStyle: style }))}
                      />
                      <span className="rm-perm-tile-label">
                        <strong>{style}</strong>
                        {' — '}
                        {style === 'SOLID' ? 'opaque card with sharp edges' : 'translucent card with backdrop blur'}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {canWrite && (
            <div className="rm-footer">
              <Link to="/admin/settings" className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>× Cancel</Link>
              <button className="rm-hero-btn solid" disabled={saving} onClick={save}>
                {saving ? 'Saving…' : '✓ Save changes'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
