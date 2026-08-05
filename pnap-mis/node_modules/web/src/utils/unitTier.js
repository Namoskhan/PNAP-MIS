// Where a user sits in the territorial hierarchy, and which part of the
// chain is therefore fixed for them.
//
// Shared by UnitContext (which decides the default/corrected operating
// context) and UnitSwitcher (which decides what may be selected). They
// used to disagree — the switcher offered every tier while the context
// only knew how to correct a few personas — so the rule lives here once.
//
// This is a convenience boundary, NOT the security boundary. The server
// re-derives it in middleware/unitScopeGuard and does not trust the
// client.

export const LEVEL_ORDER = ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'];

export function levelIndex(level) {
  return LEVEL_ORDER.indexOf(level);
}

/**
 * @returns {{level: string, fixed: object}} the user's own tier, plus
 *   the chain segments they cannot change.
 */
export function homeTierOf(user) {
  const roles = user?.roles || [];
  // Super and Central are the unbounded tiers — Central is responsible
  // for every province, so it has no territorial ceiling of its own.
  if (roles.includes('SUPER_ADMIN') || roles.includes('CENTRAL_ADMIN')) {
    return { level: 'CENTRAL', fixed: {} };
  }
  const s = user?.scope || {};
  if (roles.includes('PROVINCE_ADMIN') && s.provinceId) {
    return { level: 'PROVINCE', fixed: { provinceId: s.provinceId } };
  }
  if (roles.includes('DISTRICT_ADMIN') && s.districtId) {
    return { level: 'DISTRICT', fixed: { provinceId: s.provinceId, districtId: s.districtId } };
  }
  if (roles.includes('AREA_ADMIN') && s.areaId) {
    return {
      level: 'AREA',
      fixed: { provinceId: s.provinceId, districtId: s.districtId, areaId: s.areaId },
    };
  }
  // Cabinet holders and plain members are pinned from their role
  // assignment; if we get here, prefer the narrowest reach, not the
  // widest.
  if (s.basicUnitId) {
    return {
      level: 'BASIC_UNIT',
      fixed: {
        provinceId: s.provinceId, districtId: s.districtId,
        areaId: s.areaId, basicUnitId: s.basicUnitId,
      },
    };
  }
  return { level: 'CENTRAL', fixed: {} };
}

/** You may operate at your own tier or any tier beneath it — never above. */
export function isLevelAllowed(user, level) {
  const home = levelIndex(homeTierOf(user).level);
  const want = levelIndex(level);
  return want >= 0 && home >= 0 && want >= home;
}

/**
 * The unit id this user's home tier points at, when their own tier IS a
 * concrete unit. CENTRAL resolves through an API call instead, so it
 * returns null here.
 */
export function homeUnitIdOf(user) {
  const { level, fixed } = homeTierOf(user);
  if (level === 'PROVINCE') return fixed.provinceId || null;
  if (level === 'DISTRICT') return fixed.districtId || null;
  if (level === 'AREA') return fixed.areaId || null;
  if (level === 'BASIC_UNIT') return fixed.basicUnitId || null;
  return null;
}
