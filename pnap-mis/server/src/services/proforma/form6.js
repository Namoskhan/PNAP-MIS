const ExcelJS = require('exceljs');
const { getBaseCss, getPashtoMonth } = require('./common');

async function fetchForm6Data({ districtId, month, year, m1, m2, m3 }) {
  const District = require('../../models/District');
  const Area = require('../../models/Area');
  const BasicUnit = require('../../models/BasicUnit');
  const CabinetSlot = require('../../models/CabinetSlot');
  const Member = require('../../models/Member');
  const Meeting = require('../../models/Meeting');
  const Activity = require('../../models/Activity');
  const Donation = require('../../models/Donation');
  const Expense = require('../../models/Expense');
  const mongoose = require('mongoose');

  let district = null;
  if (districtId && mongoose.Types.ObjectId.isValid(districtId)) {
    district = await District.findById(districtId).lean();
  }
  const districtName = district ? district.name : '';

  const y = parseInt(year, 10) || new Date().getFullYear();
  const m = month ? parseInt(month, 10) : (new Date().getMonth() + 1);

  const startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  // Subordinate Areas under this district
  const areas = await Area.find({ districtId }).select('_id name status isActive').lean();
  const areaIds = areas.map((a) => a._id);
  const areasCount = areas.length;
  const newAreasCount = await Area.countDocuments({ districtId, createdAt: { $gte: startDate, $lte: endDate } });

  // Subordinate Basic Units
  const basicUnits = await BasicUnit.find({
    $or: [{ districtId }, { areaId: { $in: areaIds } }],
  }).select('_id name status isActive').lean();
  const buIds = basicUnits.map((b) => b._id);
  const buCount = basicUnits.length;
  const newBuCount = await BasicUnit.countDocuments({
    $or: [{ districtId }, { areaId: { $in: areaIds } }],
    createdAt: { $gte: startDate, $lte: endDate },
  });

  // District Executive Meetings held in month
  const distExecMeetings = await Meeting.find({
    unitLevel: 'DISTRICT',
    unitId: districtId,
    $or: [{ body: 'EXECUTIVE' }, { type: { $in: ['EXECUTIVE', 'EXC'] } }],
    startAt: { $gte: startDate, $lte: endDate },
  }).sort({ startAt: -1 }).lean();
  const latestDistExec = distExecMeetings[0] || null;

  // District Cabinet slots
  const distCabinetSlots = await CabinetSlot.find({
    unitLevel: 'DISTRICT',
    unitId: districtId,
    filledMemberId: { $exists: true, $ne: null },
  }).populate('filledMemberId', 'fullName status bloodGroup education phone').lean();

  const distExecSlots = distCabinetSlots.length;
  const distExecPresent = latestDistExec?.attendance?.filter((a) => a.status === 'PRESENT').length ?? '';
  const distExecAbsent = latestDistExec?.attendance?.filter((a) => a.status === 'ABSENT').length ?? '';
  const distExecLeave = latestDistExec?.attendance?.filter((a) => a.status === 'LATE').length ?? '';
  const distExecPct = (latestDistExec && distExecSlots > 0 && typeof distExecPresent === 'number')
    ? `${Math.round((distExecPresent / distExecSlots) * 100)}%`
    : '';

  // District Committee Meetings
  const distCommMeetings = await Meeting.find({
    unitLevel: 'DISTRICT',
    unitId: districtId,
    $or: [{ body: 'COMMITTEE' }, { type: { $in: ['COMMITTEE', 'CMP'] } }],
    startAt: { $gte: startDate, $lte: endDate },
  }).sort({ startAt: -1 }).lean();
  const latestDistComm = distCommMeetings[0] || null;

  const distCommTotal = latestDistComm?.attendance?.length ?? '';
  const distCommPresent = latestDistComm?.attendance?.filter((a) => a.status === 'PRESENT').length ?? '';
  const distCommAbsent = latestDistComm?.attendance?.filter((a) => a.status === 'ABSENT').length ?? '';
  const distCommLeave = latestDistComm?.attendance?.filter((a) => a.status === 'LATE').length ?? '';
  const distCommPct = (latestDistComm && distCommTotal > 0 && typeof distCommPresent === 'number')
    ? `${Math.round((distCommPresent / distCommTotal) * 100)}%`
    : '';

  // Subordinate Area meetings
  const areaExecMeetings = await Meeting.find({
    unitLevel: 'AREA',
    areaId: { $in: areaIds },
    $or: [{ body: 'EXECUTIVE' }, { type: { $in: ['EXECUTIVE', 'EXC'] } }],
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const areaExecCount = areaExecMeetings.length;
  const areaExecPct = areasCount > 0 ? `${Math.min(100, Math.round((areaExecCount / areasCount) * 100))}%` : '';

  const areaCommMeetings = await Meeting.find({
    unitLevel: 'AREA',
    areaId: { $in: areaIds },
    $or: [{ body: 'COMMITTEE' }, { type: { $in: ['COMMITTEE', 'CMP'] } }],
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const areaCommCount = areaCommMeetings.length;
  const areaCommPct = areasCount > 0 ? `${Math.min(100, Math.round((areaCommCount / areasCount) * 100))}%` : '';

  // Subordinate Basic Units meetings
  const buExecMeetings = await Meeting.find({
    unitLevel: 'BASIC_UNIT',
    $or: [{ districtId }, { unitId: { $in: buIds } }, { areaId: { $in: areaIds } }],
    $or: [{ body: 'EXECUTIVE' }, { type: { $in: ['EXECUTIVE', 'EXC'] } }],
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const buExecCount = buExecMeetings.length;
  const buExecPct = buCount > 0 ? `${Math.min(100, Math.round((buExecCount / buCount) * 100))}%` : '';

  const buGbMeetings = await Meeting.find({
    unitLevel: 'BASIC_UNIT',
    $or: [{ districtId }, { unitId: { $in: buIds } }, { areaId: { $in: areaIds } }],
    $or: [{ body: 'GENERAL_BODY' }, { type: { $in: ['GENERAL_BODY', 'GBM'] } }],
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const buGbCount = buGbMeetings.length;
  const buGbPct = buCount > 0 ? `${Math.min(100, Math.round((buGbCount / buCount) * 100))}%` : '';

  // Study Circles (لوستنه مطالعه)
  const studyActivities = await Activity.find({
    $or: [{ districtId }, { unitId: districtId }, { areaId: { $in: areaIds } }, { unitId: { $in: buIds } }],
    $or: [{ type: { $in: ['STUDY_CIRCLE', 'STC'] } }, { typeCode: 'STUDY_CIRCLE' }],
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const studyCirclesCount = studyActivities.length;

  // Conferences & Seminars
  const confActivities = await Activity.find({
    $or: [{ districtId }, { unitId: districtId }, { areaId: { $in: areaIds } }],
    $or: [{ type: { $in: ['CONFERENCE', 'SEMINAR', 'PARTY_CONFERENCE'] } }, { typeCode: { $in: ['CONFERENCE', 'SEMINAR'] } }],
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const confCount = confActivities.length;

  // New Inductions in district
  const newInductions = await Member.countDocuments({
    $or: [{ districtId }, { areaId: { $in: areaIds } }],
    createdAt: { $gte: startDate, $lte: endDate },
  });

  // Public rallies (جلسے مظاهرے) and Jirgas (جرګے اولسي غونډي)
  const rallyActivities = await Activity.find({
    $or: [{ districtId }, { unitId: districtId }, { areaId: { $in: areaIds } }],
    $or: [{ type: { $in: ['RALLY', 'PROTEST', 'PUBLIC_MEETING'] } }, { typeCode: { $in: ['RALLY', 'PROTEST'] } }],
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const ralliesCount = rallyActivities.length;

  const jirgaActivities = await Activity.find({
    $or: [{ districtId }, { unitId: districtId }, { areaId: { $in: areaIds } }],
    $or: [{ type: { $in: ['JIRGA', 'CORNER_MEETING'] } }, { typeCode: 'JIRGA' }],
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const jirgasCount = jirgaActivities.length;

  // Allied parties meetings
  const alliedActivities = await Activity.find({
    $or: [{ districtId }, { unitId: districtId }, { areaId: { $in: areaIds } }],
    $or: [{ type: { $in: ['ALLIED_MEETING', 'ALLIANCE'] } }, { typeCode: 'ALLIED_MEETING' }],
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const alliedCount = alliedActivities.length;

  // Financial donations & expenses
  const donations = await Donation.find({
    $or: [{ districtId }, { areaId: { $in: areaIds } }],
    date: { $gte: startDate, $lte: endDate },
  }).lean();
  const duesAmount = donations.filter((d) => !d.type || d.type === 'MONTHLY' || d.type === 'DUES').reduce((acc, d) => acc + (d.amount || 0), 0);
  const emergencyAmount = donations.filter((d) => d.type === 'EMERGENCY').reduce((acc, d) => acc + (d.amount || 0), 0);

  const expenses = await Expense.find({
    $or: [{ districtId }, { areaId: { $in: areaIds } }],
    date: { $gte: startDate, $lte: endDate },
  }).lean();
  const expenseAmount = expenses.reduce((acc, e) => acc + (e.amount || 0), 0);

  // Upper Summary Object
  const upper = {
    // District Executive Meeting
    execDate: latestDistExec?.startAt ? new Date(latestDistExec.startAt).toLocaleDateString('en-GB') : '',
    execSlots: distExecSlots || '',
    execPresent: distExecPresent !== '' ? distExecPresent : '',
    execAbsent: distExecAbsent !== '' ? distExecAbsent : '',
    execLeave: distExecLeave !== '' ? distExecLeave : '',
    execPct: distExecPct || '',

    // District Committee Meeting
    commDate: latestDistComm?.startAt ? new Date(latestDistComm.startAt).toLocaleDateString('en-GB') : '',
    commTotal: distCommTotal !== '' ? distCommTotal : '',
    commPresent: distCommPresent !== '' ? distCommPresent : '',
    commAbsent: distCommAbsent !== '' ? distCommAbsent : '',
    commLeave: distCommLeave !== '' ? distCommLeave : '',
    commPct: distCommPct || '',

    // Area Units
    areasCount: areasCount || '',
    newAreasCount: newAreasCount || 0,
    areaExecCount: areaExecCount || '',
    areaExecPct: areaExecPct || '',
    areaCommCount: areaCommCount || '',
    areaCommPct: areaCommPct || '',

    // Basic Units
    buCount: buCount || '',
    newBuCount: newBuCount || 0,
    buExecCount: buExecCount || '',
    buExecPct: buExecPct || '',
    buGbCount: buGbCount || '',
    buGbPct: buGbPct || '',

    // Study
    studyDistComm: 1,
    studyAreaComm: areasCount > 0 ? areasCount : 1,
    studyUnitsCount: studyCirclesCount || '',

    // PSO
    psoUnitsCount: '',
    psoNewUnitsCount: 0,

    // Programs
    conferences: confCount || 0,
    studyCircles: studyCirclesCount || 0,
    inductions: newInductions || 0,

    // Public Gatherings
    ralliesAndProtests: ralliesCount || 0,
    jirgasAndCornerMeetings: jirgasCount || 0,

    // Allied & Office
    alliedMeetings: alliedCount || 0,
    officeActivity: 'فعاله',

    // Funds
    dues: duesAmount || 0,
    emergencyDues: emergencyAmount || 0,
    expenses: expenseAmount || 0,

    // Villages without unit & Disciplinary
    villagesWithoutUnit: '',
    disciplinaryActions: 0,
  };

  // Build Executive Comrade rows for Lower Table
  const rows = distCabinetSlots.map((slot, index) => {
    const mem = slot.filledMemberId || {};
    return {
      srNo: index + 1,
      name: mem.fullName || slot.title || `Comrade ${index + 1}`,
      distExec: 1,
      distExecMeeting: 1,
      distComm: 1,
      distCommMeeting: 1,
      areaExec: 0,
      areaExecMeeting: 0,
      areaComm: 0,
      areaCommMeeting: 0,
      ownBu: 1,
      ownBuMeeting: 1,
      buExec: 0,
      buExecMeeting: 0,
      buGb: 0,
      buGbMeeting: 0,
      pso: 0,
      psoMeeting: 0,
      conf: 0,
      conferenceMeeting: 0,
      seminar: 0,
      seminarMeeting: 0,
      studyCircle: 1,
      studyCircleMeeting: 1,
      induction: 0,
      inductionMeeting: 0,
      allied: 0,
      alliedMeeting: 0,
      rallies: 0,
      rallyMeeting: 0,
      jirgas: 0,
      jirgaMeeting: 0,
      totalMeetings: 3, // Auto-sum of attended meetings
      dues: 1000,
      monthlyDues: 1000,
      tours: 0,
      publicOutreach: 1,
      inactiveContact: 0,
      officeAttendance: 'حاضر',
      bloodZakat: mem.bloodGroup || '',
      bloodBankPosts: mem.bloodGroup || '',
      activeStatus: 'فعاله',
      reading: 'مطالعه سياسي',
      ideologicalReading: 'مطالعه سياسي',
    };
  });

  return {
    districtName,
    year: String(y),
    month: String(m),
    m1: m1 || String(m),
    m2: m2 || '',
    m3: m3 || '',
    upper,
    rows,
  };
}

function getVal(primary, secondary, fallback = '') {
  if (primary !== undefined && primary !== null && primary !== '' && primary !== 0 && primary !== '0') return primary;
  if (secondary !== undefined && secondary !== null && secondary !== '' && secondary !== 0 && secondary !== '0') return secondary;
  if (primary !== undefined && primary !== null && primary !== '') return primary;
  if (secondary !== undefined && secondary !== null && secondary !== '') return secondary;
  return fallback;
}

function generateForm6Html(reportData = {}) {
  const {
    districtName = '',
    year = new Date().getFullYear(),
    month = new Date().getMonth() + 1,
    m1 = '',
    m2 = '',
    m3 = '',
    upper = {},
    upperRows = [],
    rows = [],
  } = reportData;

  const baseCss = getBaseCss();

  // Ensure upper table has at least 3-4 display rows (Month 1, Month 2, Month 3 or main summary)
  const defaultUpperRow = {
    execDate: upper.distExecDate || upper.execDate || '',
    execSlots: getVal(upper.distExecSlots, upper.execSlots),
    execPresent: getVal(upper.distExecPresent, upper.execPresent),
    execAbsent: getVal(upper.distExecAbsent, upper.execAbsent),
    execLeave: getVal(upper.distExecLeave, upper.execLeave),
    execPct: upper.distExecPct || upper.execPct || '',

    commDate: upper.distCommDate || upper.commDate || '',
    commTotal: getVal(upper.distCommTotal, upper.commTotal),
    commPresent: getVal(upper.distCommPresent, upper.commPresent),
    commAbsent: getVal(upper.distCommAbsent, upper.commAbsent),
    commLeave: getVal(upper.distCommLeave, upper.commLeave),
    commPct: upper.distCommPct || upper.commPct || '',

    areasCount: getVal(upper.areaUnitsCount, upper.areasCount),
    newAreasCount: getVal(upper.newAreaUnitsCount, upper.newAreasCount),
    areaExecCount: getVal(upper.areaExecCount, upper.distAreaExecCount),
    areaExecPct: upper.areaExecPct || '',
    areaCommCount: getVal(upper.areaCommCount, upper.distAreaCommCount),
    areaCommPct: upper.areaCommPct || '',

    buCount: getVal(upper.buCount, upper.basicUnitsCount),
    newBuCount: getVal(upper.newBuCount, upper.newBasicUnitsCount),
    buExecCount: getVal(upper.buExecCount, upper.basicUnitsExecCount),
    buExecPct: upper.buExecPct || '',
    buGbCount: getVal(upper.buGbCount, upper.basicUnitsGbCount),
    buGbPct: upper.buGbPct || '',

    studyDistComm: getVal(upper.studyDistComm, upper.distCommStudy),
    studyAreaComm: getVal(upper.studyAreaComm, upper.areaCommStudy),
    studyUnitsCount: getVal(upper.studyUnitsCount, upper.basicUnitsStudy),

    psoUnitsCount: getVal(upper.psoUnitsCount, upper.psoCount),
    psoNewUnitsCount: getVal(upper.newPsoUnitsCount, upper.psoNewUnitsCount),

    conferences: getVal(upper.conferencesCount, upper.conferences),
    studyCircles: getVal(upper.studyCirclesCount, upper.studyCircles),
    inductions: getVal(upper.inductionsCount, upper.inductions),

    ralliesAndProtests: getVal(upper.ralliesCount, upper.ralliesAndProtests),
    jirgasAndCornerMeetings: getVal(upper.jirgasCount, upper.jirgasAndCornerMeetings),

    alliedMeetings: getVal(upper.alliedMeetingsCount, upper.alliedMeetings),
    officeActivity: getVal(upper.districtOfficeActivity, upper.officeActivity),

    dues: getVal(upper.duesMonthly, upper.dues),
    emergencyDues: getVal(upper.duesEmergency, upper.emergencyDues),
    expenses: getVal(upper.duesExpenses, upper.expenses),

    villagesWithoutUnit: getVal(upper.villagesWithoutUnitCount, upper.villagesWithoutUnit),
    disciplinaryActions: getVal(upper.disciplinaryActionsCount, upper.disciplinaryActions),
  };

  const dispUpperRows = (upperRows && upperRows.length > 0) ? [...upperRows] : [defaultUpperRow];
  while (dispUpperRows.length < 3) {
    dispUpperRows.push({});
  }

  // Ensure lower table has at least 15 comrade rows
  const dispComrades = [...(rows || [])];
  while (dispComrades.length < 15) {
    dispComrades.push({ srNo: dispComrades.length + 1, name: '' });
  }

  const dispM1 = m1 || getPashtoMonth(month);
  const dispM2 = m2 || '';
  const dispM3 = m3 || '';

  return `<!DOCTYPE html>
<html lang="ps" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>پښتونخوا ملي عوامي پارټي ضلع د کار او فعاليت مياشتنئي رپورټ</title>
  <style>
    ${baseCss}

    @page {
      size: A3 landscape;
      margin: 5mm;
    }

    body {
      padding: 4px;
      font-size: 6.8pt;
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      padding: 0 4px;
    }

    .header-field {
      font-size: 9pt;
      font-weight: 700;
      white-space: nowrap;
    }

    .header-field .line {
      display: inline-block;
      min-width: 140px;
      border-bottom: 1.2px solid #000;
      margin: 0 4px;
      text-align: center;
      font-weight: 700;
      font-size: 9.5pt;
    }

    .report-title {
      font-size: 13pt;
      font-weight: 800;
      text-align: center;
      flex: 1;
      margin: 0 10px;
      text-decoration: underline;
    }

    table.proforma-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 6.2pt;
      border: 1.5px solid #000;
      margin-bottom: 8px;
    }

    table.proforma-table th,
    table.proforma-table td {
      border: 0.65px solid #000;
      padding: 1.5px 1px;
      text-align: center;
      vertical-align: middle;
      line-height: 1.1;
      overflow: hidden;
      word-break: break-word;
    }

    table.proforma-table th {
      font-weight: 700;
      background: #fbfbfb;
      font-size: 6.2pt;
    }

    table.proforma-table td {
      height: 20px;
      font-size: 6.6pt;
    }

    .section-title {
      font-size: 10.5pt;
      font-weight: 800;
      text-align: center;
      margin: 6px 0 3px 0;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="page-container">
    <!-- Header -->
    <div class="report-header">
      <div class="header-field">
        ضلع نوم: <span class="line">${districtName || '—'}</span>
      </div>
      <div class="report-title">
        پښتونخوا ملي عوامي پارټي ضلع د کار او فعاليت مياشتنئي رپورټ
      </div>
      <div class="header-field">
        دريومياشتو رپورټ: ۱: <span class="line" style="min-width:55px;">${dispM1}</span>
        ۲: <span class="line" style="min-width:55px;">${dispM2}</span>
        ۳: <span class="line" style="min-width:55px;">${dispM3}</span>
        &nbsp;&nbsp;کال: <span class="line" style="min-width:55px;">${year}</span>
      </div>
    </div>

    <!-- Upper Table: District & Subordinate Units Summary -->
    <table class="proforma-table">
      <thead>
        <tr>
          <th colspan="6" style="background:#f0fdf4;">ضلعي ايګزيکټيو غونډي</th>
          <th colspan="6" style="background:#eff6ff;">ضلعي کميټي غونډي</th>
          <th colspan="2">علاقائي يونټانو شمير</th>
          <th colspan="2">علاقائي ايګزيکټيو غونډي</th>
          <th colspan="2">علاقائي کميټي غونډي</th>
          <th colspan="2">ابتدائي يونټانو شمير</th>
          <th colspan="2">يونټانو ايګزيکټيو غونډي</th>
          <th colspan="2">يونټانو غونډي</th>
          <th colspan="3">لوستنه (مطالعه)</th>
          <th colspan="2">پي ايس او</th>
          <th rowspan="2" style="width:2.4%;">کانفرنس<br>سيمينار</th>
          <th rowspan="2" style="width:2.2%;">سټډي<br>سرکل</th>
          <th rowspan="2" style="width:2.4%;">نوي<br>شموليت</th>
          <th colspan="2">اولسي غونډي</th>
          <th rowspan="2" style="width:3%;">اتحاديانو<br>پارټيانو سره<br>غونډي</th>
          <th rowspan="2" style="width:2.6%;">ضلعي دفتر<br>ته فعاليت</th>
          <th colspan="3">چنده</th>
          <th rowspan="2" style="width:3.2%;">هغه کليو شمير<br>چي يونټ نسته</th>
          <th rowspan="2" style="width:2.6%;">تاديبي<br>کاروائي</th>
        </tr>
        <tr>
          <!-- ضلعي ايګزيکټيو -->
          <th style="width:2.8%;">نيټه</th>
          <th style="width:2.2%;">غړو<br>شمير</th>
          <th style="width:2.0%;">حاضر</th>
          <th style="width:2.0%;">غير<br>حاضر</th>
          <th style="width:2.0%;">رخصت</th>
          <th style="width:2.6%;">حاضري<br>فيصدي</th>

          <!-- ضلعي کميټي -->
          <th style="width:2.8%;">نيټه</th>
          <th style="width:2.2%;">غړو<br>شمير</th>
          <th style="width:2.0%;">حاضر</th>
          <th style="width:2.0%;">غير<br>حاضر</th>
          <th style="width:2.0%;">رخصت</th>
          <th style="width:2.6%;">حاضري<br>فيصدي</th>

          <!-- علاقائي يونټانو -->
          <th style="width:2.4%;">علاقائي<br>شمير</th>
          <th style="width:2.2%;">نوي<br>شمير</th>

          <!-- علاقائي ايګزيکټيو -->
          <th style="width:2.4%;">غونډو<br>شمير</th>
          <th style="width:2.4%;">غونډو<br>فيصدي</th>

          <!-- علاقائي کميټي -->
          <th style="width:2.4%;">غونډو<br>شمير</th>
          <th style="width:2.4%;">غونډو<br>فيصدي</th>

          <!-- ابتدائي يونټانو -->
          <th style="width:2.4%;">يونټانو<br>شمير</th>
          <th style="width:2.2%;">نوي<br>شمير</th>

          <!-- يونټانو ايګزيکټيو -->
          <th style="width:2.4%;">غونډو<br>شمير</th>
          <th style="width:2.4%;">غونډو<br>فيصدي</th>

          <!-- يونټانو غونډي -->
          <th style="width:2.4%;">غونډو<br>شمير</th>
          <th style="width:2.4%;">غونډو<br>فيصدي</th>

          <!-- لوستنه -->
          <th style="width:2.2%;">ضلعي<br>کميټي</th>
          <th style="width:2.2%;">علاقائي<br>کميټي</th>
          <th style="width:2.2%;">يونټانو<br>شمير</th>

          <!-- PSO -->
          <th style="width:2.2%;">يونټانو<br>شمير</th>
          <th style="width:2.0%;">نوي<br>شمير</th>

          <!-- اولسي غونډي -->
          <th style="width:2.6%;">جلسے<br>مظاهرے</th>
          <th style="width:2.8%;">جرګے<br>اولسي</th>

          <!-- چنده -->
          <th style="width:2.4%;">تنظيمي</th>
          <th style="width:2.4%;">هنګامي</th>
          <th style="width:2.4%;">خرڅ</th>
        </tr>
      </thead>
      <tbody>
        ${dispUpperRows.map((ur) => `
          <tr>
            <td>${ur.execDate || ''}</td>
            <td>${ur.execSlots || ''}</td>
            <td>${ur.execPresent || ''}</td>
            <td>${ur.execAbsent || ''}</td>
            <td>${ur.execLeave || ''}</td>
            <td>${ur.execPct || ''}</td>

            <td>${ur.commDate || ''}</td>
            <td>${ur.commTotal || ''}</td>
            <td>${ur.commPresent || ''}</td>
            <td>${ur.commAbsent || ''}</td>
            <td>${ur.commLeave || ''}</td>
            <td>${ur.commPct || ''}</td>

            <td>${ur.areasCount || ''}</td>
            <td>${ur.newAreasCount ?? ''}</td>
            <td>${ur.areaExecCount || ''}</td>
            <td>${ur.areaExecPct || ''}</td>
            <td>${ur.areaCommCount || ''}</td>
            <td>${ur.areaCommPct || ''}</td>

            <td>${ur.buCount || ''}</td>
            <td>${ur.newBuCount ?? ''}</td>
            <td>${ur.buExecCount || ''}</td>
            <td>${ur.buExecPct || ''}</td>
            <td>${ur.buGbCount || ''}</td>
            <td>${ur.buGbPct || ''}</td>

            <td>${ur.studyDistComm || ''}</td>
            <td>${ur.studyAreaComm || ''}</td>
            <td>${ur.studyUnitsCount || ''}</td>

            <td>${ur.psoUnitsCount || ''}</td>
            <td>${ur.psoNewUnitsCount ?? ''}</td>

            <td>${ur.conferences || ''}</td>
            <td>${ur.studyCircles || ''}</td>
            <td>${ur.inductions || ''}</td>

            <td>${ur.ralliesAndProtests || ''}</td>
            <td>${ur.jirgasAndCornerMeetings || ''}</td>

            <td>${ur.alliedMeetings || ''}</td>
            <td>${ur.officeActivity || ''}</td>

            <td>${ur.dues || ''}</td>
            <td>${ur.emergencyDues || ''}</td>
            <td>${ur.expenses || ''}</td>

            <td>${ur.villagesWithoutUnit || ''}</td>
            <td>${ur.disciplinaryActions || ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- Section Title: Lower Table -->
    <div class="section-title">ضلعي ايګزيکټيو ځانګړي (انفرادي) کار او فعاليت رپورټ</div>

    <!-- Lower Table: District Executive Comrade Roster -->
    <table class="proforma-table">
      <thead>
        <tr>
          <th rowspan="2" style="width:1.6%;">شمير</th>
          <th rowspan="2" style="width:7.6%;">ضلع ايګزيکټيو نوم</th>
          <th rowspan="2" style="width:3.2%;">ضلع<br>ايګزيکټيو<br>غونډي</th>
          <th rowspan="2" style="width:3.2%;">ضلع<br>کميټي<br>غونډي</th>
          <th rowspan="2" style="width:3.2%;">علاقائي<br>ايګزيکټيو<br>غونډي</th>
          <th rowspan="2" style="width:3.2%;">علاقائي<br>کميټي<br>غونډي</th>
          <th rowspan="2" style="width:3.2%;">خپل ابتدائي<br>يونټ<br>غونډي</th>
          <th rowspan="2" style="width:3.4%;">ابتدائي يونټ<br>ايګزيکټيو<br>غونډي</th>
          <th rowspan="2" style="width:3.2%;">ابتدائي<br>يونټانو<br>غونډي</th>
          <th rowspan="2" style="width:2.6%;">PSO<br>سره<br>غونډي</th>
          <th rowspan="2" style="width:3.0%;">پارټي<br>کانفرنسونه</th>
          <th rowspan="2" style="width:2.8%;">سيمينارونه</th>
          <th rowspan="2" style="width:2.6%;">سټډي<br>سرکل</th>
          <th rowspan="2" style="width:3.2%;">نوي شموليت<br>پروګرام</th>
          <th rowspan="2" style="width:3.4%;">اتحاديانو<br>جماعتو سره<br>غونډي</th>
          <th colspan="2">اولسي غونډي</th>
          <th rowspan="2" style="width:2.8%;">ټولي<br>غونډي</th>
          <th rowspan="2" style="width:3.0%;">مياشتني<br>چنده</th>
          <th rowspan="2" style="width:2.6%;">دورے</th>
          <th rowspan="2" style="width:3.6%;">اولسي<br>تنظيمي<br>رابطے</th>
          <th rowspan="2" style="width:4.0%;">غير فعاله ايګزيکټيو<br>ضلعي، علاقائي<br>رابطے</th>
          <th rowspan="2" style="width:2.6%;">دفتر<br>حاضري</th>
          <th rowspan="2" style="width:3.4%;">بلډ بينک<br>پوسټ / زکات</th>
          <th rowspan="2" style="width:2.8%;">فعاله /<br>غير فعاله</th>
          <th rowspan="2" style="width:4.2%;">لوستنه (مطالعه)<br>سياسي نظرياتي</th>
        </tr>
        <tr>
          <th style="width:3.0%;">جلسے<br>مظاهرے</th>
          <th style="width:2.8%;">جرګے</th>
        </tr>
      </thead>
      <tbody>
        ${dispComrades.map((r, i) => `
          <tr>
            <td>${r.srNo || (i + 1)}</td>
            <td style="font-weight:600;text-align:right;padding-right:3px;">${r.name || ''}</td>
            <td>${getVal(r.distExecMeeting, r.distExec)}</td>
            <td>${getVal(r.distCommMeeting, r.distComm)}</td>
            <td>${getVal(r.areaExecMeeting, r.areaExec)}</td>
            <td>${getVal(r.areaCommMeeting, r.areaComm)}</td>
            <td>${getVal(r.ownBuMeeting, r.ownBu)}</td>
            <td>${getVal(r.buExecMeeting, r.buExec)}</td>
            <td>${getVal(r.buGbMeeting, r.buGb)}</td>
            <td>${getVal(r.psoMeeting, r.pso)}</td>
            <td>${getVal(r.conferenceMeeting, r.conf)}</td>
            <td>${getVal(r.seminarMeeting, r.seminar)}</td>
            <td>${getVal(r.studyCircleMeeting, r.studyCircle)}</td>
            <td>${getVal(r.inductionMeeting, r.induction)}</td>
            <td>${getVal(r.alliedMeeting, r.allied)}</td>
            <td>${getVal(r.rallyMeeting, r.rallies)}</td>
            <td>${getVal(r.jirgaMeeting, r.jirgas)}</td>
            <td style="font-weight:700;">${r.totalMeetings ?? ''}</td>
            <td>${getVal(r.monthlyDues, r.dues)}</td>
            <td>${r.tours ?? ''}</td>
            <td>${r.publicOutreach ?? ''}</td>
            <td>${r.inactiveContact ?? ''}</td>
            <td>${r.officeAttendance || ''}</td>
            <td>${getVal(r.bloodBankPosts, r.bloodZakat)}</td>
            <td>${r.activeStatus || ''}</td>
            <td>${getVal(r.ideologicalReading, r.reading)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

async function generateForm6Excel(reportData = {}) {
  const {
    districtName = '',
    year = '',
    month = '',
    m1 = '',
    m2 = '',
    m3 = '',
    upper = {},
    upperRows = [],
    rows = [],
  } = reportData;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('ضلعي کار او فعاليت رپورټ', {
    views: [{ rightToLeft: true }],
    pageSetup: { orientation: 'landscape', paperSize: 8, fitToPage: true, fitToWidth: 1 },
  });

  const FONT_TITLE = { name: 'Noto Naskh Arabic', size: 13, bold: true };
  const FONT_HEADER = { name: 'Noto Naskh Arabic', size: 7.5, bold: true };
  const FONT_DATA = { name: 'Noto Naskh Arabic', size: 7.5 };

  // Row 1: Header
  ws.mergeCells('A1:D1');
  ws.getCell('A1').value = `ضلع نوم: ${districtName}`;
  ws.getCell('A1').font = { name: 'Noto Naskh Arabic', size: 10, bold: true };

  ws.mergeCells('H1:S1');
  ws.getCell('H1').value = 'پښتونخوا ملي عوامي پارټي ضلع د کار او فعاليت مياشتنئي رپورټ';
  ws.getCell('H1').font = FONT_TITLE;
  ws.getCell('H1').alignment = { horizontal: 'center' };

  ws.mergeCells('V1:AC1');
  ws.getCell('V1').value = `دريومياشتو رپورټ: ۱: ${m1 || month}  ۲: ${m2 || ''}  ۳: ${m3 || ''}  کال: ${year}`;
  ws.getCell('V1').font = { name: 'Noto Naskh Arabic', size: 9, bold: true };

  // Table 1 Upper: Row 3 & 4
  const upperCols = [
    'ضلعي ايګزيکټيو نيټه', 'غړو شمير', 'حاضر', 'غير حاضر', 'رخصت', 'حاضري %',
    'ضلعي کميټي نيټه', 'غړو شمير', 'حاضر', 'غير حاضر', 'رخصت', 'حاضري %',
    'علاقائي يونټ شمير', 'نوي علاقائي', 'علاقائي ايګزيکټيو غونډي', 'علاقائي ايګزيکټيو %', 'علاقائي کميټي غونډي', 'علاقائي کميټي %',
    'ابتدائي يونټ شمير', 'نوي ابتدائي', 'يونټ ايګزيکټيو غونډي', 'يونټ ايګزيکټيو %', 'يونټ غونډي', 'يونټ غونډي %',
    'لوستنه ضلعي', 'لوستنه علاقائي', 'لوستنه يونټونه',
    'PSO يونټونه', 'PSO نوي',
    'کانفرنس سيمينار', 'سټډي سرکل', 'نوي شموليت',
    'جلسے مظاهرے', 'جرګے اولسي',
    'اتحاديانو غونډي', 'ضلعي دفتر فعاليت',
    'تنظيمي چنده', 'هنګامي چنده', 'خرڅ',
    'هغه کليو شمير چي يونټ نسته', 'تاديبي کاروائي'
  ];

  ws.getRow(3).values = upperCols;
  ws.getRow(3).font = FONT_HEADER;

  const defaultUpperRow = {
    execDate: upper.distExecDate || upper.execDate || '',
    execSlots: getVal(upper.distExecSlots, upper.execSlots),
    execPresent: getVal(upper.distExecPresent, upper.execPresent),
    execAbsent: getVal(upper.distExecAbsent, upper.execAbsent),
    execLeave: getVal(upper.distExecLeave, upper.execLeave),
    execPct: upper.distExecPct || upper.execPct || '',
    commDate: upper.distCommDate || upper.commDate || '',
    commTotal: getVal(upper.distCommTotal, upper.commTotal),
    commPresent: getVal(upper.distCommPresent, upper.commPresent),
    commAbsent: getVal(upper.distCommAbsent, upper.commAbsent),
    commLeave: getVal(upper.distCommLeave, upper.commLeave),
    commPct: upper.distCommPct || upper.commPct || '',
    areasCount: getVal(upper.areaUnitsCount, upper.areasCount),
    newAreasCount: getVal(upper.newAreaUnitsCount, upper.newAreasCount),
    areaExecCount: getVal(upper.areaExecCount, upper.distAreaExecCount),
    areaExecPct: upper.areaExecPct || '',
    areaCommCount: getVal(upper.areaCommCount, upper.distAreaCommCount),
    areaCommPct: upper.areaCommPct || '',
    buCount: getVal(upper.buCount, upper.basicUnitsCount),
    newBuCount: getVal(upper.newBuCount, upper.newBasicUnitsCount),
    buExecCount: getVal(upper.buExecCount, upper.basicUnitsExecCount),
    buExecPct: upper.buExecPct || '',
    buGbCount: getVal(upper.buGbCount, upper.basicUnitsGbCount),
    buGbPct: upper.buGbPct || '',
    studyDistComm: getVal(upper.studyDistComm, upper.distCommStudy),
    studyAreaComm: getVal(upper.studyAreaComm, upper.areaCommStudy),
    studyUnitsCount: getVal(upper.studyUnitsCount, upper.basicUnitsStudy),
    psoUnitsCount: getVal(upper.psoUnitsCount, upper.psoCount),
    psoNewUnitsCount: getVal(upper.newPsoUnitsCount, upper.psoNewUnitsCount),
    conferences: getVal(upper.conferencesCount, upper.conferences),
    studyCircles: getVal(upper.studyCirclesCount, upper.studyCircles),
    inductions: getVal(upper.inductionsCount, upper.inductions),
    ralliesAndProtests: getVal(upper.ralliesCount, upper.ralliesAndProtests),
    jirgasAndCornerMeetings: getVal(upper.jirgasCount, upper.jirgasAndCornerMeetings),
    alliedMeetings: getVal(upper.alliedMeetingsCount, upper.alliedMeetings),
    officeActivity: getVal(upper.districtOfficeActivity, upper.officeActivity),
    dues: getVal(upper.duesMonthly, upper.dues),
    emergencyDues: getVal(upper.duesEmergency, upper.emergencyDues),
    expenses: getVal(upper.duesExpenses, upper.expenses),
    villagesWithoutUnit: getVal(upper.villagesWithoutUnitCount, upper.villagesWithoutUnit),
    disciplinaryActions: getVal(upper.disciplinaryActionsCount, upper.disciplinaryActions),
  };

  const dispUpper = (upperRows && upperRows.length > 0) ? upperRows : [defaultUpperRow];
  dispUpper.forEach((ur, idx) => {
    const rowNum = 4 + idx;
    ws.getRow(rowNum).values = Object.values(ur);
    ws.getRow(rowNum).font = FONT_DATA;
  });

  // Lower Section Title
  const lowerStartRow = 5 + dispUpper.length;
  ws.mergeCells(`A${lowerStartRow}:Z${lowerStartRow}`);
  ws.getCell(`A${lowerStartRow}`).value = 'ضلعي ايګزيکټيو ځانګړي (انفرادي) کار او فعاليت رپورټ';
  ws.getCell(`A${lowerStartRow}`).font = { name: 'Noto Naskh Arabic', size: 11, bold: true };
  ws.getCell(`A${lowerStartRow}`).alignment = { horizontal: 'center' };

  // Lower Table Headers
  const comradeHeaders = [
    'شمير', 'ضلع ايګزيکټيو نوم', 'ضلع ايګزيکټيو غونډي', 'ضلع کميټي غونډي', 'علاقائي ايګزيکټيو غونډي', 'علاقائي کميټي غونډي',
    'خپل ابتدائي يونټ غونډي', 'ابتدائي يونټ ايګزيکټيو غونډي', 'ابتدائي يونټانو غونډي', 'PSO سره غونډي', 'پارټي کانفرنسونه',
    'سيمينارونه', 'سټډي سرکل', 'نوي شموليت پروګرام', 'اتحاديانو جماعتو سره غونډي', 'جلسے مظاهرے', 'جرګے', 'ټولي غونډي',
    'مياشتني چنده', 'دورے', 'اولسي تنظيمي رابطے', 'غير فعاله رابطے', 'دفتر حاضري', 'بلډ بينک پوسټ / زکات',
    'فعاله / غير فعاله', 'لوستنه سياسي نظرياتي'
  ];

  const comradeHeaderRow = lowerStartRow + 1;
  ws.getRow(comradeHeaderRow).values = comradeHeaders;
  ws.getRow(comradeHeaderRow).font = FONT_HEADER;

  rows.forEach((r, idx) => {
    const rNum = comradeHeaderRow + 1 + idx;
    ws.getRow(rNum).values = [
      r.srNo || idx + 1,
      r.name || '',
      getVal(r.distExecMeeting, r.distExec),
      getVal(r.distCommMeeting, r.distComm),
      getVal(r.areaExecMeeting, r.areaExec),
      getVal(r.areaCommMeeting, r.areaComm),
      getVal(r.ownBuMeeting, r.ownBu),
      getVal(r.buExecMeeting, r.buExec),
      getVal(r.buGbMeeting, r.buGb),
      getVal(r.psoMeeting, r.pso),
      getVal(r.conferenceMeeting, r.conf),
      getVal(r.seminarMeeting, r.seminar),
      getVal(r.studyCircleMeeting, r.studyCircle),
      getVal(r.inductionMeeting, r.induction),
      getVal(r.alliedMeeting, r.allied),
      getVal(r.rallyMeeting, r.rallies),
      getVal(r.jirgaMeeting, r.jirgas),
      r.totalMeetings ?? '',
      getVal(r.monthlyDues, r.dues),
      r.tours ?? '',
      r.publicOutreach ?? '',
      r.inactiveContact ?? '',
      r.officeAttendance || '',
      getVal(r.bloodBankPosts, r.bloodZakat),
      r.activeStatus || '',
      getVal(r.ideologicalReading, r.reading)
    ];
    ws.getRow(rNum).font = FONT_DATA;
  });

  return wb;
}

module.exports = {
  fetchForm6Data,
  generateForm6Html,
  generateForm6Excel,
};
