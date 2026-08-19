const asyncHandler = require('express-async-handler');
const Province = require('../models/Province');
const District = require('../models/District');
const Area = require('../models/Area');
const BasicUnit = require('../models/BasicUnit');
const CabinetSlot = require('../models/CabinetSlot');
const { ok, created, ApiError } = require('../utils/response');
const activityService = require('../services/activityService');
const { audit } = require('../utils/audit');

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

// Structuring the organization is itself meaningful organizational
// activity (Province / District / Area / Basic Unit Management). One
// helper so the four creation endpoints below stay one line each and
// the chain is assembled the same way every time.
function recordOrgActivity(req, action, unitLevel, unitId, label, chain) {
  activityService.record({
    action,
    req,
    chain,
    unitLevel,
    unitId,
    targetType: unitLevel,
    targetId: unitId,
    targetLabel: label,
  }).catch(() => {});
}

// Province creation — CENTRAL_ADMIN's core responsibility, with
// SUPER_ADMIN retained as break-glass so a database with no Central
// Admin can still be bootstrapped. No auto-provisioned admin; a
// PROVINCE_ADMIN is created explicitly via POST /api/admin/users.
exports.createProvince = asyncHandler(async (req, res) => {
  if (!isGlobalAdmin(req.user)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only a Central Admin can create provinces');
  }
  const p = await Province.create(req.body);
  recordOrgActivity(req, 'PROVINCE_MANAGED', 'PROVINCE', p._id, p.name, { provinceId: p._id });
  created(res, p);
});

// ─── Org-unit deletion — SUPER_ADMIN ONLY, at every tier ─────────────
//
// Deliberately narrower than creation. Creation is delegated one level
// down (Central Admin creates provinces, Province Admin creates
// districts, and so on), but removal is destructive and irreversible,
// so it stays with the bootstrap authority alone. The check is an
// explicit SUPER_ADMIN test, NOT isGlobalAdmin() — that helper admits
// Central Admin too, which is exactly what must not happen here.
//
// Every unit sits on a denormalized chain: districts, areas, basic
// units, members, meetings, activities and donations all carry the
// ancestor ids. Cascading a delete would silently destroy member and
// meeting records; leaving the children behind would orphan them
// against an id that no longer resolves. So a unit may be deleted ONLY
// when nothing depends on it, and the refusal names exactly what is in
// the way so the operator knows what to clear first.

