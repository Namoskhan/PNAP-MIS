const router = require('express').Router();
const ctrl = require('../controllers/performanceController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/member/:id', ctrl.memberPerformance);
// PR U6 — weighted composite score endpoint. Returns the live score
// for a member computed against the active PerformanceRuleSet.
router.get('/member/:id/score', ctrl.memberScore);

module.exports = router;
