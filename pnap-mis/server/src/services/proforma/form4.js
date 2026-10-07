const ExcelJS = require('exceljs');
const { getBaseCss, getPashtoMonth } = require('./common');

async function fetchForm4Data({ unitId, month, year }) {
  const BasicUnit = require('../../models/BasicUnit');
  const Meeting = require('../../models/Meeting');
  const Activity = require('../../models/Activity');
  const Member = require('../../models/Member');
  const Donation = require('../../models/Donation');
  const Expense = require('../../models/Expense');
  const CabinetSlot = require('../../models/CabinetSlot');

  const unit = await BasicUnit.findById(unitId).lean();
  const unitName = unit ? unit.name : '';
  const areaId = unit?.areaId;

  const m = parseInt(month, 10) || (new Date().getMonth() + 1);
  const y = parseInt(year, 10) || new Date().getFullYear();
  const startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  // 1. Executive Meetings of this basic unit
  const execMeetings = await Meeting.find({
    unitLevel: 'BASIC_UNIT',
    $or: [{ unitId }, { basicUnitId: unitId }],
    $and: [
      { $or: [{ body: 'EXECUTIVE' }, { type: { $in: ['EXECUTIVE', 'EXC'] } }] },
      { startAt: { $gte: startDate, $lte: endDate } },
    ],
  }).sort({ startAt: -1 }).lean();

  // 2. General Body Meetings of this basic unit
  const gbMeetings = await Meeting.find({
    unitLevel: 'BASIC_UNIT',
    $or: [{ unitId }, { basicUnitId: unitId }],
    $and: [
      { $or: [{ body: 'GENERAL_BODY' }, { type: { $in: ['GENERAL_BODY', 'GBM'] } }] },
      { title: { $not: /pso|پي ايس او/i } },
      { startAt: { $gte: startDate, $lte: endDate } },
    ],
  }).sort({ startAt: -1 }).lean();

  // 3. PSO Meetings of this basic unit
  const psoMeetings = await Meeting.find({
    unitLevel: 'BASIC_UNIT',
    $or: [{ unitId }, { basicUnitId: unitId }],
    $and: [
      { title: { $regex: /pso|پي ايس او/i } },
      { startAt: { $gte: startDate, $lte: endDate } },
    ],
  }).sort({ startAt: -1 }).lean();

  // 4. Area / District Meetings where unit members might attend
  const higherMeetings = await Meeting.find({
    $or: [{ areaId }, { unitLevel: { $in: ['AREA', 'DISTRICT'] } }],
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();

  // 5. Activities of this unit
  const allActivities = await Activity.find({
    $and: [
      { $or: [{ unitId }, { basicUnitId: unitId }, { areaId }] },
      { startAt: { $gte: startDate, $lte: endDate } },
    ],
  }).populate('leadMemberId', 'fullName status bloodGroup').populate('participants', 'fullName status bloodGroup').lean();

  const unitActivities = allActivities.filter(a =>
    String(a.unitId) === String(unitId) || String(a.basicUnitId) === String(unitId)
  );

  // 6. Cabinet slots of this basic unit
  const cabinetSlots = await CabinetSlot.find({
    unitLevel: 'BASIC_UNIT',
    unitId,
    filledMemberId: { $exists: true, $ne: null },
  }).populate('filledMemberId', 'fullName status bloodGroup').lean();

  const execSlots = cabinetSlots.length;
  const totalMembers = await Member.countDocuments({
    basicUnitId: unitId,
    status: { $in: ['ACTIVE', 'APPROVED'] },
  });

  // Calculate Upper Table metrics
  const latestExec = execMeetings[0];
  const execPresent = latestExec?.attendance?.filter(a => a.status === 'PRESENT').length || 0;
  const execAbsent = latestExec?.attendance?.filter(a => a.status === 'ABSENT').length || 0;
  const execLeave = latestExec?.attendance?.filter(a => ['LEAVE', 'EXCUSED'].includes(a.status)).length || 0;
  const execTotalMarked = execPresent + execAbsent + execLeave || execSlots;
  const execPct = execTotalMarked > 0 && latestExec ? Math.round((execPresent / execTotalMarked) * 100) : '';

  const latestGb = gbMeetings[0];
  const gbPresent = latestGb?.attendance?.filter(a => a.status === 'PRESENT').length || 0;
  const gbAbsent = latestGb?.attendance?.filter(a => a.status === 'ABSENT').length || 0;
  const gbLeave = latestGb?.attendance?.filter(a => ['LEAVE', 'EXCUSED'].includes(a.status)).length || 0;
  const gbTotalMarked = gbPresent + gbAbsent + gbLeave || totalMembers;
  const gbPct = gbTotalMarked > 0 && latestGb ? Math.round((gbPresent / gbTotalMarked) * 100) : '';

  const latestPso = psoMeetings[0];
  const psoPresent = latestPso?.attendance?.filter(a => a.status === 'PRESENT').length || 0;
  const psoTotal = latestPso?.attendance?.length || 0;
  const psoPct = psoTotal > 0 ? Math.round((psoPresent / psoTotal) * 100) : '';

  const seminarsCount = unitActivities.filter(a => ['SEMINAR', 'SEM'].includes(a.type || a.typeCode)).length;
  const studyCirclesCount = unitActivities.filter(a => ['STUDY_CIRCLE', 'STC'].includes(a.type || a.typeCode)).length;
  const publicEventsCount = unitActivities.filter(a => ['JALSA', 'PROTEST', 'PUBLIC_GATHERING'].includes(a.type || a.typeCode)).length;
  const inductionCount = unitActivities.filter(a => ['CAMPAIGN', 'INDUCTION'].includes(a.type || a.typeCode)).length;
  const inactiveContactCount = unitActivities.filter(a =>
    /inactive|غير فعاله/i.test(a.title || '') || /inactive|غير فعاله/i.test(a.description || '')
  ).length;
  const publicOutreachCount = unitActivities.filter(a =>
    ['COMMUNITY_SERVICE', 'TASK'].includes(a.type || a.typeCode) || /outreach|عامه/i.test(a.title || '')
  ).length;

  const newMembersCount = await Member.countDocuments({
    basicUnitId: unitId,
    createdAt: { $gte: startDate, $lte: endDate },
  });

  // Donations & Expenses
  const allDonations = await Donation.find({
    $and: [
      { $or: [{ unitId }, { basicUnitId: unitId }] },
      { receivedAt: { $gte: startDate, $lte: endDate } },
      { $or: [{ state: 'APPROVED' }, { state: { $exists: false } }, { state: null }] },
    ],
  }).lean();

  const emergencyDonations = allDonations
    .filter(d => /هنګامي|emergency/i.test(d.note || ''))
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  const orgDonations = allDonations
    .filter(d => !/هنګامي|emergency/i.test(d.note || ''))
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  const allExpenses = await Expense.find({
    $and: [
      { $or: [{ unitId }, { basicUnitId: unitId }] },
      { incurredAt: { $gte: startDate, $lte: endDate } },
      { $or: [{ state: 'APPROVED' }, { state: { $exists: false } }, { state: null }] },
    ],
  }).lean();
  const totalExpense = allExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  // Lower Table: Each cabinet member's individual performance
  const execRows = cabinetSlots.map((slot, i) => {
    const member = slot.filledMemberId;
    const mId = member?._id ? String(member._id) : '';

    const unitExecAttended = execMeetings.filter(m =>
      m.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT')
    ).length;

    const unitGbAttended = gbMeetings.filter(m =>
      m.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT')
    ).length;

    const psoAttended = psoMeetings.filter(m =>
      m.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT')
    ).length;

    const semAttended = allActivities.filter(a =>
      ['SEMINAR', 'SEM'].includes(a.type || a.typeCode) &&
      (String(a.leadMemberId?._id || a.leadMemberId) === mId || a.participants?.some(p => String(p._id || p) === mId))
    ).length;

    const stcAttended = allActivities.filter(a =>
      ['STUDY_CIRCLE', 'STC'].includes(a.type || a.typeCode) &&
      (String(a.leadMemberId?._id || a.leadMemberId) === mId || a.participants?.some(p => String(p._id || p) === mId))
    ).length;

    const indAttended = allActivities.filter(a =>
      ['CAMPAIGN', 'INDUCTION'].includes(a.type || a.typeCode) &&
      (String(a.leadMemberId?._id || a.leadMemberId) === mId || a.participants?.some(p => String(p._id || p) === mId))
    ).length;

    const rallyAttended = allActivities.filter(a =>
      ['JALSA', 'PROTEST', 'PUBLIC_GATHERING'].includes(a.type || a.typeCode) &&
      (String(a.leadMemberId?._id || a.leadMemberId) === mId || a.participants?.some(p => String(p._id || p) === mId))
    ).length;

    const alliedAttended = allActivities.filter(a =>
      /allied|اتحادي|alliances/i.test(a.title || '') &&
      (String(a.leadMemberId?._id || a.leadMemberId) === mId || a.participants?.some(p => String(p._id || p) === mId))
    ).length;

    const confAttended = allActivities.filter(a =>
      ['PARTY_CONFERENCE'].includes(a.type || a.typeCode) &&
      (String(a.leadMemberId?._id || a.leadMemberId) === mId || a.participants?.some(p => String(p._id || p) === mId))
    ).length;

    const totalMeetings = unitExecAttended + unitGbAttended + psoAttended;

    const inactAttended = allActivities.filter(a =>
      (/inactive|غير فعاله/i.test(a.title || '') || /inactive|غير فعاله/i.test(a.description || '')) &&
      (String(a.leadMemberId?._id || a.leadMemberId) === mId || a.participants?.some(p => String(p._id || p) === mId))
    ).length;

    const publicOutreachAttended = allActivities.filter(a =>
      ['COMMUNITY_SERVICE', 'TASK'].includes(a.type || a.typeCode) &&
      (String(a.leadMemberId?._id || a.leadMemberId) === mId || a.participants?.some(p => String(p._id || p) === mId))
    ).length;

    const memberDues = allDonations
      .filter(d => String(d.donorMemberId) === mId)
      .reduce((sum, d) => sum + (d.amount || 0), 0);

    const higherAttended = higherMeetings.filter(m =>
      m.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT')
    ).length;

    const activeLabel = (member?.status === 'ACTIVE' || member?.status === 'APPROVED') ? 'فعاله' : 'غير فعاله';

    return {
      srNo: i + 1,
      name: member?.fullName || slot.roleCode || '',
      unitExecMeeting: unitExecAttended > 0 ? String(unitExecAttended) : '',
      unitGbMeeting: unitGbAttended > 0 ? String(unitGbAttended) : '',
      psoMeeting: psoAttended > 0 ? String(psoAttended) : '',
      seminar: semAttended > 0 ? String(semAttended) : '',
      studyCircle: stcAttended > 0 ? String(stcAttended) : '',
      induction: indAttended > 0 ? String(indAttended) : '',
      ralliesAndJirgas: rallyAttended > 0 ? String(rallyAttended) : '',
      alliedMeetings: alliedAttended > 0 ? String(alliedAttended) : '',
      partyConference: confAttended > 0 ? String(confAttended) : '',
      totalMeetings: totalMeetings > 0 ? String(totalMeetings) : '',
      inactiveContact: inactAttended > 0 ? String(inactAttended) : '',
      publicOutreach: publicOutreachAttended > 0 ? String(publicOutreachAttended) : '',
      monthlyDues: memberDues > 0 ? String(memberDues) : '',
      reading: stcAttended > 0 ? String(stcAttended) : '',
      districtOrAreaAttendance: higherAttended > 0 ? String(higherAttended) : '',
      activeStatus: activeLabel,
      bloodPostsAndZakat: member?.bloodGroup ? String(member.bloodGroup) : '',
    };
  });

  return {
    unitName,
    month: getPashtoMonth(m),
    year: String(y),
    upper: {
      execDate: latestExec?.startAt ? new Date(latestExec.startAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : '',
      execSlots: execSlots || '',
      execPresent: latestExec ? String(execPresent) : '',
      execAbsent: latestExec ? String(execAbsent) : '',
      execLeave: latestExec ? String(execLeave) : '',
      execPct: execPct !== '' ? `${execPct}%` : '',
      gbDate: latestGb?.startAt ? new Date(latestGb.startAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : '',
      gbMembers: totalMembers || '',
      gbPresent: latestGb ? String(gbPresent) : '',
      gbAbsent: latestGb ? String(gbAbsent) : '',
      gbLeave: latestGb ? String(gbLeave) : '',
      gbPct: gbPct !== '' ? `${gbPct}%` : '',
      psoMembers: psoTotal > 0 ? String(psoTotal) : '',
      psoPresent: latestPso ? String(psoPresent) : '',
      psoPct: psoPct !== '' ? `${psoPct}%` : '',
      reading: studyCirclesCount > 0 ? String(studyCirclesCount) : '',
      seminar: seminarsCount > 0 ? String(seminarsCount) : '',
      studyCircle: studyCirclesCount > 0 ? String(studyCirclesCount) : '',
      newMembers: newMembersCount > 0 ? String(newMembersCount) : '',
      publicEvents: (publicEventsCount + inductionCount) > 0 ? String(publicEventsCount + inductionCount) : '',
      inactiveContact: inactiveContactCount > 0 ? String(inactiveContactCount) : '',
      publicOutreach: publicOutreachCount > 0 ? String(publicOutreachCount) : '',
      orgDonations: orgDonations > 0 ? String(orgDonations) : '',
      emergencyDonations: emergencyDonations > 0 ? String(emergencyDonations) : '',
      expenses: totalExpense > 0 ? String(totalExpense) : '',
      disciplinary: '—',
      bloodPosts: '',
      bloodCash: '',
      bloodTotalCash: '',
      zakat: '—',
      totalHouseholds: unit?.customData?.households || '',
    },
    execRows,
  };
}

function generateForm4Html({ unitName = '', month = '', year = '', upper = {}, execRows = [] } = {}) {
  const dispExec = [...execRows];
  while (dispExec.length < 12) {
    dispExec.push({
      srNo: dispExec.length + 1,
      name: '',
      unitExecMeeting: '',
      unitGbMeeting: '',
      psoMeeting: '',
      seminar: '',
      studyCircle: '',
      induction: '',
      ralliesAndJirgas: '',
      alliedMeetings: '',
      partyConference: '',
      totalMeetings: '',
      inactiveContact: '',
      publicOutreach: '',
      monthlyDues: '',
      reading: '',
      districtOrAreaAttendance: '',
      activeStatus: '',
      bloodPostsAndZakat: '',
    });
  }

  const formatPct = (v) => {
    if (!v) return '';
    return String(v).includes('%') ? v : `${v}%`;
  };

  return `<!DOCTYPE html>
<html lang="ps" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>پښتونخوا ملي عوامي پارټي ابتدائي يونټ کار او فعاليت مياشتنئي رپورټ</title>
  <style>
    ${getBaseCss()}
    @page {
      size: A4 landscape;
      margin: 6mm 5mm 5mm 5mm;
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="report-header">
      <div class="header-field">
        ابتدائي يونټ نوم: <span class="line">${unitName}</span>
      </div>
      <div class="report-title">
        پښتونخوا ملي عوامي پارټي ابتدائي يونټ کار او فعاليت مياشتنئي رپورټ
      </div>
      <div class="header-field">
        مياشت: <span class="line" style="min-width: 90px;">${month}</span>
        کال: <span class="line" style="min-width: 70px;">${year}</span>
      </div>
    </div>

    <!-- UPPER TABLE -->
    <table class="proforma-table">
      <thead>
        <tr>
          <th colspan="6">يونټ ايګزيکټيو غونډي</th>
          <th colspan="6">يونټ جنرل باډي غونډي</th>
          <th colspan="3">پي ايس او يونټ</th>
          <th rowspan="2" style="width: 2.8%;">لوستنه<br>(مطالعه)</th>
          <th rowspan="2" style="width: 2.6%;">سيمينار</th>
          <th rowspan="2" style="width: 2.6%;">سټډي<br>سرکل</th>
          <th rowspan="2" style="width: 2.8%;">نوي<br>شموليت</th>
          <th rowspan="2" style="width: 3.2%;">اولسي غونډي/<br>شموليت پروګرام</th>
          <th rowspan="2" style="width: 3.8%;">غير فعاله ايګزيکټيو<br>او ملګرو سره رابطه</th>
          <th rowspan="2" style="width: 3.0%;">اولس سره<br>رابطه</th>
          <th colspan="3">چنده</th>
          <th rowspan="2" style="width: 2.8%;">تاديبي<br>کاروائي</th>
          <th colspan="4">بلډ بينک</th>
          <th rowspan="2" style="width: 3.0%;">ټولو کورو<br>شمير</th>
        </tr>
        <tr>
          <!-- يونټ ايګزيکټيو -->
          <th style="width: 3.0%;">غونډي نيټه</th>
          <th style="width: 2.8%;">ايګزيکټيو<br>شمير</th>
          <th style="width: 2.2%;">حاضر</th>
          <th style="width: 2.4%;">غيرحاضر</th>
          <th style="width: 2.2%;">رخصت</th>
          <th style="width: 2.6%;">حاضري<br>فيصدي</th>

          <!-- يونټ جنرل باډي -->
          <th style="width: 3.0%;">غونډي نيټه</th>
          <th style="width: 2.8%;">يونټ ممبر<br>شپ</th>
          <th style="width: 2.2%;">حاضر</th>
          <th style="width: 2.4%;">غيرحاضر</th>
          <th style="width: 2.2%;">رخصت</th>
          <th style="width: 2.6%;">حاضري<br>فيصدي</th>

          <!-- پي ايس او -->
          <th style="width: 2.5%;">غړو شمير</th>
          <th style="width: 3.0%;">غونډه کي حاضر<br>شمير</th>
          <th style="width: 2.5%;">حاضر<br>فيصدي</th>

          <!-- چنده -->
          <th style="width: 2.8%;">تنظيمي</th>
          <th style="width: 2.6%;">هنګامي</th>
          <th style="width: 2.6%;">خرڅ</th>

          <!-- بلډ بينک -->
          <th style="width: 2.4%;">پوستونه</th>
          <th style="width: 2.4%;">نغدي</th>
          <th style="width: 2.4%;">ټولي نغدي</th>
          <th style="width: 2.4%;">زکات</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${upper.execDate || ''}</td>
          <td>${upper.execSlots || ''}</td>
          <td>${upper.execPresent || ''}</td>
          <td>${upper.execAbsent || ''}</td>
          <td>${upper.execLeave || ''}</td>
          <td>${formatPct(upper.execPct)}</td>

          <td>${upper.gbDate || ''}</td>
          <td>${upper.gbMembers || ''}</td>
          <td>${upper.gbPresent || ''}</td>
          <td>${upper.gbAbsent || ''}</td>
          <td>${upper.gbLeave || ''}</td>
          <td>${formatPct(upper.gbPct)}</td>

          <td>${upper.psoMembers || ''}</td>
          <td>${upper.psoPresent || ''}</td>
          <td>${formatPct(upper.psoPct)}</td>

          <td>${upper.reading || ''}</td>
          <td>${upper.seminar || ''}</td>
          <td>${upper.studyCircle || ''}</td>
          <td>${upper.newMembers || ''}</td>
          <td>${upper.publicEvents || ''}</td>
          <td>${upper.inactiveContact || ''}</td>
          <td>${upper.publicOutreach || ''}</td>

          <td>${upper.orgDonations || ''}</td>
          <td>${upper.emergencyDonations || ''}</td>
          <td>${upper.expenses || ''}</td>
          <td>${upper.disciplinary || ''}</td>
          <td>${upper.bloodPosts || ''}</td>
          <td>${upper.bloodCash || ''}</td>
          <td>${upper.bloodTotalCash || ''}</td>
          <td>${upper.zakat || ''}</td>
          <td>${upper.totalHouseholds || ''}</td>
        </tr>
      </tbody>
    </table>

    <!-- LOWER TABLE -->
    <div class="table-section-title">
      ابتدائي يونټ ايګزيکټيو ځانګړي (انفرادي) کار او فعاليت مياشتنئي رپورټ
    </div>
    <table class="proforma-table">
      <thead>
        <tr>
          <th style="width: 2%;">شمير</th>
          <th style="width: 8%;">ايګزيکټيو نوم</th>
          <th style="width: 4%;">يونټ ايګزيکټيو<br>غونډي</th>
          <th style="width: 4%;">يونټ جنرل باډي<br>غونډي</th>
          <th style="width: 4%;">پي ايس او سره<br>غونډي</th>
          <th style="width: 3.5%;">سيمينار</th>
          <th style="width: 3.5%;">سټډي<br>سرکل</th>
          <th style="width: 4%;">شموليت<br>پروګرام</th>
          <th style="width: 5%;">جلسے،مظاهرے<br>اولسي غونډي</th>
          <th style="width: 4.5%;">اتحاديانو سره<br>غونډي</th>
          <th style="width: 4%;">پارټي<br>کانفرنس</th>
          <th style="width: 3.5%;">ټولي<br>غونډي</th>
          <th style="width: 6%;">غير فعاله ايګزيکټيو او<br>ملګرو سره رابطه شمير</th>
          <th style="width: 4%;">اولس سره<br>رابطه</th>
          <th style="width: 4%;">مياشتني<br>چنده</th>
          <th style="width: 4.5%;">لوستنه<br>(مطالعه)</th>
          <th style="width: 6%;">ضلعي يا علاقائي<br>دوتر ته حاضري</th>
          <th style="width: 4%;">فعاله /<br>غير فعاله</th>
          <th style="width: 5%;">بلډ بينک<br>پوست / زکات</th>
        </tr>
      </thead>
      <tbody>
        ${dispExec.map((r, i) => `
          <tr>
            <td>${r.srNo || (i + 1)}</td>
            <td style="font-weight: 600;">${r.name || ''}</td>
            <td>${r.unitExecMeeting || ''}</td>
            <td>${r.unitGbMeeting || ''}</td>
            <td>${r.psoMeeting || ''}</td>
            <td>${r.seminar || ''}</td>
            <td>${r.studyCircle || ''}</td>
            <td>${r.induction || ''}</td>
            <td>${r.ralliesAndJirgas || ''}</td>
            <td>${r.alliedMeetings || ''}</td>
            <td>${r.partyConference || ''}</td>
            <td>${r.totalMeetings || ''}</td>
            <td>${r.inactiveContact || ''}</td>
            <td>${r.publicOutreach || ''}</td>
            <td>${r.monthlyDues || ''}</td>
            <td>${r.reading || ''}</td>
            <td>${r.districtOrAreaAttendance || ''}</td>
            <td>${r.activeStatus || ''}</td>
            <td>${r.bloodPostsAndZakat || ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

async function generateForm4Excel({ unitName = '', month = '', year = '', upper = {}, execRows = [] } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('ابتدائي يونټ رپورټ', {
    views: [{ rightToLeft: true }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });

  const FONT_TITLE = { name: 'Noto Naskh Arabic', size: 13, bold: true };
  const FONT_HEADER = { name: 'Noto Naskh Arabic', size: 8, bold: true };
  const FONT_DATA = { name: 'Noto Naskh Arabic', size: 8 };

  ws.mergeCells('A1:C1');
  ws.getCell('A1').value = `ابتدائي يونټ نوم: ${unitName}`;
  ws.getCell('A1').font = { name: 'Noto Naskh Arabic', size: 10, bold: true };

  ws.mergeCells('I1:S1');
  ws.getCell('I1').value = 'پښتونخوا ملي عوامي پارټي ابتدائي يونټ کار او فعاليت مياشتنئي رپورټ';
  ws.getCell('I1').font = FONT_TITLE;
  ws.getCell('I1').alignment = { horizontal: 'center' };

  ws.mergeCells('AA1:AC1');
  ws.getCell('AA1').value = `مياشت: ${month}  کال: ${year}`;
  ws.getCell('AA1').font = { name: 'Noto Naskh Arabic', size: 10, bold: true };

  const upperHeaders1 = [
    'يونټ ايګزيکټيو غونډي نيټه', 'ايګزيکټيو شمير', 'حاضر', 'غيرحاضر', 'رخصت', 'حاضري فيصدي',
    'يونټ جنرل باډي غونډي نيټه', 'يونټ ممبرشپ', 'حاضر', 'غيرحاضر', 'رخصت', 'حاضري فيصدي',
    'پي ايس او غړو شمير', 'حاضر شمير', 'حاضري فيصدي',
    'لوستنه', 'سيمينار', 'سټډي سرکل', 'نوي شموليت', 'اولسي غونډي', 'غير فعاله رابطه', 'اولس سره رابطه',
    'تنظيمي چنده', 'هنګامي چنده', 'خرڅ', 'تاديبي کاروائي',
    'بلډ پوستونه', 'نغدي', 'ټولي نغدي', 'زکات', 'ټولو کورو شمير'
  ];

  ws.getRow(3).values = upperHeaders1;
  ws.getRow(3).font = FONT_HEADER;

  ws.getRow(4).values = [
    upper.execDate || '', upper.execSlots || '', upper.execPresent || '', upper.execAbsent || '', upper.execLeave || '', upper.execPct || '',
    upper.gbDate || '', upper.gbMembers || '', upper.gbPresent || '', upper.gbAbsent || '', upper.gbLeave || '', upper.gbPct || '',
    upper.psoMembers || '', upper.psoPresent || '', upper.psoPct || '',
    upper.reading || '', upper.seminar || '', upper.studyCircle || '', upper.newMembers || '', upper.publicEvents || '', upper.inactiveContact || '', upper.publicOutreach || '',
    upper.orgDonations || '', upper.emergencyDonations || '', upper.expenses || '', upper.disciplinary || '',
    upper.bloodPosts || '', upper.bloodCash || '', upper.bloodTotalCash || '', upper.zakat || '', upper.totalHouseholds || ''
  ];
  ws.getRow(4).font = FONT_DATA;

  // Lower Table
  ws.getCell('A6').value = 'ابتدائي يونټ ايګزيکټيو ځانګړي (انفرادي) کار او فعاليت مياشتنئي رپورټ';
  ws.getCell('A6').font = { name: 'Noto Naskh Arabic', size: 11, bold: true };

  const lowerHeaders = [
    'شمير', 'ايګزيکټيو نوم', 'يونټ ايګزيکټيو غونډي', 'يونټ جنرل باډي غونډي', 'پي ايس او سره غونډي',
    'سيمينار', 'سټډي سرکل', 'شموليت پروګرام', 'جلسے مظاهرے', 'اتحاديانو سره غونډي', 'پارټي کانفرنس',
    'ټولي غونډي', 'غير فعاله رابطه شمير', 'اولس سره رابطه', 'مياشتني چنده', 'لوستنه', 'دفتر ته حاضري',
    'فعاله / غير فعاله', 'بلډ بينک / زکات'
  ];
  ws.getRow(7).values = lowerHeaders;
  ws.getRow(7).font = FONT_HEADER;

  execRows.forEach((r, idx) => {
    const rowNum = 8 + idx;
    ws.getRow(rowNum).values = [
      r.srNo || idx + 1, r.name || '', r.unitExecMeeting || '', r.unitGbMeeting || '', r.psoMeeting || '',
      r.seminar || '', r.studyCircle || '', r.induction || '', r.ralliesAndJirgas || '', r.alliedMeetings || '',
      r.partyConference || '', r.totalMeetings || '', r.inactiveContact || '', r.publicOutreach || '',
      r.monthlyDues || '', r.reading || '', r.districtOrAreaAttendance || '', r.activeStatus || '',
      r.bloodPostsAndZakat || ''
    ];
    ws.getRow(rowNum).font = FONT_DATA;
  });

  return wb;
}

module.exports = {
  fetchForm4Data,
  generateForm4Html,
  generateForm4Excel,
};
