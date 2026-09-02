const router = require('express').Router();
const ctrl = require('../controllers/transferController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

router.use(authenticate);

// Same read-gate rationale as financeRoutes — fund movements are
// finance records.
router.get('/', requirePermission('MANAGE_FINANCE', 'APPROVE_EXPENSE'), ctrl.list);
// Validate + describe the destination picked in the organization tree
// — same finance read-gate as the list. Declared as a literal path (no
// :id route exists on GET, so ordering is not load-bearing, but keep
// it above any future one).
router.get('/destination-preview',
  requirePermission('MANAGE_FINANCE', 'APPROVE_EXPENSE'), ctrl.destinationPreview);
router.post('/', upload.single('receipt'), ctrl.initiate);
router.post('/:id/acknowledge', ctrl.acknowledge);
router.post('/:id/ack', ctrl.acknowledge);
router.post('/:id/reject', ctrl.reject);
router.post('/:id/cancel', ctrl.cancel);

module.exports = router;
