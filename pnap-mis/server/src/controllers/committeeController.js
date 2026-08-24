const asyncHandler = require('express-async-handler');
const RoleAssignment = require('../models/RoleAssignment');
const BasicUnit = require('../models/BasicUnit');
const Area = require('../models/Area');
const District = require('../models/District');
const Province = require('../models/Province');
const PermanentMembership = require('../models/PermanentMembership');
const { ok, ApiError } = require('../utils/response');
const { canManagePermanentMembers } = require('../utils/unitScope');

// SRS §3.2 — A "committee" is the wider consultative body
// of a level: own cabinet + subordinate Secretaries & Senior Mawin
// Secretaries + (admin-managed) Permanent Members.
//
// Composition by level:
//   Area     → Elaqayi Committee (Area Cabinet + Basic Unit Secretaries & Senior Mawins)
//   District → Zilla Committee (District Cabinet + Area Secretaries & Senior Mawins)
//   Province → Sobayi Committee (Provincial Cabinet + District Secretaries & Senior Mawins)
//   Central  → Central Committee (Central Cabinet + Provincial Presidents & GS / 1st Secs)
//
// Permanent members live in PermanentMembership (admin-curated).

const SUBORDINATE_KEY_ROLES = ['SECRETARY', 'SENIOR_MAWIN', 'PRESIDENT', 'GENERAL_SECRETARY'];

async function listSubordinateUnits(parentLevel, parentId) {
  if (parentLevel === 'AREA') {
    const units = await BasicUnit.find({ areaId: parentId, isActive: true }).select('name').lean();
    return units.map((u) => ({ ...u, level: 'BASIC_UNIT' }));
  }
  if (parentLevel === 'DISTRICT') {
    const areas = await Area.find({ districtId: parentId, isActive: true }).select('name').lean();
    return areas.map((a) => ({ ...a, level: 'AREA' }));
  }
  if (parentLevel === 'PROVINCE') {
    const districts = await District.find({ provinceId: parentId, isActive: true }).select('name code').lean();
    return districts.map((d) => ({ ...d, level: 'DISTRICT' }));
  }
  if (parentLevel === 'CENTRAL') {
    const provinces = await Province.find({ isActive: true }).select('name code').lean();
    return provinces.map((p) => ({ ...p, level: 'PROVINCE' }));
  }
  return [];
}

exports.addPermanent = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, memberId, nominationNote } = req.body;
  if (!['AREA', 'DISTRICT', 'PROVINCE', 'CENTRAL'].includes(unitLevel)) {
    throw new ApiError(400, 'INVALID_LEVEL', 'Selective members are only valid at AREA / DISTRICT / PROVINCE / CENTRAL');
  }
  if (!(await canManagePermanentMembers(req.user, unitLevel, unitId))) {
    throw new ApiError(403, 'FORBIDDEN',
      'Only the level\'s Senior Mawin Secretary or a higher admin within scope may nominate Selective Members');
  }
  const doc = await PermanentMembership.create({
    unitLevel, unitId, memberId,
    nominationNote,
    nominatedBy: req.user._id,
  });
  ok(res, doc);
});

exports.removePermanent = asyncHandler(async (req, res) => {
  const doc = await PermanentMembership.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Selective member not found');
  if (!(await canManagePermanentMembers(req.user, doc.unitLevel, doc.unitId))) {
    throw new ApiError(403, 'FORBIDDEN',
      'Only the level\'s Senior Mawin Secretary or a higher admin within scope may revoke Selective Members');
  }
  doc.isActive = false;
  await doc.save();
  ok(res, doc);
});

exports.composition = asyncHandler(async (req, res) => {
  const { unitLevel, unitId } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');
  if (unitLevel === 'BASIC_UNIT') {
    throw new ApiError(400, 'INVALID_LEVEL', 'Basic Units do not have a committee — they have only a cabinet');
  }
  // Tell the frontend whether the caller may write — saves a 403
  // round-trip when the nominate form is hidden anyway.
  const canManage = await canManagePermanentMembers(req.user, unitLevel, unitId);

  // Own cabinet
  const ownCabinet = await RoleAssignment.find({
    unitLevel, unitId,
    state: 'APPROVED',
    endedAt: { $exists: false },
  }).populate('memberId', 'fullName phone memberId photoUrl');

  // Subordinate key roles
  const subs = await listSubordinateUnits(unitLevel, unitId);
  const subRows = await Promise.all(subs.map(async (s) => {
    const roles = await RoleAssignment.find({
      unitLevel: s.level,
      unitId: s._id,
      roleCode: { $in: SUBORDINATE_KEY_ROLES },
      state: 'APPROVED',
      endedAt: { $exists: false },
    }).populate('memberId', 'fullName phone memberId');
    return {
      unit: { _id: s._id, name: s.name, code: s.code, level: s.level },
      roles,
    };
  }));

  // Permanent members (admin-curated)
  const permanent = await PermanentMembership.find({
    unitLevel, unitId, isActive: true,
  }).populate('memberId', 'fullName phone memberId');

  ok(res, {
    unit: { unitLevel, unitId },
    ownCabinet,
    subordinates: subRows,
    permanentMembers: permanent,
    canManage,
  });
});
