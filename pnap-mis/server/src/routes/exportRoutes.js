const router = require('express').Router();
const ctrl = require('../controllers/exportController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { requireUnitScope } = require('../middleware/unitScopeGuard');

router.use(authenticate);

// Finance exports carry the same data as the finance read endpoints —
// gate them identically so revoking a role's finance permissions
// closes the download path too.
const FIN_READ = requirePermission('MANAGE_FINANCE', 'APPROVE_EXPENSE');
const UNIT_SCOPE = requireUnitScope({ required: true });

router.get('/unit/finance/xlsx', FIN_READ, UNIT_SCOPE, ctrl.unitFinanceXlsx);
router.get('/unit/finance/pdf', FIN_READ, UNIT_SCOPE, ctrl.unitFinancePdf);
router.get('/unit/meetings/xlsx', UNIT_SCOPE, ctrl.unitMeetingsXlsx);
router.get('/unit/meetings/pdf', UNIT_SCOPE, ctrl.unitMeetingsPdf);
router.get('/unit/activities/xlsx', UNIT_SCOPE, ctrl.unitActivitiesXlsx);
router.get('/unit/activities/pdf', UNIT_SCOPE, ctrl.unitActivitiesPdf);
router.get('/unit/transfers/xlsx', FIN_READ, UNIT_SCOPE, ctrl.unitTransfersXlsx);
router.get('/unit/transfers/pdf', FIN_READ, UNIT_SCOPE, ctrl.unitTransfersPdf);
router.get('/member/:id/pdf', ctrl.memberPerformancePdf);
router.get('/member/:id/xlsx', ctrl.memberPerformanceXlsx);
router.get('/meeting/:id/pdf', ctrl.meetingPdf);

module.exports = router;
