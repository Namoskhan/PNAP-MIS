const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const ctrl = require('../controllers/reportTemplateController');

// Public-ish report rendering. Authenticated only — scope checks
// piggy-back on gatherUnitData, which fails on bad unitLevel/unitId
// pairs. Future hardening could narrow further by user's tier scope.
router.use(authenticate);

router.get('/templates/:id/render', ctrl.render);

module.exports = router;
