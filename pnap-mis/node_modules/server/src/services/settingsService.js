const SystemSettings = require('../models/SystemSettings');
const SettingsVersion = require('../models/SettingsVersion');
const themeValidator = require('../utils/themeValidator');
const themePresets = require('../utils/themePresets');
const { ApiError } = require('../utils/response');

// settingsService — single source of truth for the SystemSettings
// singleton. Responsibilities:
//
//   • Load on demand, cache the whole document (it's tiny and one-row).
//   • Validate every write through themeValidator BEFORE persistence
//     so a broken theme never reaches the DB.
//   • Insert a SettingsVersion snapshot + diff on every successful
//     write, so admin can rollback to any historical state.
//   • Invalidate the cache on every write — multi-instance deploys
//     wire this to a Mongo change-stream subscriber later.
//
// Hot read path: `getAll()` and `getPublic()`. Both serve from the
// in-process cache after first load. The cache is a single object,
// not an LRU — there's literally one document.

let _cache = null;
let _cacheReady = false;

// ─── Cache ────────────────────────────────────────────────────────

async function load() {
  const doc = await SystemSettings.findById('singleton').lean();
  _cache = doc || null;
  _cacheReady = true;
  return _cache;
}

function invalidate() {
  _cache = null;
  _cacheReady = false;
}

async function getAll() {
  if (!_cacheReady) await load();
  return _cache;
}

// Dot-path getter. Returns undefined if any segment is missing.
async function get(path) {
  const doc = await getAll();
  if (!doc) return undefined;
  return String(path).split('.').reduce((cur, k) => (cur == null ? cur : cur[k]), doc);
}

// ─── Public (login-page) projection ───────────────────────────────

// Returns only what the unauthenticated login page needs. Keep this
// list tight — every field added here becomes publicly readable.
async function getPublic() {
  const all = await getAll();
  if (!all) return null;
  return {
    identity: {
      systemName: all.identity?.systemName,
      shortName: all.identity?.shortName,
      organizationName: all.identity?.organizationName,
      loginTitle: all.identity?.loginTitle,
      browserTabTitle: all.identity?.browserTabTitle,
      metaDescription: all.identity?.metaDescription,
      copyrightText: all.identity?.copyrightText,
      footerText: all.identity?.footerText,
    },
    logos: {
      login: all.logos?.login,
      favicon: all.logos?.favicon,
    },
    loginPage: all.loginPage,
    // The login page consumes the active palette so colors match
    // the rest of the app from the very first paint.
    theme: {
      activeMode: all.theme?.activeMode,
      light: all.theme?.light,
      dark: all.theme?.dark,
    },
    typography: all.typography,
    // Dashboard appearance is non-secret visual preferences; exposing
    // it here so BrandingProvider can apply the data-compact / data-
    // glass attributes on first paint (pre-auth) and on the login
    // page consistently with the rest of the app.
    dashboard: all.dashboard,
  };
}

// ─── Deep merge + diff ────────────────────────────────────────────

// Recursive deep-merge that's safe for our settings shape:
//   • Plain objects are merged key-by-key
//   • Arrays REPLACE wholesale (we don't try to merge arrays — admin
//     overriding `customFields` expects to replace the list)
//   • Non-plain values (Date, ObjectId, primitives) replace
function _isPlainObject(v) {
  if (v === null || typeof v !== 'object') return false;
  if (Array.isArray(v)) return false;
  if (v instanceof Date) return false;
  return Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null;
}

function deepMerge(target, patch) {
  if (!_isPlainObject(target)) return patch;
  if (!_isPlainObject(patch)) return patch;
  const out = { ...target };
  for (const k of Object.keys(patch)) {
    if (patch[k] === undefined) continue;
    if (_isPlainObject(target[k]) && _isPlainObject(patch[k])) {
      out[k] = deepMerge(target[k], patch[k]);
    } else {
      out[k] = patch[k];
    }
  }
  return out;
}

