const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { upload } = require('../middleware/upload');

const ctrl = require('../controllers/settingsController');
const logoCtrl = require('../controllers/settingsLogoController');
const {
  settingsPatchSchema,
  restoreSchema,
  importSchema,
} = require('../validators/settingsSchemas');

// Authenticated branding endpoints. Reads are open to anyone holding
// VIEW_SYSTEM_BRANDING / MANAGE_SYSTEM_BRANDING; writes require
// MANAGE_SYSTEM_BRANDING. SUPER_ADMIN passes both via the dynamic
// permission catalogue.
router.use(authenticate);

const READ = requirePermission('VIEW_SYSTEM_BRANDING', 'MANAGE_SYSTEM_BRANDING');
const WRITE = requirePermission('MANAGE_SYSTEM_BRANDING');

// Live settings (full doc — admin surfaces consume this)
router.get('/',                              READ,  ctrl.getAll);
router.patch('/',                            WRITE, validate(settingsPatchSchema), ctrl.update);
router.post('/reset',                        WRITE, ctrl.reset);

// ─── Admin-only sub-routes ────────────────────────────────────────
// Theme presets (locked code-side registry) + dry-run validator.
// `validate` GOES BEFORE `:n` so Express doesn't try to treat it as
// a version number.
router.get('/theme/presets',                 READ,  ctrl.listPresets);
router.post('/theme/apply-preset/:name',     WRITE, ctrl.applyPreset);
router.post('/validate',                     WRITE, validate(settingsPatchSchema), ctrl.validate);

// Versions + rollback
router.get('/versions',                      READ,  ctrl.listVersions);
router.get('/versions/:n',                   READ,  ctrl.getVersion);
router.post('/versions/:n/restore',          WRITE, validate(restoreSchema), ctrl.restoreVersion);

// Export / import
router.get('/export',                        READ,  ctrl.exportBundle);
router.post('/import',                       WRITE, validate(importSchema), ctrl.importBundle);

// ─── Logos (PR B3) ────────────────────────────────────────────────
// Upload pipeline reuses the existing `upload` middleware (JPEG/
// PNG/WebP, ≤5MB). Each slot is one of: sidebar / sidebarDark /
// login / favicon / print. Reset clears the slot back to default.
router.post('/logos/:slot',                  WRITE, upload.single('logo'), logoCtrl.uploadLogo);
router.post('/logos/:slot/reset',            WRITE, logoCtrl.resetLogo);

module.exports = router;
