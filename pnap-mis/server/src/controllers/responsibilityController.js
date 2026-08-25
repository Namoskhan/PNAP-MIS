const asyncHandler = require('express-async-handler');
const Responsibility = require('../models/Responsibility');
const Member = require('../models/Member');
const { ok, created, ApiError } = require('../utils/response');
const { canManageMeetings, resolveUnitChain, userHasRole } = require('../utils/unitScope');

const RoleAssignment = require('../models/RoleAssignment');
const { formatUnitArrangedBy } = require('../utils/unitFormat');

exports.list = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, memberId, state, scope } = req.query;
  const filter = {};
  if (memberId) filter.assignedToMemberId = memberId;
  if (state) filter.state = state;
  if (unitLevel && unitId) {
    if (scope === 'subtree') {
      const chain = await resolveUnitChain(unitLevel, unitId);
      if (!chain) throw new ApiError(400, 'INVALID_UNIT', 'Unit not found');
      if (unitLevel === 'BASIC_UNIT') filter.basicUnitId = chain.basicUnitId;
      else if (unitLevel === 'AREA') filter.areaId = chain.areaId;
      else if (unitLevel === 'DISTRICT') filter.districtId = chain.districtId;
      else if (unitLevel === 'PROVINCE') filter.provinceId = chain.provinceId;
    } else {
      filter.unitLevel = unitLevel;
      filter.unitId = unitId;
    }
  }
  const items = await Responsibility.find(filter)
    .sort({ dueDate: 1, createdAt: -1 })
    .limit(500)
    .populate({
      path: 'assignedToMemberId',
      select: 'fullName memberId phone cnic basicUnitId areaId districtId provinceId',
      populate: [
        { path: 'basicUnitId', select: 'name' },
        { path: 'areaId', select: 'name' },
        { path: 'districtId', select: 'name code' },
        { path: 'provinceId', select: 'name code' },
      ],
    })
    .populate('basicUnitId', 'name')
    .populate('areaId', 'name')
    .populate('districtId', 'name code')
    .populate('provinceId', 'name code')
    .populate('relatedActivityId', 'title type')
    .populate('relatedMeetingId', 'title type startAt');

  // Batch-fetch active roles for all assigned members
  const memberIds = items.map((r) => r.assignedToMemberId?._id).filter(Boolean);
  const activeRoles = memberIds.length
    ? await RoleAssignment.find({
        memberId: { $in: memberIds },
        state: 'APPROVED',
        endedAt: { $exists: false },
      }).lean()
    : [];

  const rolesByMember = new Map();
  for (const ra of activeRoles) {
    const mId = String(ra.memberId);
    const label = ra.customRoleName || ra.customName || ra.roleCode;
    if (!rolesByMember.has(mId)) rolesByMember.set(mId, []);
    rolesByMember.get(mId).push(label);
  }

  const enhanced = items.map((item) => {
    const obj = item.toObject();
    if (obj.assignedToMemberId?._id) {
      const mId = String(obj.assignedToMemberId._id);
      const roles = rolesByMember.get(mId) || [];
      obj.assignedToMemberId.roles = roles;
      obj.assignedToMemberId.roleText = roles.join(', ') || 'Member';

      const u = obj.assignedToMemberId;
      const parts = [];
      if (u.basicUnitId?.name) parts.push(`Basic Unit: ${u.basicUnitId.name}`);
      if (u.areaId?.name) parts.push(`Area: ${u.areaId.name}`);
      if (u.districtId?.name) parts.push(`District: ${u.districtId.name}`);
      if (u.provinceId?.name || u.provinceId?.code) parts.push(u.provinceId.name || u.provinceId.code);
      obj.assignedToMemberId.unitText = parts.join(' · ') || '';
    }
    return obj;
  });

  ok(res, enhanced);
});

exports.create = asyncHandler(async (req, res) => {
  if (!canManageMeetings(req.user)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only Senior Mawin / Admin may assign responsibilities');
  }
  const d = req.body;
  const chain = await resolveUnitChain(d.unitLevel, d.unitId);
  if (!chain) throw new ApiError(400, 'INVALID_UNIT', 'Unit not found');

  const member = await Member.findById(d.assignedToMemberId).lean();
  if (!member) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'Member not found');

  const r = await Responsibility.create({
    unitLevel: d.unitLevel,
    unitId: d.unitId,
    ...chain,
    title: d.title,
    description: d.description,
    dueDate: d.dueDate,
    assignedToMemberId: d.assignedToMemberId,
    assignedByUserId: req.user._id,
    relatedActivityId: d.relatedActivityId,
    relatedMeetingId: d.relatedMeetingId,
  });
  created(res, r);
});

exports.update = asyncHandler(async (req, res) => {
  const r = await Responsibility.findById(req.params.id);
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'Responsibility not found');

  // The assignee, the assigning user, or any unit manager may update.
  const isAssignee = String(r.assignedToMemberId) === String(req.user.memberId || '');
  const isOwner = String(r.assignedByUserId) === String(req.user._id);
  if (!isAssignee && !isOwner && !canManageMeetings(req.user)) {
    throw new ApiError(403, 'FORBIDDEN', 'Forbidden');
  }

  const { state, completionNote, title, description, dueDate } = req.body;
  if (state) {
    if (!Responsibility.STATES.includes(state)) {
      throw new ApiError(400, 'INVALID_STATE', 'Invalid state');
    }
    r.state = state;
    if (state === 'COMPLETED') r.completedAt = new Date();
  }
  if (completionNote !== undefined) r.completionNote = completionNote;
  if (title !== undefined && (isOwner || canManageMeetings(req.user))) r.title = title;
  if (description !== undefined) r.description = description;
  if (dueDate !== undefined && (isOwner || canManageMeetings(req.user))) r.dueDate = dueDate || null;

  await r.save();
  ok(res, r);
});

exports.remove = asyncHandler(async (req, res) => {
  const r = await Responsibility.findById(req.params.id);
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'Responsibility not found');
  const isOwner = String(r.assignedByUserId) === String(req.user._id);
  if (!isOwner && !canManageMeetings(req.user)) {
    throw new ApiError(403, 'FORBIDDEN', 'Forbidden');
  }
  await r.deleteOne();
  ok(res, { deleted: true });
});
