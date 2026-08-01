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
      return { user: existing, created: false, username: SUPER_USERNAME };
    }
  }
  const dup = await User.findOne({ username: SUPER_USERNAME });
  if (dup) return { user: dup, created: false, username: SUPER_USERNAME };
  const u = new User({
    username: SUPER_USERNAME,
    fullName: 'PNAP Super Admin',
    roles: ['SUPER_ADMIN'],
    scope: {},
    isActive: true,
  });
  await u.setPassword(DEFAULT_PASSWORD);
  await u.save();
  console.log(`[super-admin] auto-created username="${SUPER_USERNAME}" pw="${DEFAULT_PASSWORD}"`);
  return { user: u, created: true, username: SUPER_USERNAME };
}

module.exports = { ensureSuperAdmin, SUPER_USERNAME };
