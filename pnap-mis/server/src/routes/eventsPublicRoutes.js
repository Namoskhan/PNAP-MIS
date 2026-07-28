const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/eventsPublicController');

// Read-only events endpoints consumed by Meeting / Activity create
// + detail flows. Authenticated only — no MANAGE_EVENT_CONFIG
// requirement, since anyone allowed to record meetings needs to
// read the catalogue and resolve form schemas.
router.use(authenticate);

router.get('/types', ctrl.listTypes);
router.get('/types/:entity/:code/form', ctrl.getTypeForm);
router.get('/snapshots/:id', ctrl.getSnapshot);

module.exports = router;
