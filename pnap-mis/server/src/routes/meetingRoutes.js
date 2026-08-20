const router = require('express').Router();
const ctrl = require('../controllers/meetingController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { upload } = require('../middleware/upload');
const { uploadAny } = require('../middleware/uploadAny');
const { meetingCreateSchema, meetingFinalizeSchema, meetingUpdateSchema } = require('../validators/unitSchemas');
const { requireUnitScope } = require('../middleware/unitScopeGuard');

router.use(authenticate);

// A meeting list addressed at (unitLevel, unitId) must stay inside the
// caller's territory; see middleware/unitScopeGuard.
router.get('/', requireUnitScope(), ctrl.list);
router.post('/', validate(meetingCreateSchema), ctrl.create);
router.get('/eligible-attendees', ctrl.eligibleAttendees);
router.get('/:id', ctrl.getOne);
router.get('/:id/attendees', ctrl.attendees);
router.get('/:id/eligible-attendees', ctrl.attendees);
router.patch('/:id', validate(meetingUpdateSchema), ctrl.update);
router.post('/:id/photos', upload.array('photos', 10), ctrl.uploadPhotos);
router.post('/:id/documents', uploadAny.array('documents', 5), ctrl.uploadDocuments);
router.get('/:id/supervisor-candidates', ctrl.supervisorCandidates);
router.post('/:id/finalize', validate(meetingFinalizeSchema), ctrl.finalize);
router.post('/:id/cancel', ctrl.cancel);

module.exports = router;
