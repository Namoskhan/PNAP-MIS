const router = require('express').Router();
const ctrl = require('../controllers/roleController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { proposeRoleSchema, decideRoleSchema, endRoleSchema } = require('../validators/unitSchemas');

router.use(authenticate);

router.get('/', ctrl.list);
router.get('/cabinet', ctrl.cabinet);
router.post('/', validate(proposeRoleSchema), ctrl.propose);
router.post('/:id/decide', validate(decideRoleSchema), ctrl.decide);
router.post('/:id/end', validate(endRoleSchema), ctrl.end);

module.exports = router;
