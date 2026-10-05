import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { uploadLogo, resetLogo } from '../../api/branding';
import { errorMessage } from '../../api/client';
import { useToast } from '../Toast';
import dialog from '../../components/dialog';

// LogoUploader — single-slot file picker with preview, upload state,
// and a Reset button. Shows the current logo as a thumbnail.
//
// Validation is mostly server-side (multer's fileFilter rejects
// non-image MIME types and oversize files). Client-side, we cap at
// 5 MB before sending to surface friendlier feedback.
//
// Props:
//   slot         — one of 'sidebar' | 'sidebarDark' | 'login' | 'favicon' | 'print'
//   label        — human-readable slot name
//   description  — help text shown below the slot
//   currentUrl   — '/uploads/...' URL of the current logo (or '')
//   recommended  — guidance string ("256×64 PNG, <100 KB")
//   onChanged    — fired on successful upload OR reset
//   disabled     — admin lacks MANAGE_SYSTEM_BRANDING

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — matches server config
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];

export default function LogoUploader({
  slot, label, description, currentUrl, recommended, onChanged, disabled,
}) {
  const { t } = useTranslation();
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  async function pick(file) {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error?.(t('admin.settings.onlyImagesAllowed', 'Only JPEG / PNG / WebP allowed (got {{type}})', { type: file.type || 'unknown' }));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error?.(t('admin.settings.fileOverLimit', 'File is {{size}} MB — over the 5 MB limit', { size: (file.size / 1024 / 1024).toFixed(1) }));
      return;
    }
    // Local preview while the upload is in flight.
    setPreviewUrl(URL.createObjectURL(file));
    setBusy(true);
    try {
      const result = await uploadLogo(slot, file);
      toast.success?.(t('admin.settings.logoUploaded', '{{label}} uploaded.', { label }));
      onChanged?.(result?.logo || null);
    } catch (e) {
      toast.error?.(errorMessage(e));
    } finally {
      setBusy(false);
      setPreviewUrl(null);
      // Reset the input so re-selecting the same file fires onChange
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function reset() {
    if (!await dialog.confirm(t('admin.settings.resetLogoConfirm', 'Reset {{label}}? The current image will be removed.', { label }))) return;
    setBusy(true);
    try {
      await resetLogo(slot);
      toast.success?.(t('admin.settings.logoReset', '{{label}} reset to default.', { label }));
      onChanged?.(null);
    } catch (e) {
      toast.error?.(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Display URL: local preview > current uploaded URL > empty.
  const displayUrl = previewUrl || currentUrl || '';

  return (
    <div className="rm-card" style={{ marginBottom: 12 }}>
      <div className="rm-card-bar">
        <span className="rm-card-bar-icon" aria-hidden="true">🖼️</span>
        <span className="rm-card-bar-label">{label}</span>
        {currentUrl && <span className="rm-card-bar-count">{t('admin.settings.logoConfigured', 'configured')}</span>}
      </div>
      <div className="rm-card-body">
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          {/* Thumbnail */}
          <div style={{
            width: 120, height: 120,
            border: '1px dashed var(--border-soft, #e5e7eb)',
            borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--bg-soft, #f9fafb)',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            {displayUrl ? (
              <img
                src={displayUrl}
                alt={label}
                style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              />
            ) : (
              <span className="muted" style={{ fontSize: 12, padding: 8, textAlign: 'center' }}>
                {t('admin.settings.noImageDefault', 'No image — using default')}
              </span>
            )}
          </div>

          {/* Controls */}
          <div style={{ flex: 1 }}>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{description}</p>
            {recommended && (
              <p className="muted" style={{ fontSize: 12 }}>
                <strong>{t('admin.settings.recommended', 'Recommended')}:</strong> {recommended}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => pick(e.target.files?.[0])}
                disabled={disabled || busy}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="rm-action perms"
                onClick={() => inputRef.current?.click()}
                disabled={disabled || busy}
              >
                {busy ? t('common.uploading', 'Uploading…') : (currentUrl ? `⟳ ${t('admin.settings.replace', 'Replace')}` : `⤴ ${t('common.upload', 'Upload')}`)}
              </button>
              {currentUrl && !disabled && (
                <button
                  type="button"
                  className="rm-action delete"
                  onClick={reset}
                  disabled={busy}
                >
                  ↺ {t('admin.settings.reset', 'Reset')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
