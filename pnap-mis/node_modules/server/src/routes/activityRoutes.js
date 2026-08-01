const router = require('express').Router();
const ctrl = require('../controllers/activityController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { upload } = require('../middleware/upload');
const { activityCreateSchema } = require('../validators/unitSchemas');

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', validate(activityCreateSchema), ctrl.create);
router.post('/:id/photos', upload.array('photos', 10), ctrl.uploadPhotos);
router.post('/:id/complete', ctrl.complete);

module.exports = router;