// diffPaths — emit [{ path, before, after }] for every leaf where
// `before` and `after` differ. Used to populate SettingsVersion.diff
// + the audit log entry, so rollback UI doesn't re-derive.
function diffPaths(before, after, prefix = '') {
  const out = [];
  if (_isPlainObject(before) && _isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const k of keys) {
      out.push(...diffPaths(before[k], after[k], prefix ? `${prefix}.${k}` : k));
    }
    return out;
  }
  // Non-object values: compare by JSON-stringify so dates/arrays
  // compare structurally rather than referentially.
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    out.push({ path: prefix, before, after });
  }
  return out;
}

// ─── Versioning ───────────────────────────────────────────────────

async function _writeVersion({ snapshot, diff, changedBy, kind, changeNote, restoredFrom }) {
  // Find the next version number atomically. Singleton write so
  // contention is minimal; a simple max+1 is fine.
  const latest = await SettingsVersion.findOne({}).sort({ versionNumber: -1 }).select('versionNumber').lean();
  const versionNumber = (latest?.versionNumber || 0) + 1;
  await SettingsVersion.create({
    versionNumber, snapshot, diff, changedBy, kind,
    changeNote, restoredFrom,
  });
  return versionNumber;
}

// ─── Update ───────────────────────────────────────────────────────

// update — deep-merge a patch onto the live doc, validate, persist,
// version, invalidate cache. Returns the new full doc.
//
// The validator runs against the MERGED state (not just the patch)
// so a partial theme.light update is checked together with the
// existing theme.light fields the admin didn't touch.
async function update(patch, user, options = {}) {
  const before = (await getAll()) || {};
  const merged = deepMerge(before, patch);

  // Theme is the only block with WCAG-style risk. If the patch
  // touched theme, validate the merged theme block.
  if (patch?.theme) {
    const v = themeValidator.validateTheme(merged.theme);
    if (!v.ok) {
      throw new ApiError(400, 'THEME_VALIDATION', 'Theme failed validation', { errors: v.errors });
    }
    // If theme changed but admin didn't explicitly set presetName,
    // flip to CUSTOM since the theme has drifted from any preset.
    if (!patch.theme.presetName && merged.theme?.presetName !== 'CUSTOM') {
      const knownPreset = themePresets.getPreset(merged.theme.presetName);
      if (knownPreset) {
        const drifted = JSON.stringify(merged.theme.light) !== JSON.stringify(knownPreset.light)
                     || JSON.stringify(merged.theme.dark)  !== JSON.stringify(knownPreset.dark);
        if (drifted) merged.theme.presetName = 'CUSTOM';
      }
    }
  }

  // Bump version + stamp updater.
  merged.settingsVersion = (before.settingsVersion || 1) + 1;
  merged.updatedBy = user?._id;

  // Persist. upsert in case the singleton was wiped — defensive.
  const updated = await SystemSettings.findByIdAndUpdate(
    'singleton',
    { $set: merged },
    { new: true, upsert: true, runValidators: true },
  ).lean();

  invalidate();

  // Version snapshot + diff
  const diff = diffPaths(before, updated);
  const versionNumber = await _writeVersion({
    snapshot: updated,
    diff,
    changedBy: user?._id,
    kind: options.kind || 'UPDATE',
    changeNote: options.changeNote,
    restoredFrom: options.restoredFrom,
  });

  return { settings: updated, versionNumber, diff };
}

