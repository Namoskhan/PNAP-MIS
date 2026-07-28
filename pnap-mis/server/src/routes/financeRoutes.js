const router = require('express').Router();
const ctrl = require('../controllers/financeController');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { upload } = require('../middleware/upload');
const { donationCreateSchema, expenseCreateSchema, expenseDecideSchema } = require('../validators/unitSchemas');

router.use(authenticate);

// Reads were previously authenticate-only, so a user whose role lost
// its finance permissions kept full read access to every unit's
// books. Financial records are permission-gated in BOTH directions:
// holders of either finance capability may read; writes keep their
// existing per-controller gates on top.
const FIN_READ = requirePermission('MANAGE_FINANCE', 'APPROVE_EXPENSE');

router.get('/donations', FIN_READ, ctrl.listDonations);
router.post('/donations', upload.single('receipt'), validate(donationCreateSchema), ctrl.recordDonation);

router.get('/expenses', FIN_READ, ctrl.listExpenses);
router.post('/expenses', upload.single('evidence'), validate(expenseCreateSchema), ctrl.recordExpense);
router.post('/expenses/:id/decide', validate(expenseDecideSchema), ctrl.decideExpense);

router.get('/summary', FIN_READ, ctrl.summary);
router.get('/monthly', FIN_READ, ctrl.monthlyStatements);

module.exports = router;