const UNIT_MODEL = {
  PROVINCE: () => Province,
  DISTRICT: () => District,
  AREA: () => Area,
  BASIC_UNIT: () => BasicUnit,
};
// The chain key each tier is referenced by on every descendant record.
const UNIT_FK = {
  PROVINCE: 'provinceId',
  DISTRICT: 'districtId',
  AREA: 'areaId',
  BASIC_UNIT: 'basicUnitId',
};
const UNIT_NOUN = {
  PROVINCE: 'province',
  DISTRICT: 'district',
  AREA: 'area',
  BASIC_UNIT: 'basic unit',
};
// Tiers that live beneath each tier, nearest first.
const TIERS_BELOW = {
  PROVINCE: ['DISTRICT', 'AREA', 'BASIC_UNIT'],
  DISTRICT: ['AREA', 'BASIC_UNIT'],
  AREA: ['BASIC_UNIT'],
  BASIC_UNIT: [],
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function deleteUnitHandler(level) {
  return asyncHandler(async (req, res) => {
    if (!isSuper(req.user)) {
      throw new ApiError(403, 'FORBIDDEN',
        `Only a Super Admin can delete ${UNIT_NOUN[level] === 'area' ? 'an' : 'a'} ${UNIT_NOUN[level]}.`);
    }
    const Model = UNIT_MODEL[level]();
    const unit = await Model.findById(req.params.id);
    if (!unit) throw new ApiError(404, 'NOT_FOUND', `${UNIT_NOUN[level]} not found`);

    const Member = require('../models/Member');
    const User = require('../models/User');
    const RoleAssignment = require('../models/RoleAssignment');
    const Meeting = require('../models/Meeting');
    const Activity = require('../models/Activity');

    const fk = UNIT_FK[level];
    const scoped = { [fk]: unit._id };

    const [childCounts, members, scopedUsers, roles, meetings, activities] = await Promise.all([
      Promise.all(TIERS_BELOW[level].map((l) => UNIT_MODEL[l]().countDocuments(scoped))),
      Member.countDocuments(scoped),
      // Accounts pinned to this unit. Partitioned below — a pure
      // territorial admin is deleted WITH the unit; anything else
      // blocks.
      User.find({ [`scope.${fk}`]: unit._id })
        .select('_id fullName username email roles memberId').lean(),
      // A cabinet seat can be held by a member rostered elsewhere (a
      // province officer registered in a basic unit), so this is not
      // covered by the member count above.
      RoleAssignment.countDocuments({
        unitLevel: level, unitId: unit._id,
        state: 'APPROVED', endedAt: { $exists: false },
      }),
      Meeting.countDocuments(scoped),
      Activity.countDocuments(scoped),
    ]);

    // A territorial admin exists ONLY to administer this unit — a
    // Province Admin whose province is gone has nothing left to
    // administer — so it is removed WITH the unit rather than blocking
    // it. Creating a unit provisions its admin in the same step, and
    // deleting one should undo that step, not leave an orphan behind
    // for the operator to hunt down.
    //
    // Two kinds of account are deliberately NOT swept up, and still
    // block instead:
    //   * a member-linked login (memberId set) — that is a person's own
    //     account, not scaffolding, and deleting it would take their
    //     membership login with it;
    //   * SUPER_ADMIN / CENTRAL_ADMIN — global tiers are never removed
    //     as a side effect of tidying up an org unit.
    const disposableAdmins = [];
    const blockingUsers = [];
    for (const u of scopedUsers) {
      const isGlobalTier = (u.roles || []).includes('SUPER_ADMIN')
        || (u.roles || []).includes('CENTRAL_ADMIN');
      if (!u.memberId && !isGlobalTier) disposableAdmins.push(u);
      else blockingUsers.push(u);
    }

    const counts = {
      members, roles, meetings, activities,
      admins: blockingUsers.length,
      adminsToRemove: disposableAdmins.length,
    };
    const blockers = [];
    TIERS_BELOW[level].forEach((l, i) => {
      const n = childCounts[i];
      counts[UNIT_NOUN[l].replace(' ', '')] = n;
      if (n) blockers.push(plural(n, UNIT_NOUN[l]));
    });
    if (members) blockers.push(plural(members, 'member'));
    if (blockingUsers.length) blockers.push(plural(blockingUsers.length, 'linked user account'));
    if (roles) blockers.push(plural(roles, 'cabinet role'));
    if (meetings) blockers.push(plural(meetings, 'meeting'));
    if (activities) blockers.push(plural(activities, 'activity').replace('activitys', 'activities'));

    if (blockers.length) {
      throw new ApiError(
        409,
        'UNIT_NOT_EMPTY',
        `"${unit.name}" still contains ${blockers.join(', ')}. `
        + `Remove or reassign them before deleting this ${UNIT_NOUN[level]}.`,
        { counts }
      );
    }

    // Cabinet slots are seeded per unit — the unit's own scaffolding
    // rather than user data — so they go with it.
    await CabinetSlot.deleteMany({ unitLevel: level, unitId: unit._id });
    if (disposableAdmins.length) {
      await User.deleteMany({ _id: { $in: disposableAdmins.map((u) => u._id) } });
    }
    await Model.deleteOne({ _id: unit._id });

    await audit({
      req,
      action: `${level}_DELETE`,
      targetType: level,
      targetId: unit._id,
      targetLabel: unit.name,
      // Record WHICH admin logins went with it. A deletion that removes
      // credentials has to be reconstructable from the audit trail.
      before: {
        name: unit.name,
        code: unit.code,
        removedAdmins: disposableAdmins.map((u) => ({
          _id: u._id, fullName: u.fullName, username: u.username,
          email: u.email, roles: u.roles,
        })),
      },
    });

    ok(res, {
      deleted: true,
      name: unit.name,
      level,
      removedAdmins: disposableAdmins.length,
    });
  });
}

exports.deleteProvince = deleteUnitHandler('PROVINCE');
exports.deleteDistrict = deleteUnitHandler('DISTRICT');
exports.deleteArea = deleteUnitHandler('AREA');
exports.deleteBasicUnit = deleteUnitHandler('BASIC_UNIT');

// District creation — SUPER_ADMIN or the PROVINCE_ADMIN of that
// specific province. The province admin's scope.provinceId must
// match the target province.
exports.createDistrict = asyncHandler(async (req, res) => {
  const province = await Province.findById(req.body.provinceId).orFail();
  if (!userScopeMatches(req.user, 'provinceId', province._id)) {
    throw new ApiError(403, 'FORBIDDEN', 'You can only create districts within your own province');
  }
  const d = await District.create({ ...req.body, provinceId: province._id });
  recordOrgActivity(req, 'DISTRICT_MANAGED', 'DISTRICT', d._id, d.name, {
    districtId: d._id, provinceId: province._id,
  });
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
  recordOrgActivity(req, 'AREA_MANAGED', 'AREA', a._id, a.name, {
    areaId: a._id, districtId: district._id, provinceId: district.provinceId,
  });
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
  recordOrgActivity(req, 'BASIC_UNIT_MANAGED', 'BASIC_UNIT', u._id, u.name, {
    basicUnitId: u._id, areaId: area._id, districtId: area.districtId, provinceId: area.provinceId,
  });
  created(res, u);
});
