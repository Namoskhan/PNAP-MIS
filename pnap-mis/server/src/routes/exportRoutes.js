const router = require('express').Router();
const ctrl = require('../controllers/exportController');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

// Finance exports carry the same data as the finance read endpoints —
// gate them identically so revoking a role's finance permissions
// closes the download path too.
const FIN_READ = requirePermission('MANAGE_FINANCE', 'APPROVE_EXPENSE');

router.get('/unit/finance/xlsx', FIN_READ, ctrl.unitFinanceXlsx);
router.get('/unit/finance/pdf', FIN_READ, ctrl.unitFinancePdf);
router.get('/unit/meetings/xlsx', ctrl.unitMeetingsXlsx);
router.get('/unit/meetings/pdf', ctrl.unitMeetingsPdf);
router.get('/unit/activities/xlsx', ctrl.unitActivitiesXlsx);
router.get('/unit/activities/pdf', ctrl.unitActivitiesPdf);
router.get('/unit/transfers/xlsx', FIN_READ, ctrl.unitTransfersXlsx);
router.get('/unit/transfers/pdf', FIN_READ, ctrl.unitTransfersPdf);
router.get('/member/:id/pdf', ctrl.memberPerformancePdf);
router.get('/meeting/:id/pdf', ctrl.meetingPdf);

module.exports = router;
