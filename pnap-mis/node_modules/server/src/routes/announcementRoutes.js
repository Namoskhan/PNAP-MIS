const router = require('express').Router();
const ctrl = require('../controllers/announcementController');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { announcementCreateSchema } = require('../validators/announcementSchemas');

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', validate(announcementCreateSchema), ctrl.create);
router.delete('/:id', ctrl.remove);

module.exports = router;
