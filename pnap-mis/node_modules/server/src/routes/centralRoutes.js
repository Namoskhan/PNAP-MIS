const router = require('express').Router();
const ctrl = require('../controllers/centralController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/congress', ctrl.congressSummary);
router.get('/alerts', ctrl.alertsFeed);

module.exports = router;
