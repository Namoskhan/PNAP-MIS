const User = require('../models/User');
const Province = require('../models/Province');
const { slugifyName, DEFAULT_PASSWORD } = require('./areaAdmin');

/**
 * Idempotently provision a District Admin User for a given District.
 *
 *  - Username = slug(district.name). Collisions (two districts with
 *    the same name in different provinces) get suffixed with the
 *    parent province's code, then a numeric counter, until unique.
 *  - Password = "123456". The admin can change it later.
 *  - Scope = the district's province / district IDs.
 *  - Role = DISTRICT_ADMIN. The role grants role-assignment power
 *    across every Area in the district (see canDecideRole +
 *    canInitiateRole + HIGHER_ADMIN_ROLES in unitScope.js).
 *
 * Per the SRS §5.1 + the user's directive: when a district is created,
 * the system creates this admin so the District Admin can structure
 * the Areas under it (assign Elaqai/Area cabinet roles).
 *
 * Safe to call repeatedly — returns the existing record on the second
 * call without changing the password.
 */
async function ensureDistrictAdmin(district) {
  if (!district || !district._id) return null;

  const existing = await User.findOne({
    'scope.districtId': district._id,
    roles: 'DISTRICT_ADMIN',
  });
  if (existing) return { user: existing, created: false, username: existing.username };

  const base = slugifyName(district.name);
  let username = base;

  if (await User.findOne({ username })) {
    const province = await Province.findById(district.provinceId).lean();
    const code = (province?.code || '').toLowerCase();
    username = code ? `${base}-${code}` : `${base}-2`;
    let i = 2;
    while (await User.findOne({ username })) {
      username = code ? `${base}-${code}-${i}` : `${base}-${i}`;
      i++;
    }
  }

  const u = new User({
    username,
    fullName: `${district.name} District Admin`,
    roles: ['DISTRICT_ADMIN'],
    scope: {
      districtId: district._id,
      provinceId: district.provinceId,
    },
    isActive: true,
  });
  await u.setPassword(DEFAULT_PASSWORD);
  await u.save();
  console.log(`[district-admin] auto-created username="${username}" pw="${DEFAULT_PASSWORD}" for district "${district.name}"`);
  return { user: u, created: true, username };
}

module.exports = { ensureDistrictAdmin };
