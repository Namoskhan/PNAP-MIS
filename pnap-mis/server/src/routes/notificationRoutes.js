const router = require('express').Router();
const ctrl = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', ctrl.list);
router.get('/unread-count', ctrl.unreadCount);
router.post('/mark-all-read', ctrl.markAllRead);
router.post('/:id/read', ctrl.markRead);
router.delete('/:id', ctrl.remove);

module.exports = router;
