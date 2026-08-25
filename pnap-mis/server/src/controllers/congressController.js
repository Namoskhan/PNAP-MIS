const asyncHandler = require('express-async-handler');
const Congress = require('../models/Congress');
const CongressMember = require('../models/CongressMember');
const Member = require('../models/Member');
const RoleAssignment = require('../models/RoleAssignment');
const Province = require('../models/Province');
const District = require('../models/District');
const Area = require('../models/Area');
const BasicUnit = require('../models/BasicUnit');
const Central = require('../models/Central');
const { ok, created, ApiError } = require('../utils/response');
const { audit } = require('../utils/audit');
const { canManageCongressMembers } = require('../utils/unitScope');
const analyticsService = require('../services/analyticsService');

// ─── National Congress Reporting Periods / Calendar ───────────────────
function refreshAnalytics() {
  try {
    analyticsService.invalidateCache();
  } catch (err) {
    console.warn(`[congress] analytics cache invalidation failed: ${err.message}`);
  }
}

exports.list = asyncHandler(async (req, res) => {
  const filter = req.query.includeInactive === 'true' ? {} : { isActive: true };
  const items = await Congress.find(filter).sort({ heldOn: -1 }).lean();
  ok(res, items);
});

function parseBody(body) {
  const label = (body.label || '').trim();
  if (!label) throw new ApiError(400, 'VALIDATION_ERROR', 'label is required');

  const heldOn = body.heldOn ? new Date(body.heldOn) : null;
  if (!heldOn || isNaN(heldOn.getTime())) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'heldOn must be a valid date');
  }
  if (heldOn.getTime() > Date.now()) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'heldOn cannot be in the future');
  }
  return {
    label,
    heldOn,
    venue: (body.venue || '').trim() || undefined,
    notes: (body.notes || '').trim() || undefined,
  };
}

exports.create = asyncHandler(async (req, res) => {
  const data = parseBody(req.body);
  const clash = await Congress.findOne({ heldOn: data.heldOn, isActive: true }).lean();
  if (clash) {
    throw new ApiError(409, 'DUPLICATE_CONGRESS',
      `A Congress is already recorded on that date ("${clash.label}")`);
  }

  const doc = await Congress.create({ ...data, createdBy: req.user._id });
  await audit({
    req,
    action: 'CONGRESS_CREATE',
    targetType: 'Congress',
    targetId: doc._id,
    targetLabel: doc.label,
    after: data,
  });
  refreshAnalytics();
  created(res, doc);
});

exports.update = asyncHandler(async (req, res) => {
  const doc = await Congress.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Congress not found');

  const data = parseBody(req.body);
  const clash = await Congress.findOne({
    heldOn: data.heldOn, isActive: true, _id: { $ne: doc._id },
  }).lean();
  if (clash) {
    throw new ApiError(409, 'DUPLICATE_CONGRESS',
      `A Congress is already recorded on that date ("${clash.label}")`);
  }

  const before = { label: doc.label, heldOn: doc.heldOn, venue: doc.venue, notes: doc.notes };
  Object.assign(doc, data, { updatedBy: req.user._id });
  await doc.save();

  await audit({
    req,
    action: 'CONGRESS_UPDATE',
    targetType: 'Congress',
    targetId: doc._id,
    targetLabel: doc.label,
    before,
    after: data,
  });
  refreshAnalytics();
  ok(res, doc);
});

exports.remove = asyncHandler(async (req, res) => {
  const doc = await Congress.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Congress not found');

  doc.isActive = false;
  doc.updatedBy = req.user._id;
  await doc.save();

  await audit({
    req,
    action: 'CONGRESS_DEACTIVATE',
    targetType: 'Congress',
    targetId: doc._id,
    targetLabel: doc.label,
  });
  refreshAnalytics();
  ok(res, doc);
});

// ─── National Congress Assembly Members Management ─────────────────────

// Helper to resolve central unit details
async function resolveCongressUnit(unitLevel, unitId) {
  let c = null;
  if (unitId && unitId !== 'CENTRAL') {
    try { c = await Central.findById(unitId); } catch {}
  }
  if (!c) c = await Central.findOne();
  if (!c) c = await Central.create({ name: 'PKNAP Central' });
  return {
    unitLevel: 'CENTRAL',
    unitId: c._id,
    unitName: c.name || 'PKNAP Central',
    congressTitle: 'National Congress',
  };
}

