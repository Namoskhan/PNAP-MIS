const asyncHandler = require('express-async-handler');
const JirgaMember = require('../models/JirgaMember');
const Member = require('../models/Member');
const RoleAssignment = require('../models/RoleAssignment');
const Province = require('../models/Province');
const District = require('../models/District');
const Area = require('../models/Area');
const BasicUnit = require('../models/BasicUnit');
const Central = require('../models/Central');
const { ok, ApiError } = require('../utils/response');
const { canManageJirgaMembers } = require('../utils/unitScope');

// Helper to resolve unit details and validate level
async function resolveJirgaUnit(unitLevel, unitId) {
  if (!['CENTRAL', 'PROVINCE'].includes(unitLevel)) {
    throw new ApiError(400, 'INVALID_LEVEL', 'Jirga is only available at CENTRAL (Qomi Jirga) and PROVINCE (Sobayi Jirga)');
  }
  if (unitLevel === 'CENTRAL') {
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
      jirgaTitle: 'National / Qomi Jirga',
    };
  }
  if (unitLevel === 'PROVINCE') {
    if (!unitId) throw new ApiError(400, 'VALIDATION_ERROR', 'unitId required for PROVINCE Jirga');
    const p = await Province.findById(unitId);
    if (!p) throw new ApiError(404, 'NOT_FOUND', 'Province not found');
    return {
      unitLevel: 'PROVINCE',
      unitId: p._id,
      unitName: p.name,
      jirgaTitle: `${p.name} Sobayi Jirga`,
    };
  }
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

// GET /api/jirga/composition?unitLevel=PROVINCE&unitId=...
exports.getComposition = asyncHandler(async (req, res) => {
  const { unitLevel, unitId } = req.query;
  const unit = await resolveJirgaUnit(unitLevel, unitId);

  const canManage = await canManageJirgaMembers(req.user, unit.unitLevel, unit.unitId);

  const jirgaMembers = await JirgaMember.find({
    unitLevel: unit.unitLevel,
    unitId: unit.unitId,
    isActive: true,
  })
    .populate('memberId', 'fullName cnic phone memberId photoUrl dateJoined provinceId districtId areaId basicUnitId')
    .populate('assignedBy', 'fullName email')
    .sort({ createdAt: -1 })
    .lean();

  // Extract member objects for role enrichment
  const memberObjs = jirgaMembers.map((jm) => ({
    _id: jm.memberId?._id,
    fullName: jm.memberId?.fullName,
    cnic: jm.memberId?.cnic,
    phone: jm.memberId?.phone,
    memberId: jm.memberId?.memberId,
    photoUrl: jm.memberId?.photoUrl,
    dateJoined: jm.memberId?.dateJoined,
    provinceId: jm.memberId?.provinceId,
    districtId: jm.memberId?.districtId,
    areaId: jm.memberId?.areaId,
    basicUnitId: jm.memberId?.basicUnitId,
    jirgaRecordId: jm._id,
    assignedRoleSnapshot: jm.assignedRoleSnapshot,
    nominationNote: jm.nominationNote,
    assignedBy: jm.assignedBy,
    assignedAt: jm.assignedAt || jm.createdAt,
  })).filter((m) => !!m._id);

  const enriched = await enrichMembersWithRoles(memberObjs);

  ok(res, {
    unit,
    members: enriched,
    totalMembers: enriched.length,
    canManage,
  });
});

// GET /api/jirga/eligible-members
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

  const unit = await resolveJirgaUnit(unitLevel, unitId);

  // Build member search filter
  const filter = { status: 'ACTIVE' };

  // Territorial boundary:
  // For Sobayi Jirga (Province level), default candidates to that Province
  if (unit.unitLevel === 'PROVINCE') {
    filter.provinceId = unit.unitId;
  }
  if (provinceId && unit.unitLevel === 'CENTRAL') {
    filter.provinceId = provinceId;
  }
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

  // Find currently active members in this Jirga
  const existingJirgaMembers = await JirgaMember.find({
    unitLevel: unit.unitLevel,
    unitId: unit.unitId,
    isActive: true,
  }).select('memberId').lean();

  const assignedSet = new Set(existingJirgaMembers.map((j) => String(j.memberId)));

  const enriched = await enrichMembersWithRoles(membersRaw);

  const results = enriched.map((m) => ({
    ...m,
    isAssignedToJirga: assignedSet.has(String(m._id)),
  }));

  const filtered = unassignedOnly === 'true'
    ? results.filter((r) => !r.isAssignedToJirga)
    : results;

  ok(res, {
    candidates: filtered,
    total: totalCount,
    page: p,
    limit: lim,
  });
});

// POST /api/jirga/members
exports.assignMember = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, memberId, nominationNote } = req.body;
  const unit = await resolveJirgaUnit(unitLevel, unitId);

  const canManage = await canManageJirgaMembers(req.user, unit.unitLevel, unit.unitId);
  if (!canManage) {
    throw new ApiError(403, 'FORBIDDEN',
      'Only the General Secretary of this unit or an authorized administrator may assign members to the Jirga');
  }

  const member = await Member.findById(memberId);
  if (!member || member.status !== 'ACTIVE') {
    throw new ApiError(400, 'INVALID_MEMBER', 'Member not found or not currently active');
  }

  // Check if already active in this Jirga
  const existing = await JirgaMember.findOne({
    unitLevel: unit.unitLevel,
    unitId: unit.unitId,
    memberId: member._id,
    isActive: true,
  });
  if (existing) {
    throw new ApiError(409, 'ALREADY_ASSIGNED', 'This member is already an active member of this Jirga');
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
  let doc = await JirgaMember.findOne({
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
    doc = await JirgaMember.create({
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

// POST /api/jirga/members/:id/remove or DELETE /api/jirga/members/:id
exports.removeMember = asyncHandler(async (req, res) => {
  const doc = await JirgaMember.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Jirga member assignment not found');

  const canManage = await canManageJirgaMembers(req.user, doc.unitLevel, doc.unitId);
  if (!canManage) {
    throw new ApiError(403, 'FORBIDDEN',
      'Only the General Secretary of this unit or an authorized administrator may remove members from the Jirga');
  }

  doc.isActive = false;
  doc.removedAt = new Date();
  doc.removedBy = req.user._id;
  doc.removalReason = req.body?.reason || req.body?.removalReason;
  await doc.save();

  ok(res, doc);
});
