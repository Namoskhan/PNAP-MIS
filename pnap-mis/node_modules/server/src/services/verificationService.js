const User = require('../models/User');
const env = require('../config/env');
const email = require('./emailService');
const templates = require('../utils/emailTemplates');
const { TTL, issueToken, hashToken, looksLikeToken } = require('./tokenService');
const account = require('./accountService');

// ─── Email verification ──────────────────────────────────────────────
//
// ONE flow for the entire application. There is no per-role variant and
// nothing here reads a role name: an area admin, a district secretary
// and a rank-and-file member all traverse exactly this code.
//
// The only excluded account is the bootstrap Super Admin, and that is
// decided by User.isBootstrap — a document flag, not a role.
//
// Verification is NOT enforced at login. The state is recorded and
// surfaced in the UI; nothing in the login path consults it. Turning it
// into a gate later is a single guard in _finishMemberLogin, but
// shipping it on would lock out every existing account the moment this
// deploys.

const VERIFY_HOURS = TTL.VERIFY_EMAIL / (60 * 60 * 1000);

function linkFor(rawToken) {
  return `${env.APP_URL}/verify-email/${rawToken}`;
}

/**
 * Issue (or re-issue) a verification token and mail it.
 *
 * Silent about outcomes by design — the caller returns an identical
 * response whatever happens here, so an attacker cannot use this
 * endpoint to test whether an address is registered.
 *
 * Re-issuing OVERWRITES any token already in flight, so at most one
 * verification link is ever live for an account.
 *
 * @returns {Promise<string>} an outcome code, for logging only.
 */
async function requestVerification(identifier) {
  const acct = await account.resolveAccount(identifier);
  if (!acct) return 'NO_ACCOUNT';
  if (account.isExcluded(acct.user)) return 'EXCLUDED';
  if (acct.user.emailVerified) return 'ALREADY_VERIFIED';

  const to = account.emailFor(acct);
  if (!to) return 'NO_EMAIL';

  const { raw, hash, expiresAt } = issueToken(TTL.VERIFY_EMAIL);
  await User.updateOne(
    { _id: acct.user._id },
    { $set: { emailVerificationToken: hash, emailVerificationExpires: expiresAt } }
  );

  await email.send({
    to,
    ...templates.verifyEmail({
      fullName: account.displayNameFor(acct),
      url: linkFor(raw),
      hours: VERIFY_HOURS,
    }),
  });
  return 'SENT';
}

/**
 * Redeem a verification token.
 *
 * Matching is done on the HASH of the submitted token against an
 * unexpired row, so a stolen database gives an attacker nothing to
 * replay. Clearing the stored hash on success is what makes the link
 * single-use.
 *
 * @returns {Promise<{ok:true, alreadyVerified:boolean}|{ok:false, code:string}>}
 */
async function confirmVerification(rawToken) {
  if (!looksLikeToken(rawToken)) return { ok: false, code: 'INVALID_TOKEN' };

  const user = await User.findOne({
    emailVerificationToken: hashToken(rawToken),
  }).select('+emailVerificationToken +emailVerificationExpires');

  if (!user) return { ok: false, code: 'INVALID_TOKEN' };

  // Expiry is checked in application code rather than in the query so
  // an expired link can be reported as expired — "invalid" would send
  // the user hunting for a typo in a link that was simply too old.
  if (!user.emailVerificationExpires || user.emailVerificationExpires.getTime() < Date.now()) {
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();
    return { ok: false, code: 'TOKEN_EXPIRED' };
  }
  if (account.isExcluded(user)) return { ok: false, code: 'INVALID_TOKEN' };

  const alreadyVerified = Boolean(user.emailVerified);
  user.emailVerified = true;
  user.emailVerifiedAt = new Date();
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save();

  return { ok: true, alreadyVerified };
}

module.exports = { requestVerification, confirmVerification, VERIFY_HOURS };