// Helper to enrich members with their active roles and unit names
async function enrichMembersWithRoles(members) {
  if (!members || members.length === 0) return [];
  const memberIds = members.map((m) => m._id);

  // Fetch all active approved role assignments for these members
  const activeRoles = await RoleAssignment.find({
    memberId: { $in: memberIds },
    state: 'APPROVED',
    endedAt: { $exists: false },
  }).lean();

  // Collect unit IDs to look up names
  const provIds = new Set();
  const distIds = new Set();
  const areaIds = new Set();
  const buIds = new Set();

  activeRoles.forEach((r) => {
    if (r.unitLevel === 'PROVINCE') provIds.add(String(r.unitId));
    if (r.unitLevel === 'DISTRICT') distIds.add(String(r.unitId));
    if (r.unitLevel === 'AREA') areaIds.add(String(r.unitId));
    if (r.unitLevel === 'BASIC_UNIT') buIds.add(String(r.unitId));
  });

  members.forEach((m) => {
    if (m.provinceId) provIds.add(String(m.provinceId?._id || m.provinceId));
    if (m.districtId) distIds.add(String(m.districtId?._id || m.districtId));
    if (m.areaId) areaIds.add(String(m.areaId?._id || m.areaId));
    if (m.basicUnitId) buIds.add(String(m.basicUnitId?._id || m.basicUnitId));
  });

  const [provinces, districts, areas, bus] = await Promise.all([
    Province.find({ _id: { $in: [...provIds] } }).select('name code').lean(),
    District.find({ _id: { $in: [...distIds] } }).select('name code').lean(),
    Area.find({ _id: { $in: [...areaIds] } }).select('name code').lean(),
    BasicUnit.find({ _id: { $in: [...buIds] } }).select('name code').lean(),
  ]);

  const provMap = new Map(provinces.map((p) => [String(p._id), p.name]));
  const distMap = new Map(districts.map((d) => [String(d._id), d.name]));
  const areaMap = new Map(areas.map((a) => [String(a._id), a.name]));
  const buMap = new Map(bus.map((b) => [String(b._id), b.name]));

  const getUnitName = (level, id) => {
    if (level === 'CENTRAL') return 'PKNAP Central';
    if (level === 'PROVINCE') return provMap.get(String(id)) || 'Province';
    if (level === 'DISTRICT') return distMap.get(String(id)) || 'District';
    if (level === 'AREA') return areaMap.get(String(id)) || 'Area';
    if (level === 'BASIC_UNIT') return buMap.get(String(id)) || 'Basic Unit';
    return '';
  };

  // Group roles by memberId
  const rolesByMember = new Map();
  activeRoles.forEach((r) => {
    const key = String(r.memberId);
    if (!rolesByMember.has(key)) rolesByMember.set(key, []);
    rolesByMember.get(key).push({
      _id: r._id,
      roleCode: r.roleCode,
      customRoleName: r.customRoleName,
      unitLevel: r.unitLevel,
      unitId: r.unitId,
      unitName: getUnitName(r.unitLevel, r.unitId),
      startedAt: r.startedAt,
    });
  });

  return members.map((m) => {
    const mId = String(m._id);
    const roles = rolesByMember.get(mId) || [];
    const primaryRole = roles[0] || null;
    return {
      ...m,
      activeRoles: roles,
      primaryRole,
      homeUnit: {
        provinceName: provMap.get(String(m.provinceId?._id || m.provinceId)) || '',
        districtName: distMap.get(String(m.districtId?._id || m.districtId)) || '',
        areaName: areaMap.get(String(m.areaId?._id || m.areaId)) || '',
        basicUnitName: buMap.get(String(m.basicUnitId?._id || m.basicUnitId)) || '',
      },
    };
  });
}

