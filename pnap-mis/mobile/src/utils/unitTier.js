// Ported from web/src/utils/unitTier.js — pure JS, no DOM deps.

export const LEVEL_ORDER = ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'];

export function levelIndex(level) {
  return LEVEL_ORDER.indexOf(level);
}

export function homeTierOf(user) {
  const roles = user?.roles || [];
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
  if (s.basicUnitId) {
    return {
      level: 'BASIC_UNIT',
      fixed: {
        provinceId: s.provinceId, districtId: s.districtId,
        areaId: s.areaId, basicUnitId: s.basicUnitId,
      },
    };
  }
  if (s.areaId) {
    return {
      level: 'AREA',
      fixed: {
        provinceId: s.provinceId, districtId: s.districtId,
        areaId: s.areaId,
      },
    };
  }
  if (s.districtId) {
    return {
      level: 'DISTRICT',
      fixed: { provinceId: s.provinceId, districtId: s.districtId },
    };
  }
  if (s.provinceId) {
    return {
      level: 'PROVINCE',
      fixed: { provinceId: s.provinceId },
    };
  }
  return { level: 'CENTRAL', fixed: {} };
}

export function isLevelAllowed(user, level) {
  const home = levelIndex(homeTierOf(user).level);
  const want = levelIndex(level);
  return want >= 0 && home >= 0 && want >= home;
}

export function homeUnitIdOf(user) {
  const { level, fixed } = homeTierOf(user);
  if (level === 'PROVINCE') return fixed.provinceId || user?.scope?.provinceId || null;
  if (level === 'DISTRICT') return fixed.districtId || user?.scope?.districtId || null;
  if (level === 'AREA') return fixed.areaId || user?.scope?.areaId || null;
  if (level === 'BASIC_UNIT') return fixed.basicUnitId || user?.scope?.basicUnitId || null;
  return null;
}

export const LEVEL_LABELS = {
  CENTRAL: 'Central',
  PROVINCE: 'Province',
  DISTRICT: 'District',
  AREA: 'Area',
  BASIC_UNIT: 'Basic Unit',
};
