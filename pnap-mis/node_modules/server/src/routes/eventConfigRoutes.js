const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const typeCtrl = require('../controllers/eventTypeController');
const fieldCtrl = require('../controllers/fieldDefinitionController');

const {
  eventTypeCreateSchema,
  eventTypeUpdateSchema,
} = require('../validators/eventTypeSchemas');
const {
  fieldDefCreateSchema,
  fieldDefUpdateSchema,
} = require('../validators/fieldDefinitionSchemas');

// Every endpoint requires authentication. Reads are open to anyone
// holding VIEW_EVENT_CONFIG or MANAGE_EVENT_CONFIG (so non-admin
// roles can be granted "look but don't touch" via the catalogue);
// writes require MANAGE_EVENT_CONFIG. Super Admin always passes via
// the permission cache fallback.
router.use(authenticate);

const READ = requirePermission('VIEW_EVENT_CONFIG', 'MANAGE_EVENT_CONFIG');
const WRITE = requirePermission('MANAGE_EVENT_CONFIG');

// ─── Event Type configs ──────────────────────────────────────────
router.get('/types',                READ,  typeCtrl.list);
router.get('/types/:id',            READ,  typeCtrl.getOne);
router.get('/types/:id/snapshot',   READ,  typeCtrl.previewSnapshot);
router.post('/types',               WRITE, validate(eventTypeCreateSchema), typeCtrl.create);
router.patch('/types/:id',          WRITE, validate(eventTypeUpdateSchema), typeCtrl.update);
router.delete('/types/:id',         WRITE, typeCtrl.remove);

// ─── Field Definitions (the field library) ───────────────────────
router.get('/fields',               READ,  fieldCtrl.list);
router.get('/fields/:id',           READ,  fieldCtrl.getOne);
router.post('/fields',              WRITE, validate(fieldDefCreateSchema),  fieldCtrl.create);
router.patch('/fields/:id',         WRITE, validate(fieldDefUpdateSchema),  fieldCtrl.update);
router.delete('/fields/:id',        WRITE, fieldCtrl.remove);

module.exports = router;
