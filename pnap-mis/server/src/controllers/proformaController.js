const ProformaReport = require('../models/ProformaReport');
const BasicUnit = require('../models/BasicUnit');
const Area = require('../models/Area');
const District = require('../models/District');
const Province = require('../models/Province');
const proformaService = require('../services/proformaReportService');
const asyncHandler = require('express-async-handler');
const { ApiError, ok, fail } = require('../utils/response');

// Roles authorized to edit/submit proforma reports at different levels
const BU_AREA_ROLES = [
  'SENIOR_MAWIN',
  'PRESIDENT',
  'GENERAL_SECRETARY',
  'AREA_ADMIN',
  'DISTRICT_ADMIN',
  'PROVINCE_ADMIN',
  'CENTRAL_ADMIN',
  'SUPER_ADMIN',
];
const PROVINCE_ROLES = ['SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY', 'PRESIDENT', 'PROVINCE_ADMIN', 'CENTRAL_ADMIN', 'SUPER_ADMIN'];

function checkCanEdit(user, formType, targetLevel) {
  if (!user) return false;
  const roles = user.roles || [];
  if (roles.includes('SUPER_ADMIN') || roles.includes('CENTRAL_ADMIN') || user.isBootstrap) return true;

  if (formType === 'form5') {
    return roles.some((r) => PROVINCE_ROLES.includes(r));
  }
  return roles.some((r) => BU_AREA_ROLES.includes(r));
}

// 1. GET /api/proforma/entry
// Retrieves saved report if exists, or initial baseline for entry
exports.getProformaEntry = asyncHandler(async (req, res) => {
  const { formType, unitId, areaId, provinceId, year, month } = req.query;

  if (!formType) throw new ApiError(400, 'BAD_REQUEST', 'formType is required');
  const y = parseInt(year, 10) || new Date().getFullYear();
  const m = parseInt(month, 10) || (new Date().getMonth() + 1);

  let targetId = unitId;
  let unitLevel = 'BASIC_UNIT';
  let unitName = '';

  if (['form1', 'form2', 'form3'].includes(formType)) {
    targetId = areaId || unitId;
    unitLevel = 'AREA';
    let area = await Area.findById(targetId).lean();
    if (!area) {
      const bu = await BasicUnit.findById(targetId).lean();
      if (bu?.areaId) {
        targetId = bu.areaId.toString();
        area = await Area.findById(targetId).lean();
      }
    }
    unitName = area?.name || '';
  } else if (formType === 'form4') {
    targetId = unitId;
    unitLevel = 'BASIC_UNIT';
    const bu = await BasicUnit.findById(targetId).lean();
    unitName = bu?.name || '';
  } else if (formType === 'form5') {
    targetId = provinceId || unitId;
    unitLevel = 'PROVINCE';
    const prov = await Province.findById(targetId).lean();
    unitName = prov?.name || '';
  }

  if (!targetId) {
    throw new ApiError(400, 'BAD_REQUEST', `Target unit ID is required for ${formType}`);
  }

  const canEdit = checkCanEdit(req.user, formType, unitLevel);

  // Check if a saved report already exists in MongoDB
  const savedReport = await ProformaReport.findOne({
    formType,
    unitId: targetId,
    year: y,
    month: m,
  }).lean();

  // Pull system initial baseline (member names, slots, live attendance, etc.)
  let baseline = {};
  try {
    if (formType === 'form1') {
      baseline = await proformaService.fetchForm1Data({ areaId: targetId, month: m, year: y });
    } else if (formType === 'form2') {
      baseline = await proformaService.fetchForm2Data({ areaId: targetId, month: m, year: y });
    } else if (formType === 'form3') {
      baseline = await proformaService.fetchForm3Data({ areaId: targetId, month: m, year: y });
    } else if (formType === 'form4') {
      baseline = await proformaService.fetchForm4Data({ unitId: targetId, month: m, year: y });
    } else if (formType === 'form5') {
      baseline = await proformaService.fetchForm5Data({ provinceId: targetId, month: m, year: y });
    }
  } catch (err) {
    console.error('Error fetching proforma baseline:', err);
  }

  // If a saved report already exists and prefill is not explicitly requested, return saved report merged with baseline
  if (savedReport && req.query.prefill !== 'true') {
    const savedData = savedReport.data || {};
    const baseRows = baseline.execRows || baseline.rows || [];
    const rawSavedRows = savedData.rows || savedData.execRows || [];

    let mergedRows = rawSavedRows;
    if (rawSavedRows.length > 0 && baseRows.length > 0) {
      mergedRows = rawSavedRows.map((sRow, idx) => {
        const bRow = baseRows[idx] || {};
        const row = { ...bRow, ...sRow };
        for (const [k, v] of Object.entries(bRow)) {
          if (sRow[k] === undefined || sRow[k] === null || sRow[k] === '') {
            row[k] = v;
          }
        }
        if (!row.meetingDate || String(row.meetingDate).trim() === '') {
          row.meetingDate = savedData.execDate || savedData.executiveMeetingDate || bRow.meetingDate || baseline.upper?.execDate || '';
        }
        return row;
      });
    }

    const mergedData = {
      ...baseline,
      ...savedData,
      rows: mergedRows,
      execRows: mergedRows,
    };

    return res.json({
      success: true,
      exists: true,
      canEdit,
      report: savedReport,
      data: mergedData,
      metadata: {
        submittedByName: savedReport.submittedByName,
        submittedByRole: savedReport.submittedByRole,
        submittedAt: savedReport.submittedAt || savedReport.updatedAt,
        status: savedReport.status,
        notes: savedReport.notes,
      },
    });
  }

  return res.json({
    success: true,
    exists: false,
    canEdit,
    report: null,
    data: baseline,
    metadata: {
      submittedByName: '',
      submittedByRole: '',
      submittedAt: null,
      status: 'DRAFT',
      notes: '',
    },
  });
});

