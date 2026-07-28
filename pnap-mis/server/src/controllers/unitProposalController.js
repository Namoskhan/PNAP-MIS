const asyncHandler = require('express-async-handler');
const UnitProposal = require('../models/UnitProposal');
const BasicUnit = require('../models/BasicUnit');
const Area = require('../models/Area');
const District = require('../models/District');
const Province = require('../models/Province');
const RoleAssignment = require('../models/RoleAssignment');
const CabinetSlot = require('../models/CabinetSlot');
// Admin auto-provisioning utilities removed — under the new SRS-aligned
// flow, tier admins are explicitly created by the next-tier-up admin
// via POST /api/admin/users (see ManageOrgPage), not auto-seeded
// when a unit is created.
const { ok, created, ApiError } = require('../utils/response');
const { userHasRole } = require('../utils/unitScope');

// Unit Formation Authority Matrix (CENTRAL_ADMIN removed; Super
// owns the top tier directly).
//   BASIC_UNIT proposed by AREA_ADMIN+    → approved by DISTRICT_ADMIN+
//   AREA       proposed by DISTRICT_ADMIN+ → approved by PROVINCE_ADMIN+
//   DISTRICT   proposed by PROVINCE_ADMIN+ → approved by SUPER_ADMIN
//   PROVINCE   proposed by SUPER_ADMIN     → approved by SUPER_ADMIN
const PROPOSER_ROLES = {
  BASIC_UNIT: ['DISTRICT_ADMIN', 'PROVINCE_ADMIN', 'SUPER_ADMIN'],
  AREA: ['DISTRICT_ADMIN', 'PROVINCE_ADMIN', 'SUPER_ADMIN'],
  DISTRICT: ['PROVINCE_ADMIN', 'SUPER_ADMIN'],
  PROVINCE: ['SUPER_ADMIN'],
};
const APPROVER_ROLES = {
  BASIC_UNIT: ['DISTRICT_ADMIN', 'PROVINCE_ADMIN', 'SUPER_ADMIN'],
  AREA: ['PROVINCE_ADMIN', 'SUPER_ADMIN'],
  DISTRICT: ['SUPER_ADMIN'],
  PROVINCE: ['SUPER_ADMIN'],
};

exports.list = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.query.state) filter.state = req.query.state;
  if (req.query.targetLevel) filter.targetLevel = req.query.targetLevel;
  const items = await UnitProposal.find(filter)
    .sort({ createdAt: -1 })
    .populate('proposedBy', 'fullName email')
    .populate('decidedBy', 'fullName email')
    .populate('parentBasicUnitId', 'name')
    .populate('parentAreaId', 'name')
    .populate('parentDistrictId', 'name code')
    .populate('parentProvinceId', 'name code')
    .populate('proposedSecretaryMemberId', 'fullName memberId');
  ok(res, items);
});

exports.propose = asyncHandler(async (req, res) => {
  const { targetLevel, name, code, parentId, proposedSecretaryMemberId, boundaryDescription, note } = req.body;
  if (!UnitProposal.TARGET_LEVELS.includes(targetLevel)) {
    throw new ApiError(400, 'INVALID_LEVEL', 'targetLevel must be BASIC_UNIT / AREA / DISTRICT / PROVINCE');
  }
  if (!userHasRole(req.user, ...PROPOSER_ROLES[targetLevel])) {
    throw new ApiError(403, 'FORBIDDEN', `Your role cannot propose a ${targetLevel}`);
  }
  if (!name) throw new ApiError(400, 'VALIDATION_ERROR', 'name required');

  const data = { targetLevel, name, code, boundaryDescription, note, proposedBy: req.user._id };
  if (proposedSecretaryMemberId) data.proposedSecretaryMemberId = proposedSecretaryMemberId;

  // Validate parent exists at the right level
  if (targetLevel === 'BASIC_UNIT') {
    const a = await Area.findById(parentId);
    if (!a) throw new ApiError(400, 'INVALID_PARENT', 'Parent Area not found');
    data.parentAreaId = a._id;
  } else if (targetLevel === 'AREA') {
    const d = await District.findById(parentId);
    if (!d) throw new ApiError(400, 'INVALID_PARENT', 'Parent District not found');
    data.parentDistrictId = d._id;
  } else if (targetLevel === 'DISTRICT') {
    const p = await Province.findById(parentId);
    if (!p) throw new ApiError(400, 'INVALID_PARENT', 'Parent Province not found');
    data.parentProvinceId = p._id;
  } else if (targetLevel === 'PROVINCE') {
    if (!code) throw new ApiError(400, 'VALIDATION_ERROR', 'code required for province');
  }

  const proposal = await UnitProposal.create(data);
  created(res, proposal);
});

