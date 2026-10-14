const ProformaReport = require('../models/ProformaReport');
const BasicUnit = require('../models/BasicUnit');
const Area = require('../models/Area');
const District = require('../models/District');
const Province = require('../models/Province');
const proformaService = require('../services/proformaReportService');
const asyncHandler = require('express-async-handler');
const { ApiError, ok, fail } = require('../utils/response');

// Roles authorized to edit/submit proforma reports across all tiers
const PROFORMA_AUTHORIZED_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'CENTRAL_ADMIN',
  'PROVINCE_ADMIN',
  'DISTRICT_ADMIN',
  'AREA_ADMIN',
  'PRESIDENT',
  'SR_VICE_PRESIDENT',
  'VICE_PRESIDENT',
  'GENERAL_SECRETARY',
  'DEPUTY_SECRETARY',
  'OFFICE_SECRETARY',
  'FINANCE_SECRETARY',
  'INFORMATION_SECRETARY',
  'SENIOR_MAWIN',
];

const BU_AREA_ROLES = PROFORMA_AUTHORIZED_ROLES;
const PROVINCE_ROLES = PROFORMA_AUTHORIZED_ROLES;

function checkCanEdit(user, formType, targetLevel) {
  if (!user) return false;
  const roles = user.roles || [];
  if (roles.includes('SUPER_ADMIN') || roles.includes('CENTRAL_ADMIN') || roles.includes('ADMIN') || user.isBootstrap) return true;

  // Allow all authorized administrative and leadership roles
  return roles.some((r) => PROFORMA_AUTHORIZED_ROLES.includes(r)) || roles.length > 0;
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
  } else if (['form6', 'form7', 'form8'].includes(formType)) {
    targetId = req.query.districtId || unitId;
    unitLevel = 'DISTRICT';
    const dist = await District.findById(targetId).lean();
    unitName = dist?.name || '';
  } else if (formType === 'form9') {
    targetId = req.query.districtId || req.query.areaId || unitId;
    const dist = await District.findById(targetId).lean();
    if (dist) {
      unitLevel = 'DISTRICT';
      unitName = dist.name;
    } else {
      const area = await Area.findById(targetId).lean();
      if (area) {
        unitLevel = 'AREA';
        unitName = area.name;
      } else {
        unitLevel = 'DISTRICT';
      }
    }
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
    } else if (formType === 'form6') {
      baseline = await proformaService.fetchForm6Data({ districtId: targetId, month: m, year: y, m1: req.query.m1, m2: req.query.m2, m3: req.query.m3 });
    } else if (formType === 'form7') {
      baseline = await proformaService.fetchForm7Data({ districtId: targetId, month: m, year: y });
    } else if (formType === 'form8') {
      baseline = await proformaService.fetchForm8Data({ districtId: targetId, month: m, year: y });
    } else if (formType === 'form9') {
      baseline = await proformaService.fetchForm9Data({
        districtId: unitLevel === 'DISTRICT' ? targetId : undefined,
        areaId: unitLevel === 'AREA' ? targetId : undefined,
        month: m,
        year: y,
      });
    }
  } catch (err) {
    console.error('Error fetching proforma baseline:', err);
  }

  // If a saved report already exists and prefill is not explicitly requested, return saved report merged with baseline
  if (savedReport && req.query.prefill !== 'true') {
    if (formType === 'form9') {
      const savedData = savedReport.data || {};
      const mergedData = {
        ...baseline,
        ...savedData,
        sec1Members: (savedData.sec1Members && savedData.sec1Members.length > 0) ? savedData.sec1Members : (baseline.sec1Members || []),
        sec2PublicGatherings: savedData.sec2PublicGatherings || baseline.sec2PublicGatherings || [],
        sec3Conferences: savedData.sec3Conferences || baseline.sec3Conferences || [],
        sec4BloodBank: { ...(baseline.sec4BloodBank || {}), ...(savedData.sec4BloodBank || {}) },
        sec5Discipline: savedData.sec5Discipline || baseline.sec5Discipline || [],
        sec6Proposals: {
          political: { ...(baseline.sec6Proposals?.political || {}), ...(savedData.sec6Proposals?.political || {}) },
          organizational: { ...(baseline.sec6Proposals?.organizational || {}), ...(savedData.sec6Proposals?.organizational || {}) },
          social: { ...(baseline.sec6Proposals?.social || {}), ...(savedData.sec6Proposals?.social || {}) },
        },
        sec7Notes: { ...(baseline.sec7Notes || {}), ...(savedData.sec7Notes || {}) },
      };
      const isSubmitted = savedReport.status === 'SUBMITTED' || savedReport.status === 'APPROVED';
      return res.json({
        success: true,
        exists: isSubmitted,
        isDraft: savedReport.status === 'DRAFT',
        canEdit,
        report: savedReport,
        data: mergedData,
        metadata: {
          submittedByName: isSubmitted ? (savedReport.submittedByName || '') : '',
          submittedByRole: isSubmitted ? (savedReport.submittedByRole || '') : '',
          submittedAt: isSubmitted ? (savedReport.submittedAt || savedReport.updatedAt) : null,
        },
      });
    }

    const savedData = savedReport.data || {};
    const baseRows = baseline.execRows || baseline.rows || [];
    const rawSavedRows = savedData.rows || savedData.execRows || [];

    const rowAliasMap = {
      distExecMeeting: 'distExec',
      distExec: 'distExecMeeting',
      distCommMeeting: 'distComm',
      distComm: 'distCommMeeting',
      areaExecMeeting: 'areaExec',
      areaExec: 'areaExecMeeting',
      areaCommMeeting: 'areaComm',
      areaComm: 'areaCommMeeting',
      ownBuMeeting: 'ownBu',
      ownBu: 'ownBuMeeting',
      buExecMeeting: 'buExec',
      buExec: 'buExecMeeting',
      buGbMeeting: 'buGb',
      buGb: 'buGbMeeting',
      psoMeeting: 'pso',
      pso: 'psoMeeting',
      conferenceMeeting: 'conf',
      conf: 'conferenceMeeting',
      seminarMeeting: 'seminar',
      seminar: 'seminarMeeting',
      studyCircleMeeting: 'studyCircle',
      studyCircle: 'studyCircleMeeting',
      inductionMeeting: 'induction',
      induction: 'inductionMeeting',
      alliedMeeting: 'allied',
      allied: 'alliedMeeting',
      rallyMeeting: 'rallies',
      rallies: 'rallyMeeting',
      jirgaMeeting: 'jirgas',
      jirgas: 'jirgaMeeting',
      monthlyDues: 'dues',
      dues: 'monthlyDues',
      bloodBankPosts: 'bloodZakat',
      bloodZakat: 'bloodBankPosts',
      ideologicalReading: 'reading',
      reading: 'ideologicalReading',
    };

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
        for (const [a, b] of Object.entries(rowAliasMap)) {
          if (sRow[a] !== undefined && sRow[a] !== null && sRow[a] !== '' && (row[b] === undefined || row[b] === null || row[b] === '' || row[b] === 0)) {
            row[b] = sRow[a];
          }
        }
        if (!row.meetingDate || String(row.meetingDate).trim() === '') {
          row.meetingDate = savedData.execDate || savedData.executiveMeetingDate || bRow.meetingDate || baseline.upper?.execDate || '';
        }
        return row;
      });
    }

    const mergedUpper = {
      ...(baseline.upper || {}),
      ...(savedData.upper || {}),
    };
    const upperAliasMap = {
      areaUnitsCount: 'areasCount',
      areasCount: 'areaUnitsCount',
      newAreaUnitsCount: 'newAreasCount',
      newAreasCount: 'newAreaUnitsCount',
      newPsoUnitsCount: 'psoNewUnitsCount',
      psoNewUnitsCount: 'newPsoUnitsCount',
      conferencesCount: 'conferences',
      conferences: 'conferencesCount',
      studyCirclesCount: 'studyCircles',
      studyCircles: 'studyCirclesCount',
      inductionsCount: 'inductions',
      inductions: 'inductionsCount',
      ralliesCount: 'ralliesAndProtests',
      ralliesAndProtests: 'ralliesCount',
      jirgasCount: 'jirgasAndCornerMeetings',
      jirgasAndCornerMeetings: 'jirgasCount',
      alliedMeetingsCount: 'alliedMeetings',
      alliedMeetings: 'alliedMeetingsCount',
      districtOfficeActivity: 'officeActivity',
      officeActivity: 'districtOfficeActivity',
      duesMonthly: 'dues',
      dues: 'duesMonthly',
      duesEmergency: 'emergencyDues',
      emergencyDues: 'duesEmergency',
      duesExpenses: 'expenses',
      expenses: 'duesExpenses',
      villagesWithoutUnitCount: 'villagesWithoutUnit',
      villagesWithoutUnit: 'villagesWithoutUnitCount',
      disciplinaryActionsCount: 'disciplinaryActions',
      disciplinaryActions: 'disciplinaryActionsCount',
    };
    for (const [a, b] of Object.entries(upperAliasMap)) {
      if (mergedUpper[a] !== undefined && mergedUpper[a] !== null && mergedUpper[a] !== '' && (mergedUpper[b] === undefined || mergedUpper[b] === null || mergedUpper[b] === '' || mergedUpper[b] === 0)) {
        mergedUpper[b] = mergedUpper[a];
      }
    }

    const mergedData = {
      ...baseline,
      ...savedData,
      upper: mergedUpper,
      rows: mergedRows,
      execRows: mergedRows,
    };

    const isSubmitted = savedReport.status === 'SUBMITTED' || savedReport.status === 'APPROVED';

    return res.json({
      success: true,
      exists: isSubmitted,
      isDraft: savedReport.status === 'DRAFT',
      canEdit,
      report: savedReport,
      data: mergedData,
      metadata: {
        submittedByName: isSubmitted ? (savedReport.submittedByName || '') : '',
        submittedByRole: isSubmitted ? (savedReport.submittedByRole || '') : '',
        submittedAt: isSubmitted ? (savedReport.submittedAt || savedReport.updatedAt) : null,
        status: savedReport.status || 'DRAFT',
        notes: savedReport.notes || '',
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
    status = 'DRAFT',
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
  } else if (['form6', 'form7', 'form8'].includes(formType)) {
    effectiveUnitId = districtId || unitId;
  } else if (formType === 'form9') {
    effectiveUnitId = districtId || areaId || unitId;
    const dist = await District.findById(effectiveUnitId).lean();
    if (dist) {
      unitLevel = 'DISTRICT';
    } else {
      const a = await Area.findById(effectiveUnitId).lean();
      if (a) unitLevel = 'AREA';
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

  // Form 2: Subordinate Basic Units validation
  if (formType === 'form2' && Array.isArray(data?.rows)) {
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const unitLabel = (r.unitName || '').trim() || `Row #${i + 1}`;

      if (!r.unitName || !r.unitName.trim()) {
        throw new ApiError(400, 'BAD_REQUEST', `Basic unit name is required for row #${i + 1}`);
      }

      const eTot = parseInt(r.execTotal, 10) || 0;
      const ePres = parseInt(r.execPresent, 10) || 0;
      const eAbs = parseInt(r.execAbsent, 10) || 0;
      const eLeave = parseInt(r.execLeave, 10) || 0;
      if (eTot < 0 || ePres < 0 || eAbs < 0 || eLeave < 0) {
        throw new ApiError(400, 'BAD_REQUEST', `Unit '${unitLabel}': Negative attendance values are not allowed`);
      }
      if (eTot > 0 && (ePres + eAbs + eLeave) > eTot) {
        throw new ApiError(400, 'BAD_REQUEST', `Unit '${unitLabel}': Executive attendance (Present: ${ePres} + Absent: ${eAbs} + Leave: ${eLeave} = ${ePres + eAbs + eLeave}) exceeds Total Slots (${eTot})`);
      }

      const gTot = parseInt(r.gbTotalMembers, 10) || 0;
      const gPres = parseInt(r.gbPresent, 10) || 0;
      const gAbs = parseInt(r.gbAbsent, 10) || 0;
      const gLeave = parseInt(r.gbLeave, 10) || 0;
      if (gTot < 0 || gPres < 0 || gAbs < 0 || gLeave < 0) {
        throw new ApiError(400, 'BAD_REQUEST', `Unit '${unitLabel}': Negative attendance values are not allowed`);
      }
      if (gTot > 0 && (gPres + gAbs + gLeave) > gTot) {
        throw new ApiError(400, 'BAD_REQUEST', `Unit '${unitLabel}': General Body attendance (Present: ${gPres} + Absent: ${gAbs} + Leave: ${gLeave} = ${gPres + gAbs + gLeave}) exceeds Membership (${gTot})`);
      }

      const psoMem = parseInt(r.psoMembership, 10) || 0;
      const psoAtt = parseInt(r.psoAttendees, 10) || 0;
      if (psoMem < 0 || psoAtt < 0) {
        throw new ApiError(400, 'BAD_REQUEST', `Unit '${unitLabel}': Negative PSO numbers are not allowed`);
      }
      if (psoMem > 0 && psoAtt > psoMem) {
        throw new ApiError(400, 'BAD_REQUEST', `Unit '${unitLabel}': PSO attendees (${psoAtt}) cannot exceed PSO membership (${psoMem})`);
      }

      const dues = parseInt(r.unitDonations, 10);
      const emg = parseInt(r.emergencyDonations, 10);
      const exp = parseInt(r.totalExpenses, 10);
      const bCash = parseInt(r.bloodCash, 10);
      const zakat = parseInt(r.zakat, 10);
      if ((!isNaN(dues) && dues < 0) || (!isNaN(emg) && emg < 0) || (!isNaN(exp) && exp < 0) || (!isNaN(bCash) && bCash < 0) || (!isNaN(zakat) && zakat < 0)) {
        throw new ApiError(400, 'BAD_REQUEST', `Unit '${unitLabel}': Financial amounts cannot be negative`);
      }
    }
  }

  // Form 3: Area Detailed Activity Report validation
  if (formType === 'form3') {
    if (data?.bloodBank) {
      const bCash = parseInt(data.bloodBank.bloodCash, 10);
      const bTot = parseInt(data.bloodBank.bloodTotalCash, 10);
      const zakat = parseInt(data.bloodBank.zakat, 10);
      const posts = parseInt(data.bloodBank.bloodPosts, 10);
      if ((!isNaN(bCash) && bCash < 0) || (!isNaN(bTot) && bTot < 0) || (!isNaN(zakat) && zakat < 0) || (!isNaN(posts) && posts < 0)) {
        throw new ApiError(400, 'BAD_REQUEST', 'Blood Bank figures and Zakat amounts cannot be negative');
      }
    }
    if (Array.isArray(data?.committeeMembers)) {
      for (let i = 0; i < data.committeeMembers.length; i++) {
        const c = data.committeeMembers[i];
        const numKeys = ['areaExec', 'areaComm', 'unitExec', 'unitGb', 'pso', 'conf', 'seminar', 'studyCircle', 'induction', 'rally', 'reading', 'inactiveContact', 'dues', 'tour'];
        for (const k of numKeys) {
          const val = parseInt(c[k], 10);
          if (!isNaN(val) && val < 0) {
            throw new ApiError(400, 'BAD_REQUEST', `Committee member '${c.name || `#${i + 1}`}': Negative count for ${k} is not allowed`);
          }
        }
      }
    }
  }

  // Form 5: Provincial Executive Individual Activity Report validation
  if (formType === 'form5' && Array.isArray(data?.rows)) {
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const memberName = (r.name || '').trim();
      const hasAnyData = Object.entries(r).some(([k, v]) => k !== 'srNo' && k !== 'name' && String(v || '').trim() !== '');
      if (hasAnyData && !memberName) {
        throw new ApiError(400, 'BAD_REQUEST', `Row #${i + 1}: Executive comrade name is required when activity counts are entered`);
      }
      const numKeys = [
        'centralComm', 'provincialJirga', 'provincialExec', 'provincialComm',
        'districtExec', 'districtComm', 'areaExec', 'areaComm',
        'basicUnitsExec', 'basicUnitsGb', 'ownBasicUnit', 'psoMeetings',
        'partyConferences', 'seminars', 'studyCircles', 'inductions',
        'ralliesAndProtests', 'jirgasAndCornerMeetings', 'pressConferences',
        'alliedMeetings', 'totalMeetings', 'dues', 'tours', 'reading'
      ];
      for (const k of numKeys) {
        const val = parseInt(r[k], 10);
        if (!isNaN(val) && val < 0) {
          throw new ApiError(400, 'BAD_REQUEST', `Row #${i + 1} (${memberName || 'Unnamed'}): Negative value for ${k} is not allowed`);
        }
      }
    }
  }

  // Form 6: District Executive Individual Activity Report validation
  if (formType === 'form6' && Array.isArray(data?.rows)) {
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const memberName = (r.name || '').trim();
      const numKeys = [
        'distExec', 'distComm', 'areaExec', 'areaComm', 'ownBu', 'buExec', 'buGb',
        'pso', 'conf', 'seminar', 'studyCircle', 'induction', 'allied', 'rallies',
        'jirgas', 'totalMeetings', 'dues', 'tours', 'publicOutreach', 'inactiveContact'
      ];
      for (const k of numKeys) {
        const val = parseInt(r[k], 10);
        if (!isNaN(val) && val < 0) {
          throw new ApiError(400, 'BAD_REQUEST', `Row #${i + 1} (${memberName || 'Unnamed'}): Negative value for ${k} is not allowed`);
        }
      }
    }
  }

  // Form 7: District Subordinate Area Units Monthly Work & Activity Report validation
  if (formType === 'form7' && Array.isArray(data?.rows)) {
    for (let i = 0; i < data.rows.length; i++) {
      const r = data.rows[i];
      const unitName = (r.unitName || '').trim();
      const label = unitName || `Row #${i + 1}`;

      const hasData = Object.entries(r).some(([k, v]) => k !== 'srNo' && k !== 'unitName' && String(v ?? '').trim() !== '');
      if (hasData && !unitName) {
        throw new ApiError(400, 'BAD_REQUEST', `Area Unit row #${i + 1}: Unit name is required`);
      }

      const numKeys = [
        'execMeetings', 'execTotalMembers', 'execPresent', 'execHeld',
        'commMeetings', 'commTotalMembers', 'commPresent', 'commHeld',
        'buCount', 'newBuCount',
        'buExecUnitsTotal', 'buExecUnitsPresent', 'buExecMeetingsTotal', 'buExecMeetingsHeld',
        'buGbMeetingsTotal', 'buGbMeetingsHeld', 'inactiveBuCount',
        'membershipTotal', 'membershipPresent',
        'studyAreaComm', 'studyUnitsComm', 'studyUnitsCount',
        'programsCount', 'inductionPrograms', 'newInductions',
        'psoUnitsCount',
        'ralliesCount', 'jirgasCount', 'unitGatherings',
        'villagesWithoutUnit',
        'duesMonthly', 'duesOrg', 'duesEmergency',
        'bloodPosts', 'bloodCash', 'bloodZakat'
      ];
      for (const k of numKeys) {
        const val = parseInt(r[k], 10);
        if (!isNaN(val) && val < 0) {
          throw new ApiError(400, 'BAD_REQUEST', `${label}: Negative value for ${k} is not allowed`);
        }
      }

      // Check attendance & meeting integrity
      const execTot = parseInt(r.execTotalMembers, 10) || 0;
      const execPres = parseInt(r.execPresent, 10) || 0;
      const execMtgs = parseInt(r.execMeetings, 10) || 0;
      const execHeld = parseInt(r.execHeld, 10) || 0;
      if (execTot > 0 && execPres > execTot) {
        throw new ApiError(400, 'BAD_REQUEST', `${label}: Present executive members (${execPres}) cannot exceed total members (${execTot})`);
      }
      if (execMtgs > 0 && execHeld > execMtgs) {
        throw new ApiError(400, 'BAD_REQUEST', `${label}: Held executive meetings (${execHeld}) cannot exceed scheduled meetings (${execMtgs})`);
      }

      const commTot = parseInt(r.commTotalMembers, 10) || 0;
      const commPres = parseInt(r.commPresent, 10) || 0;
      const commMtgs = parseInt(r.commMeetings, 10) || 0;
      const commHeld = parseInt(r.commHeld, 10) || 0;
      if (commTot > 0 && commPres > commTot) {
        throw new ApiError(400, 'BAD_REQUEST', `${label}: Present committee members (${commPres}) cannot exceed total members (${commTot})`);
      }
      if (commMtgs > 0 && commHeld > commMtgs) {
        throw new ApiError(400, 'BAD_REQUEST', `${label}: Held committee meetings (${commHeld}) cannot exceed scheduled meetings (${commMtgs})`);
      }

      const buTot = parseInt(r.buCount, 10) || 0;
      const newBu = parseInt(r.newBuCount, 10) || 0;
      const inactBu = parseInt(r.inactiveBuCount, 10) || 0;
      if (buTot > 0 && newBu > buTot) {
        throw new ApiError(400, 'BAD_REQUEST', `${label}: New basic units (${newBu}) cannot exceed total basic units (${buTot})`);
      }
      if (buTot > 0 && inactBu > buTot) {
        throw new ApiError(400, 'BAD_REQUEST', `${label}: Inactive basic units (${inactBu}) cannot exceed total basic units (${buTot})`);
      }

      const beTotMem = parseInt(r.buExecUnitsTotal, 10) || 0;
      const bePres = parseInt(r.buExecUnitsPresent, 10) || 0;
      const beMtgs = parseInt(r.buExecMeetingsTotal, 10) || 0;
      const beHeld = parseInt(r.buExecMeetingsHeld, 10) || 0;
      if (beTotMem > 0 && bePres > beTotMem) {
        throw new ApiError(400, 'BAD_REQUEST', `${label}: BU Exec present members (${bePres}) cannot exceed total (${beTotMem})`);
      }
      if (beMtgs > 0 && beHeld > beMtgs) {
        throw new ApiError(400, 'BAD_REQUEST', `${label}: BU Exec held meetings (${beHeld}) cannot exceed total scheduled (${beMtgs})`);
      }

      const bgMtgs = parseInt(r.buGbMeetingsTotal, 10) || 0;
      const bgHeld = parseInt(r.buGbMeetingsHeld, 10) || 0;
      if (bgMtgs > 0 && bgHeld > bgMtgs) {
        throw new ApiError(400, 'BAD_REQUEST', `${label}: BU GB held meetings (${bgHeld}) cannot exceed total scheduled (${bgMtgs})`);
      }

      const memTot = parseInt(r.membershipTotal, 10) || 0;
      const memPres = parseInt(r.membershipPresent, 10) || 0;
      if (memTot > 0 && memPres > memTot) {
        throw new ApiError(400, 'BAD_REQUEST', `${label}: Present members (${memPres}) cannot exceed total membership (${memTot})`);
      }

      const sTot = parseInt(r.studyUnitsComm, 10) || 0;
      const sCount = parseInt(r.studyUnitsCount, 10) || 0;
      if (sTot > 0 && sCount > sTot) {
        throw new ApiError(400, 'BAD_REQUEST', `${label}: Units conducting study circles (${sCount}) cannot exceed total (${sTot})`);
      }
    }
  }

  // Form 8: District Central & Provincial Committee Members validation
  if (formType === 'form8') {
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const hasData = Object.entries(r).some(
        ([k, v]) => !['srNo', 'activeStatus'].includes(k) && v !== '' && v !== null && v !== 0 && v !== '0'
      );
      if (!hasData) continue;

      const label = (r.name || '').trim() || `Row #${i + 1}`;
      if (!r.name || !r.name.trim()) {
        throw new ApiError(400, 'BAD_REQUEST', `Comrade name is required for row #${i + 1}`);
      }

      const numericFields = [
        'distCommMeeting', 'areaExecMeeting', 'areaCommMeeting', 'ownBuMeeting',
        'buExecMeeting', 'buMeeting', 'psoMeeting', 'conferences', 'seminars',
        'studyCircles', 'inductions', 'publicGatherings', 'totalMeetings',
        'monthlyDues', 'tours', 'contacts', 'officeAttendance', 'bloodBank'
      ];
      for (const f of numericFields) {
        const val = parseInt(r[f], 10);
        if (!isNaN(val) && val < 0) {
          throw new ApiError(400, 'BAD_REQUEST', `${label}: Value for '${f}' cannot be negative (${val})`);
        }
      }

      // Auto-calculate / verify total meetings
      const meetingsSum = (parseInt(r.distCommMeeting, 10) || 0) +
        (parseInt(r.areaExecMeeting, 10) || 0) +
        (parseInt(r.areaCommMeeting, 10) || 0) +
        (parseInt(r.ownBuMeeting, 10) || 0) +
        (parseInt(r.buExecMeeting, 10) || 0) +
        (parseInt(r.buMeeting, 10) || 0) +
        (parseInt(r.psoMeeting, 10) || 0) +
        (parseInt(r.conferences, 10) || 0) +
        (parseInt(r.seminars, 10) || 0) +
        (parseInt(r.studyCircles, 10) || 0) +
        (parseInt(r.inductions, 10) || 0) +
        (parseInt(r.publicGatherings, 10) || 0);

      r.totalMeetings = meetingsSum;
    }
  }

  // Form 9: District Central & Provincial Organs Members validation
  if (formType === 'form9') {
    const sec1 = Array.isArray(data?.sec1Members) ? data.sec1Members : [];
    for (let i = 0; i < sec1.length; i++) {
      const r = sec1[i];
      const hasData = Object.entries(r).some(
        ([k, v]) => !['srNo', 'memberId'].includes(k) && v !== '' && v !== null && v !== 0 && v !== '0'
      );
      if (!hasData) continue;
      const numFields = [
        'distExecMeeting', 'distCommMeeting', 'areaExecMeeting', 'areaCommMeeting',
        'buExecMeeting', 'buGbMeeting', 'psoMeeting', 'conferences', 'seminars',
        'studyCircles', 'inductions', 'alliesMeeting', 'publicGatherings',
        'totalMeetings', 'dues', 'tours'
      ];
      for (const f of numFields) {
        const val = parseInt(r[f], 10);
        if (!isNaN(val) && val < 0) {
          throw new ApiError(400, 'BAD_REQUEST', `Section 1 Comrade #${i + 1} (${r.name || 'Unnamed'}): Negative value for '${f}' is not allowed`);
        }
      }
      // Auto-sum meetings
      r.totalMeetings = (parseInt(r.distExecMeeting, 10) || 0) +
        (parseInt(r.distCommMeeting, 10) || 0) +
        (parseInt(r.areaExecMeeting, 10) || 0) +
        (parseInt(r.areaCommMeeting, 10) || 0) +
        (parseInt(r.buExecMeeting, 10) || 0) +
        (parseInt(r.buGbMeeting, 10) || 0) +
        (parseInt(r.psoMeeting, 10) || 0) +
        (parseInt(r.conferences, 10) || 0) +
        (parseInt(r.seminars, 10) || 0) +
        (parseInt(r.studyCircles, 10) || 0) +
        (parseInt(r.inductions, 10) || 0) +
        (parseInt(r.alliesMeeting, 10) || 0) +
        (parseInt(r.publicGatherings, 10) || 0);
    }

    if (data?.sec4BloodBank) {
      const b = data.sec4BloodBank;
      ['eidHidesCount', 'cash', 'totalCash', 'zakat'].forEach((f) => {
        const val = parseInt(b[f], 10);
        if (!isNaN(val) && val < 0) {
          throw new ApiError(400, 'BAD_REQUEST', `Section 4 Blood Bank: Value for '${f}' cannot be negative`);
        }
      });
    }
  }

  const buRecord = formType === 'form4' ? await BasicUnit.findById(effectiveUnitId).lean() : null;
  const resolvedAreaId = formType === 'form4' ? (areaId || buRecord?.areaId || effectiveUnitId) : (['form5', 'form6', 'form7', 'form8'].includes(formType) ? undefined : (unitLevel === 'AREA' ? effectiveUnitId : (areaId || undefined)));
  const resolvedDistrictId = ['form6', 'form7', 'form8'].includes(formType) ? effectiveUnitId : (unitLevel === 'DISTRICT' ? effectiveUnitId : (districtId || buRecord?.districtId || undefined));

  const existingDoc = await ProformaReport.findOne({ formType, unitId: effectiveUnitId, year: y, month: m }).lean();

  const isOfficialSubmit = status === 'SUBMITTED' || status === 'APPROVED';
  const effectiveStatus = isOfficialSubmit
    ? status
    : (existingDoc?.status === 'SUBMITTED' || existingDoc?.status === 'APPROVED' ? existingDoc.status : 'DRAFT');

  const updateFields = {
    formType,
    unitLevel: unitLevel || (formType === 'form4' ? 'BASIC_UNIT' : (formType === 'form5' ? 'PROVINCE' : (['form6', 'form7', 'form8'].includes(formType) ? 'DISTRICT' : 'AREA'))),
    unitId: effectiveUnitId,
    unitName: unitName || data.unitName || data.areaName || data.districtName || data.provinceName || buRecord?.name || '',
    areaId: resolvedAreaId,
    districtId: resolvedDistrictId,
    provinceId: provinceId || buRecord?.provinceId || undefined,
    year: y,
    month: m,
    data,
    status: effectiveStatus,
    notes,
  };

  if (isOfficialSubmit) {
    updateFields.submittedBy = req.user._id;
    updateFields.submittedByName = req.user.fullName || req.user.name || req.user.email || 'Officer';
    updateFields.submittedByRole = primaryRole;
    updateFields.submittedAt = new Date();
  } else if (!existingDoc || existingDoc.status === 'DRAFT') {
    updateFields.submittedBy = null;
    updateFields.submittedByName = '';
    updateFields.submittedByRole = '';
    updateFields.submittedAt = null;
  }

  const doc = await ProformaReport.findOneAndUpdate(
    { formType, unitId: effectiveUnitId, year: y, month: m },
    updateFields,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return res.json({
    success: true,
    exists: isOfficialSubmit,
    isDraft: effectiveStatus === 'DRAFT',
    message: isOfficialSubmit ? 'Report saved and stored in database successfully' : 'Draft saved successfully',
    report: doc,
    data: doc.data,
    metadata: {
      submittedByName: isOfficialSubmit ? (doc.submittedByName || '') : '',
      submittedByRole: isOfficialSubmit ? (doc.submittedByRole || '') : '',
      submittedAt: isOfficialSubmit ? (doc.submittedAt || doc.updatedAt) : null,
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

// 4. POST /api/proforma/reset
// Deletes or resets an entered report back to fresh baseline draft
exports.resetProformaReport = asyncHandler(async (req, res) => {
  const { formType, unitId, areaId, provinceId, year, month } = req.body;
  if (!formType || !year || !month) {
    throw new ApiError(400, 'BAD_REQUEST', 'formType, year, and month are required');
  }

  let targetId = unitId;
  let unitLevel = 'BASIC_UNIT';
  if (['form1', 'form2', 'form3'].includes(formType)) {
    targetId = areaId || unitId;
    unitLevel = 'AREA';
    const a = await Area.findById(targetId).lean();
    if (!a) {
      const bu = await BasicUnit.findById(targetId).lean();
      if (bu?.areaId) targetId = bu.areaId.toString();
    }
  } else if (formType === 'form4') {
    targetId = unitId;
    unitLevel = 'BASIC_UNIT';
  } else if (formType === 'form5') {
    targetId = provinceId || unitId;
    unitLevel = 'PROVINCE';
  } else if (['form6', 'form7', 'form8'].includes(formType)) {
    targetId = req.body.districtId || unitId;
    unitLevel = 'DISTRICT';
  } else if (formType === 'form9') {
    targetId = req.body.districtId || req.body.areaId || unitId;
    const dist = await District.findById(targetId).lean();
    if (dist) unitLevel = 'DISTRICT';
    else {
      const a = await Area.findById(targetId).lean();
      if (a) unitLevel = 'AREA';
      else unitLevel = 'DISTRICT';
    }
  }

  if (!targetId) {
    throw new ApiError(400, 'BAD_REQUEST', 'Target unit ID is required');
  }

  const canEdit = checkCanEdit(req.user, formType, unitLevel);
  if (!canEdit) {
    throw new ApiError(403, 'FORBIDDEN', 'You do not have permission to reset this proforma report.');
  }

  const y = parseInt(year, 10);
  const m = parseInt(month, 10);

  await ProformaReport.deleteOne({
    formType,
    unitId: targetId,
    year: y,
    month: m,
  });

  return res.json({
    success: true,
    message: 'Report reset to fresh draft successfully',
  });
});
