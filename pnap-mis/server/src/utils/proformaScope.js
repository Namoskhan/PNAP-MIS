const { ApiError } = require('./response');
const { resolveUnitChain } = require('./unitScope');

// Roles authorized to access (read, generate, or manage) proforma reports
const PROFORMA_AUTHORIZED_ROLES = [
  // Super and System Admin
  'SUPER_ADMIN',
  'ADMIN',
  'CENTRAL_ADMIN',
  // Territorial Admins
  'PROVINCE_ADMIN',
  'DISTRICT_ADMIN',
  'AREA_ADMIN',
  // Central Cabinet / Leadership
  'CHAIRMAN',
  'CO_CHAIRMAN',
  'SR_VICE_CHAIRMAN',
  'VICE_CHAIRMAN',
  'FIRST_SECRETARY',
  // Province / District / Area / Basic Unit Cabinet & Leadership
  'PRESIDENT',
  'SR_VICE_PRESIDENT',
  'VICE_PRESIDENT',
  'GENERAL_SECRETARY',
  'DEPUTY_SECRETARY',
  'OFFICE_SECRETARY',
  'FINANCE_SECRETARY',
  'INFORMATION_SECRETARY',
  'ORGANIZING_SECRETARY',
  'CULTURE_SECRETARY',
  'SENIOR_MAWIN',
  'SECRETARY',
];

// Numeric rank for tiers: higher number = higher authority
const TIER_RANK = {
  CENTRAL: 5,
  PROVINCE: 4,
  DISTRICT: 3,
  AREA: 2,
  BASIC_UNIT: 1,
};

// Target tier required for each form type
const FORM_REQUIRED_TIER = {
  form1: 'AREA',
  form2: 'AREA',
  form3: 'AREA',
  form4: 'BASIC_UNIT',
  form5: 'PROVINCE',
  form6: 'DISTRICT',
  form7: 'DISTRICT',
  form8: 'DISTRICT',
  form9: 'DISTRICT', // Can also be AREA when specifically addressing an Area unit
};

/**
 * Checks if the user holds an authorized administrative or leadership role for proformas.
 */
function isRoleAuthorizedForProforma(user) {
  if (!user) return false;
  if (user.isBootstrap) return true;
  const roles = user.roles || [];
  return roles.some((r) => PROFORMA_AUTHORIZED_ROLES.includes(r));
}

/**
 * Derives the caller's highest tier of authority.
 * @param {object} user
 * @returns {'CENTRAL' | 'PROVINCE' | 'DISTRICT' | 'AREA' | 'BASIC_UNIT'}
 */
function getUserTier(user) {
  if (!user) return 'BASIC_UNIT';
  const roles = user.roles || [];

  // Super and Central admins have unbounded national reach
  if (
    roles.includes('SUPER_ADMIN') ||
    roles.includes('CENTRAL_ADMIN') ||
    roles.includes('ADMIN') ||
    user.isBootstrap
  ) {
    return 'CENTRAL';
  }

  // Central cabinet roles
  if (
    roles.some((r) =>
      ['CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN', 'FIRST_SECRETARY'].includes(r)
    )
  ) {
    return 'CENTRAL';
  }

  const s = user.scope || {};

  // Province admin or provincial cabinet
  if (roles.includes('PROVINCE_ADMIN')) return 'PROVINCE';
  if (s.provinceId && !s.districtId && !s.areaId && !s.basicUnitId) return 'PROVINCE';

  // District admin or district cabinet
  if (roles.includes('DISTRICT_ADMIN')) return 'DISTRICT';
  if (s.districtId && !s.areaId && !s.basicUnitId) return 'DISTRICT';

  // Area admin or area cabinet
  if (roles.includes('AREA_ADMIN')) return 'AREA';
  if (s.areaId && !s.basicUnitId) return 'AREA';

  // Basic Unit cabinet
  if (s.basicUnitId) return 'BASIC_UNIT';

  // If user has provinceId only, default to PROVINCE
  if (s.provinceId) return 'PROVINCE';

  // Fallback for authorized users without specific scope
  return 'AREA';
}

/**
 * Resolves the required tier for a given form and target level.
 */
function getFormTier(formType, targetLevel) {
  if (formType === 'form9' && targetLevel === 'AREA') {
    return 'AREA';
  }
  return targetLevel || FORM_REQUIRED_TIER[formType] || 'BASIC_UNIT';
}

/**
 * Validates that:
 * 1. The user has an authorized role.
 * 2. The user's tier is greater than or equal to the form's required tier (lower cannot access higher).
 * 3. The target unit is within the user's territorial scope.
 *
 * @param {object} user
 * @param {string} formType
 * @param {string} targetId
 * @param {string} targetLevel
 * @throws {ApiError} 403 FORBIDDEN or OUT_OF_SCOPE
 */
