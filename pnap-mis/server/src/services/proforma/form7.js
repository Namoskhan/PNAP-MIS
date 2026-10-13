const ExcelJS = require('exceljs');
const { getBaseCss, getPashtoMonth } = require('./common');

/**
 * Fetch and aggregate data for Form 7: District Subordinate Area Units Monthly Work & Activity Report
 * (ضلع کښي علاقائي يونټانو د کار او فعاليت مياشتنئي رپورټ)
 */
async function fetchForm7Data({ districtId, month, year }) {
  const District = require('../../models/District');
  const Area = require('../../models/Area');
  const BasicUnit = require('../../models/BasicUnit');
  const Meeting = require('../../models/Meeting');
  const Activity = require('../../models/Activity');
  const Member = require('../../models/Member');
  const CabinetSlot = require('../../models/CabinetSlot');

  const district = await District.findById(districtId).lean();
  const districtName = district ? district.name : '';

  // Get all Area Units belonging to this District
  const areas = await Area.find({ districtId }).sort({ name: 1 }).lean();

  const m = parseInt(month, 10) || (new Date().getMonth() + 1);
  const y = parseInt(year, 10) || new Date().getFullYear();
  const startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  const monthLabel = getPashtoMonth(m);

  const rows = [];
  for (let i = 0; i < areas.length; i++) {
    const area = areas[i];

    // 1. Area Executive Meetings
    const areaExecMeetings = await Meeting.find({
      unitLevel: 'AREA',
      $and: [
        { $or: [{ unitId: area._id }, { areaId: area._id }] },
        { $or: [{ body: 'EXECUTIVE' }, { type: { $in: ['EXECUTIVE', 'EXC'] } }] },
        { startAt: { $gte: startDate, $lte: endDate } },
      ],
    }).sort({ startAt: -1 }).lean();

    const latestAreaExec = areaExecMeetings[0] || null;
    const execTotalSlots = (await CabinetSlot.countDocuments({
      unitLevel: 'AREA',
      unitId: area._id,
      filledMemberId: { $exists: true, $ne: null },
    })) || 9;
    const execPresent = latestAreaExec
      ? latestAreaExec.attendance?.filter((a) => a.status === 'PRESENT').length ?? 0
      : '';
    const execPct = (latestAreaExec && execTotalSlots > 0 && typeof execPresent === 'number')
      ? Math.round((execPresent / execTotalSlots) * 100) + '%'
      : '';

    // 2. Area Committee Meetings
    const areaCommMeetings = await Meeting.find({
      unitLevel: 'AREA',
      $and: [
        { $or: [{ unitId: area._id }, { areaId: area._id }] },
        { $or: [{ body: 'COMMITTEE' }, { type: { $in: ['COMMITTEE', 'COMM'] } }] },
        { startAt: { $gte: startDate, $lte: endDate } },
      ],
    }).sort({ startAt: -1 }).lean();

    const latestAreaComm = areaCommMeetings[0] || null;
    const commTotalMembers = (await Member.countDocuments({
      areaId: area._id,
      roles: { $in: ['AREA_COMMITTEE', 'EXECUTIVE'] },
      status: 'ACTIVE',
    })) || 15;
    const commPresent = latestAreaComm
      ? latestAreaComm.attendance?.filter((a) => a.status === 'PRESENT').length ?? 0
      : '';
    const commPct = (latestAreaComm && commTotalMembers > 0 && typeof commPresent === 'number')
      ? Math.round((commPresent / commTotalMembers) * 100) + '%'
      : '';

    // 3. Subordinate Basic Units in Area
    const basicUnits = await BasicUnit.find({ areaId: area._id }).lean();
    const buTotalCount = basicUnits.length;
    const newBuCount = basicUnits.filter(
      (bu) => bu.createdAt && new Date(bu.createdAt) >= startDate && new Date(bu.createdAt) <= endDate
    ).length;
    const inactiveBuCount = basicUnits.filter((bu) => bu.status === 'INACTIVE').length;

    // 4. Basic Units Executive Meetings aggregated
    const buIds = basicUnits.map((bu) => bu._id);
    const buExecMeetings = await Meeting.find({
      unitLevel: 'BASIC_UNIT',
      unitId: { $in: buIds },
      $or: [{ body: 'EXECUTIVE' }, { type: { $in: ['EXECUTIVE', 'EXC'] } }],
      startAt: { $gte: startDate, $lte: endDate },
    }).lean();

    // 5. Basic Units General Body Meetings aggregated
    const buGbMeetings = await Meeting.find({
      unitLevel: 'BASIC_UNIT',
      unitId: { $in: buIds },
      $or: [{ body: 'GENERAL_BODY' }, { type: { $in: ['GENERAL_BODY', 'GBM'] } }],
      startAt: { $gte: startDate, $lte: endDate },
    }).lean();

    const buExecMeetingsTotal = buTotalCount > 0 ? buTotalCount : 0;
    const buExecMeetingsHeld = buExecMeetings.length;
    const buExecPct = buExecMeetingsTotal > 0
      ? Math.round((buExecMeetingsHeld / buExecMeetingsTotal) * 100) + '%'
      : '0%';

    const buGbMeetingsTotal = buTotalCount > 0 ? buTotalCount : 0;
    const buGbMeetingsHeld = buGbMeetings.length;
    const buGbPct = buGbMeetingsTotal > 0
      ? Math.round((buGbMeetingsHeld / buGbMeetingsTotal) * 100) + '%'
      : '0%';

    // 6. Membership in Area
    const totalMembers = await Member.countDocuments({ areaId: area._id });
    const activeMembers = await Member.countDocuments({ areaId: area._id, status: 'ACTIVE' });
    const membershipPct = totalMembers > 0 ? Math.round((activeMembers / totalMembers) * 100) + '%' : '100%';

    // 7. Inductions in Month
    const newInductions = await Member.countDocuments({
      areaId: area._id,
      joinedAt: { $gte: startDate, $lte: endDate },
    });

    // 8. Activities in Area (Conferences, Seminars, Study Circles, Rallies, Jirgas)
    const activities = await Activity.find({
      $or: [{ unitId: area._id }, { areaId: area._id }],
      date: { $gte: startDate, $lte: endDate },
    }).lean();

    const confAndSeminars = activities.filter((a) =>
      ['CONFERENCE', 'SEMINAR', 'STUDY_CIRCLE', 'WORKSHOP'].includes(a.type)
    ).length;

    const ralliesCount = activities.filter((a) =>
      ['RALLY', 'PROTEST', 'DEMONSTRATION', 'JALSA'].includes(a.type)
    ).length;

    const jirgasCount = activities.filter((a) =>
      ['JIRGA', 'CORNER_MEETING', 'COMMUNITY'].includes(a.type)
    ).length;

    rows.push({
      srNo: i + 1,
      areaId: String(area._id),
      unitName: area.name,
      // 1. Executive Meetings
      execMeetings: areaExecMeetings.length > 0 ? areaExecMeetings.length : 1,
      execTotalMembers: execTotalSlots,
      execPresent: typeof execPresent === 'number' ? execPresent : '',
      execHeld: areaExecMeetings.length > 0 ? 1 : 0,
      execPct: execPct || '0%',
      // 2. Committee Meetings
      commMeetings: areaCommMeetings.length > 0 ? areaCommMeetings.length : 1,
      commTotalMembers: commTotalMembers,
      commPresent: typeof commPresent === 'number' ? commPresent : '',
      commHeld: areaCommMeetings.length > 0 ? 1 : 0,
      commPct: commPct || '0%',
      // 3. Subordinate Basic Units
      buCount: buTotalCount,
      newBuCount: newBuCount,
      // 4. Basic Units Executive
      buExecUnitsTotal: buTotalCount,
      buExecUnitsPresent: buTotalCount - inactiveBuCount,
      buExecMeetingsTotal: buExecMeetingsTotal,
      buExecMeetingsHeld: buExecMeetingsHeld,
      buExecPct: buExecPct,
      // 5. Basic Units General Body Meetings
      buGbMeetingsTotal: buGbMeetingsTotal,
      buGbMeetingsHeld: buGbMeetingsHeld,
      buGbPct: buGbPct,
      inactiveBuCount: inactiveBuCount,
      // 6. Membership
      membershipTotal: totalMembers,
      membershipPresent: activeMembers,
      membershipPct: membershipPct,
      // 7. Study
      studyAreaComm: 0,
      studyUnitsComm: 0,
      studyUnitsCount: 0,
      studyPct: '0%',
      // 8. Programs & Education
      programsCount: confAndSeminars,
      inductionPrograms: newInductions > 0 ? 1 : 0,
      newInductions: newInductions,
      // 9. PSO
      psoUnitsCount: 0,
      // 10. Public Gatherings
      ralliesCount: ralliesCount,
      jirgasCount: jirgasCount,
      unitGatherings: 0,
      // 11. Villages without unit
      villagesWithoutUnit: 0,
      // 12. Office activity
      officeActivity: 'منظم / فعال',
      // 13. Dues & Finances
      duesMonthly: 0,
      duesOrg: 0,
      duesEmergency: 0,
      // 14. Blood Bank
      bloodPosts: 0,
      bloodCash: 0,
      bloodZakat: 0,
    });
  }

  return {
    districtName,
    month: monthLabel,
    year: String(y),
    rows,
  };
}

