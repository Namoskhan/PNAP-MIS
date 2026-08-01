const router = require('express').Router();
const ctrl = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/unit', ctrl.unitDashboard);
router.get('/subordinates', ctrl.subordinateBreakdown);

module.exports = router;
