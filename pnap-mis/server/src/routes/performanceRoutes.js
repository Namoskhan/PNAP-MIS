const router = require('express').Router();
const ctrl = require('../controllers/performanceController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);
router.get('/member/:id', ctrl.memberPerformance);
// PR U6 — weighted composite score endpoint. Returns the live score
// for a member computed against the active PerformanceRuleSet.
router.get('/member/:id/score', ctrl.memberScore);

// Unit-level performance — the same ruleset applied to a Province /
// District / Area / Basic Unit, plus a paginated member leaderboard
// for that unit. Scope is enforced per request in the controller
// (unitWithinAreaAdminScope), so a District Admin cannot score a
// province they don't administer.
router.get('/unit', ctrl.unitPerformance);
router.get('/unit/members', ctrl.unitMemberScores);

module.exports = router;
