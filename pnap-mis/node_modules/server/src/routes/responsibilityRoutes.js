const router = require('express').Router();
const ctrl = require('../controllers/responsibilityController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { responsibilityCreateSchema, responsibilityUpdateSchema } = require('../validators/unitSchemas');

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', validate(responsibilityCreateSchema), ctrl.create);
router.patch('/:id', validate(responsibilityUpdateSchema), ctrl.update);
router.delete('/:id', ctrl.remove);

module.exports = router;