/**
 * Generate A4 Landscape HTML template for Form 7 matching printed paper sheet
 */
function generateForm7Html({ districtName = '', month = '', year = '', rows = [] } = {}) {
  const displayRows = [...rows];
  while (displayRows.length < 15) {
    displayRows.push({
      srNo: displayRows.length + 1,
      unitName: '',
      execMeetings: '',
      execTotalMembers: '',
      execPresent: '',
      execHeld: '',
      execPct: '',
      commMeetings: '',
      commTotalMembers: '',
      commPresent: '',
      commHeld: '',
      commPct: '',
      buCount: '',
      newBuCount: '',
      buExecUnitsTotal: '',
      buExecUnitsPresent: '',
      buExecMeetingsTotal: '',
      buExecMeetingsHeld: '',
      buExecPct: '',
      buGbMeetingsTotal: '',
      buGbMeetingsHeld: '',
      buGbPct: '',
      inactiveBuCount: '',
      membershipTotal: '',
      membershipPresent: '',
      membershipPct: '',
      studyAreaComm: '',
      studyUnitsComm: '',
      studyUnitsCount: '',
      studyPct: '',
      programsCount: '',
      inductionPrograms: '',
      newInductions: '',
      psoUnitsCount: '',
      ralliesCount: '',
      jirgasCount: '',
      unitGatherings: '',
      villagesWithoutUnit: '',
      officeActivity: '',
      duesMonthly: '',
      duesOrg: '',
      duesEmergency: '',
      bloodPosts: '',
      bloodCash: '',
      bloodZakat: '',
    });
  }

  const cleanVal = (val) => {
    if (val === undefined || val === null || val === 'NaN' || val === 'NaN%') return '';
    return String(val);
  };

  const getNum = (v) => {
    const n = parseInt(v, 10);
    return isNaN(n) ? 0 : n;
  };

  // Calculate Column Totals for Footer Row
  const totals = {
    execMeetings: rows.reduce((s, r) => s + getNum(r.execMeetings), 0),
    execTotalMembers: rows.reduce((s, r) => s + getNum(r.execTotalMembers), 0),
    execPresent: rows.reduce((s, r) => s + getNum(r.execPresent), 0),
    execHeld: rows.reduce((s, r) => s + getNum(r.execHeld), 0),
    commMeetings: rows.reduce((s, r) => s + getNum(r.commMeetings), 0),
    commTotalMembers: rows.reduce((s, r) => s + getNum(r.commTotalMembers), 0),
    commPresent: rows.reduce((s, r) => s + getNum(r.commPresent), 0),
    commHeld: rows.reduce((s, r) => s + getNum(r.commHeld), 0),
    buCount: rows.reduce((s, r) => s + getNum(r.buCount), 0),
    newBuCount: rows.reduce((s, r) => s + getNum(r.newBuCount), 0),
    buExecUnitsTotal: rows.reduce((s, r) => s + getNum(r.buExecUnitsTotal), 0),
    buExecUnitsPresent: rows.reduce((s, r) => s + getNum(r.buExecUnitsPresent), 0),
    buExecMeetingsTotal: rows.reduce((s, r) => s + getNum(r.buExecMeetingsTotal), 0),
    buExecMeetingsHeld: rows.reduce((s, r) => s + getNum(r.buExecMeetingsHeld), 0),
    buGbMeetingsTotal: rows.reduce((s, r) => s + getNum(r.buGbMeetingsTotal), 0),
    buGbMeetingsHeld: rows.reduce((s, r) => s + getNum(r.buGbMeetingsHeld), 0),
    inactiveBuCount: rows.reduce((s, r) => s + getNum(r.inactiveBuCount), 0),
    membershipTotal: rows.reduce((s, r) => s + getNum(r.membershipTotal), 0),
    membershipPresent: rows.reduce((s, r) => s + getNum(r.membershipPresent), 0),
    studyAreaComm: rows.reduce((s, r) => s + getNum(r.studyAreaComm), 0),
    studyUnitsComm: rows.reduce((s, r) => s + getNum(r.studyUnitsComm), 0),
    studyUnitsCount: rows.reduce((s, r) => s + getNum(r.studyUnitsCount), 0),
    programsCount: rows.reduce((s, r) => s + getNum(r.programsCount), 0),
    inductionPrograms: rows.reduce((s, r) => s + getNum(r.inductionPrograms), 0),
    newInductions: rows.reduce((s, r) => s + getNum(r.newInductions), 0),
    psoUnitsCount: rows.reduce((s, r) => s + getNum(r.psoUnitsCount), 0),
    ralliesCount: rows.reduce((s, r) => s + getNum(r.ralliesCount), 0),
    jirgasCount: rows.reduce((s, r) => s + getNum(r.jirgasCount), 0),
    unitGatherings: rows.reduce((s, r) => s + getNum(r.unitGatherings), 0),
    villagesWithoutUnit: rows.reduce((s, r) => s + getNum(r.villagesWithoutUnit), 0),
    duesMonthly: rows.reduce((s, r) => s + getNum(r.duesMonthly), 0),
    duesOrg: rows.reduce((s, r) => s + getNum(r.duesOrg), 0),
    duesEmergency: rows.reduce((s, r) => s + getNum(r.duesEmergency), 0),
    bloodPosts: rows.reduce((s, r) => s + getNum(r.bloodPosts), 0),
    bloodCash: rows.reduce((s, r) => s + getNum(r.bloodCash), 0),
    bloodZakat: rows.reduce((s, r) => s + getNum(r.bloodZakat), 0),
  };

  return `<!DOCTYPE html>
<html lang="ps" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ضلع کښي علاقائي يونټانو د کار او فعاليت مياشتنئي رپورټ (Form 7)</title>
  <style>
    ${getBaseCss()}
    @page {
      size: A4 landscape;
      margin: 4mm 5mm;
    }
    body {
      font-size: 7pt;
      line-height: 1.15;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
      padding: 0 4px;
    }
    .header-title {
      font-size: 14pt;
      font-weight: bold;
      text-align: center;
      flex: 1;
      color: #0f172a;
    }
    .header-meta {
      font-size: 9pt;
      font-weight: 600;
      white-space: nowrap;
    }
    .header-line {
      border-bottom: 1px dotted #333;
      padding: 0 10px;
      font-weight: bold;
      min-width: 60px;
      display: inline-block;
      text-align: center;
    }
    table.proforma-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 6.5pt;
      text-align: center;
    }
    table.proforma-table th, table.proforma-table td {
      border: 1px solid #111;
      padding: 1.5px 0.5px;
      height: 15px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    table.proforma-table th {
      background: #f1f5f9;
      font-weight: bold;
      line-height: 1.05;
      font-size: 6pt;
    }
    table.proforma-table th.main-hdr {
      font-size: 7pt;
      font-weight: bold;
    }
    .footer-bar {
      margin-top: 10px;
      display: flex;
      justify-content: space-between;
      padding: 0 30px;
      font-size: 9pt;
      font-weight: 600;
    }
    .sig-line {
      border-bottom: 1px dashed #333;
      display: inline-block;
      width: 140px;
      margin-inline-start: 6px;
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="header-bar">
      <div class="header-meta">
        ضلع نوم: <span class="header-line">${districtName || '—'}</span>
      </div>
      <div class="header-title">
        ضلع کښي علاقائي يونټانو د کار او فعاليت مياشتنئي رپورټ
      </div>
      <div class="header-meta">
        مياشت: <span class="header-line">${month || '—'}</span>&nbsp;&nbsp;کال: <span class="header-line">${year || '—'}</span>
      </div>
    </div>

    <table class="proforma-table">
      <thead>
        <!-- Row 1: Super Headers -->
        <tr>
          <th rowspan="2" style="width: 18px;">شمير</th>
          <th rowspan="2" style="width: 75px;">علاقائي يونټ نوم</th>
          
          <!-- Section 1: Executive Meetings -->
          <th colspan="5" class="main-hdr" style="background: #f0fdf4;">ايګزيکټيو</th>

          <!-- Section 2: Committee Meetings -->
          <th colspan="5" class="main-hdr" style="background: #eff6ff;">کميټي غونډي</th>

          <!-- Section 3: Basic Units Count -->
          <th colspan="2" class="main-hdr" style="background: #fefce8;">ابتدائي يونټانو</th>

          <!-- Section 4: Basic Units Executive -->
          <th colspan="5" class="main-hdr" style="background: #faf5ff;">ابتدائي يونټانو ايګزيکټيو</th>

          <!-- Section 5: Basic Units GB Meetings -->
          <th colspan="4" class="main-hdr" style="background: #f0fdf4;">ابتدائي يونټانو غونډو شمير</th>

          <!-- Section 6: Membership -->
          <th colspan="3" class="main-hdr" style="background: #eff6ff;">غړيتوب (ممبرشپ)</th>

          <!-- Section 7: Study -->
          <th colspan="4" class="main-hdr" style="background: #fefce8;">لوستنه (مطالعه)</th>

          <!-- Section 8: Programs -->
          <th colspan="3" class="main-hdr" style="background: #faf5ff;">پروګرامونه، سيمينار، شموليت</th>

          <!-- Section 9: PSO -->
          <th rowspan="2" style="width: 28px; background: #fdf2f8;">PSO شمير</th>

          <!-- Section 10: Public Gatherings -->
          <th colspan="3" class="main-hdr" style="background: #fffbeb;">اولسي غونډي</th>

          <!-- Section 11: Villages without unit -->
          <th rowspan="2" style="width: 32px; background: #f8fafc;">کليو شمير يونټ نسته</th>

          <!-- Section 12: Office activity -->
          <th rowspan="2" style="width: 38px; background: #f8fafc;">علاقائي دفتر فعاليت</th>

          <!-- Section 13: Dues -->
          <th colspan="3" class="main-hdr" style="background: #f0fdf4;">چنده</th>

          <!-- Section 14: Blood bank -->
          <th colspan="3" class="main-hdr" style="background: #fef2f2;">بلډ بينک</th>
        </tr>

        <!-- Row 2: Sub Headers -->
        <tr>
          <!-- Exec subheaders -->
          <th style="width: 22px;">غونډي</th>
          <th style="width: 22px;">شمير</th>
          <th style="width: 24px;">حاضر ملګرو</th>
          <th style="width: 22px;">حاضر غونډو</th>
          <th style="width: 24px;">فيصدي</th>

          <!-- Comm subheaders -->
          <th style="width: 22px;">غونډي</th>
          <th style="width: 22px;">شمير</th>
          <th style="width: 24px;">حاضر ملګرو</th>
          <th style="width: 22px;">حاضر غونډو</th>
          <th style="width: 24px;">فيصدي</th>

          <!-- BU Count subheaders -->
          <th style="width: 24px;">ټول شمير</th>
          <th style="width: 22px;">نوي يونټانو</th>

          <!-- BU Exec subheaders -->
          <th style="width: 20px;">شمير</th>
          <th style="width: 20px;">حاضر</th>
          <th style="width: 22px;">غونډو شمير</th>
          <th style="width: 22px;">حاضر غونډو</th>
          <th style="width: 24px;">فيصدي</th>

          <!-- BU GB subheaders -->
          <th style="width: 22px;">غونډو شمير</th>
          <th style="width: 22px;">حاضر غونډو</th>
          <th style="width: 24px;">فيصدي</th>
          <th style="width: 22px;">غير فعاله</th>

          <!-- Membership subheaders -->
          <th style="width: 24px;">ټول</th>
          <th style="width: 24px;">حاضر</th>
          <th style="width: 24px;">فيصدي</th>

          <!-- Study subheaders -->
          <th style="width: 26px;">علاقائي کميټي</th>
          <th style="width: 26px;">يونټانو کميټي</th>
          <th style="width: 22px;">يونټانو</th>
          <th style="width: 24px;">فيصدي</th>

          <!-- Programs subheaders -->
          <th style="width: 32px;">کانفرنس/ سيمينار</th>
          <th style="width: 26px;">شموليت پروګرام</th>
          <th style="width: 24px;">نوي شموليت</th>

          <!-- Public Gatherings subheaders -->
          <th style="width: 28px;">جلسے مظاهرے</th>
          <th style="width: 24px;">جرګے</th>
          <th style="width: 24px;">يونټو</th>

          <!-- Dues subheaders -->
          <th style="width: 28px;">مياشتنۍ</th>
          <th style="width: 28px;">علاقائي</th>
          <th style="width: 26px;">هنګامي</th>

          <!-- Blood Bank subheaders -->
          <th style="width: 24px;">پوستونه</th>
          <th style="width: 24px;">نغدي</th>
          <th style="width: 24px;">زکات</th>
        </tr>
      </thead>
      <tbody>
        ${displayRows.map((r, i) => `
        <tr>
          <td>${r.srNo || (i + 1)}</td>
          <td style="text-align: right; font-weight: 600; padding: 0 3px;">${cleanVal(r.unitName)}</td>
          <td>${cleanVal(r.execMeetings)}</td>
          <td>${cleanVal(r.execTotalMembers)}</td>
          <td>${cleanVal(r.execPresent)}</td>
          <td>${cleanVal(r.execHeld)}</td>
          <td>${cleanVal(r.execPct)}</td>
          <td>${cleanVal(r.commMeetings)}</td>
          <td>${cleanVal(r.commTotalMembers)}</td>
          <td>${cleanVal(r.commPresent)}</td>
          <td>${cleanVal(r.commHeld)}</td>
          <td>${cleanVal(r.commPct)}</td>
          <td>${cleanVal(r.buCount)}</td>
          <td>${cleanVal(r.newBuCount)}</td>
          <td>${cleanVal(r.buExecUnitsTotal)}</td>
          <td>${cleanVal(r.buExecUnitsPresent)}</td>
          <td>${cleanVal(r.buExecMeetingsTotal)}</td>
          <td>${cleanVal(r.buExecMeetingsHeld)}</td>
          <td>${cleanVal(r.buExecPct)}</td>
          <td>${cleanVal(r.buGbMeetingsTotal)}</td>
          <td>${cleanVal(r.buGbMeetingsHeld)}</td>
          <td>${cleanVal(r.buGbPct)}</td>
          <td>${cleanVal(r.inactiveBuCount)}</td>
          <td>${cleanVal(r.membershipTotal)}</td>
          <td>${cleanVal(r.membershipPresent)}</td>
          <td>${cleanVal(r.membershipPct)}</td>
          <td>${cleanVal(r.studyAreaComm)}</td>
          <td>${cleanVal(r.studyUnitsComm)}</td>
          <td>${cleanVal(r.studyUnitsCount)}</td>
          <td>${cleanVal(r.studyPct)}</td>
          <td>${cleanVal(r.programsCount)}</td>
          <td>${cleanVal(r.inductionPrograms)}</td>
          <td>${cleanVal(r.newInductions)}</td>
          <td>${cleanVal(r.psoUnitsCount)}</td>
          <td>${cleanVal(r.ralliesCount)}</td>
          <td>${cleanVal(r.jirgasCount)}</td>
          <td>${cleanVal(r.unitGatherings)}</td>
          <td>${cleanVal(r.villagesWithoutUnit)}</td>
          <td style="font-size: 5.5pt;">${cleanVal(r.officeActivity)}</td>
          <td>${cleanVal(r.duesMonthly)}</td>
          <td>${cleanVal(r.duesOrg)}</td>
          <td>${cleanVal(r.duesEmergency)}</td>
          <td>${cleanVal(r.bloodPosts)}</td>
          <td>${cleanVal(r.bloodCash)}</td>
          <td>${cleanVal(r.bloodZakat)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr style="background: #f1f5f9; font-weight: bold;">
          <td colspan="2">ټول / Total</td>
          <td>${totals.execMeetings || ''}</td>
          <td>${totals.execTotalMembers || ''}</td>
          <td>${totals.execPresent || ''}</td>
          <td>${totals.execHeld || ''}</td>
          <td></td>
          <td>${totals.commMeetings || ''}</td>
          <td>${totals.commTotalMembers || ''}</td>
          <td>${totals.commPresent || ''}</td>
          <td>${totals.commHeld || ''}</td>
          <td></td>
          <td>${totals.buCount || ''}</td>
          <td>${totals.newBuCount || ''}</td>
          <td>${totals.buExecUnitsTotal || ''}</td>
          <td>${totals.buExecUnitsPresent || ''}</td>
          <td>${totals.buExecMeetingsTotal || ''}</td>
          <td>${totals.buExecMeetingsHeld || ''}</td>
          <td></td>
          <td>${totals.buGbMeetingsTotal || ''}</td>
          <td>${totals.buGbMeetingsHeld || ''}</td>
          <td></td>
          <td>${totals.inactiveBuCount || ''}</td>
          <td>${totals.membershipTotal || ''}</td>
          <td>${totals.membershipPresent || ''}</td>
          <td></td>
          <td>${totals.studyAreaComm || ''}</td>
          <td>${totals.studyUnitsComm || ''}</td>
          <td>${totals.studyUnitsCount || ''}</td>
          <td></td>
          <td>${totals.programsCount || ''}</td>
          <td>${totals.inductionPrograms || ''}</td>
          <td>${totals.newInductions || ''}</td>
          <td>${totals.psoUnitsCount || ''}</td>
          <td>${totals.ralliesCount || ''}</td>
          <td>${totals.jirgasCount || ''}</td>
          <td>${totals.unitGatherings || ''}</td>
          <td>${totals.villagesWithoutUnit || ''}</td>
          <td></td>
          <td>${totals.duesMonthly || ''}</td>
          <td>${totals.duesOrg || ''}</td>
          <td>${totals.duesEmergency || ''}</td>
          <td>${totals.bloodPosts || ''}</td>
          <td>${totals.bloodCash || ''}</td>
          <td>${totals.bloodZakat || ''}</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer-bar">
      <div>ضلعي سکرټري جنرل: <span class="sig-line"></span></div>
      <div>ضلعي صدر: <span class="sig-line"></span></div>
      <div>د دستخط نيټه: <span class="sig-line" style="width: 100px;"></span></div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate Excel workbook for Form 7 matching printed proforma structure
 */
async function generateForm7Excel({ districtName = '', month = '', year = '', rows = [] } = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PNAP-MIS';
  workbook.lastModifiedBy = 'PNAP-MIS';
  workbook.created = new Date();
  workbook.modified = new Date();

  const ws = workbook.addWorksheet('ضلع کښي علاقائي يونټانو کار', {
    views: [{ rightToLeft: true }],
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });

  // Title Row
  ws.mergeCells('A1:AS1');
  ws.getCell('A1').value = 'ضلع کښي علاقائي يونټانو د کار او فعاليت مياشتنئي رپورټ (Form 7)';
  ws.getCell('A1').font = { size: 14, bold: true, name: 'Arial' };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 26;

  // Metadata Row
  ws.mergeCells('A2:M2');
  ws.getCell('A2').value = `ضلع نوم: ${districtName || '—'}`;
  ws.getCell('A2').font = { size: 10, bold: true };
  ws.getCell('A2').alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells('N2:AA2');
  ws.getCell('N2').value = `مياشت: ${month || '—'}`;
  ws.getCell('N2').font = { size: 10, bold: true };
  ws.getCell('N2').alignment = { horizontal: 'center', vertical: 'middle' };

  ws.mergeCells('AB2:AS2');
  ws.getCell('AB2').value = `کال: ${year || '—'}`;
  ws.getCell('AB2').font = { size: 10, bold: true };
  ws.getCell('AB2').alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(2).height = 20;

  // Header Row 3 (Super Headers)
  ws.mergeCells('A3:A4');
  ws.getCell('A3').value = '#';

  ws.mergeCells('B3:B4');
  ws.getCell('B3').value = 'علاقائي يونټ نوم';

  ws.mergeCells('C3:G3');
  ws.getCell('C3').value = 'ايګزيکټيو';

  ws.mergeCells('H3:L3');
  ws.getCell('H3').value = 'کميټي غونډي';

  ws.mergeCells('M3:N3');
  ws.getCell('M3').value = 'ابتدائي يونټانو';

  ws.mergeCells('O3:S3');
  ws.getCell('O3').value = 'ابتدائي يونټانو ايګزيکټيو';

  ws.mergeCells('T3:W3');
  ws.getCell('T3').value = 'ابتدائي يونټانو غونډو شمير';

  ws.mergeCells('X3:Z3');
  ws.getCell('X3').value = 'غړيتوب (ممبرشپ)';

  ws.mergeCells('AA3:AD3');
  ws.getCell('AA3').value = 'لوستنه (مطالعه)';

  ws.mergeCells('AE3:AG3');
  ws.getCell('AE3').value = 'پروګرامونه، سيمينار، شموليت';

  ws.mergeCells('AH3:AH4');
  ws.getCell('AH3').value = 'PSO شمير';

  ws.mergeCells('AI3:AK3');
  ws.getCell('AI3').value = 'اولسي غونډي';

  ws.mergeCells('AL3:AL4');
  ws.getCell('AL3').value = 'کليو شمير يونټ نسته';

  ws.mergeCells('AM3:AM4');
  ws.getCell('AM3').value = 'علاقائي دفتر فعاليت';

  ws.mergeCells('AN3:AP3');
  ws.getCell('AN3').value = 'چنده';

  ws.mergeCells('AQ3:AS3');
  ws.getCell('AQ3').value = 'بلډ بينک';

  // Sub Headers Row 4
  const subHeaders = [
    '#', 'علاقائي يونټ نوم',
    'غونډي', 'شمير', 'حاضر ملګرو', 'حاضر غونډو', 'فيصدي', // C-G
    'غونډي', 'شمير', 'حاضر ملګرو', 'حاضر غونډو', 'فيصدي', // H-L
    'ټول شمير', 'نوي يونټانو', // M-N
    'شمير', 'حاضر', 'غونډو شمير', 'حاضر غونډو', 'فيصدي', // O-S
    'غونډو شمير', 'حاضر غونډو', 'فيصدي', 'غير فعاله', // T-W
    'ټول', 'حاضر', 'فيصدي', // X-Z
    'علاقائي کميټي', 'يونټانو کميټي', 'يونټانو', 'فيصدي', // AA-AD
    'کانفرنس/سيمينار', 'شموليت پروګرام', 'نوي شموليت', // AE-AG
    'PSO شمير', // AH
    'جلسے مظاهرے', 'جرګے', 'يونټو', // AI-AK
    'کليو شمير يونټ نسته', 'علاقائي دفتر فعاليت', // AL-AM
    'مياشتنۍ', 'علاقائي', 'هنګامي', // AN-AP
    'پوستونه', 'نغدي', 'زکات', // AQ-AS
  ];

  subHeaders.forEach((sh, idx) => {
    const colNum = idx + 1;
    const cell = ws.getCell(4, colNum);
    if (!cell.value) {
      cell.value = sh;
    }
  });

  // Style Header Rows
  [3, 4].forEach((rNum) => {
    const r = ws.getRow(rNum);
    r.height = 20;
    r.eachCell((c) => {
      c.font = { bold: true, size: 9, name: 'Arial' };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      c.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });

  // Data Rows
  let startRow = 5;
  rows.forEach((r, idx) => {
    const rowNum = startRow + idx;
    const values = [
      idx + 1,
      r.unitName || '',
      r.execMeetings || 0,
      r.execTotalMembers || 0,
      r.execPresent || 0,
      r.execHeld || 0,
      r.execPct || '',
      r.commMeetings || 0,
      r.commTotalMembers || 0,
      r.commPresent || 0,
      r.commHeld || 0,
      r.commPct || '',
      r.buCount || 0,
      r.newBuCount || 0,
      r.buExecUnitsTotal || 0,
      r.buExecUnitsPresent || 0,
      r.buExecMeetingsTotal || 0,
      r.buExecMeetingsHeld || 0,
      r.buExecPct || '',
      r.buGbMeetingsTotal || 0,
      r.buGbMeetingsHeld || 0,
      r.buGbPct || '',
      r.inactiveBuCount || 0,
      r.membershipTotal || 0,
      r.membershipPresent || 0,
      r.membershipPct || '',
      r.studyAreaComm || 0,
      r.studyUnitsComm || 0,
      r.studyUnitsCount || 0,
      r.studyPct || '',
      r.programsCount || 0,
      r.inductionPrograms || 0,
      r.newInductions || 0,
      r.psoUnitsCount || 0,
      r.ralliesCount || 0,
      r.jirgasCount || 0,
      r.unitGatherings || 0,
      r.villagesWithoutUnit || 0,
      r.officeActivity || '',
      r.duesMonthly || 0,
      r.duesOrg || 0,
      r.duesEmergency || 0,
      r.bloodPosts || 0,
      r.bloodCash || 0,
      r.bloodZakat || 0,
    ];

    const dataRow = ws.getRow(rowNum);
    dataRow.values = values;
    dataRow.height = 18;
    dataRow.eachCell((cell, cNum) => {
      cell.font = { size: 9, name: 'Arial' };
      cell.alignment = {
        horizontal: cNum === 2 ? 'right' : 'center',
        vertical: 'middle',
      };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });

  // Total Footer Row
  const totalRowNum = startRow + rows.length;
  const totalRow = ws.getRow(totalRowNum);
  totalRow.height = 20;

  totalRow.getCell(1).value = '';
  totalRow.getCell(2).value = 'ټول / Total';
  totalRow.getCell(2).font = { bold: true };
  totalRow.getCell(2).alignment = { horizontal: 'right', vertical: 'middle' };

  const numCols = [
    3, 4, 5, 6, 8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 20, 21, 23, 24, 25,
    27, 28, 29, 31, 32, 33, 34, 35, 36, 37, 38, 40, 41, 42, 43, 44, 45,
  ];

  numCols.forEach((colIdx) => {
    const colLetter = ws.getColumn(colIdx).letter;
    if (rows.length > 0) {
      totalRow.getCell(colIdx).value = {
        formula: `SUM(${colLetter}5:${colLetter}${totalRowNum - 1})`,
      };
    } else {
      totalRow.getCell(colIdx).value = 0;
    }
  });

  totalRow.eachCell((c) => {
    c.font = { bold: true, size: 9, name: 'Arial' };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
    c.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // Set explicit column widths
  ws.columns.forEach((col, idx) => {
    if (idx === 0) col.width = 5; // #
    else if (idx === 1) col.width = 22; // Area Name
    else if (idx === 38) col.width = 16; // Office Activity
    else col.width = 7.5;
  });

  return workbook;
}

module.exports = {
  fetchForm7Data,
  generateForm7Html,
  generateForm7Excel,
};
