const RoleAssignment = require('../models/RoleAssignment');
const { resolveUnitChain } = require('./unitScope');
const { ApiError } = require('./response');

// Central officeholders can read the national dashboard without being
// granted any Super Admin permissions or management routes.
const CENTRAL_CABINET_DASHBOARD_ROLES = [
  'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN',
  'GENERAL_SECRETARY', 'FINANCE_SECRETARY', 'PRESS_SECRETARY',
  'CULTURE_SECRETARY', 'SPORTS_SECRETARY', 'FIRST_SECRETARY',
];

const SCOPED_DASHBOARD_ROLES = {
  PROVINCE: ['PRESIDENT', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY', 'FINANCE_SECRETARY'],
  DISTRICT: ['SENIOR_MAWIN', 'SECRETARY', 'FINANCE_SECRETARY'],
  AREA: ['SENIOR_MAWIN', 'SECRETARY', 'FINANCE_SECRETARY'],
  BASIC_UNIT: ['SENIOR_MAWIN', 'SECRETARY', 'FINANCE_SECRETARY'],
};

const SCOPE_KEY = {
  PROVINCE: 'provinceId', DISTRICT: 'districtId',
  AREA: 'areaId', BASIC_UNIT: 'basicUnitId',
};

function accessFromAssignments(user, assignments) {
  if (!user) return null;
  if (user.roles?.includes('SUPER_ADMIN') || user.roles?.includes('CENTRAL_ADMIN')) return { level: 'CENTRAL', unitId: null };
  if (!user.memberId) return null;

  const central = assignments.find((a) => a.unitLevel === 'CENTRAL'
    && CENTRAL_CABINET_DASHBOARD_ROLES.includes(a.roleCode));
  if (central) return { level: 'CENTRAL', unitId: null };

  for (const level of ['PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT']) {
    const match = assignments.find((a) => a.unitLevel === level
      && SCOPED_DASHBOARD_ROLES[level].includes(a.roleCode));
    if (match?.unitId) return { level, unitId: String(match.unitId) };
  }
  return null;
}

async function dashboardAccessByRole(user) {
  if (!user) return {};
  const assignments = user.memberId ? await RoleAssignment.find({
    memberId: user.memberId, state: 'APPROVED', endedAt: { $exists: false },
  }).select('unitLevel unitId roleCode').lean() : [];
  return Object.fromEntries((user.roles || []).map((role) => [role,
    accessFromAssignments({ ...user, roles: [role], memberId: user.memberId },
      assignments.filter((a) => a.roleCode === role)),
  ]));
}

async function dashboardAccess(user, activeRole) {
  const byRole = await dashboardAccessByRole(user);
  if (activeRole) return Object.hasOwn(byRole, activeRole) ? byRole[activeRole] : null;
  for (const level of ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT']) {
    const access = Object.values(byRole).find((a) => a?.level === level);
    if (access) return access;
  }
  return null;
}

async function canViewExecutiveDashboard(user) {
  return Boolean(await dashboardAccess(user));
}

function requireExecutiveDashboardAccess(req, res, next) {
  dashboardAccess(req.user, req.get('X-Dashboard-Role'))
    .then(async (access) => {
      if (access) {
        // Scoped officeholders cannot replace their assigned unit with
        // a different province/district/area/basic unit in the URL.
        // Analytics then rolls that unit up with its subordinates.
        if (access.level !== 'CENTRAL') {
          const chain = await resolveUnitChain(access.level, access.unitId);
          if (!chain) throw new ApiError(403, 'OUT_OF_SCOPE', 'Your dashboard unit is no longer available');
          const levels = Object.keys(SCOPE_KEY);
          if (levels.slice(0, levels.indexOf(access.level) + 1).some((level) => !chain[SCOPE_KEY[level]])) {
            throw new ApiError(403, 'OUT_OF_SCOPE', 'Your dashboard unit has an incomplete hierarchy');
          }
          for (const key of Object.values(SCOPE_KEY)) req.query[key] = chain[key] ? String(chain[key]) : '';
        }
        return next();
      }
      return next(new ApiError(403, 'FORBIDDEN', 'An approved dashboard role is required'));
    })
    .catch(next);
}

module.exports = { CENTRAL_CABINET_DASHBOARD_ROLES, canViewExecutiveDashboard, dashboardAccess, dashboardAccessByRole, requireExecutiveDashboardAccess };