exports.decide = asyncHandler(async (req, res) => {
  const proposal = await UnitProposal.findById(req.params.id);
  if (!proposal) throw new ApiError(404, 'NOT_FOUND', 'Proposal not found');
  if (proposal.state !== 'PENDING' && proposal.state !== 'REVISION_REQUESTED') {
    throw new ApiError(400, 'INVALID_STATE', `Proposal already ${proposal.state}`);
  }
  if (!userHasRole(req.user, ...APPROVER_ROLES[proposal.targetLevel])) {
    throw new ApiError(403, 'FORBIDDEN', `Your role cannot approve a ${proposal.targetLevel}`);
  }

  const { decision, decisionNote } = req.body;
  if (!['APPROVED', 'REJECTED', 'REVISION_REQUESTED'].includes(decision)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'decision must be APPROVED / REJECTED / REVISION_REQUESTED');
  }

  proposal.state = decision;
  proposal.decidedBy = req.user._id;
  proposal.decidedAt = new Date();
  proposal.decisionNote = decisionNote;

  if (decision === 'APPROVED') {
    // Materialize the unit document.
    if (proposal.targetLevel === 'BASIC_UNIT') {
      const area = await Area.findById(proposal.parentAreaId).lean();
      const u = await BasicUnit.create({
        name: proposal.name,
        areaId: area._id,
        districtId: area.districtId,
        provinceId: area.provinceId,
      });
      proposal.createdUnitId = u._id;
      // Auto-create the 6-slot cabinet template (3 mandatory + 3 optional).
      await CabinetSlot.seedFor('BASIC_UNIT', u._id);
    } else if (proposal.targetLevel === 'AREA') {
      const d = await District.findById(proposal.parentDistrictId).lean();
      const a = await Area.create({
        name: proposal.name,
        districtId: d._id,
        provinceId: d.provinceId,
      });
      proposal.createdUnitId = a._id;
      await CabinetSlot.seedFor('AREA', a._id);
    } else if (proposal.targetLevel === 'DISTRICT') {
      const p = await Province.findById(proposal.parentProvinceId).lean();
      const d = await District.create({
        name: proposal.name,
        code: proposal.code,
        provinceId: p._id,
      });
      proposal.createdUnitId = d._id;
    } else if (proposal.targetLevel === 'PROVINCE') {
      const p = await Province.create({ name: proposal.name, code: proposal.code });
      proposal.createdUnitId = p._id;
    }

    // If a Secretary nominee was supplied, immediately propose them
    // as the new unit's Secretary so the cabinet kick-starts.
    if (proposal.proposedSecretaryMemberId && proposal.createdUnitId) {
      await RoleAssignment.create({
        unitLevel: proposal.targetLevel,
        unitId: proposal.createdUnitId,
        memberId: proposal.proposedSecretaryMemberId,
        roleCode: proposal.targetLevel === 'PROVINCE' ? 'PRESIDENT' : 'SECRETARY',
        state: 'PROPOSED',
        initiatedBy: req.user._id,
      });
    }
  }

  await proposal.save();
  ok(res, proposal);
});
