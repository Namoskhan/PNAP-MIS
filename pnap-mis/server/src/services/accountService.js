const User = require('../models/User');
const Member = require('../models/Member');
const { deriveMemberRoles } = require('../utils/syncMemberRoles');

// ─── Account resolution + credential store of record ─────────────────
//
// This module exists because of one fact about how PNAP logs people in:
//
//   A MEMBER'S PASSWORD DOES NOT LIVE ON THEIR USER RECORD.
//
// authController._finishMemberLogin verifies `member.verifyPassword()`.
// The User row it creates for that member is a JWT-subject + role/scope
// cache; it carries no passwordHash and no email. So a password reset
// that writes User.passwordHash would report success, change nothing
// the login path reads, and leave the member locked out with a password
// they were just told was updated.
//
// Everything here serves the same single system described in the design:
// ONE verification flow and ONE reset flow for the whole application,
// with the tokens on User (never duplicated onto Member), and only the
// final password write routed to whichever document actually holds the
// credential.
//
// None of this touches the login path. authController is unchanged
// except for the new handlers appended to it.

const CNIC_RX = /^\d{5}-\d{7}-\d$/;

// Only an ACTIVE member has a usable login identity — every other
// status is rejected by _finishMemberLogin before a password is even
// checked, so recovering one would hand out a credential nobody can
// use. Keeping this tight also means an unapproved applicant never
// materialises as a row in the admin user roster.
const PROVISIONABLE = new Set(['ACTIVE']);

/**
 * The bootstrap Super Admin is excluded from BOTH flows. Its password is
 * managed out of band (seed file / database / maintenance script), and
 * it has no mailbox to recover to.
 *
 * Keyed on a document flag, never on a role name — per the brief, none
 * of this may depend on the role system.
 */
function isExcluded(user) {
  return Boolean(user && user.isBootstrap);
}

/**
 * Member.email now carries a partial UNIQUE index, so at most one member
 * can hold a given address and this normally resolves to a single row.
 *
 * The ACTIVE-first / oldest-next tie-break is kept deliberately: records
 * created before the constraint existed may still share an address until
 * `npm run dedupe-identity` has been run against that database, and a
 * password-reset path must stay deterministic rather than let Mongo's
 * natural order decide which account it recovers.
 */
async function pickMemberByEmail(email) {
  const active = await Member.findOne({ email, status: 'ACTIVE' })
    .sort({ createdAt: 1 })
    .select('+passwordHash');
  if (active) return active;
  return Member.findOne({ email }).sort({ createdAt: 1 }).select('+passwordHash');
}

/**
 * Find — or lazily provision — the User row that owns this member's
 * login identity.
 *
 * Deliberately builds the SAME shape _finishMemberLogin builds, minus
 * lastLoginAt, so a member who resets their password before ever
 * logging in ends up with exactly the record login would have created.
 *
 * Note what is NOT copied: `email`. User.email carries a unique partial
 * index; copying a member's address here could collide with an existing
 * admin account and make E11000 the reason a password reset fails.
 * Email for member accounts is resolved from Member — see emailFor().
 */
async function ensureUserForMember(member) {
  if (!member) return null;
  const existing = await User.findOne({ cnic: member.cnic });
  if (existing) return existing;
  if (!PROVISIONABLE.has(member.status)) return null;

  const roles = await deriveMemberRoles(member._id);
  const user = new User({
    cnic: member.cnic,
    fullName: member.fullName,
    memberId: member._id,
    roles,
    // Mirrors the login guard: only an approved member has a live
    // account. _finishMemberLogin flips this to true on first sign-in.
    isActive: member.status === 'ACTIVE',
    scope: {
      basicUnitId: member.basicUnitId,
      areaId: member.areaId,
      districtId: member.districtId,
      provinceId: member.provinceId,
    },
  });
  await user.save();
  return user;
}

/**
 * Resolve an email / username / CNIC to an account.
 *
 * Uses the same format dispatch as login so the two can never disagree
 * about what a given identifier means.
 *
 * @returns {Promise<{user: any, member: any|null}|null>} null when no
 *   account exists. Callers MUST NOT let that distinction reach the
 *   client — see the response-parity note in passwordResetService.
 */
async function resolveAccount(rawIdentifier) {
  const id = String(rawIdentifier || '').trim();
  if (!id) return null;

  let user = null;
  let member = null;

  // CNIC or email only — the same two identifiers the login path now
  // accepts. Anything else resolves to null, so recovery cannot be
  // requested for an identifier that could not be used to sign in
  // anyway. The bootstrap Super Admin's username exception does not
  // apply here: that account is excluded from both recovery flows by
  // isExcluded() regardless.
  if (CNIC_RX.test(id)) {
    user = await User.findOne({ cnic: id });
    member = await Member.findOne({ cnic: id }).select('+passwordHash');
  } else if (id.includes('@')) {
    const email = id.toLowerCase();
    user = await User.findOne({ email });
    member = await pickMemberByEmail(email);
  } else {
    return null;
  }

  // A User found by email or username may still be a member account.
  // CNIC is the one identifier both tables share, and memberId is the
  // explicit link when it has been set.
  if (user && !member) {
    if (user.memberId) {
      member = await Member.findById(user.memberId).select('+passwordHash');
    } else if (user.cnic) {
      member = await Member.findOne({ cnic: user.cnic }).select('+passwordHash');
    }
  }

  // Conversely, a member found by email may have no User row yet —
  // members are provisioned lazily at first login.
  if (member && !user) user = await ensureUserForMember(member);

  if (!user) return null;
  return { user, member: member || null };
}

/** Reload an account from a User document (used after a token match). */
async function accountForUser(user) {
  if (!user) return null;
  let member = null;
  if (user.memberId) member = await Member.findById(user.memberId).select('+passwordHash');
  else if (user.cnic) member = await Member.findOne({ cnic: user.cnic }).select('+passwordHash');
  return { user, member };
}

/**
 * The address to mail. A member's User row has no email, so the Member
 * record is the fallback — and for member accounts, usually the only
 * source.
 */
function emailFor(account) {
  if (!account) return null;
  return account.user?.email || account.member?.email || null;
}

function displayNameFor(account) {
  return account?.user?.fullName || account?.member?.fullName || '';
}

/**
 * Write a new password to the credential store(s) of record.
 *
 * The rule, derived from the three login branches:
 *   * A member is verified against Member.passwordHash → always write there.
 *   * An admin User is verified against User.passwordHash → write there.
 *   * A User that has BOTH a linked member and its own passwordHash is
 *     reachable through either branch, so both are written. Leaving one
 *     stale would mean the old password still works on one login path.
 *   * A member's User row that has no passwordHash is left without one:
 *     it is a role cache, and minting a second live credential on it
 *     would widen the account's attack surface for no benefit.
 *
 * The Member document is saved here; the User document is left DIRTY for
 * the caller to save alongside the token clear, so a reset is one write
 * to User rather than two.
 *
 * @returns {Promise<string[]>} which stores were written, for the audit line.
 */
async function applyNewPassword(account, plainPassword) {
  const { user, member } = account;
  const written = [];

  if (member) {
    await member.setPassword(plainPassword);
    await member.save();
    written.push('MEMBER');
  }
  if (!member || user.passwordHash) {
    await user.setPassword(plainPassword);
    written.push('USER');
  }
  return written;
}

module.exports = {
  CNIC_RX,
  isExcluded,
  ensureUserForMember,
  resolveAccount,
  accountForUser,
  emailFor,
  displayNameFor,
  applyNewPassword,
};
