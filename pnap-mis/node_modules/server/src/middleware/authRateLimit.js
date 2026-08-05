const rateLimit = require('express-rate-limit');
const env = require('../config/env');
const { fail } = require('../utils/response');

// ─── Rate limits for the account-security endpoints ──────────────────
//
// These are SEPARATE from the global /api limiter in app.js on purpose.
// That one defaults to max 0 (disabled) outside production so bulk data
// entry isn't throttled — which would leave forgot-password, resend and
// token-guessing completely unthrottled on every non-production
// deployment. These limiters are always on.
//
// They also sit in front of the only endpoints in the system that will
// send mail on an anonymous request, so an unlimited one is both an
// enumeration oracle and a way to use the organization's SMTP
// reputation to spam a third party.
//
// Tests are exempt — a suite that trips a 15-minute window fails for
// reasons unrelated to what it is asserting.

const WINDOW_MS = 15 * 60 * 1000;
const CONFIGURED = parseInt(process.env.AUTH_RATE_LIMIT || '0', 10);

function make(defaultMax, message) {
  const max = CONFIGURED > 0 ? CONFIGURED : defaultMax;
  return rateLimit({
    windowMs: WINDOW_MS,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test',
    // Match the project's error envelope so the client's
    // errorMessage() helper reads it like any other failure.
    handler: (req, res) => fail(res, 429, 'RATE_LIMITED', message),
  });
}

// Sends mail. Tightest budget.
const forgotPasswordLimiter = make(
  5,
  'Too many password reset requests. Please wait 15 minutes and try again.'
);

// Sends mail.
const resendVerificationLimiter = make(
  5,
  'Too many verification emails requested. Please wait 15 minutes and try again.'
);

// No mail, but a 256-bit token is not guessable — this is here to stop
// the traffic, not the cryptography. Roomier so a user who fumbles a
// password rule three times isn't locked out of their own reset link.
const resetPasswordLimiter = make(
  15,
  'Too many attempts. Please wait 15 minutes and try again.'
);

// Opening a verification link is a GET a mail client may prefetch, so
// this is the loosest of the four.
const verifyEmailLimiter = make(
  30,
  'Too many attempts. Please wait 15 minutes and try again.'
);

module.exports = {
  forgotPasswordLimiter,
  resendVerificationLimiter,
  resetPasswordLimiter,
  verifyEmailLimiter,
};
