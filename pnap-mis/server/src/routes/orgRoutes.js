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

module.exports = router;
