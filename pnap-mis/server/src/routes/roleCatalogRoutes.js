const router = require('express').Router();
const ctrl = require('../controllers/roleCatalogController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

// Read is open to any authenticated user — the Roles page lists them
// for context, and other UIs may want to render labels by code.
router.get('/', ctrl.list);

// Writes are Super Admin only.
router.post('/', requireRole('SUPER_ADMIN'), ctrl.create);
router.patch('/:id', requireRole('SUPER_ADMIN'), ctrl.update);
router.delete('/:id', requireRole('SUPER_ADMIN'), ctrl.remove);

module.exports = router;