// reset — restore the seeded PKNAP_DEFAULT preset (theme + typography
// defaults). Identity, logos, login customizations are preserved
// since they're org-specific, not theme-specific. Admin can clear
// those via patch if they want.
async function reset(user, options = {}) {
  const preset = themePresets.PRESETS.PKNAP_DEFAULT;
  const patch = {
    theme: {
      activeMode: 'LIGHT',
      presetName: 'PKNAP_DEFAULT',
      light: preset.light,
      dark: preset.dark,
    },
    typography: {
      fontFamily: 'Inter, system-ui, sans-serif',
      headingFontFamily: 'Inter, system-ui, sans-serif',
      baseFontSize: 14, headingScale: 1.2, borderRadius: 8, spacingScale: 1.0,
    },
    dashboard: {
      enableAnimations: true, enableCountUpKpis: true,
      chartStyle: 'MODERN', compactMode: false, glassmorphism: false,
      sidebarDefaultCollapsed: false,
    },
  };
  return update(patch, user, { kind: 'RESET', changeNote: options.changeNote || 'Reset to PKNAP_DEFAULT' });
}

// applyPreset — overwrite the theme block with one of the locked
// presets. Identity/typography/etc. are untouched.
async function applyPreset(presetName, user) {
  const preset = themePresets.getPreset(presetName);
  if (!preset) throw new ApiError(400, 'UNKNOWN_PRESET', `No such preset "${presetName}"`);
  const patch = {
    theme: {
      presetName: preset.code,
      light: preset.light,
      dark: preset.dark,
    },
  };
  return update(patch, user, { kind: 'UPDATE', changeNote: `Applied preset ${preset.code}` });
}

// ─── Rollback ─────────────────────────────────────────────────────

// restoreVersion — find the historical snapshot, deep-merge it onto
// the current doc (so we replace every field except _id + audit
// timestamps), bump version, write a new SettingsVersion of kind
// RESTORE.
async function restoreVersion(versionNumber, user, options = {}) {
  const target = await SettingsVersion.findOne({ versionNumber }).lean();
  if (!target) throw new ApiError(404, 'VERSION_NOT_FOUND', `No version #${versionNumber}`);
  const snap = target.snapshot || {};
  // Strip fields that shouldn't be replayed
  const replay = { ...snap };
  delete replay._id;
  delete replay.settingsVersion;
  delete replay.updatedBy;
  delete replay.createdAt;
  delete replay.updatedAt;
  return update(replay, user, {
    kind: 'RESTORE',
    restoredFrom: versionNumber,
    changeNote: options.changeNote || `Restored from v${versionNumber}`,
  });
}

// ─── Versions list ────────────────────────────────────────────────

async function listVersions({ limit = 50, before } = {}) {
  const filter = {};
  if (before) filter.versionNumber = { $lt: parseInt(before, 10) };
  return SettingsVersion.find(filter)
    .sort({ versionNumber: -1 })
    .limit(Math.min(parseInt(limit, 10) || 50, 200))
    .lean();
}

async function getVersion(versionNumber) {
  return SettingsVersion.findOne({ versionNumber: parseInt(versionNumber, 10) }).lean();
}

// ─── Export / import ──────────────────────────────────────────────

// Serializable bundle for backup / share-between-deployments. Strips
// db-internal fields. Logos are EXCLUDED — they're URLs to local
// uploads that won't resolve on a different deployment. Admin should
// re-upload after import.
async function exportBundle() {
  const all = await getAll();
  if (!all) return null;
  const { _id, settingsVersion, updatedBy, createdAt, updatedAt, logos, ...rest } = all;
  return {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    bundle: rest,
  };
}

// Validate + apply an exported bundle. Logos are deliberately
// ignored on import for the reason above.
async function importBundle(payload, user, options = {}) {
  if (!payload || !payload.bundle) {
    throw new ApiError(400, 'INVALID_BUNDLE', 'Bundle missing or malformed');
  }
  const { logos, ...patch } = payload.bundle;
  return update(patch, user, {
    kind: 'IMPORT',
    changeNote: options.changeNote || `Imported bundle (schema v${payload.schemaVersion || '?'})`,
  });
}

module.exports = {
  load,
  invalidate,
  getAll,
  get,
  getPublic,
  update,
  reset,
  applyPreset,
  restoreVersion,
  listVersions,
  getVersion,
  exportBundle,
  importBundle,
  // Exposed for unit tests / the seeder
  deepMerge,
  diffPaths,
};
