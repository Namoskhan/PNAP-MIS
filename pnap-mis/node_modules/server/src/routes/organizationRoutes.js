const router = require('express').Router();
const ctrl = require('../controllers/orgController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// Organization tree — the destination picker for fund transfers.
//
// Mounted separately from orgRoutes rather than aliasing that router,
// so this path exposes exactly one read endpoint and none of the unit
// CRUD. Gated on the finance permissions: the tree deliberately spans
// the whole organization (any unit can now receive a transfer), so it
// is not a general-purpose directory.
router.get('/tree', requirePermission('MANAGE_FINANCE', 'APPROVE_EXPENSE'), ctrl.tree);

module.exports = router;
