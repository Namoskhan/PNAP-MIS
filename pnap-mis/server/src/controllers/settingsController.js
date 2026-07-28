const asyncHandler = require('express-async-handler');
const { ok, ApiError } = require('../utils/response');
const { audit } = require('../utils/audit');
const settingsService = require('../services/settingsService');
const themeValidator = require('../utils/themeValidator');
const themePresets = require('../utils/themePresets');

// Strip the optional changeNote off the patch body — we forward it
// to the service as a separate parameter so it lands on the
// SettingsVersion row + audit entry, not on the document itself.
function _splitPatch(body) {
  const { changeNote, ...patch } = body || {};
  return { patch, changeNote };
}

// ─── Read endpoints ───────────────────────────────────────────────

// GET /settings — full settings doc. Authenticated; gated on
// VIEW_SYSTEM_BRANDING / MANAGE_SYSTEM_BRANDING at the route layer.
exports.getAll = asyncHandler(async (req, res) => {
  const doc = await settingsService.getAll();
  ok(res, doc);
});

// GET /public/branding — login-page projection. NO auth.
exports.getPublic = asyncHandler(async (req, res) => {
  const lite = await settingsService.getPublic();
  ok(res, lite);
});

// ─── Write endpoints ──────────────────────────────────────────────

// PATCH /settings — deep-merge patch. Validator already ran via the
// `validate` middleware; settingsService.update handles theme
// validation + persistence + version + cache invalidation.
exports.update = asyncHandler(async (req, res) => {
  const { patch, changeNote } = _splitPatch(req.body);
  const before = await settingsService.getAll();

  const { settings, versionNumber, diff } = await settingsService.update(
    patch, req.user, { changeNote },
  );

  await audit({
    req,
    action: 'SYSTEM_SETTINGS_UPDATE',
    targetType: 'SystemSettings',
    targetId: 'singleton',
    targetLabel: `v${versionNumber}`,
    before,
    after: settings,
    note: changeNote || (diff.length ? `${diff.length} field(s) changed` : 'no-op'),
  });

  ok(res, { settings, versionNumber, diffSize: diff.length });
});

// POST /settings/reset — restore PKNAP_DEFAULT theme/typography/
// dashboard. Identity, logos, login customizations preserved.
exports.reset = asyncHandler(async (req, res) => {
  const before = await settingsService.getAll();
  const { settings, versionNumber } = await settingsService.reset(req.user, {
    changeNote: req.body?.changeNote,
  });

  await audit({
    req,
    action: 'SYSTEM_SETTINGS_RESET',
    targetType: 'SystemSettings',
    targetId: 'singleton',
    targetLabel: `v${versionNumber}`,
    before, after: settings,
    note: 'Reset to PKNAP_DEFAULT',
  });

  ok(res, { settings, versionNumber });
});

// POST /admin/settings/theme/apply-preset/:name — overwrite theme
// block with a locked preset. Identity/typography untouched.
exports.applyPreset = asyncHandler(async (req, res) => {
  const before = await settingsService.getAll();
  const { settings, versionNumber } = await settingsService.applyPreset(
    req.params.name, req.user,
  );

  await audit({
    req,
    action: 'SYSTEM_SETTINGS_APPLY_PRESET',
    targetType: 'SystemSettings',
    targetId: 'singleton',
    targetLabel: req.params.name,
    before, after: settings,
    note: `Applied preset ${req.params.name}`,
  });

  ok(res, { settings, versionNumber });
});

// POST /admin/settings/validate — dry-run. Validates a candidate
// theme/typography/etc. WITHOUT writing. Useful for the admin UI's
// "save" button to surface errors before the user hits commit.
exports.validate = asyncHandler(async (req, res) => {
  const { patch } = _splitPatch(req.body);
  const before = (await settingsService.getAll()) || {};
  const merged = settingsService.deepMerge(before, patch);

  const themeResult = patch?.theme
    ? themeValidator.validateTheme(merged.theme)
    : { ok: true, errors: [], warnings: [] };

  ok(res, {
    ok: themeResult.ok,
    errors: themeResult.errors,
    warnings: themeResult.warnings,
    diff: settingsService.diffPaths(before, merged),
  });
});

// ─── Theme presets registry ───────────────────────────────────────

exports.listPresets = asyncHandler(async (req, res) => {
  ok(res, themePresets.listPresets());
});

// ─── Versions / rollback ──────────────────────────────────────────

exports.listVersions = asyncHandler(async (req, res) => {
  const items = await settingsService.listVersions({
    limit: req.query.limit,
    before: req.query.before,
  });
  ok(res, items);
});

exports.getVersion = asyncHandler(async (req, res) => {
  const v = await settingsService.getVersion(req.params.n);
  if (!v) throw new ApiError(404, 'NOT_FOUND', `No version #${req.params.n}`);
  ok(res, v);
});

exports.restoreVersion = asyncHandler(async (req, res) => {
  const before = await settingsService.getAll();
  const { settings, versionNumber } = await settingsService.restoreVersion(
    parseInt(req.params.n, 10),
    req.user,
    { changeNote: req.body?.changeNote },
  );

  await audit({
    req,
    action: 'SYSTEM_SETTINGS_RESTORE',
    targetType: 'SystemSettings',
    targetId: 'singleton',
    targetLabel: `restored ${req.params.n} → v${versionNumber}`,
    before, after: settings,
    note: req.body?.changeNote || `Restored from v${req.params.n}`,
  });

  ok(res, { settings, versionNumber, restoredFrom: parseInt(req.params.n, 10) });
});

// ─── Export / import ──────────────────────────────────────────────

exports.exportBundle = asyncHandler(async (req, res) => {
  const bundle = await settingsService.exportBundle();
  if (!bundle) throw new ApiError(404, 'NOT_FOUND', 'No settings document yet');
  ok(res, bundle);
});

exports.importBundle = asyncHandler(async (req, res) => {
  const before = await settingsService.getAll();
  const { settings, versionNumber } = await settingsService.importBundle(
    req.body, req.user, { changeNote: req.body?.changeNote },
  );

  await audit({
    req,
    action: 'SYSTEM_SETTINGS_IMPORT',
    targetType: 'SystemSettings',
    targetId: 'singleton',
    targetLabel: `v${versionNumber}`,
    before, after: settings,
    note: req.body?.changeNote || `Imported bundle (schema v${req.body?.schemaVersion || '?'})`,
  });

  ok(res, { settings, versionNumber });
});
