const User = require('../models/User');
const District = require('../models/District');

// Strip non-letters/digits, lowercase, replace runs of separators with one '-'.
// Used to build a memorable Area Admin username from the area name.
function slugifyName(name) {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'area';
}

const DEFAULT_PASSWORD = '123456';

/**
 * Idempotently provision an Area Admin User for a given Area.
 *
 *  - Username = slug(area.name). If a User with that username already
 *    exists for a different Area (e.g. another district has an area
 *    with the same name), we suffix with the parent district code,
 *    then a numeric counter, until unique. The Super Admin can read
 *    the actual chosen username from the server log line.
 *  - Password = "123456". The admin can change it later.
 *  - Scope = the area's province / district / area IDs.
 *  - Role = AREA_ADMIN, which already grants role-assignment + cabinet
 *    permissions across the area's basic units.
 *
 * Safe to call repeatedly — returns the existing record on the second
 * call without changing the password.
 */
async function ensureAreaAdmin(area) {
  if (!area || !area._id) return null;

  const existing = await User.findOne({
    'scope.areaId': area._id,
    roles: 'AREA_ADMIN',
  });
  if (existing) return { user: existing, created: false, username: existing.username };

  const base = slugifyName(area.name);
  let username = base;

  if (await User.findOne({ username })) {
    const district = await District.findById(area.districtId).lean();
    const code = (district?.code || '').toLowerCase();
    username = code ? `${base}-${code}` : `${base}-2`;
    let i = 2;
    while (await User.findOne({ username })) {
      username = code ? `${base}-${code}-${i}` : `${base}-${i}`;
      i++;
    }
  }

  const u = new User({
    username,
    fullName: `${area.name} Area Admin`,
    roles: ['AREA_ADMIN'],
    scope: {
      areaId: area._id,
      districtId: area.districtId,
      provinceId: area.provinceId,
    },
    isActive: true,
  });
  await u.setPassword(DEFAULT_PASSWORD);
  await u.save();
  console.log(`[area-admin] auto-created username="${username}" pw="${DEFAULT_PASSWORD}" for area "${area.name}"`);
  return { user: u, created: true, username };
}

module.exports = { ensureAreaAdmin, slugifyName, DEFAULT_PASSWORD };
