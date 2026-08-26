const RoleAssignment = require('../models/RoleAssignment');

// Central officeholders can read the national dashboard without being
// granted any Super Admin permissions or management routes.
const CENTRAL_CABINET_DASHBOARD_ROLES = [
  'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN',
  'GENERAL_SECRETARY', 'FINANCE_SECRETARY', 'PRESS_SECRETARY',
  'CULTURE_SECRETARY', 'SPORTS_SECRETARY', 'FIRST_SECRETARY',
];

const SCOPED_DASHBOARD_ROLES = {
  PROVINCE: ['PRESIDENT', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY'],
  DISTRICT: ['SENIOR_MAWIN', 'SECRETARY'],
  AREA: ['SENIOR_MAWIN', 'SECRETARY'],
  BASIC_UNIT: ['SENIOR_MAWIN', 'SECRETARY'],
};

const SCOPE_KEY = {
  PROVINCE: 'provinceId', DISTRICT: 'districtId',
  AREA: 'areaId', BASIC_UNIT: 'basicUnitId',
};

async function dashboardAccess(user) {
  if (!user) return null;
  if (user.roles?.includes('SUPER_ADMIN') || user.roles?.includes('CENTRAL_ADMIN')) return { level: 'CENTRAL', unitId: null };
  if (!user.memberId) return null;

  const assignments = await RoleAssignment.find({
    memberId: user.memberId, state: 'APPROVED', endedAt: { $exists: false },
  }).select('unitLevel unitId roleCode').lean();

  const central = assignments.find((a) => a.unitLevel === 'CENTRAL'
    && CENTRAL_CABINET_DASHBOARD_ROLES.includes(a.roleCode));
  if (central) return { level: 'CENTRAL', unitId: null };

  for (const level of ['PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT']) {
    const match = assignments.find((a) => a.unitLevel === level
      && SCOPED_DASHBOARD_ROLES[level].includes(a.roleCode));
    if (match) return { level, unitId: String(match.unitId) };
  }
  return null;
}

async function canViewExecutiveDashboard(user) {
  return Boolean(await dashboardAccess(user));
}

function requireExecutiveDashboardAccess(req, res, next) {
  dashboardAccess(req.user)
    .then((access) => {
      if (access) {
        // Scoped officeholders cannot replace their assigned unit with
        // a different province/district/area/basic unit in the URL.
        // Analytics then rolls that unit up with its subordinates.
        if (access.level !== 'CENTRAL') {
          for (const key of Object.values(SCOPE_KEY)) req.query[key] = '';
          req.query[SCOPE_KEY[access.level]] = access.unitId;
        }
        return next();
      }
      const { ApiError } = require('./response');
      return next(new ApiError(403, 'FORBIDDEN', 'Central Cabinet dashboard access required'));
    })
    .catch(next);
}

module.exports = { CENTRAL_CABINET_DASHBOARD_ROLES, canViewExecutiveDashboard, dashboardAccess, requireExecutiveDashboardAccess };
