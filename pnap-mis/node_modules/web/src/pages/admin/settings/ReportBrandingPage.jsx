import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchSettings, patchSettings } from '../../../api/branding';
import { useAuth } from '../../../context/AuthContext';
import { hasPermission } from '../../../utils/permissions';
import { useToast } from '../../../components/Toast';
import { errorMessage } from '../../../api/client';
import { FileTextIcon, ImageIcon } from '../../../components/icons';

// Report Branding editor — the admin surface for the reportBranding
// settings block the PDF/XLSX exporters already consume:
//   • showLogoOnPdf / showLogoOnXlsx — whether the "print" logo slot
//     (uploaded in Logo Manager) is embedded in export headers.
//   • pdfFooterText — footer line on every PDF page; falls back to
//     identity.copyrightText, then footerText, then a timestamp.
//   • pdfHeaderColor — the separator-bar color under PDF headers;
//     empty means "use the theme's primary color".

export default function ReportBrandingPage() {
  const { user } = useAuth();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const canWrite = hasPermission(user, 'MANAGE_SYSTEM_BRANDING');

  const [form, setForm] = useState(null);
  const [printLogo, setPrintLogo] = useState(null);
  const [themePrimary, setThemePrimary] = useState('#1e40af');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function load() {
    setBusy(true); setErr('');
    try {
      const s = await fetchSettings();
      const rb = s?.reportBranding || {};
      setForm({
        showLogoOnPdf: rb.showLogoOnPdf !== false,
        showLogoOnXlsx: rb.showLogoOnXlsx !== false,
        pdfFooterText: rb.pdfFooterText || '',
        pdfHeaderColor: rb.pdfHeaderColor || '',
      });
      setPrintLogo(s?.logos?.print?.url || null);
      setThemePrimary(s?.theme?.light?.primary || '#1e40af');
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true); setErr('');
    try {
      await patchSettings({
        reportBranding: {
          showLogoOnPdf: !!form.showLogoOnPdf,
          showLogoOnXlsx: !!form.showLogoOnXlsx,
          pdfFooterText: form.pdfFooterText || '',
          pdfHeaderColor: form.pdfHeaderColor || '',
        },
        changeNote: 'Updated report branding',
      });
      toast.success?.('Report branding saved. Applies to the next export.');
      load();
    } catch (e) { setErr(errorMessage(e)); toast.error?.(errorMessage(e)); }
    finally { setSaving(false); }
  }

  const effectiveHeaderColor = form?.pdfHeaderColor || themePrimary;

  return (
    <div>
      <div className="rm-hero">
        <div className="rm-hero-content">
          <div className="rm-hero-icon" aria-hidden="true"><FileTextIcon size={22} /></div>
          <div style={{ flex: 1 }}>
            <h2 className="rm-hero-title">Report Branding</h2>
            <div className="rm-hero-sub">
              Header logo, footer text, and accent color for PDF / XLSX exports.
              Changes apply to the next export — nothing is regenerated retroactively.
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

      {!busy && form && (
        <>
          <div className="rm-card">
            <div className="rm-card-bar">
              <span className="rm-card-bar-icon" aria-hidden="true"><ImageIcon size={15} /></span>
              <span className="rm-card-bar-label">Export logo</span>
            </div>
            <div className="rm-card-body">
              <div className="form-grid">
                <div className="field">
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={form.showLogoOnPdf}
                      onChange={(e) => setForm((p) => ({ ...p, showLogoOnPdf: e.target.checked }))}
                      disabled={!canWrite}
                    />
                    Show logo on PDF exports
                  </label>
                </div>
                <div className="field">
                  <label className="toggle-row">
                    <input
                      type="checkbox"
                      checked={form.showLogoOnXlsx}
                      onChange={(e) => setForm((p) => ({ ...p, showLogoOnXlsx: e.target.checked }))}
                      disabled={!canWrite}
                    />
                    Show logo on Excel exports
                  </label>
                </div>
                <div className="field full">
                  {printLogo ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <img src={printLogo} alt="Print logo" style={{ height: 48, borderRadius: 6, border: '1px solid var(--border)' }} />
                      <span className="hint">
                        Current print logo. Replace it in the <Link to="/admin/settings/logos">Logo Manager</Link> ("Print" slot).
                      </span>
                    </div>
                  ) : (
                    <div className="hint">
                      No print logo uploaded yet — exports render text-only headers.
                      Upload one in the <Link to="/admin/settings/logos">Logo Manager</Link> ("Print" slot).
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rm-card">
            <div className="rm-card-bar">
              <span className="rm-card-bar-icon" aria-hidden="true"><FileTextIcon size={15} /></span>
              <span className="rm-card-bar-label">PDF header & footer</span>
            </div>
            <div className="rm-card-body">
              <div className="form-grid">
                <div className="field">
                  <label>Header accent color</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="color"
                      value={effectiveHeaderColor}
                      onChange={(e) => setForm((p) => ({ ...p, pdfHeaderColor: e.target.value }))}
                      disabled={!canWrite}
                      style={{ width: 44, height: 34, padding: 2, border: '1px solid var(--border-strong)', borderRadius: 6, background: 'var(--surface)' }}
                    />
                    <input
                      value={form.pdfHeaderColor}
                      placeholder={`Theme primary (${themePrimary})`}
                      maxLength={7}
                      onChange={(e) => setForm((p) => ({ ...p, pdfHeaderColor: e.target.value.trim() }))}
                      disabled={!canWrite}
                      style={{ flex: 1 }}
                    />
                    {form.pdfHeaderColor && canWrite && (
                      <button type="button" className="btn secondary sm" onClick={() => setForm((p) => ({ ...p, pdfHeaderColor: '' }))}>
                        Use theme color
                      </button>
                    )}
                  </div>
                  <div className="hint">The separator bar under PDF headers. Leave empty to follow the theme's primary color.</div>
                </div>
                <div className="field">
                  <label>PDF footer text</label>
                  <input
                    value={form.pdfFooterText}
                    maxLength={300}
                    placeholder="e.g. © PKNAP — internal use only"
                    onChange={(e) => setForm((p) => ({ ...p, pdfFooterText: e.target.value }))}
                    disabled={!canWrite}
                  />
                  <div className="hint">Shown at the bottom of every PDF page. Empty falls back to the copyright text from System Identity.</div>
                </div>
              </div>

              {/* Live header preview — same layout logic the exporter uses. */}
              <div style={{ marginTop: 14, border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {form.showLogoOnPdf && printLogo && (
                    <img src={printLogo} alt="" style={{ height: 34 }} />
                  )}
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1a' }}>Organization Report Title</div>
                    <div style={{ fontSize: 12, color: '#374151' }}>Period subtitle</div>
                  </div>
                </div>
                <div style={{ height: 2, background: effectiveHeaderColor, marginTop: 10 }} />
                <div style={{ marginTop: 10, textAlign: 'center', fontSize: 10, color: '#9aa3af', fontStyle: 'italic' }}>
                  {form.pdfFooterText || 'Footer falls back to copyright / footer text from System Identity'}
                </div>
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
