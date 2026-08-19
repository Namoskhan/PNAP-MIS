const router = require('express').Router();
const ctrl = require('../controllers/centralController');
const congressCtrl = require('../controllers/congressController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/congress', ctrl.congressSummary);
router.get('/alerts', ctrl.alertsFeed);

// ─── National Congress calendar ────────────────────────────────────
// The dates that bound Congress-to-Congress reporting periods.
// Mounted here rather than as a new top-level route so the existing
// route table and sidebar are untouched.
//
// Reads: any authenticated user — the dashboard period selector needs
// them, and a Congress date is not sensitive.
// Writes: Super Admin only, matching every other national-scope
// configuration surface (roles, audit, settings).
//
// NOTE the ordering: '/congresses' must not be shadowed by the
// '/congress' summary above. Express matches exact paths, so they are
// unambiguous, but keep the plural distinct if either is ever changed
// to a parameterised pattern.
router.get('/congresses', congressCtrl.list);
router.post('/congresses', requireRole('SUPER_ADMIN'), congressCtrl.create);
router.patch('/congresses/:id', requireRole('SUPER_ADMIN'), congressCtrl.update);
router.delete('/congresses/:id', requireRole('SUPER_ADMIN'), congressCtrl.remove);

module.exports = router;
