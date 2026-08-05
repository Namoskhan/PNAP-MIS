const crypto = require('crypto');

// ─── Single-use, expiring, hashed action tokens ──────────────────────
//
// Used by BOTH the email-verification and the password-reset flows.
// One implementation, so the two can never drift into different
// security properties.
//
// The contract:
//   * The token is 32 bytes of crypto.randomBytes — 256 bits. Not
//     Math.random, not a uuid, not a timestamp.
//   * Only the SHA-256 HASH is persisted. A database dump therefore
//     contains nothing replayable, and neither does a backup, a log
//     line, or a mongodump left on a laptop.
//   * The plaintext exists exactly once, in the email. We return it,
//     the caller mails it, nobody stores it.
//   * Every token carries an absolute expiry, checked at redemption.
//   * Redemption clears the stored hash, which is what makes a token
//     single-use and blocks replay of a captured link.
//
// SHA-256 (rather than bcrypt, which guards the password itself) is
// the right choice here: the input is 256 bits of uniform entropy, so
// there is no dictionary to slow down, and redemption must stay fast.

const TOKEN_BYTES = 32;

const TTL = {
  // Long enough to survive a mailbox nobody checks until tomorrow.
  VERIFY_EMAIL: 24 * 60 * 60 * 1000,
  // Short: a reset link is a live credential.
  RESET_PASSWORD: 60 * 60 * 1000,
};

/** SHA-256 hex digest — the only form ever written to the database. */
function hashToken(raw) {
  return crypto.createHash('sha256').update(String(raw)).digest('hex');
}

/**
 * Mint a token.
 * @returns {{ raw: string, hash: string, expiresAt: Date }}
 *   `raw` goes in the email and is never persisted; `hash` and
 *   `expiresAt` go on the User document.
 */
function issueToken(ttlMs) {
  const raw = crypto.randomBytes(TOKEN_BYTES).toString('hex');
  return { raw, hash: hashToken(raw), expiresAt: new Date(Date.now() + ttlMs) };
}

/**
 * Shape check before we ever touch the database. A token is fixed-width
 * hex; anything else is a probe, and rejecting it here keeps junk out
 * of the query path.
 */
function looksLikeToken(raw) {
  return typeof raw === 'string' && new RegExp(`^[0-9a-f]{${TOKEN_BYTES * 2}}$`).test(raw);
}

module.exports = { TTL, TOKEN_BYTES, hashToken, issueToken, looksLikeToken };
