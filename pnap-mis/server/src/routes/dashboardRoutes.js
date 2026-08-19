const router = require('express').Router();
const ctrl = require('../controllers/dashboardController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/unit', ctrl.unitDashboard);
router.get('/subordinates', ctrl.subordinateBreakdown);

// ─── Executive analytics ───────────────────────────────────────────
// System-wide organizational intelligence. Every route below reads
// across ALL provinces regardless of the caller's own scope, so they
// are Super Admin only — the same gate adminRoutes puts on the audit
// log and the global finance overview. Reuses the existing
// authenticate + requireRole middleware; no new auth path.
const SUPER_ONLY = requireRole('SUPER_ADMIN');

router.get('/summary', SUPER_ONLY, ctrl.executiveSummary);
router.get('/scope', SUPER_ONLY, ctrl.scope);
router.get('/province-breakdown', SUPER_ONLY, ctrl.provinceBreakdown);
router.get('/org-breakdown', SUPER_ONLY, ctrl.orgBreakdown);
router.get('/membership', SUPER_ONLY, ctrl.membership);
router.get('/meetings', SUPER_ONLY, ctrl.meetings);
router.get('/campaigns', SUPER_ONLY, ctrl.campaigns);
router.get('/reports', SUPER_ONLY, ctrl.reports);
router.get('/activity', SUPER_ONLY, ctrl.activityFeed);
router.get('/activity-trend', SUPER_ONLY, ctrl.activityTrend);
router.get('/inactive-members', SUPER_ONLY, ctrl.inactiveMembers);
router.get('/inactive-units', SUPER_ONLY, ctrl.inactiveUnits);

module.exports = router;
