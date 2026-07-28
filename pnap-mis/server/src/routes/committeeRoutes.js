const router = require('express').Router();
const ctrl = require('../controllers/committeeController');
const sup = require('../controllers/supervisoryController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/composition', ctrl.composition);
router.post('/permanent', ctrl.addPermanent);
router.post('/permanent/:id/remove', ctrl.removePermanent);

router.get('/supervisory-compliance', sup.compliance);

module.exports = router;
