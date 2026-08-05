const router = require('express').Router();
const ctrl = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');
const {
  forgotPasswordLimiter,
  resendVerificationLimiter,
  resetPasswordLimiter,
  verifyEmailLimiter,
} = require('../middleware/authRateLimit');

router.post('/login', ctrl.login);
router.get('/me', authenticate, ctrl.me);

// ── Account security. All public by design: a locked-out user has no
// token to authenticate with. Each carries its own rate limiter,
// independent of the global /api limiter (which is disabled outside
// production).
router.post('/forgot-password', forgotPasswordLimiter, ctrl.forgotPassword);
router.get('/reset-password/:token', resetPasswordLimiter, ctrl.checkResetToken);
router.post('/reset-password', resetPasswordLimiter, ctrl.resetPassword);
router.post('/resend-verification', resendVerificationLimiter, ctrl.resendVerification);
router.get('/verify-email/:token', verifyEmailLimiter, ctrl.verifyEmail);

module.exports = router;
