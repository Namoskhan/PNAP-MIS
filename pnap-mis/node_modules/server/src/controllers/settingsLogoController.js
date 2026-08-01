const fs = require('fs');
const path = require('path');
const asyncHandler = require('express-async-handler');
const env = require('../config/env');
const { ok, ApiError } = require('../utils/response');
const { audit } = require('../utils/audit');
const settingsService = require('../services/settingsService');

// settingsLogoController — multipart upload + reset for the 5 logo
// slots in SystemSettings.logos. Reuses the existing upload
// middleware (JPEG/PNG/WebP, ≤5MB) — SVG is deliberately excluded
// because we don't have a server-side SVG sanitizer (XSS risk).
//
// Behavior on upload:
//   1. Validate the slot name is known.
//   2. Capture the previous URL from settings (for cleanup).
//   3. Update settings.logos[slot] with the new URL.
//   4. Best-effort delete the old file from disk.
//   5. Audit + return new logo metadata.
//
// Reset clears the slot (sets back to {}); the URL field becomes
// empty and BrandingProvider falls back to the default rendering
// (sidebar shows text initial; favicon falls back to the static
// build asset).

const KNOWN_SLOTS = ['sidebar', 'sidebarDark', 'login', 'favicon', 'print'];

function _assertSlot(slot) {
  if (!KNOWN_SLOTS.includes(slot)) {
    throw new ApiError(400, 'INVALID_SLOT',
      `Unknown logo slot "${slot}". Known: ${KNOWN_SLOTS.join(', ')}`);
  }
}

// Convert a /uploads/foo.png URL back to its on-disk path so we can
// unlink it. Returns null when the URL doesn't look like a local
// upload (defensive — admin could in theory paste a CDN URL into the
// field via direct PATCH, in which case there's no local file to
// clean up).
function _diskPathFor(url) {
  if (!url || typeof url !== 'string' || !url.startsWith('/uploads/')) return null;
  const filename = url.replace(/^\/uploads\//, '');
  // Reject path traversal — only basename ever lands here under
  // normal upload flow, but be paranoid.
  const safe = path.basename(filename);
  return path.resolve(process.cwd(), env.UPLOAD_DIR, safe);
}

async function _unlinkBestEffort(diskPath) {
  if (!diskPath) return;
  try {
    await fs.promises.unlink(diskPath);
  } catch {
    // File missing or permission issue — log nothing because the
    // request shouldn't fail just because cleanup failed. Orphan
    // files can be swept by a maintenance job later.
  }
}

// POST /admin/settings/logos/:slot
exports.uploadLogo = asyncHandler(async (req, res) => {
  const slot = req.params.slot;
  _assertSlot(slot);

  if (!req.file) {
    throw new ApiError(400, 'FILE_REQUIRED', 'Upload an image file in the `logo` field');
  }

  const before = await settingsService.getAll();
  const previousUrl = before?.logos?.[slot]?.url;

  const newSlotValue = {
    url: `/uploads/${req.file.filename}`,
    uploadedAt: new Date(),
    sizeBytes: req.file.size,
    contentType: req.file.mimetype,
  };

  // settingsService.update merges deeply, so this only touches the
  // one slot we changed. Theme/identity/etc. are untouched.
  const { settings, versionNumber } = await settingsService.update(
    { logos: { [slot]: newSlotValue } },
    req.user,
    { changeNote: `Uploaded ${slot} logo` },
  );

  // Best-effort cleanup of the previous file. Done AFTER persistence
  // so we don't lose the new URL if cleanup throws (it won't, but
  // ordering matters for safety).
  if (previousUrl && previousUrl !== newSlotValue.url) {
    await _unlinkBestEffort(_diskPathFor(previousUrl));
  }

  await audit({
    req,
    action: 'SYSTEM_LOGO_UPLOAD',
    targetType: 'SystemSettings',
    targetId: 'singleton',
    targetLabel: `logos.${slot}`,
    note: `Uploaded ${slot} (${(req.file.size / 1024).toFixed(1)} KB) — v${versionNumber}`,
  });

  ok(res, { slot, logo: newSlotValue, settingsVersion: versionNumber });
});

// POST /admin/settings/logos/:slot/reset
//
// Clears the slot. Frontend falls back to default rendering (text
// initial in sidebar, static favicon, etc.).
exports.resetLogo = asyncHandler(async (req, res) => {
  const slot = req.params.slot;
  _assertSlot(slot);

  const before = await settingsService.getAll();
  const previousUrl = before?.logos?.[slot]?.url;

  if (!previousUrl) {
    // Already cleared — short-circuit so we don't write a no-op
    // version row.
    return ok(res, { slot, logo: null, noop: true });
  }

  // Persist the slot as an explicit empty object (Mongoose unset is
  // tricky through deepMerge; setting an empty subdoc is cleaner).
  const { settings, versionNumber } = await settingsService.update(
    { logos: { [slot]: { url: '', uploadedAt: undefined, sizeBytes: undefined, contentType: undefined } } },
    req.user,
    { changeNote: `Reset ${slot} logo to default` },
  );

  // Now safe to delete the old file from disk.
  await _unlinkBestEffort(_diskPathFor(previousUrl));

  await audit({
    req,
    action: 'SYSTEM_LOGO_RESET',
    targetType: 'SystemSettings',
    targetId: 'singleton',
    targetLabel: `logos.${slot}`,
    note: `Reset ${slot} — v${versionNumber}`,
  });

  ok(res, { slot, logo: null, settingsVersion: versionNumber });
});

exports.KNOWN_SLOTS = KNOWN_SLOTS;
