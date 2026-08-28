const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const userCtrl = require('../controllers/adminUserController');
const auditCtrl = require('../controllers/adminAuditController');
const memberCtrl = require('../controllers/memberController');
const roleCtrl = require('../controllers/roleController');
const { requireUnitScope } = require('../middleware/unitScopeGuard');
const financeCtrl = require('../controllers/financeController');

// Every admin endpoint requires authentication. Per-route role checks
// follow. Read-only directory lookups are open to every admin tier so
// anyone with admin powers can browse the org. Credential actions are
// delegated ONE LEVEL DOWN (utils/adminHierarchy): the route admits
// every tier that manages another tier, and the controller then
// verifies the specific target is the caller's direct subordinate.
// Global system surfaces — audit, role catalogue, finance overview,
// member god-mode — stay SUPER_ADMIN only.
router.use(authenticate);

// Read-only directory lookups (executives at a level, search,
// per-user lookup) — open to every admin tier so anyone with admin
// powers can browse the org.
//
// This block used to claim the controllers scoped the rows per caller.
// They did not: /executives took a (level, unitId) straight from the
// query and returned that unit's cabinet to any admin tier, so a
// District Admin could read another province's executive directory.
// The territorial bound is now applied here, by the same helper the
// cabinet endpoint uses.
const READ_ADMIN = requireRole(
  'SUPER_ADMIN', 'CENTRAL_ADMIN',
  'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN',
);
const SUPER_ONLY = requireRole('SUPER_ADMIN');
// Tiers that administer another tier's accounts. Coarse gate only —
// canManageAdminUser() in the controller is what actually decides.
const TIER_ADMIN = requireRole(
  'SUPER_ADMIN', 'CENTRAL_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN',
);

// ─── Read-only directory (any admin tier) ─────────────────────────
router.get('/users', READ_ADMIN, userCtrl.list);
router.get('/search', READ_ADMIN, userCtrl.search);
router.get('/executives', READ_ADMIN, requireUnitScope(), userCtrl.listExecutives);
router.get('/users/:id', READ_ADMIN, userCtrl.getOne);

// ─── Tier-admin creation (Super → Central → Province → District → Area)
// Each tier creates the tier directly below it; Super Admin keeps
// PROVINCE_ADMIN as a break-glass path. Hierarchy + scope validated
// inside the controller via adminHierarchy.creatableRoles().
router.post('/users', TIER_ADMIN, userCtrl.create);

// ─── Credential mgmt — one level down ─────────────────────────────
// Super → Central Admins, Central → Province Admins, Province →
// District Admins, District → Area Admins. Super Admin retains
// blanket authority as the break-glass operator. The target check
// lives in the controller (canManageAdminUser).
router.patch('/users/:id', TIER_ADMIN, userCtrl.update);
router.post('/users/:id/reset-password', TIER_ADMIN, userCtrl.resetPassword);
router.post('/users/:id/deactivate', TIER_ADMIN, userCtrl.deactivate);
router.post('/users/:id/activate', TIER_ADMIN, userCtrl.activate);
router.delete('/users/:id', TIER_ADMIN, userCtrl.remove);

// Member god-mode actions
router.patch('/members/:id', SUPER_ONLY, memberCtrl.adminEdit);
router.post('/members/:id/reset-password', SUPER_ONLY, memberCtrl.adminResetPassword);
router.post('/members/:id/remove', SUPER_ONLY, memberCtrl.adminRemove);

// Role assignment force-end
router.post('/roles/:id/force-end', SUPER_ONLY, roleCtrl.adminEnd);

// ─── Role catalogue (the Role-Management page) ────────────────────
// `/admin/roles` is shared with the assignment force-end above; the
// HTTP method + path differ enough that Express routes them
// unambiguously.
const roleCatalogCtrl = require('../controllers/roleCatalogController');
router.get('/roles', authenticate, roleCatalogCtrl.list);
router.post('/roles', SUPER_ONLY, roleCatalogCtrl.create);
router.patch('/roles/:id', SUPER_ONLY, roleCatalogCtrl.update);
router.delete('/roles/:id', SUPER_ONLY, roleCatalogCtrl.remove);

// Audit log + finance overview
router.get('/audit', SUPER_ONLY, auditCtrl.list);
router.get('/finance-overview', SUPER_ONLY, financeCtrl.globalOverview);

module.exports = router;
