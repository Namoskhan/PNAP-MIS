const router = require('express').Router();
const ctrl = require('../controllers/orgController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

// READS — open to any authenticated user (the controller scope-clamps
// what each user can see based on their role+scope).
router.get('/provinces', ctrl.listProvinces);
router.get('/districts', ctrl.listDistricts);
router.get('/areas', ctrl.listAreas);
router.get('/basic-units', ctrl.listBasicUnits);
router.get('/central', ctrl.getCentral);

// WRITES — strict per-tier hierarchy:
//   POST /provinces    → Central Admin (Super Admin as break-glass)
//   POST /districts    → Super Admin or PROVINCE_ADMIN of that province
//   POST /areas        → Super Admin or DISTRICT_ADMIN of that district
//   POST /basic-units  → Super Admin or AREA_ADMIN of that area
// Scope is verified inside the controller (matching scope.provinceId
// / scope.districtId / scope.areaId against the target unit).
router.post('/provinces', requireRole('SUPER_ADMIN', 'CENTRAL_ADMIN'), ctrl.createProvince);
router.post('/districts', requireRole('SUPER_ADMIN', 'PROVINCE_ADMIN'), ctrl.createDistrict);
router.post('/areas', requireRole('SUPER_ADMIN', 'DISTRICT_ADMIN'), ctrl.createArea);
router.post('/basic-units', requireRole('SUPER_ADMIN', 'AREA_ADMIN'), ctrl.createBasicUnit);

// DELETE — SUPER_ADMIN ONLY, at every tier.
//
// Creation is delegated one level down; removal is not delegated at
// all. No Central / Province / District / Area Admin may delete an org
// unit, including their own. The route gate and a second explicit
// isSuper() check inside the controller both enforce it, so adding a
// role to these lines alone cannot silently widen the permission.
//
// Deletion is refused while anything still depends on the unit — see
// deleteUnitHandler for what counts as a blocker.
router.delete('/provinces/:id', requireRole('SUPER_ADMIN'), ctrl.deleteProvince);
router.delete('/districts/:id', requireRole('SUPER_ADMIN'), ctrl.deleteDistrict);
router.delete('/areas/:id', requireRole('SUPER_ADMIN'), ctrl.deleteArea);
router.delete('/basic-units/:id', requireRole('SUPER_ADMIN'), ctrl.deleteBasicUnit);

module.exports = router;