// 2. POST /api/proforma/save
// Saves or updates an entered report in MongoDB
exports.saveProformaReport = asyncHandler(async (req, res) => {
  const {
    formType,
    unitId,
    areaId,
    districtId,
    provinceId,
    unitLevel,
    unitName,
    year,
    month,
    data,
    status = 'SUBMITTED',
    notes = '',
  } = req.body;

  if (!formType) throw new ApiError(400, 'BAD_REQUEST', 'formType is required');
  if (!unitId) throw new ApiError(400, 'BAD_REQUEST', 'unitId is required');
  if (!data || typeof data !== 'object') throw new ApiError(400, 'BAD_REQUEST', 'data payload is required');

  const y = parseInt(year, 10);
  const m = parseInt(month, 10);
  if (!y || !m || m < 1 || m > 12) {
    throw new ApiError(400, 'BAD_REQUEST', 'Valid year and month are required');
  }

  const canEdit = checkCanEdit(req.user, formType, unitLevel);
  if (!canEdit) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to enter or submit this proforma report. Only Senior Mawin, Vice President, or authorized executives may submit.');
  }

  const userRoles = req.user.roles || [];
  const primaryRole = userRoles.find((r) => [...BU_AREA_ROLES, ...PROVINCE_ROLES].includes(r)) || userRoles[0] || 'MEMBER';

  let effectiveUnitId = unitId;
  if (['form1', 'form2', 'form3'].includes(formType)) {
    effectiveUnitId = areaId || unitId;
    const a = await Area.findById(effectiveUnitId).lean();
    if (!a) {
      const bu = await BasicUnit.findById(effectiveUnitId).lean();
      if (bu?.areaId) effectiveUnitId = bu.areaId.toString();
    }
  }

  // Validate attendance sums against total slots if provided in data.upper
  if (data?.upper) {
    const u = data.upper;
    const execSlots = parseInt(u.execSlots, 10) || 0;
    const execPres = parseInt(u.execPresent, 10) || 0;
    const execAbs = parseInt(u.execAbsent, 10) || 0;
    const execLeave = parseInt(u.execLeave, 10) || 0;
    if (execSlots > 0 && (execPres + execAbs + execLeave) > execSlots) {
      throw new ApiError(400, 'BAD_REQUEST', `Area Executive attendance sum (Present: ${execPres} + Absent: ${execAbs} + Leave: ${execLeave} = ${execPres + execAbs + execLeave}) cannot exceed Total Members (${execSlots})`);
    }

    const commTotal = parseInt(u.commTotal, 10) || 0;
    const commPres = parseInt(u.commPresent, 10) || 0;
    const commAbs = parseInt(u.commAbsent, 10) || 0;
    const commLeave = parseInt(u.commLeave, 10) || 0;
    if (commTotal > 0 && (commPres + commAbs + commLeave) > commTotal) {
      throw new ApiError(400, 'BAD_REQUEST', `Area Committee attendance sum (Present: ${commPres} + Absent: ${commAbs} + Leave: ${commLeave} = ${commPres + commAbs + commLeave}) cannot exceed Total Members (${commTotal})`);
    }

    if (formType === 'form4') {
      const gbMembers = parseInt(u.gbMembers, 10) || 0;
      const gbPres = parseInt(u.gbPresent, 10) || 0;
      const gbAbs = parseInt(u.gbAbsent, 10) || 0;
      const gbLeave = parseInt(u.gbLeave, 10) || 0;
      if (gbMembers > 0 && (gbPres + gbAbs + gbLeave) > gbMembers) {
        throw new ApiError(400, 'BAD_REQUEST', `General Body attendance sum (Present: ${gbPres} + Absent: ${gbAbs} + Leave: ${gbLeave} = ${gbPres + gbAbs + gbLeave}) cannot exceed Total Members (${gbMembers})`);
      }
    }

    const totalMembers = parseInt(u.totalMembers, 10) || 0;
    const activeMembers = parseInt(u.activeMembers, 10) || 0;
    if (totalMembers > 0 && activeMembers > totalMembers) {
      throw new ApiError(400, 'BAD_REQUEST', `Active members (${activeMembers}) cannot exceed Total members (${totalMembers})`);
    }

    // Ensure studyPct is filled if study sessions or units were specified
    if (!u.studyPct) {
      const units = parseInt(u.studyUnitsCount, 10) || 0;
      const totalUnits = parseInt(u.buExecCount, 10) || 1;
      if (units > 0) {
        u.studyPct = `${Math.min(100, Math.round((units / totalUnits) * 100))}%`;
      } else if (parseInt(u.studyAreaComm, 10) > 0) {
        u.studyPct = '100%';
      }
    }
  }

  const buRecord = formType === 'form4' ? await BasicUnit.findById(effectiveUnitId).lean() : null;
  const resolvedAreaId = formType === 'form4' ? (areaId || buRecord?.areaId || effectiveUnitId) : effectiveUnitId;

  const doc = await ProformaReport.findOneAndUpdate(
    { formType, unitId: effectiveUnitId, year: y, month: m },
    {
      formType,
      unitLevel: unitLevel || (formType === 'form4' ? 'BASIC_UNIT' : (formType === 'form5' ? 'PROVINCE' : 'AREA')),
      unitId: effectiveUnitId,
      unitName: unitName || data.unitName || data.areaName || data.provinceName || buRecord?.name || '',
      areaId: resolvedAreaId,
      districtId: districtId || buRecord?.districtId || undefined,
      provinceId: provinceId || buRecord?.provinceId || undefined,
      year: y,
      month: m,
      data,
      status,
      notes,
      submittedBy: req.user._id,
      submittedByName: req.user.fullName || req.user.name || req.user.email || 'Officer',
      submittedByRole: primaryRole,
      submittedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return res.json({
    success: true,
    exists: true,
    message: 'Report saved and stored in database successfully',
    report: doc,
    data: doc.data,
    metadata: {
      submittedByName: doc.submittedByName,
      submittedByRole: doc.submittedByRole,
      submittedAt: doc.submittedAt || doc.updatedAt,
      status: doc.status,
      notes: doc.notes,
    },
  });
});

// 3. GET /api/proforma/history
// Retrieves list of previously submitted reports for this unit
exports.getProformaHistory = asyncHandler(async (req, res) => {
  const { unitId, formType } = req.query;
  if (!unitId) throw new ApiError(400, 'BAD_REQUEST', 'unitId is required');

  const filter = { unitId };
  if (formType) filter.formType = formType;

  const list = await ProformaReport.find(filter)
    .select('formType unitId unitName year month status submittedByName submittedByRole submittedAt updatedAt')
    .sort({ year: -1, month: -1 })
    .lean();

  return res.json({
    success: true,
    reports: list,
  });
});