// GET /api/congress/composition
exports.getComposition = asyncHandler(async (req, res) => {
  const { unitLevel, unitId } = req.query;
  const unit = await resolveCongressUnit(unitLevel, unitId);

  const canManage = await canManageCongressMembers(req.user, unit.unitLevel, unit.unitId);

  const congressMembers = await CongressMember.find({
    unitLevel: unit.unitLevel,
    unitId: unit.unitId,
    isActive: true,
  })
    .populate('memberId', 'fullName cnic phone memberId photoUrl dateJoined provinceId districtId areaId basicUnitId')
    .populate('assignedBy', 'fullName email')
    .sort({ createdAt: -1 })
    .lean();

  // Extract member objects for role enrichment
  const memberObjs = congressMembers.map((cm) => ({
    _id: cm.memberId?._id,
    fullName: cm.memberId?.fullName,
    cnic: cm.memberId?.cnic,
    phone: cm.memberId?.phone,
    memberId: cm.memberId?.memberId,
    photoUrl: cm.memberId?.photoUrl,
    dateJoined: cm.memberId?.dateJoined,
    provinceId: cm.memberId?.provinceId,
    districtId: cm.memberId?.districtId,
    areaId: cm.memberId?.areaId,
    basicUnitId: cm.memberId?.basicUnitId,
    congressRecordId: cm._id,
    assignedRoleSnapshot: cm.assignedRoleSnapshot,
    nominationNote: cm.nominationNote,
    assignedBy: cm.assignedBy,
    assignedAt: cm.assignedAt || cm.createdAt,
  })).filter((m) => !!m._id);

  const enriched = await enrichMembersWithRoles(memberObjs);

  ok(res, {
    unit,
    members: enriched,
    totalMembers: enriched.length,
    canManage,
  });
});

// GET /api/congress/eligible-members
exports.getEligibleMembers = asyncHandler(async (req, res) => {
  const {
    unitLevel,
    unitId,
    search,
    provinceId,
    districtId,
    areaId,
    basicUnitId,
    roleCode,
    filterUnitLevel,
    unassignedOnly,
    page = 1,
    limit = 100,
  } = req.query;

  const unit = await resolveCongressUnit(unitLevel, unitId);

  // Build member search filter
  const filter = { status: 'ACTIVE' };

  if (provinceId) filter.provinceId = provinceId;
  if (districtId) filter.districtId = districtId;
  if (areaId) filter.areaId = areaId;
  if (basicUnitId) filter.basicUnitId = basicUnitId;

  if (search && search.trim()) {
    const term = search.trim();
    const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { fullName: rx },
      { cnic: rx },
      { phone: rx },
      { memberId: rx },
    ];
  }

  // If role filter is requested, resolve matching member IDs first
  if (roleCode || filterUnitLevel) {
    const roleQuery = { state: 'APPROVED', endedAt: { $exists: false } };
    if (roleCode && roleCode !== 'ALL' && roleCode !== 'NO_ROLE') {
      roleQuery.roleCode = roleCode;
    }
    if (filterUnitLevel && filterUnitLevel !== 'ALL') {
      roleQuery.unitLevel = filterUnitLevel;
    }
    if (roleCode === 'NO_ROLE') {
      const officeHolders = await RoleAssignment.distinct('memberId', {
        state: 'APPROVED',
        endedAt: { $exists: false },
      });
      filter._id = { $nin: officeHolders };
    } else {
      const matchingMemberIds = await RoleAssignment.distinct('memberId', roleQuery);
      filter._id = { $in: matchingMemberIds };
    }
  }

  const p = Math.max(1, parseInt(page, 10) || 1);
  const lim = Math.min(300, Math.max(1, parseInt(limit, 10) || 100));

  const [membersRaw, totalCount] = await Promise.all([
    Member.find(filter)
      .select('fullName cnic phone memberId photoUrl dateJoined provinceId districtId areaId basicUnitId')
      .skip((p - 1) * lim)
      .limit(lim)
      .lean(),
    Member.countDocuments(filter),
  ]);

  // Find currently active members in National Congress
  const existingCongressMembers = await CongressMember.find({
    unitLevel: unit.unitLevel,
    unitId: unit.unitId,
    isActive: true,
  }).select('memberId').lean();

  const assignedSet = new Set(existingCongressMembers.map((j) => String(j.memberId)));

  const enriched = await enrichMembersWithRoles(membersRaw);

  const results = enriched.map((m) => ({
    ...m,
    isAssignedToCongress: assignedSet.has(String(m._id)),
  }));

  const filtered = unassignedOnly === 'true'
    ? results.filter((r) => !r.isAssignedToCongress)
    : results;

  ok(res, {
    candidates: filtered,
    total: totalCount,
    page: p,
    limit: lim,
  });
});

