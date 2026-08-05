const User = require('../models/User');
const { DEFAULT_PASSWORD } = require('./areaAdmin');

const SUPER_USERNAME = 'super';

/**
 * Idempotently provision the top-level Super Admin User.
 *
 *  - Username = "super" (fixed).
 *  - Password = "123456".
 *  - Scope = none (god mode — sees and edits everything).
 *  - Role = SUPER_ADMIN.
 *
 * SUPER_ADMIN is the only top-tier account: it covers system
 * operations (credential management, audit, password resets,
 * emergency overrides) AND the in-org "Central" leadership duties
 * (Central Cabinet, Central Committee, Qomi Jirga, Province
 * creation) per SRS §5.1.
 */
/**
 * Flag the bootstrap account so it is excluded from email verification
 * and password reset. Its password is managed out of band — seed file,
 * database, or a maintenance script — and it has no mailbox to recover
 * to, so a self-service reset would be a way to lock the organization
 * out of its own root account.
 *
 * The flag lives on the document rather than being inferred from
 * `roles.includes('SUPER_ADMIN')` so the exclusion never depends on the
 * role system, and so a second, real Super Admin created later through
 * the admin UI still gets the normal flows.
 *
 * Idempotent, and doubles as the migration for existing databases: the
 * field simply appears on the next boot.
 */
async function markBootstrap(user) {
  if (user.isBootstrap) return;
  await User.updateOne({ _id: user._id }, { $set: { isBootstrap: true } });
  user.isBootstrap = true;
}

async function ensureSuperAdmin() {
  const existing = await User.findOne({
    $or: [
      { username: SUPER_USERNAME },
      { roles: 'SUPER_ADMIN', isActive: true },
    ],
  });
  if (existing) {
    // Make sure the canonical username exists even if a SUPER_ADMIN
    // account already exists under a different login (e.g. the seed
    // script's admin@pnap.local). Don't touch that other record.
    if (existing.username === SUPER_USERNAME) {
      await markBootstrap(existing);
      return { user: existing, created: false, username: SUPER_USERNAME };
    }
  }
  const dup = await User.findOne({ username: SUPER_USERNAME });
  if (dup) {
    await markBootstrap(dup);
    return { user: dup, created: false, username: SUPER_USERNAME };
  }
  const u = new User({
    username: SUPER_USERNAME,
    fullName: 'PNAP Super Admin',
    roles: ['SUPER_ADMIN'],
    scope: {},
    isActive: true,
    isBootstrap: true,
  });
  await u.setPassword(DEFAULT_PASSWORD);
  await u.save();
  console.log(`[super-admin] auto-created username="${SUPER_USERNAME}" pw="${DEFAULT_PASSWORD}"`);
  return { user: u, created: true, username: SUPER_USERNAME };
}

module.exports = { ensureSuperAdmin, SUPER_USERNAME };
