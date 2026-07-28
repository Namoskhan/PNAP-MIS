const asyncHandler = require('express-async-handler');
const Meeting = require('../models/Meeting');
const BasicUnit = require('../models/BasicUnit');
const Area = require('../models/Area');
const District = require('../models/District');
const Province = require('../models/Province');
const { ok, ApiError } = require('../utils/response');

// SRS §12 — Each upper level is required to send a supervisor to
// meetings of the level below. We compute, per child unit, the
// percentage of finalized meetings in the period where
// supervisorAttended === true.

const CHILD_LEVEL = {
  AREA: 'BASIC_UNIT',
  DISTRICT: 'AREA',
  PROVINCE: 'DISTRICT',
  CENTRAL: 'PROVINCE',
};
const CHILD_FK = {
  AREA: 'basicUnitId',
  DISTRICT: 'areaId',
  PROVINCE: 'districtId',
  CENTRAL: 'provinceId',
};

async function listChildren(parentLevel, parentId) {
  if (parentLevel === 'AREA')
    return BasicUnit.find({ areaId: parentId, isActive: true }).select('name').lean();
  if (parentLevel === 'DISTRICT')
    return Area.find({ districtId: parentId, isActive: true }).select('name').lean();
  if (parentLevel === 'PROVINCE')
    return District.find({ provinceId: parentId, isActive: true }).select('name code').lean();
  if (parentLevel === 'CENTRAL')
    return Province.find({ isActive: true }).select('name code').lean();
  return [];
}

exports.compliance = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, days } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');
  if (unitLevel === 'BASIC_UNIT') {
    throw new ApiError(400, 'INVALID_LEVEL', 'Basic Units have no subordinate level to supervise');
  }

  const childLevel = CHILD_LEVEL[unitLevel];
  const childFk = CHILD_FK[unitLevel];

  const since = new Date(Date.now() - (parseInt(days || '90', 10)) * 24 * 3600 * 1000);
  const children = await listChildren(unitLevel, unitId);
  const threshold = parseInt(req.query.threshold || '60', 10);

  const rows = await Promise.all(children.map(async (c) => {
    const agg = await Meeting.aggregate([
      {
        $match: {
          unitLevel: childLevel,
          unitId: c._id,
          state: 'FINALIZED',
          startAt: { $gte: since },
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          withSupervisor: { $sum: { $cond: ['$supervisorAttended', 1, 0] } },
        },
      },
    ]);
    const r = agg[0] || { total: 0, withSupervisor: 0 };
    const pct = r.total ? Math.round((r.withSupervisor / r.total) * 100) : null;
    return {
      _id: c._id,
      name: c.name,
      code: c.code,
      meetingsFinalized: r.total,
      meetingsWithSupervisor: r.withSupervisor,
      compliancePct: pct,
      breach: pct !== null && pct < threshold,
    };
  }));

  ok(res, {
    unitLevel,
    unitId,
    childLevel,
    days: parseInt(days || '90', 10),
    threshold,
    rows,
  });
});
