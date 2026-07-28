const router = require('express').Router();
const { authenticate, requireRole } = require('../middleware/auth');
const userCtrl = require('../controllers/adminUserController');
const auditCtrl = require('../controllers/adminAuditController');
const memberCtrl = require('../controllers/memberController');
const roleCtrl = require('../controllers/roleController');
const financeCtrl = require('../controllers/financeController');

// Every admin endpoint requires authentication. Per-route role checks
// follow — read-only directory lookups are open to every admin tier
// (so PNAP Admin / Central Admin can browse the org), while
// destructive credential / member / role / audit actions stay locked
// to SUPER_ADMIN only.
router.use(authenticate);

// Read-only directory lookups (executives at a level, search,
// per-user lookup) — open to every admin tier so anyone with admin
// powers can browse the org. Backend controllers still scope what
// rows are returned per the caller.
const READ_ADMIN = requireRole(
  'SUPER_ADMIN',
  'PROVINCE_ADMIN', 'DISTRICT_ADMIN', 'AREA_ADMIN',
);
const SUPER_ONLY = requireRole('SUPER_ADMIN');

// ─── Read-only directory (any admin tier) ─────────────────────────
router.get('/users', READ_ADMIN, userCtrl.list);
router.get('/search', READ_ADMIN, userCtrl.search);
router.get('/executives', READ_ADMIN, userCtrl.listExecutives);
router.get('/users/:id', READ_ADMIN, userCtrl.getOne);

// ─── Tier-admin creation (Super → Province → District → Area) ─────
// SUPER_ADMIN can create PROVINCE_ADMIN
// PROVINCE_ADMIN can create DISTRICT_ADMIN within their province
// DISTRICT_ADMIN can create AREA_ADMIN within their district
// Hierarchy + scope validated inside the controller.
router.post(
  '/users',
  requireRole('SUPER_ADMIN', 'PROVINCE_ADMIN', 'DISTRICT_ADMIN'),
  userCtrl.create,
);

// ─── God-mode credential mgmt (SUPER_ADMIN only) ──────────────────
router.patch('/users/:id', SUPER_ONLY, userCtrl.update);
router.post('/users/:id/reset-password', SUPER_ONLY, userCtrl.resetPassword);
router.post('/users/:id/deactivate', SUPER_ONLY, userCtrl.deactivate);
router.post('/users/:id/activate', SUPER_ONLY, userCtrl.activate);

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
