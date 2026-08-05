const User = require('../models/User');
const env = require('../config/env');
const email = require('./emailService');
const templates = require('../utils/emailTemplates');
const { TTL, issueToken, hashToken, looksLikeToken } = require('./tokenService');
const account = require('./accountService');

// ─── Forgot / reset password ─────────────────────────────────────────
//
// ONE flow for the entire application, role-name independent, with the
// bootstrap Super Admin excluded via User.isBootstrap.
//
// Two properties this module exists to guarantee:
//
//   1. NO EXISTENCE DISCLOSURE. requestReset() reports nothing about
//      what it found. Unknown address, known address, no mailbox on
//      file, excluded account, deactivated account — every one of them
//      returns the same value, and the controller returns the same body
//      and the same status. The outcome code that comes back is for the
//      server log only and must never be forwarded to the client.
//
//   2. THE PASSWORD LANDS WHERE LOGIN READS IT. Members authenticate
//      against Member.passwordHash, not User.passwordHash. The write is
//      delegated to accountService.applyNewPassword(), which owns that
//      rule. This is the single most breakable part of the feature.

const RESET_HOURS = TTL.RESET_PASSWORD / (60 * 60 * 1000);

// Deliberately modest: this is a community membership system, and a
// rule that rejects what people can actually remember pushes them onto
// sticky notes. Length does the real work.
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;

function linkFor(rawToken) {
  return `${env.APP_URL}/reset-password/${rawToken}`;
}

/**
 * Validate a candidate password. Returns null when acceptable, or a
 * human-readable reason.
 */
function passwordProblem(plain) {
  if (typeof plain !== 'string' || plain.length < MIN_PASSWORD) {
    return `Password must be at least ${MIN_PASSWORD} characters.`;
  }
  if (plain.length > MAX_PASSWORD) {
    return `Password must be at most ${MAX_PASSWORD} characters.`;
  }
  if (!/[a-zA-Z]/.test(plain) || !/[0-9]/.test(plain)) {
    return 'Password must contain at least one letter and one number.';
  }
  return null;
}

/**
 * Issue a reset token and mail it. Overwrites any token already in
 * flight, so requesting a second link immediately invalidates the first.
 *
 * @returns {Promise<string>} outcome code — FOR LOGGING ONLY. Returning
 *   this to the client would defeat the whole point of the endpoint.
 */
async function requestReset(identifier) {
  const acct = await account.resolveAccount(identifier);
  if (!acct) return 'NO_ACCOUNT';
  if (account.isExcluded(acct.user)) return 'EXCLUDED';
  // A deactivated account cannot log in, so handing it a live reset
  // link would only create a credential nobody can use.
  if (acct.user.isActive === false && acct.member?.status !== 'ACTIVE') return 'INACTIVE';

  const to = account.emailFor(acct);
  if (!to) return 'NO_EMAIL';

  const { raw, hash, expiresAt } = issueToken(TTL.RESET_PASSWORD);
  await User.updateOne(
    { _id: acct.user._id },
    { $set: { passwordResetToken: hash, passwordResetExpires: expiresAt } }
  );

  await email.send({
    to,
    ...templates.resetPassword({
      fullName: account.displayNameFor(acct),
      url: linkFor(raw),
      hours: RESET_HOURS,
    }),
  });
  return 'SENT';
}

/**
 * Check a reset token without spending it. Backs the reset page, so a
 * user sees "this link has expired" before typing a new password twice
 * rather than after.
 */
async function inspectToken(rawToken) {
  if (!looksLikeToken(rawToken)) return { ok: false, code: 'INVALID_TOKEN' };
  const user = await User.findOne({ passwordResetToken: hashToken(rawToken) })
    .select('+passwordResetToken +passwordResetExpires');
  if (!user || account.isExcluded(user)) return { ok: false, code: 'INVALID_TOKEN' };
  if (!user.passwordResetExpires || user.passwordResetExpires.getTime() < Date.now()) {
    return { ok: false, code: 'TOKEN_EXPIRED' };
  }
  return { ok: true, fullName: user.fullName };
}

/**
 * Redeem a reset token and set the new password.
 *
 * Single-use: the stored hash is cleared in the same save that writes
 * the password, so replaying a captured link finds no matching row.
 *
 * @returns {Promise<{ok:true, stores:string[]}|{ok:false, code:string, message?:string}>}
 */
async function confirmReset(rawToken, newPassword, confirmPassword) {
  if (!looksLikeToken(rawToken)) return { ok: false, code: 'INVALID_TOKEN' };

  if (typeof confirmPassword === 'string' && newPassword !== confirmPassword) {
    return { ok: false, code: 'VALIDATION_ERROR', message: 'Passwords do not match.' };
  }
  const problem = passwordProblem(newPassword);
  if (problem) return { ok: false, code: 'VALIDATION_ERROR', message: problem };

  const user = await User.findOne({ passwordResetToken: hashToken(rawToken) })
    .select('+passwordResetToken +passwordResetExpires +passwordHash');
  if (!user) return { ok: false, code: 'INVALID_TOKEN' };
  if (account.isExcluded(user)) return { ok: false, code: 'INVALID_TOKEN' };

  if (!user.passwordResetExpires || user.passwordResetExpires.getTime() < Date.now()) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    return { ok: false, code: 'TOKEN_EXPIRED' };
  }

  const acct = await account.accountForUser(user);

  // Writes Member.passwordHash and/or User.passwordHash per the rule in
  // accountService. Leaves `user` dirty; the save below persists the new
  // hash and the token clear together.
  const stores = await account.applyNewPassword(acct, newPassword);

  // Completing a reset proves control of the mailbox the link was sent
  // to, which is exactly what verification asserts — so record it.
  if (!user.emailVerified) {
    user.emailVerified = true;
    user.emailVerifiedAt = new Date();
  }
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // Best-effort notification. This is the only signal a victim receives
  // if someone else completed a reset on their account.
  const to = account.emailFor(acct);
  if (to) {
    await email.send({
      to,
      ...templates.passwordChanged({
        fullName: account.displayNameFor(acct),
        url: `${env.APP_URL}/login`,
      }),
    });
  }

  return { ok: true, stores };
}

module.exports = {
  requestReset,
  inspectToken,
  confirmReset,
  passwordProblem,
  RESET_HOURS,
  MIN_PASSWORD,
};
