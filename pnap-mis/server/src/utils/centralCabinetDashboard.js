const RoleAssignment = require('../models/RoleAssignment');

// Central officeholders can read the national dashboard without being
// granted any Super Admin permissions or management routes.
const CENTRAL_CABINET_DASHBOARD_ROLES = [
  'CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN',
  'GENERAL_SECRETARY', 'FINANCE_SECRETARY', 'PRESS_SECRETARY',
  'CULTURE_SECRETARY', 'SPORTS_SECRETARY', 'FIRST_SECRETARY',
];

async function canViewExecutiveDashboard(user) {
  if (!user) return false;
  if (user.roles?.includes('SUPER_ADMIN')) return true;

  const heldRoles = (user.roles || []).filter((role) =>
    CENTRAL_CABINET_DASHBOARD_ROLES.includes(role));
  if (!user.memberId || heldRoles.length === 0) return false;

  return Boolean(await RoleAssignment.exists({
    memberId: user.memberId,
    unitLevel: 'CENTRAL',
    roleCode: { $in: heldRoles },
    state: 'APPROVED',
  }));
}

function requireExecutiveDashboardAccess(req, res, next) {
  canViewExecutiveDashboard(req.user)
    .then((allowed) => {
      if (allowed) return next();
      const { ApiError } = require('./response');
      return next(new ApiError(403, 'FORBIDDEN', 'Central Cabinet dashboard access required'));
    })
    .catch(next);
}

module.exports = { CENTRAL_CABINET_DASHBOARD_ROLES, canViewExecutiveDashboard, requireExecutiveDashboardAccess };
