const router = require('express').Router();
const ctrl = require('../controllers/memberController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { upload } = require('../middleware/upload');
const {
  memberCreateSchema,
  memberUpdateSchema,
  memberRejectSchema,
  listQuerySchema,
} = require('../validators/memberSchemas');

router.use(authenticate);

router.get('/stats', ctrl.stats);
router.get('/', validate(listQuerySchema, 'query'), ctrl.list);
router.get('/:id', ctrl.getOne);

router.post(
  '/',
  upload.single('photo'),
  validate(memberCreateSchema),
  ctrl.create
);

router.patch(
  '/:id',
  upload.single('photo'),
  validate(memberUpdateSchema),
  ctrl.update
);

router.post('/:id/approve', ctrl.approve);
router.post('/:id/reject', validate(memberRejectSchema), ctrl.reject);
router.post('/:id/status', ctrl.setStatus);

module.exports = router;