async function validateProformaAccess(user, formType, targetId, targetLevel) {
  // 1. Role verification
  if (!isRoleAuthorizedForProforma(user)) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      'You do not have permission to access proforma reports. Proforma access is restricted to authorized party executives and leadership.'
    );
  }

  // 2. Tier hierarchy check: Lower-level roles cannot access higher-level forms
  const userTier = getUserTier(user);
  const requiredTier = getFormTier(formType, targetLevel);

  const userRank = TIER_RANK[userTier] || 1;
  const reqRank = TIER_RANK[requiredTier] || 1;

  if (userRank < reqRank) {
    throw new ApiError(
      403,
      'FORBIDDEN',
      `Access denied: Lower-level role (${userTier}) cannot access higher-level reports (${requiredTier}).`
    );
  }

  // 3. Territorial scope validation (User cannot access units outside their territory)
  if (userTier === 'CENTRAL') {
    return true; // Central / Super has nationwide scope
  }

  if (!targetId) {
    return true;
  }

  const effectiveLevel = targetLevel || requiredTier;
  const s = user.scope || {};

  // Direct fast check when targetLevel matches scope level
  if (effectiveLevel === 'DISTRICT' && s.districtId) {
    if (String(targetId) !== String(s.districtId)) {
      throw new ApiError(
        403,
        'OUT_OF_SCOPE',
        'That unit is outside your district territorial scope.'
      );
    }
  }
  if (effectiveLevel === 'PROVINCE' && s.provinceId) {
    if (String(targetId) !== String(s.provinceId)) {
      throw new ApiError(
        403,
        'OUT_OF_SCOPE',
        'That unit is outside your provincial territorial scope.'
      );
    }
  }
  if (effectiveLevel === 'AREA' && s.areaId) {
    if (String(targetId) !== String(s.areaId)) {
      throw new ApiError(
        403,
        'OUT_OF_SCOPE',
        'That unit is outside your area territorial scope.'
      );
    }
  }
  if (effectiveLevel === 'BASIC_UNIT' && s.basicUnitId) {
    if (String(targetId) !== String(s.basicUnitId)) {
      throw new ApiError(
        403,
        'OUT_OF_SCOPE',
        'That unit is outside your basic unit territorial scope.'
      );
    }
  }

  const chain = await resolveUnitChain(effectiveLevel, targetId);
  if (!chain) {
    return {
      allowed: true,
      userTier,
      requiredTier,
      targetLevel: effectiveLevel,
      targetId,
    };
  }

  // Provincial boundary check
  if (s.provinceId && chain.provinceId) {
    if (String(chain.provinceId) !== String(s.provinceId)) {
      throw new ApiError(
        403,
        'OUT_OF_SCOPE',
        'That unit is outside your provincial territorial scope.'
      );
    }
  }

  // District boundary check
  if (s.districtId && chain.districtId) {
    if (String(chain.districtId) !== String(s.districtId)) {
      throw new ApiError(
        403,
        'OUT_OF_SCOPE',
        'That unit is outside your district territorial scope.'
      );
    }
  }

  // Area boundary check
  if (s.areaId && chain.areaId) {
    if (String(chain.areaId) !== String(s.areaId)) {
      throw new ApiError(
        403,
        'OUT_OF_SCOPE',
        'That unit is outside your area territorial scope.'
      );
    }
  }

  // Basic Unit boundary check
  if (s.basicUnitId) {
    if (String(targetId) !== String(s.basicUnitId)) {
      throw new ApiError(
        403,
        'OUT_OF_SCOPE',
        'You may only access reports for your assigned basic unit.'
      );
    }
  }

  return true;
}

/**
 * Determines whether the user has permission to edit/submit this proforma report.
 * Higher tiers inspecting lower units may view/generate, while the unit's executives (or superiors within territory) edit.
 */
function canUserEditProforma(user, formType, targetLevel) {
  if (!user) return false;
  if (!isRoleAuthorizedForProforma(user)) return false;

  const userTier = getUserTier(user);
  const requiredTier = getFormTier(formType, targetLevel);

  const userRank = TIER_RANK[userTier] || 1;
  const reqRank = TIER_RANK[requiredTier] || 1;

  if (userRank < reqRank) return false;

  return true;
}

function isTierGreaterOrEqual(tierA, tierB) {
  const rankA = TIER_RANK[tierA] || 0;
  const rankB = TIER_RANK[tierB] || 0;
  return rankA >= rankB;
}

module.exports = {
  PROFORMA_AUTHORIZED_ROLES,
  TIER_RANK,
  FORM_REQUIRED_TIER,
  isRoleAuthorizedForProforma,
  getUserTier,
  getFormTier,
  isTierGreaterOrEqual,
  validateProformaAccess,
  canUserEditProforma,
};
