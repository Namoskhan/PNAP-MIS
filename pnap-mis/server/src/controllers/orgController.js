const asyncHandler = require('express-async-handler');
const Province = require('../models/Province');
const District = require('../models/District');
const Area = require('../models/Area');
const BasicUnit = require('../models/BasicUnit');
const CabinetSlot = require('../models/CabinetSlot');
const { ok, created, ApiError } = require('../utils/response');

// Tier-creation hierarchy — one level down at every step
// (utils/adminHierarchy):
//   SUPER_ADMIN     → break-glass override at any tier
//   CENTRAL_ADMIN   → may create Provinces
//   PROVINCE_ADMIN  → may create Districts within their own province
//   DISTRICT_ADMIN  → may create Areas within their own district
//   AREA_ADMIN      → may create Basic Units within their own area
// Admin users are NOT auto-provisioned — they are created explicitly
// via POST /api/admin/users by the next-tier-up admin.
function isSuper(user) { return (user?.roles || []).includes('SUPER_ADMIN'); }
// Central Admin structures the provinces, so it is unbounded the same
// way Super Admin is — see utils/adminHierarchy.GLOBAL_TIERS.
const { isGlobalAdmin } = require('../utils/adminHierarchy');
function userScopeMatches(user, scopeKey, expectedId) {
  if (isSuper(user)) return true;
  return String(user?.scope?.[scopeKey] || '') === String(expectedId || '');
}

// Server-side scope clamp on org listings: a DISTRICT_ADMIN must only
// see Areas/Basic-Units inside their district, not the whole party.
// SUPER_ADMIN sees everything; other roles fall back
// to the natural query filter.
function isGlobal(user) {
  return isGlobalAdmin(user);
}

// GET /api/organization/tree
//
// Read-only navigation over the whole organization, in three modes:
//
//   (no params)                     → roots: Central + every province
//   ?parentId=&parentLevel=         → one page of that node's children
//   ?q=                             → matches plus their ancestors
//
// Browse mode is lazy by design: a branch costs a request only when
// it is opened, so the client never loads the full unit table.
// Search returns matches together with every ancestor of every match,
// which lets the client render a pruned, already-expanded tree from a
// single response instead of walking the hierarchy request by request.
//
// SCOPE. Pass ?sourceLevel=&sourceUnitId= to get the subtree that unit
// may actually send funds to. The scope is computed HERE, from the
// sender's stored province — the client says which unit it is acting
// as, never what it is allowed to see. A Basic Unit, Area or District
// gets Central plus its own province; a Province gets everything,
// since crossing provincial boundaries is a province-level act. Both
// browse and search honour it, so the picker cannot show a unit that
// create would then reject.
//
// Without those params the tree is unscoped. Unlike listProvinces/
// listDistricts/… above it is not clamped to the caller's own
// territory in that case — it exposes unit names and parentage only,
// no membership, finance or cabinet data, and the route is gated on
// the finance permissions (see routes/organizationRoutes).
exports.tree = asyncHandler(async (req, res) => {
  const orgTree = require('../utils/orgTree');
  const { resolveSource, destinationScope } = require('../utils/transferRouting');
  const { parentId, parentLevel, q, page, limit, sourceLevel, sourceUnitId } = req.query;

  let provinceId = null;
  if (sourceLevel && sourceUnitId) {
    const source = await resolveSource(sourceLevel, sourceUnitId);
    if (!source) throw new ApiError(400, 'INVALID_UNIT', 'Source unit not found or deactivated');
    provinceId = destinationScope(source).provinceId;
  }

  if (q) {
    const r = await orgTree.searchTree(q, { limit, provinceId });
    return ok(res,
      { mode: 'search', nodes: r.nodes, matchIds: r.matchIds, truncated: r.truncated },
      { total: r.total });
  }

  if (parentId) {
    if (!orgTree.isLevel(parentLevel)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'parentLevel is required and must be a valid unit level');
    }
    const r = await orgTree.childrenOf(parentLevel, parentId, { page, limit, provinceId });
    return ok(res,
      { mode: 'children', nodes: r.nodes, parentId, parentLevel },
      { page: r.page, limit: r.limit, total: r.total, totalPages: r.totalPages });
  }

  ok(res, { mode: 'roots', nodes: await orgTree.rootNodes({ provinceId }) });
});

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

// Province creation — CENTRAL_ADMIN's core responsibility, with
// SUPER_ADMIN retained as break-glass so a database with no Central
// Admin can still be bootstrapped. No auto-provisioned admin; a
// PROVINCE_ADMIN is created explicitly via POST /api/admin/users.
exports.createProvince = asyncHandler(async (req, res) => {
  if (!isGlobalAdmin(req.user)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only a Central Admin can create provinces');
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
