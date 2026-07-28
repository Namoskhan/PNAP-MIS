const User = require('../models/User');
const { slugifyName, DEFAULT_PASSWORD } = require('./areaAdmin');

/**
 * Idempotently provision a Province Admin User for a given Province.
 *
 *  - Username = slug(province.name) (e.g. "sindh", "punjab"). On
 *    collision, suffix with the province code, then a numeric counter.
 *  - Password = "123456".
 *  - Scope = the province's _id.
 *  - Role = PROVINCE_ADMIN. Per HIGHER_ADMIN_ROLES + the territorial
 *    scope check in unitWithinAreaAdminScope, this admin can:
 *      • view all members of the province (every district below it),
 *      • assign District Cabinet roles for every district in the
 *        province (mirroring how the District Admin assigns Area
 *        cabinets and the Area Admin assigns BU cabinets),
 *      • approve role proposals at any sub-level within scope,
 *      • view the Zilla Committee composition for any district.
 *
 * Per the user's directive: when a province is created, the system
 * auto-creates this admin so the Province Admin can structure the
 * Districts under it.
 *
 * Safe to call repeatedly — returns the existing record on the second
 * call without changing the password.
 */
async function ensureProvinceAdmin(province) {
  if (!province || !province._id) return null;

  const existing = await User.findOne({
    'scope.provinceId': province._id,
    roles: 'PROVINCE_ADMIN',
  });
  if (existing) return { user: existing, created: false, username: existing.username };

  const base = slugifyName(province.name);
  let username = base;

  if (await User.findOne({ username })) {
    const code = (province.code || '').toLowerCase();
    username = code ? `${base}-${code}` : `${base}-2`;
    let i = 2;
    while (await User.findOne({ username })) {
      username = code ? `${base}-${code}-${i}` : `${base}-${i}`;
      i++;
    }
  }

  const u = new User({
    username,
    fullName: `${province.name} Province Admin`,
    roles: ['PROVINCE_ADMIN'],
    scope: { provinceId: province._id },
    isActive: true,
  });
  await u.setPassword(DEFAULT_PASSWORD);
  await u.save();
  console.log(`[province-admin] auto-created username="${username}" pw="${DEFAULT_PASSWORD}" for province "${province.name}"`);
  return { user: u, created: true, username };
}

module.exports = { ensureProvinceAdmin };
