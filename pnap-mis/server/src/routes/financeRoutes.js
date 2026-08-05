const router = require('express').Router();
const ctrl = require('../controllers/financeController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { upload } = require('../middleware/upload');
const { requireUnitScope } = require('../middleware/unitScopeGuard');
const { donationCreateSchema, expenseCreateSchema, expenseDecideSchema } = require('../validators/unitSchemas');

router.use(authenticate);

// Reads were previously authenticate-only, so a user whose role lost
// its finance permissions kept full read access to every unit's
// books. Financial records are permission-gated in BOTH directions:
// holders of either finance capability may read; writes keep their
// existing per-controller gates on top.
const FIN_READ = requirePermission('MANAGE_FINANCE', 'APPROVE_EXPENSE');

// Holding a finance permission says WHAT you may read, not WHOSE. A
// District Admin carries MANAGE_FINANCE for their own district, and
// without this guard the same permission let them pull any province's
// books by naming it in the query string.
const IN_SCOPE = requireUnitScope();

router.get('/donations', FIN_READ, IN_SCOPE, ctrl.listDonations);
router.post('/donations', IN_SCOPE, upload.single('receipt'), validate(donationCreateSchema), ctrl.recordDonation);

router.get('/expenses', FIN_READ, IN_SCOPE, ctrl.listExpenses);
router.post('/expenses', IN_SCOPE, upload.single('evidence'), validate(expenseCreateSchema), ctrl.recordExpense);
router.post('/expenses/:id/decide', validate(expenseDecideSchema), ctrl.decideExpense);

router.get('/summary', FIN_READ, IN_SCOPE, ctrl.summary);
router.get('/monthly', FIN_READ, IN_SCOPE, ctrl.monthlyStatements);

module.exports = router;
