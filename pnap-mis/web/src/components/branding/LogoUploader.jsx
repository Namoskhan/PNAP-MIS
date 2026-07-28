import { useRef, useState } from 'react';
import { uploadLogo, resetLogo } from '../../api/branding';
import { errorMessage } from '../../api/client';
import { useToast } from '../Toast';

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
  const toast = useToast?.() || { success: () => {}, error: () => {} };
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  async function pick(file) {
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      toast.error?.(`Only JPEG / PNG / WebP allowed (got ${file.type || 'unknown'})`);
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error?.(`File is ${(file.size / 1024 / 1024).toFixed(1)} MB — over the 5 MB limit`);
      return;
    }
    // Local preview while the upload is in flight.
    setPreviewUrl(URL.createObjectURL(file));
    setBusy(true);
    try {
      const result = await uploadLogo(slot, file);
      toast.success?.(`${label} uploaded.`);
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
    if (!confirm(`Reset ${label}? The current image will be removed.`)) return;
    setBusy(true);
    try {
      await resetLogo(slot);
      toast.success?.(`${label} reset to default.`);
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
        {currentUrl && <span className="rm-card-bar-count">configured</span>}
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
                No image — using default
              </span>
            )}
          </div>

          {/* Controls */}
          <div style={{ flex: 1 }}>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{description}</p>
            {recommended && (
              <p className="muted" style={{ fontSize: 12 }}>
                <strong>Recommended:</strong> {recommended}
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
                {busy ? 'Uploading…' : (currentUrl ? '⟳ Replace' : '⤴ Upload')}
              </button>
              {currentUrl && !disabled && (
                <button
                  type="button"
                  className="rm-action delete"
                  onClick={reset}
                  disabled={busy}
                >
                  ↺ Reset
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
