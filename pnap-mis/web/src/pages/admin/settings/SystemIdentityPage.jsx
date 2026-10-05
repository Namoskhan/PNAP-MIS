import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchSettings, patchSettings } from '../../../api/branding';
import { useAuth } from '../../../context/AuthContext';
import { useBranding } from '../../../context/BrandingContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import { errorMessage } from '../../../api/client';
import { ClipboardIcon, TagIcon } from '../../../components/icons';

// System Identity editor — eight string fields. Pure form, no
// theming logic. On save, BrandingProvider's refresh() refetches
// the public branding so the sidebar header + browser tab title
// update without a hard reload.

const FIELDS = [
  { key: 'systemName', labelKey: 'admin.settings.systemName', helpKey: 'admin.settings.systemNameHelp', label: 'System name',
    help: 'The full product name. Shown wherever you brand the product itself.', max: 80 },
  { key: 'shortName', labelKey: 'admin.settings.shortName', helpKey: 'admin.settings.shortNameHelp', label: 'Short name / abbreviation',
    help: 'Sidebar header + compact UI surfaces.', max: 40 },
  { key: 'organizationName', labelKey: 'admin.settings.organizationName', helpKey: 'admin.settings.organizationNameHelp', label: 'Organization name',
    help: 'The organization that owns this deployment.', max: 120 },
  { key: 'loginTitle', labelKey: 'admin.settings.loginTitle', helpKey: 'admin.settings.loginTitleHelp', label: 'Login page title',
    help: 'Heading on the login screen.', max: 120 },
  { key: 'browserTabTitle', labelKey: 'admin.settings.browserTabTitle', helpKey: 'admin.settings.browserTabTitleHelp', label: 'Browser tab title',
    help: 'Sets <title> on every page.', max: 80 },
  { key: 'metaDescription', labelKey: 'admin.settings.metaDescription', helpKey: 'admin.settings.metaDescriptionHelp', label: 'Meta description',
    help: 'SEO / link-preview blurb.', max: 300 },
  { key: 'footerText', labelKey: 'admin.settings.footerText', helpKey: 'admin.settings.footerTextHelp', label: 'Footer text',
    help: 'Shown at the bottom of dashboards.', max: 300 },
  { key: 'copyrightText', labelKey: 'admin.settings.copyrightText', helpKey: 'admin.settings.copyrightTextHelp', label: 'Copyright text',
    help: 'Shown on PDF / XLSX exports.', max: 120 },
];

export default function SystemIdentityPage() {
  const { t } = useTranslation();
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
      const out = {};
      for (const f of FIELDS) out[f.key] = s?.identity?.[f.key] || '';
      setForm(out);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setErr('');
    try {
      const identity = {};
      for (const f of FIELDS) {
        if (form[f.key] !== undefined) identity[f.key] = form[f.key];
      }
      await patchSettings({ identity, changeNote: 'Updated system identity' });
      toast.success?.(t('admin.settings.identitySaved', 'Identity saved.'));
      branding.refresh?.();
      load();
    } catch (e) { setErr(errorMessage(e)); toast.error?.(errorMessage(e)); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><TagIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">{t('admin.settings.systemIdentity', 'System Identity')}</h2>
            <div className="rm-hero-sub">
              {t('admin.settings.systemIdentitySub', 'System name, short name, organization, footer, browser tab title. Saves apply globally on next focus / refresh.')}
            </div>
          </div>
          <div className="rm-hero-actions">
            <Link to="/admin/settings" className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>{t('admin.settings.backToSettings', '← Back')}</Link>
            <button className="rm-hero-btn outline" onClick={load}>⟳ {t('admin.refresh', 'Refresh')}</button>
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
              <span className="rm-card-bar-icon" aria-hidden="true"><ClipboardIcon size={15} /></span>
              <span className="rm-card-bar-label">{t('admin.settings.strings', 'Strings')}</span>
            </div>
            <div className="rm-card-body">
              <div className="form-grid">
                {FIELDS.map((f) => (
                  <div className="field full" key={f.key}>
                    <label>{t(f.labelKey, f.label)}</label>
                    <input
                      value={form[f.key] || ''}
                      maxLength={f.max}
                      onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                      disabled={!canWrite}
                    />
                    <div className="hint">{t(f.helpKey, f.help)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {canWrite && (
            <div className="rm-footer">
              <Link to="/admin/settings" className="rm-hero-btn outline" style={{ textDecoration: 'none' }}>{t('admin.cancel', '× Cancel')}</Link>
              <button className="rm-hero-btn solid" disabled={saving} onClick={save}>
                {saving ? t('admin.saving', 'Saving…') : t('admin.saveChanges', '✓ Save changes')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
