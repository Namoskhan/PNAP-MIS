const router = require('express').Router();
const ctrl = require('../controllers/jirgaController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/composition', ctrl.getComposition);
router.get('/eligible-members', ctrl.getEligibleMembers);
router.post('/members', ctrl.assignMember);
router.post('/members/:id/remove', ctrl.removeMember);
router.delete('/members/:id', ctrl.removeMember);

module.exports = router;
