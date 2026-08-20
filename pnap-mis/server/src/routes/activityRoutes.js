const router = require('express').Router();
const ctrl = require('../controllers/activityController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { upload } = require('../middleware/upload');
const { activityCreateSchema } = require('../validators/unitSchemas');

const { requireUnitScope } = require('../middleware/unitScopeGuard');

router.use(authenticate);

router.get('/', requireUnitScope(), ctrl.list);
router.post('/', validate(activityCreateSchema), ctrl.create);
router.post('/:id/photos', upload.array('photos', 10), ctrl.uploadPhotos);
router.post('/:id/complete', ctrl.complete);
router.post('/:id/cancel', ctrl.cancel);

module.exports = router;
