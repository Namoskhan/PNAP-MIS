const router = require('express').Router();
const ctrl = require('../controllers/meetingController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { upload } = require('../middleware/upload');
const { uploadAny } = require('../middleware/uploadAny');
const { meetingCreateSchema, meetingFinalizeSchema, meetingUpdateSchema } = require('../validators/unitSchemas');

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', validate(meetingCreateSchema), ctrl.create);
router.get('/:id', ctrl.getOne);
router.patch('/:id', validate(meetingUpdateSchema), ctrl.update);
router.post('/:id/photos', upload.array('photos', 10), ctrl.uploadPhotos);
router.post('/:id/documents', uploadAny.array('documents', 5), ctrl.uploadDocuments);
router.post('/:id/finalize', validate(meetingFinalizeSchema), ctrl.finalize);
router.post('/:id/cancel', ctrl.cancel);

module.exports = router;
