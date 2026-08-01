const router = require('express').Router();
const ctrl = require('../controllers/unitProposalController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', ctrl.propose);
router.post('/:id/decide', ctrl.decide);

module.exports = router;
