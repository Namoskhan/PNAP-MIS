const User = require('../models/User');
const Central = require('../models/Central');
const { DEFAULT_PASSWORD } = require('./areaAdmin');

/**
 * Idempotently provision a Central Admin User.
 *
 *  - Username: "central" (fallback "pnap")
 *  - Email: "central@admin.com"
 *  - Password: "123456"
 *  - Role: CENTRAL_ADMIN (national scope, manages PROVINCE_ADMIN and Provinces)
 */
async function ensureCentralAdmin() {
  let central = await Central.findOne();
  if (!central) {
    central = await Central.create({ name: 'PKNAP Central', isActive: true });
  }

  let user = await User.findOne({
    $or: [
      { roles: 'CENTRAL_ADMIN' },
      { username: 'central' },
      { email: 'central@admin.com' },
    ],
  });

  if (user) {
    if (!user.roles.includes('CENTRAL_ADMIN')) {
      user.roles.push('CENTRAL_ADMIN');
      await user.save();
    }
    return { user, created: false, username: user.username };
  }

  user = new User({
    username: 'central',
    email: 'central@admin.com',
    fullName: 'PKNAP Central Admin',
    roles: ['CENTRAL_ADMIN'],
    isActive: true,
  });
  await user.setPassword(DEFAULT_PASSWORD);
  await user.save();
  console.log(`[central-admin] Auto-created central admin: username="central" pw="${DEFAULT_PASSWORD}"`);
  return { user, created: true, username: 'central' };
}

module.exports = { ensureCentralAdmin };
