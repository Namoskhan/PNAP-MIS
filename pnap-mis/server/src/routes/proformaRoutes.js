const router = require('express').Router();
const ctrl = require('../controllers/proformaController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/entry', ctrl.getProformaEntry);
router.post('/save', ctrl.saveProformaReport);
router.get('/history', ctrl.getProformaHistory);

module.exports = router;
