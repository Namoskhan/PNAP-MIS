const router = require('express').Router();
const ctrl = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');
const { requireExecutiveDashboardAccess } = require('../utils/centralCabinetDashboard');

router.use(authenticate);

router.get('/unit', ctrl.unitDashboard);
router.get('/subordinates', ctrl.subordinateBreakdown);

// ─── Executive analytics ───────────────────────────────────────────
// System-wide organizational intelligence. Every route below reads
// across ALL provinces regardless of the caller's own scope. Super
// Admin and approved Central Cabinet officeholders may read these
// dashboard endpoints; no other management powers are granted here.
const SUPER_ONLY = requireExecutiveDashboardAccess;

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