// POST /api/congress/members
exports.assignMember = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, memberId, nominationNote } = req.body;
  const unit = await resolveCongressUnit(unitLevel, unitId);

  const canManage = await canManageCongressMembers(req.user, unit.unitLevel, unit.unitId);
  if (!canManage) {
    throw new ApiError(403, 'FORBIDDEN',
      'Only the Central General Secretary or an authorized administrator may assign members to the National Congress');
  }

  const member = await Member.findById(memberId);
  if (!member || member.status !== 'ACTIVE') {
    throw new ApiError(400, 'INVALID_MEMBER', 'Member not found or not currently active');
  }

  // Check if already active in National Congress
  const existing = await CongressMember.findOne({
    unitLevel: unit.unitLevel,
    unitId: unit.unitId,
    memberId: member._id,
    isActive: true,
  });
  if (existing) {
    throw new ApiError(409, 'ALREADY_ASSIGNED', 'This member is already an active member of the National Congress');
  }

  // Find primary active role to snapshot
  const activeRole = await RoleAssignment.findOne({
    memberId: member._id,
    state: 'APPROVED',
    endedAt: { $exists: false },
  }).lean();

  let roleSnapshot = undefined;
  if (activeRole) {
    let unitName = '';
    if (activeRole.unitLevel === 'PROVINCE') {
      const p = await Province.findById(activeRole.unitId).select('name').lean();
      unitName = p?.name || 'Province';
    } else if (activeRole.unitLevel === 'DISTRICT') {
      const d = await District.findById(activeRole.unitId).select('name').lean();
      unitName = d?.name || 'District';
    } else if (activeRole.unitLevel === 'AREA') {
      const a = await Area.findById(activeRole.unitId).select('name').lean();
      unitName = a?.name || 'Area';
    } else if (activeRole.unitLevel === 'BASIC_UNIT') {
      const b = await BasicUnit.findById(activeRole.unitId).select('name').lean();
      unitName = b?.name || 'Basic Unit';
    } else if (activeRole.unitLevel === 'CENTRAL') {
      unitName = 'PKNAP Central';
    }

    roleSnapshot = {
      roleCode: activeRole.roleCode,
      customRoleName: activeRole.customRoleName,
      unitLevel: activeRole.unitLevel,
      unitId: activeRole.unitId,
      unitName,
    };
  }

  // Create or reactivate record
  let doc = await CongressMember.findOne({
    unitLevel: unit.unitLevel,
    unitId: unit.unitId,
    memberId: member._id,
  });

  if (doc) {
    doc.isActive = true;
    doc.assignedRoleSnapshot = roleSnapshot;
    doc.nominationNote = nominationNote;
    doc.assignedBy = req.user._id;
    doc.assignedAt = new Date();
    doc.removedAt = undefined;
    doc.removedBy = undefined;
    doc.removalReason = undefined;
    await doc.save();
  } else {
    doc = await CongressMember.create({
      unitLevel: unit.unitLevel,
      unitId: unit.unitId,
      memberId: member._id,
      assignedRoleSnapshot: roleSnapshot,
      nominationNote,
      assignedBy: req.user._id,
      assignedAt: new Date(),
    });
  }

  ok(res, doc);
});

// POST /api/congress/members/:id/remove or DELETE /api/congress/members/:id
exports.removeMember = asyncHandler(async (req, res) => {
  const doc = await CongressMember.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Congress member assignment not found');

  const canManage = await canManageCongressMembers(req.user, doc.unitLevel, doc.unitId);
  if (!canManage) {
    throw new ApiError(403, 'FORBIDDEN',
      'Only the Central General Secretary or an authorized administrator may remove members from the National Congress');
  }

  doc.isActive = false;
  doc.removedAt = new Date();
  doc.removedBy = req.user._id;
  doc.removalReason = req.body?.reason || req.body?.removalReason;
  await doc.save();

  ok(res, doc);
});
