const router = require('express').Router();
const ctrl = require('../controllers/transferController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

router.use(authenticate);

// Same read-gate rationale as financeRoutes — fund movements are
// finance records.
router.get('/', requirePermission('MANAGE_FINANCE', 'APPROVE_EXPENSE'), ctrl.list);
router.post('/', upload.single('receipt'), ctrl.initiate);
router.post('/:id/acknowledge', ctrl.acknowledge);
router.post('/:id/reject', ctrl.reject);

module.exports = router;
