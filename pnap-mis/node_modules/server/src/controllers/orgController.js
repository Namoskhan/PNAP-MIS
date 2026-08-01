const asyncHandler = require('express-async-handler');
const Province = require('../models/Province');
const District = require('../models/District');
const Area = require('../models/Area');
const BasicUnit = require('../models/BasicUnit');
const CabinetSlot = require('../models/CabinetSlot');
const { ok, created, ApiError } = require('../utils/response');

// Tier-creation hierarchy:
//   SUPER_ADMIN     → may create at any tier
//   PROVINCE_ADMIN  → may create Districts within their own province
//   DISTRICT_ADMIN  → may create Areas within their own district
//   AREA_ADMIN      → may create Basic Units within their own area
// Admin users are NOT auto-provisioned — they are created explicitly
// via POST /api/admin/users by the next-tier-up admin.
function isSuper(user) { return (user?.roles || []).includes('SUPER_ADMIN'); }
function userScopeMatches(user, scopeKey, expectedId) {
  if (isSuper(user)) return true;
  return String(user?.scope?.[scopeKey] || '') === String(expectedId || '');
}

// Server-side scope clamp on org listings: a DISTRICT_ADMIN must only
// see Areas/Basic-Units inside their district, not the whole party.
// SUPER_ADMIN sees everything; other roles fall back
// to the natural query filter.
function isGlobal(user) {
  return user?.roles?.some((r) => r === 'SUPER_ADMIN');
}

exports.getCentral = asyncHandler(async (req, res) => {
  const { ensureCentralSingleton } = require('../utils/centralUnit');
  const c = await ensureCentralSingleton();
  ok(res, c);
});

exports.listProvinces = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  const u = req.user;
  if (!isGlobal(u) && u?.scope?.provinceId) filter._id = u.scope.provinceId;
  const provinces = await Province.find(filter).sort({ name: 1 });
  ok(res, provinces);
});

exports.listDistricts = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.provinceId) filter.provinceId = req.query.provinceId;
  const u = req.user;
  if (!isGlobal(u)) {
    if (u?.scope?.districtId) filter._id = u.scope.districtId;
    else if (u?.scope?.provinceId) filter.provinceId = u.scope.provinceId;
  }
  const districts = await District.find(filter).sort({ name: 1 });
  ok(res, districts);
});

exports.listAreas = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.districtId) filter.districtId = req.query.districtId;
  const u = req.user;
  if (!isGlobal(u)) {
    if (u?.scope?.areaId) filter._id = u.scope.areaId;
    else if (u?.scope?.districtId) filter.districtId = u.scope.districtId;
    else if (u?.scope?.provinceId) filter.provinceId = u.scope.provinceId;
  }
  const areas = await Area.find(filter).sort({ name: 1 });
  ok(res, areas);
});

exports.listBasicUnits = asyncHandler(async (req, res) => {
  const filter = { isActive: true };
  if (req.query.areaId) filter.areaId = req.query.areaId;
  const u = req.user;
  if (!isGlobal(u)) {
    if (u?.scope?.areaId) filter.areaId = u.scope.areaId;
    else if (u?.scope?.districtId) filter.districtId = u.scope.districtId;
    else if (u?.scope?.provinceId) filter.provinceId = u.scope.provinceId;
  }
  const units = await BasicUnit.find(filter).sort({ name: 1 });
  ok(res, units);
});

// Province creation — SUPER_ADMIN only. No auto-provisioned admin;
// the Super Admin must create a PROVINCE_ADMIN explicitly via
// POST /api/admin/users.
exports.createProvince = asyncHandler(async (req, res) => {
  if (!isSuper(req.user)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only Super Admin can create provinces');
  }
  const p = await Province.create(req.body);
  created(res, p);
});

// District creation — SUPER_ADMIN or the PROVINCE_ADMIN of that
// specific province. The province admin's scope.provinceId must
// match the target province.
exports.createDistrict = asyncHandler(async (req, res) => {
  const province = await Province.findById(req.body.provinceId).orFail();
  if (!userScopeMatches(req.user, 'provinceId', province._id)) {
    throw new ApiError(403, 'FORBIDDEN', 'You can only create districts within your own province');
  }
  const d = await District.create({ ...req.body, provinceId: province._id });
  created(res, d);
});

// Area creation — SUPER_ADMIN or the DISTRICT_ADMIN of that
// specific district. The district admin's scope.districtId must
// match the target district.
exports.createArea = asyncHandler(async (req, res) => {
  const district = await District.findById(req.body.districtId).orFail();
  if (!userScopeMatches(req.user, 'districtId', district._id)) {
    throw new ApiError(403, 'FORBIDDEN', 'You can only create areas within your own district');
  }
  const a = await Area.create({
    ...req.body,
    districtId: district._id,
    provinceId: district.provinceId,
  });
  await CabinetSlot.seedFor('AREA', a._id);
  created(res, a);
});

// Basic Unit creation — SUPER_ADMIN or the AREA_ADMIN of that
// specific area. The area admin's scope.areaId must match.
exports.createBasicUnit = asyncHandler(async (req, res) => {
  const area = await Area.findById(req.body.areaId).orFail();
  if (!userScopeMatches(req.user, 'areaId', area._id)) {
    throw new ApiError(403, 'FORBIDDEN', 'You can only create basic units within your own area');
  }
  const u = await BasicUnit.create({
    ...req.body,
    areaId: area._id,
    districtId: area.districtId,
    provinceId: area.provinceId,
  });
  await CabinetSlot.seedFor('BASIC_UNIT', u._id);
  created(res, u);
});
