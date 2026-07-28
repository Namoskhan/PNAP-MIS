const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const ctrl = require('../controllers/publicController');
const { validate } = require('../middleware/validate');
const { upload } = require('../middleware/upload');
const { publicRegisterSchema } = require('../validators/memberSchemas');

// Tighter limit on the unauthenticated registration endpoint so the
// public form cannot be used to flood the approval queue. Skipped
// outside production so local testing isn't gated. Tunable via the
// REGISTER_RATE_LIMIT env var when you do want to exercise it.
const isProd = env.NODE_ENV === 'production';
const max = parseInt(process.env.REGISTER_RATE_LIMIT || (isProd ? '10' : '0'), 10);

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max,                                           // 0 disables the limit
  skip: () => max === 0,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many registrations from this IP. Try again later.' } },
});

router.get('/provinces', ctrl.listProvinces);
router.get('/districts', ctrl.listDistricts);
router.get('/areas', ctrl.listAreas);
router.get('/basic-units', ctrl.listBasicUnits);

// Free-text autocomplete — backs the public registration form.
router.get('/suggest/districts', ctrl.suggestDistricts);
router.get('/suggest/areas', ctrl.suggestAreas);
router.get('/suggest/basic-units', ctrl.suggestBasicUnits);

router.get('/status', ctrl.lookupStatus);

router.post(
  '/register',
  registerLimiter,
  upload.single('photo'),
  validate(publicRegisterSchema),
  ctrl.register
);

module.exports = router;
