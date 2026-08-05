const router = require('express').Router();
const ctrl = require('../controllers/responsibilityController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { responsibilityCreateSchema, responsibilityUpdateSchema } = require('../validators/unitSchemas');

const { requireUnitScope } = require('../middleware/unitScopeGuard');

router.use(authenticate);

router.get('/', requireUnitScope(), ctrl.list);
router.post('/', validate(responsibilityCreateSchema), ctrl.create);
router.patch('/:id', validate(responsibilityUpdateSchema), ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
