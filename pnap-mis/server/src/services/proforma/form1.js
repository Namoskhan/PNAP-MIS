const ExcelJS = require('exceljs');
const { getBaseCss, getPashtoMonth } = require('./common');

async function fetchForm1Data({ areaId, month, year }) {
  const Area = require('../../models/Area');
  const BasicUnit = require('../../models/BasicUnit');
  const Meeting = require('../../models/Meeting');
  const Activity = require('../../models/Activity');
  const Member = require('../../models/Member');
  const Donation = require('../../models/Donation');
  const Expense = require('../../models/Expense');
  const CabinetSlot = require('../../models/CabinetSlot');

  const area = await Area.findById(areaId).lean();
  const areaName = area ? area.name : '';

  const m = parseInt(month, 10) || (new Date().getMonth() + 1);
  const y = parseInt(year, 10) || new Date().getFullYear();
  const startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  // Basic units under area
  const basicUnits = await BasicUnit.find({ areaId }).select('_id name status isActive').lean();
  const buIds = basicUnits.map((u) => u._id);

  // Area executive meetings held in the requested month
  const areaExecMeetings = await Meeting.find({
    unitLevel: 'AREA',
    unitId: areaId,
    $or: [{ body: 'EXECUTIVE' }, { type: { $in: ['EXECUTIVE', 'EXC'] } }],
    startAt: { $gte: startDate, $lte: endDate },
  }).sort({ startAt: -1 }).lean();

  const latestExec = areaExecMeetings[0] || null;

  // Cabinet slots
  const cabinetSlots = await CabinetSlot.find({
    unitLevel: 'AREA',
    unitId: areaId,
    filledMemberId: { $exists: true, $ne: null },
  }).populate('filledMemberId', 'fullName status education bloodGroup basicUnitId phone').lean();

  const execSlots = cabinetSlots.length;
  const execPresent = latestExec?.attendance?.filter(a => a.status === 'PRESENT').length ?? '';
  const execAbsent = latestExec?.attendance?.filter(a => a.status === 'ABSENT').length ?? '';
  const execLeave = latestExec?.attendance?.filter(a => a.status === 'LATE').length ?? '';
  const execPct = (latestExec && execSlots > 0 && typeof execPresent === 'number')
    ? `${Math.round((execPresent / execSlots) * 100)}%`
    : '';

  // Area committee meetings held in the requested month
  const areaCommittees = await Meeting.find({
    unitLevel: 'AREA',
    unitId: areaId,
    $or: [{ body: 'COMMITTEE' }, { type: { $in: ['COMMITTEE', 'CMP'] } }],
    startAt: { $gte: startDate, $lte: endDate },
  }).sort({ startAt: -1 }).lean();

  const latestComm = areaCommittees[0] || null;
  const commTotal = latestComm?.attendance?.length ?? '';
  const commPresent = latestComm?.attendance?.filter(a => a.status === 'PRESENT').length ?? '';
  const commAbsent = latestComm?.attendance?.filter(a => a.status === 'ABSENT').length ?? '';
  const commLeave = latestComm?.attendance?.filter(a => a.status === 'LATE').length ?? '';
  const commPct = (latestComm && typeof commTotal === 'number' && commTotal > 0 && typeof commPresent === 'number')
    ? `${Math.round((commPresent / commTotal) * 100)}%`
    : '';

  // Basic Unit meetings
  const buExecMeetings = await Meeting.find({
    unitLevel: 'BASIC_UNIT',
    $or: [{ areaId }, { unitId: { $in: buIds } }],
    $or: [{ body: 'EXECUTIVE' }, { type: { $in: ['EXECUTIVE', 'EXC'] } }],
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const buExecCount = buExecMeetings.length;
  const buExecPresent = buExecMeetings.filter(m => m.attendance && m.attendance.some(a => a.status === 'PRESENT')).length;
  const buExecPct = buExecCount > 0 ? `${Math.round((buExecPresent / buExecCount) * 100)}%` : '';

  const buGbMeetings = await Meeting.find({
    unitLevel: 'BASIC_UNIT',
    $or: [{ areaId }, { unitId: { $in: buIds } }],
    $or: [{ body: 'GENERAL_BODY' }, { type: { $in: ['GENERAL_BODY', 'GBM'] } }],
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const buGbCount = buGbMeetings.length;
  const buGbPresent = buGbMeetings.filter(m => m.attendance && m.attendance.some(a => a.status === 'PRESENT')).length;
  const buGbPct = buGbCount > 0 ? `${Math.round((buGbPresent / buGbCount) * 100)}%` : '';

  const buInactiveCount = basicUnits.filter(u => u.isActive === false || u.status === 'INACTIVE').length;

  // Members
  const totalMembers = await Member.countDocuments({ areaId });
  const activeMembers = await Member.countDocuments({ areaId, status: 'ACTIVE' });
  const memberPct = totalMembers > 0 ? `${Math.round((activeMembers / totalMembers) * 100)}%` : '';
  const newMembersCount = await Member.countDocuments({ areaId, createdAt: { $gte: startDate, $lte: endDate } });

  // Study circles (لوستنه)
  const allAreaStudy = await Activity.find({
    $or: [{ areaId }, { unitId: areaId }, { unitId: { $in: buIds } }],
    $or: [{ type: { $in: ['STUDY_CIRCLE', 'STC'] } }, { typeCode: 'STUDY_CIRCLE' }],
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const studyAreaComm = allAreaStudy.filter(a => a.unitLevel === 'AREA').length;
  const studyUnitsCount = new Set(allAreaStudy.filter(a => a.basicUnitId || (a.unitLevel === 'BASIC_UNIT' && a.unitId)).map(a => String(a.basicUnitId || a.unitId))).size;
  const studyPct = (basicUnits.length > 0 && studyUnitsCount > 0)
    ? `${Math.round((studyUnitsCount / basicUnits.length) * 100)}%`
    : (allAreaStudy.length > 0 ? '100%' : '');

  // Conferences & Seminars
  const allSeminars = await Activity.find({
    $or: [{ areaId }, { unitId: areaId }, { unitId: { $in: buIds } }],
    $or: [{ type: { $in: ['SEMINAR', 'PARTY_CONFERENCE', 'SEM'] } }, { typeCode: { $in: ['SEMINAR', 'PARTY_CONFERENCE'] } }],
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const confUnitsCount = allSeminars.length;

  // PSO
  const allPso = await Meeting.find({
    $or: [{ areaId }, { unitId: areaId }, { unitId: { $in: buIds } }],
    title: { $regex: /pso|student/i },
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const psoUnitsCount = allPso.length;
  const psoMeetingsHeld = allPso.length;

  // Public events & campaigns
  const allPublic = await Activity.find({
    $or: [{ areaId }, { unitId: areaId }, { unitId: { $in: buIds } }],
    $or: [
      { type: { $in: ['PROTEST', 'JALSA', 'CAMPAIGN', 'COMMUNITY_SERVICE', 'TASK'] } },
      { typeCode: { $in: ['PROTEST', 'JALSA', 'CAMPAIGN', 'COMMUNITY_SERVICE', 'TASK'] } }
    ],
    startAt: { $gte: startDate, $lte: endDate },
  }).lean();
  const publicEventsCount = allPublic.filter(a => ['PROTEST', 'JALSA'].includes(a.type || a.typeCode)).length;
  const newProgramsCount = allPublic.filter(a => ['CAMPAIGN'].includes(a.type || a.typeCode)).length;
  const toursCount = allPublic.filter(a => a.title && /tour|دوره/i.test(a.title)).length;

  // Finances
  const donWhere = {
    $or: [
      { areaId: area?._id },
      { unitLevel: 'AREA', unitId: area?._id },
      { unitLevel: 'BASIC_UNIT', unitId: { $in: buIds } },
      { unitLevel: 'BASIC_UNIT', basicUnitId: { $in: buIds } }
    ],
    receivedAt: { $gte: startDate, $lte: endDate },
    $or: [{ state: 'APPROVED' }, { state: { $exists: false } }, { state: null }],
  };
  const allDonations = await Donation.find(donWhere).lean();
  const unitDonations = allDonations.filter(d => d.unitLevel === 'BASIC_UNIT').reduce((s, d) => s + (d.amount || 0), 0);
  const areaDonations = allDonations.filter(d => d.unitLevel === 'AREA' && d.donorType !== 'EMERGENCY').reduce((s, d) => s + (d.amount || 0), 0);
  const emergencyDonations = allDonations.filter(d => d.donorType === 'EMERGENCY' || /emergency|هنګامي/i.test(d.note || '')).reduce((s, d) => s + (d.amount || 0), 0);
  const totalDonation = allDonations.reduce((s, d) => s + (d.amount || 0), 0);

  const expWhere = {
    $or: [
      { areaId: area?._id },
      { unitLevel: 'AREA', unitId: area?._id },
      { unitLevel: 'BASIC_UNIT', unitId: { $in: buIds } },
      { unitLevel: 'BASIC_UNIT', basicUnitId: { $in: buIds } }
    ],
    incurredAt: { $gte: startDate, $lte: endDate },
    $or: [{ state: 'APPROVED' }, { state: { $exists: false } }, { state: null }],
  };
  const allExpenses = await Expense.find(expWhere).lean();
  const totalExpense = allExpenses.reduce((s, e) => s + (e.amount || 0), 0);

  // Lower table: Area cabinet members
  const roleTitles = {
    SECRETARY: 'سيکرټري (Secretary)',
    SENIOR_MAWIN: 'سينئر مرستيال (Senior Mawin)',
    FINANCE_SECRETARY: 'مالياتي سيکرټري (Finance Sec.)',
    PRESS_SECRETARY: 'اطلاعات سيکرټري (Press Sec.)',
    CULTURE_SECRETARY: 'کلتوري سيکرټري (Culture Sec.)',
    SPORTS_SECRETARY: 'لوبو سيکرټري (Sports Sec.)',
    PRESIDENT: 'صدر (President)',
  };

  const meetingDateFormatted = latestExec?.startAt
    ? new Date(latestExec.startAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })
    : '';

  const execRows = cabinetSlots.map((slot, i) => {
    const member = slot.filledMemberId;
    const mId = member?._id ? String(member._id) : '';

    const areaExecAttended = areaExecMeetings.filter(mt =>
      mt.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT')
    ).length;

    const areaCommAttended = areaCommittees.filter(mt =>
      mt.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT')
    ).length;

    const ownBuAttended = buGbMeetings.filter(mt =>
      mt.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT')
    ).length;

    const buExecAttended = buExecMeetings.filter(mt =>
      mt.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT')
    ).length;

    const seminarsAttended = allSeminars.filter(a =>
      (a.type === 'SEMINAR' || a.typeCode === 'SEMINAR') &&
      (String(a.leadMemberId) === mId || a.participants?.some(p => String(p) === mId))
    ).length;

    const confAttended = allSeminars.filter(a =>
      (a.type === 'PARTY_CONFERENCE' || a.typeCode === 'PARTY_CONFERENCE') &&
      (String(a.leadMemberId) === mId || a.participants?.some(p => String(p) === mId))
    ).length;

    const studyCirclesAttended = allAreaStudy.filter(a =>
      String(a.leadMemberId) === mId || a.participants?.some(p => String(p) === mId)
    ).length;

    const ralliesAttended = allPublic.filter(a =>
      ['PROTEST', 'JALSA'].includes(a.type || a.typeCode) &&
      (String(a.leadMemberId) === mId || a.participants?.some(p => String(p) === mId))
    ).length;

    const psoAttended = allPso.filter(mt =>
      mt.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT') ||
      String(mt.leadMemberId) === mId
    ).length;

    const inductionsAttended = allPublic.filter(a =>
      (a.type === 'CAMPAIGN' || a.typeCode === 'CAMPAIGN') &&
      (String(a.leadMemberId) === mId || a.participants?.some(p => String(p) === mId))
    ).length;

    const toursAttended = allPublic.filter(a =>
      a.title && /tour|دوره/i.test(a.title) &&
      (String(a.leadMemberId) === mId || a.participants?.some(p => String(p) === mId))
    ).length;

    const alliedAttended = allPublic.filter(a =>
      a.title && /allied|اتحادي/i.test(a.title) &&
      (String(a.leadMemberId) === mId || a.participants?.some(p => String(p) === mId))
    ).length;

    const publicOutreachCount = allPublic.filter(a =>
      (a.type === 'COMMUNITY_SERVICE' || /outreach|رابط/i.test(a.title || '')) &&
      (String(a.leadMemberId) === mId || a.participants?.some(p => String(p) === mId))
    ).length;

    const memberDonations = allDonations.filter(d => String(d.donorMemberId) === mId);
    const duesTotal = memberDonations.reduce((sum, d) => sum + (d.amount || 0), 0);

    const memberRole = roleTitles[slot.roleCode] || slot.roleCode || '';
    const displayName = member?.fullName ? `${member.fullName}\n(${memberRole})` : memberRole;

    return {
      srNo: i + 1,
      name: displayName,
      meetingDate: meetingDateFormatted,
      areaExecMeetings: areaExecMeetings.length > 0 ? String(areaExecAttended) : '',
      areaCommMeetings: areaCommittees.length > 0 ? String(areaCommAttended) : '',
      ownBuMeetings: buGbMeetings.length > 0 ? String(ownBuAttended) : '',
      buExecMeetings: buExecMeetings.length > 0 ? String(buExecAttended) : '',
      buMeetings: buGbMeetings.length > 0 ? String(ownBuAttended) : '',
      psoMeetings: allPso.length > 0 ? String(psoAttended) : '',
      conferences: allSeminars.length > 0 ? String(confAttended) : '',
      seminars: allSeminars.length > 0 ? String(seminarsAttended) : '',
      studyCircles: allAreaStudy.length > 0 ? String(studyCirclesAttended) : '',
      inductions: newProgramsCount > 0 ? String(inductionsAttended) : '',
      alliedMeetings: alliedAttended > 0 ? String(alliedAttended) : '',
      ralliesAndJirgas: allPublic.length > 0 ? String(ralliesAttended) : '',
      monthlyDues: duesTotal > 0 ? String(duesTotal) : '',
      unitMeetings: (ownBuAttended + buExecAttended) > 0 ? String(ownBuAttended + buExecAttended) : '',
      tours: toursCount > 0 ? String(toursAttended) : '',
      publicOutreach: publicOutreachCount > 0 ? String(publicOutreachCount) : '',
      orgOutreach: (ownBuAttended + buExecAttended) > 0 ? String(ownBuAttended + buExecAttended) : '',
      officeAttendance: areaExecAttended > 0 ? 'حاضر' : '',
      activeStatus: member?.status === 'ACTIVE' ? 'فعاله' : (member?.status ? 'غير فعاله' : ''),
      bloodPostsAndZakat: member?.bloodGroup ? `ګروپ ${member.bloodGroup}` : '',
      ideologicalReading: member?.education || '',
    };
  });

  return {
    areaName,
    month: getPashtoMonth(m),
    year: String(y),
    upper: {
      execDate: meetingDateFormatted,
      execSlots: execSlots ? String(execSlots) : '',
      execPresent: execPresent !== '' ? String(execPresent) : '',
      execAbsent: execAbsent !== '' ? String(execAbsent) : '',
      execLeave: execLeave !== '' ? String(execLeave) : '',
      execPct: execPct || '',
      commDate: latestComm?.startAt ? new Date(latestComm.startAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : '',
      commTotal: commTotal !== '' ? String(commTotal) : '',
      commPresent: commPresent !== '' ? String(commPresent) : '',
      commAbsent: commAbsent !== '' ? String(commAbsent) : '',
      commLeave: commLeave !== '' ? String(commLeave) : '',
      commPct: commPct || '',
      buExecCount: buExecCount ? String(buExecCount) : '',
      buExecPresent: buExecPresent ? String(buExecPresent) : '',
      buExecPct: buExecPct || '',
      buGbCount: buGbCount ? String(buGbCount) : '',
      buGbPresent: buGbPresent ? String(buGbPresent) : '',
      buGbPct: buGbPct || '',
      buInactiveCount: String(buInactiveCount),
      totalMembers: String(totalMembers),
      activeMembers: String(activeMembers),
      memberPct: memberPct || '',
      studyAreaComm: studyAreaComm ? String(studyAreaComm) : '',
      studyUnitsCount: studyUnitsCount ? String(studyUnitsCount) : '',
      studyPct: studyPct || '',
      confUnitsCount: confUnitsCount ? String(confUnitsCount) : '',
      newMembersCount: String(newMembersCount),
      psoUnitsCount: psoUnitsCount ? String(psoUnitsCount) : '',
      psoMeetingsHeld: psoMeetingsHeld ? String(psoMeetingsHeld) : '',
      publicEventsCount: publicEventsCount ? String(publicEventsCount) : '',
      newProgramsCount: newProgramsCount ? String(newProgramsCount) : '',
      villagesWithoutUnit: toursCount ? String(toursCount) : '',
      toursCount: toursCount ? String(toursCount) : '',
      unitDonations: String(unitDonations),
      areaDonations: String(areaDonations),
      emergencyDonations: String(emergencyDonations),
      totalDonations: String(totalDonation),
      totalExpenses: String(totalExpense),
    },
    execRows,
  };
}

function generateForm1Html({ areaName = '', month = '', year = '', upper = {}, execRows = [] } = {}) {
  const displayExecRows = [...execRows];
  while (displayExecRows.length < 12) {
    displayExecRows.push({
      srNo: displayExecRows.length + 1,
      name: '',
      meetingDate: '',
      areaExecMeetings: '',
      areaCommMeetings: '',
      ownBuMeetings: '',
      buExecMeetings: '',
      buMeetings: '',
      psoMeetings: '',
      conferences: '',
      seminars: '',
      studyCircles: '',
      inductions: '',
      alliedMeetings: '',
      ralliesAndJirgas: '',
      monthlyDues: '',
      unitMeetings: '',
      tours: '',
      publicOutreach: '',
      orgOutreach: '',
      officeAttendance: '',
      activeStatus: '',
      bloodPostsAndZakat: '',
      ideologicalReading: '',
    });
  }

  const execRowsHtml = displayExecRows.map((r, i) => `
    <tr>
      <td style="width: 1.8%;">${r.srNo || (i + 1)}</td>
      <td style="width: 6.5%; font-weight: 600; font-size: 7.5pt; line-height: 1.2;">${(r.name || '').replace(/\n/g, '<br/>')}</td>
      <td style="width: 3.2%;">${r.meetingDate || ''}</td>
      <td style="width: 3.2%;">${r.areaExecMeetings || ''}</td>
      <td style="width: 3.2%;">${r.areaCommMeetings || ''}</td>
      <td style="width: 3.2%;">${r.ownBuMeetings || ''}</td>
      <td style="width: 3.2%;">${r.buExecMeetings || ''}</td>
      <td style="width: 3.2%;">${r.buMeetings || ''}</td>
      <td style="width: 3.0%;">${r.psoMeetings || ''}</td>
      <td style="width: 2.8%;">${r.conferences || ''}</td>
      <td style="width: 2.8%;">${r.seminars || ''}</td>
      <td style="width: 2.8%;">${r.studyCircles || ''}</td>
      <td style="width: 3.2%;">${r.inductions || ''}</td>
      <td style="width: 3.2%;">${r.alliedMeetings || ''}</td>
      <td style="width: 3.5%;">${r.ralliesAndJirgas || ''}</td>
      <td style="width: 3.0%;">${r.monthlyDues || ''}</td>
      <td style="width: 3.0%;">${r.unitMeetings || ''}</td>
      <td style="width: 2.5%;">${r.tours || ''}</td>
      <td style="width: 3.0%;">${r.publicOutreach || ''}</td>
      <td style="width: 3.0%;">${r.orgOutreach || ''}</td>
      <td style="width: 3.5%;">${r.officeAttendance || ''}</td>
      <td style="width: 3.0%;">${r.activeStatus || ''}</td>
      <td style="width: 3.5%;">${r.bloodPostsAndZakat || ''}</td>
      <td style="width: 4.5%;">${r.ideologicalReading || ''}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="ps" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>پښتونخوا نېشنل عوامي پارټي علاقائي يونټ کار او فعاليت مياشتنۍ رپورټ</title>
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
        علاقائي يونټ نوم: <span class="line">${areaName}</span>
      </div>
      <div class="report-title">
        پښتونخوا نېشنل عوامي پارټي علاقائي يونټ کار او فعاليت مياشتنۍ رپورټ
      </div>
      <div class="header-field">
        مياشت: <span class="line" style="min-width: 90px;">${month}</span>
        کال: <span class="line" style="min-width: 70px;">${year}</span>
      </div>
    </div>

    <!-- UPPER TABLE: Area Summary -->
    <table class="proforma-table">
      <thead>
        <tr>
          <th colspan="6">علاقائي ايګزيکټيو غونډي</th>
          <th colspan="6">علاقائي کميټي غونډي</th>
          <th colspan="3">ابتدائي يونټانو ايګزيکټيو</th>
          <th colspan="4">يونټانو جنرل باډي غونډو شمير</th>
          <th colspan="3">ممبر شپ (ګروپتوب)</th>
          <th colspan="3">لوستنه (مطالعه)</th>
          <th colspan="2">کانفرنسونه سيمينارونه او سټډي سرکل</th>
          <th colspan="2">پي ايس او</th>
          <th rowspan="2" style="width: 3.2%;">اولسي<br>غونډي<br>(جلسے مظاهرے)</th>
          <th rowspan="2" style="width: 3.5%;">شموليت<br>پروګرامونه</th>
          <th rowspan="2" style="width: 3.0%;">هغه علاقو کښي<br>تنظيمي دوره</th>
          <th colspan="5">چنده</th>
        </tr>
        <tr>
          <!-- علاقائي ايګزيکټيو غونډي -->
          <th style="width: 2.8%;">غونډي<br>نيټه</th>
          <th style="width: 2.8%;">ايګزيکټيو<br>شمير</th>
          <th style="width: 2.0%;">حاضر</th>
          <th style="width: 2.2%;">غير<br>حاضر</th>
          <th style="width: 2.0%;">رخصت</th>
          <th style="width: 2.5%;">حاضري<br>فيصدي</th>

          <!-- علاقائي کميټي غونډي -->
          <th style="width: 2.8%;">غونډي<br>نيټه</th>
          <th style="width: 2.5%;">حاضري<br>فيصدي</th>
          <th style="width: 2.5%;">غړو<br>شمير</th>
          <th style="width: 2.0%;">حاضر</th>
          <th style="width: 2.2%;">غير<br>حاضر</th>
          <th style="width: 2.0%;">رخصت</th>

          <!-- ابتدائي يونټانو ايګزيکټيو -->
          <th style="width: 3.0%;">يونټانو ايګزيکټيو<br>غونډو شمير</th>
          <th style="width: 2.8%;">حاضر غونډو<br>شمير</th>
          <th style="width: 2.5%;">حاضري<br>فيصدي</th>

          <!-- يونټانو جنرل باډي -->
          <th style="width: 2.6%;">غونډو<br>شمير</th>
          <th style="width: 2.8%;">حاضر غونډو<br>شمير</th>
          <th style="width: 2.5%;">حاضري<br>فيصدي</th>
          <th style="width: 3.0%;">غير فعاله<br>يونټانو شمير</th>

          <!-- ممبر شپ -->
          <th style="width: 2.8%;">ټول<br>ممبر شپ</th>
          <th style="width: 2.8%;">فعاله<br>ممبر شپ</th>
          <th style="width: 2.5%;">حاضر<br>فيصدي</th>

          <!-- لوستنه -->
          <th style="width: 2.8%;">علاقائي<br>کميټي</th>
          <th style="width: 2.5%;">يونټو<br>شمير</th>
          <th style="width: 2.5%;">حاضر<br>فيصدي</th>

          <!-- کانفرنسونه -->
          <th style="width: 2.6%;">يونټو<br>شمير</th>
          <th style="width: 2.8%;">نوي<br>شموليتونه</th>

          <!-- پي ايس او -->
          <th style="width: 2.6%;">يونټانو<br>شمير</th>
          <th style="width: 3.0%;">غونډي<br>کړي دي</th>

          <!-- چنده -->
          <th style="width: 2.6%;">يونټ<br>چنده</th>
          <th style="width: 2.6%;">علاقے<br>چنده</th>
          <th style="width: 2.6%;">هنګامي<br>چنده</th>
          <th style="width: 2.8%;">ټوله<br>چنده</th>
          <th style="width: 2.6%;">خرڅ</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${upper.execDate || ''}</td>
          <td>${upper.execSlots || ''}</td>
          <td>${upper.execPresent || ''}</td>
          <td>${upper.execAbsent || ''}</td>
          <td>${upper.execLeave || ''}</td>
          <td>${upper.execPct ? (String(upper.execPct).endsWith('%') ? upper.execPct : upper.execPct + '%') : ''}</td>

          <td>${upper.commDate || ''}</td>
          <td>${upper.commPct ? (String(upper.commPct).endsWith('%') ? upper.commPct : upper.commPct + '%') : ''}</td>
          <td>${upper.commTotal || ''}</td>
          <td>${upper.commPresent || ''}</td>
          <td>${upper.commAbsent || ''}</td>
          <td>${upper.commLeave || ''}</td>

          <td>${upper.buExecCount || ''}</td>
          <td>${upper.buExecPresent || ''}</td>
          <td>${upper.buExecPct || ''}</td>

          <td>${upper.buGbCount || ''}</td>
          <td>${upper.buGbPresent || ''}</td>
          <td>${upper.buGbPct || ''}</td>
          <td>${upper.buInactiveCount || ''}</td>

          <td>${upper.totalMembers || ''}</td>
          <td>${upper.activeMembers || ''}</td>
          <td>${upper.memberPct || ''}</td>

          <td>${upper.studyAreaComm || ''}</td>
          <td>${upper.studyUnitsCount || ''}</td>
          <td>${upper.studyPct || ''}</td>

          <td>${upper.confUnitsCount || ''}</td>
          <td>${upper.newMembersCount || ''}</td>

          <td>${upper.psoUnitsCount || ''}</td>
          <td>${upper.psoMeetingsHeld || ''}</td>

          <td>${upper.publicEventsCount || ''}</td>
          <td>${upper.newProgramsCount || ''}</td>
          <td>${upper.toursCount || ''}</td>

          <td>${upper.unitDonations || ''}</td>
          <td>${upper.areaDonations || ''}</td>
          <td>${upper.emergencyDonations || ''}</td>
          <td>${upper.totalDonations || ''}</td>
          <td>${upper.totalExpenses || ''}</td>
        </tr>
      </tbody>
    </table>

    <!-- LOWER TABLE: Area Executive Individual Performance -->
    <div class="table-section-title">
      علاقائي ايګزيکټيو کار او فعاليت ځانګړي (انفرادي) رپورټ
    </div>

    <table class="proforma-table">
      <thead>
        <tr>
          <th style="width: 1.8%;">شمير</th>
          <th style="width: 6.5%;">علاقائي ايګزيکټيو نوم</th>
          <th style="width: 3.2%;">غونډي نيټه</th>
          <th style="width: 3.2%;">علاقائي ايګزيکټيو غونډي</th>
          <th style="width: 3.2%;">علاقائي کميټي غونډي</th>
          <th style="width: 3.2%;">خپل ابتدائي يونټ غونډي</th>
          <th style="width: 3.2%;">ابتدائي يونټونو ايګزيکټيو غونډي</th>
          <th style="width: 3.2%;">ابتدائي يونټونو غونډي</th>
          <th style="width: 3.0%;">پي ايس او سره غونډي</th>
          <th style="width: 2.8%;">پارټي کانفرنس</th>
          <th style="width: 2.8%;">سيمينارونه</th>
          <th style="width: 2.8%;">سټډي سرکل</th>
          <th style="width: 3.2%;">شموليت پروګرامونه</th>
          <th style="width: 3.2%;">اتحاديانو سره غونډي</th>
          <th style="width: 3.5%;">جلسے،مظاهرے او جرګے</th>
          <th style="width: 3.0%;">مياشتنئي چنده</th>
          <th style="width: 3.0%;">يونټي غونډي</th>
          <th style="width: 2.5%;">دورہ</th>
          <th style="width: 3.0%;">اولسي رابطے</th>
          <th style="width: 3.0%;">تنظيمي رابطے</th>
          <th style="width: 3.5%;">دفتر حاضري ضلعي يا علاقائي</th>
          <th style="width: 3.0%;">فعاله / غير فعاله</th>
          <th style="width: 3.5%;">بلډ بينک پوست، زکات</th>
          <th style="width: 4.5%;">لوستنه (مطالعه) سياسي، نظرياتي</th>
        </tr>
      </thead>
      <tbody>
        ${execRowsHtml}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

async function generateForm1Excel({ areaName = '', month = '', year = '', upper = {}, execRows = [] } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('علاقائي يونټ کار او فعاليت', {
    views: [{ rightToLeft: true }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });

  const FONT_HEADER = { name: 'Noto Naskh Arabic', size: 8, bold: true };
  const FONT_DATA = { name: 'Noto Naskh Arabic', size: 8 };
  const THIN_BORDER = {
    top: { style: 'thin' }, left: { style: 'thin' },
    bottom: { style: 'thin' }, right: { style: 'thin' },
  };

  ws.mergeCells('A1:C1');
  ws.getCell('A1').value = `علاقائي يونټ نوم: ${areaName}`;
  ws.getCell('A1').font = { name: 'Noto Naskh Arabic', size: 10, bold: true };

  ws.mergeCells('K1:U1');
  ws.getCell('K1').value = 'پښتونخوا نېشنل عوامي پارټي علاقائي يونټ کار او فعاليت مياشتنۍ رپورټ';
  ws.getCell('K1').font = { name: 'Noto Naskh Arabic', size: 13, bold: true };
  ws.getCell('K1').alignment = { horizontal: 'center' };

  ws.mergeCells('AE1:AH1');
  ws.getCell('AE1').value = `مياشت: ${month}  کال: ${year}`;
  ws.getCell('AE1').font = { name: 'Noto Naskh Arabic', size: 10, bold: true };

  // Upper Table Headers (Row 3 & 4)
  const upperCols = [
    'غونډي نيټه', 'ايګزيکټيو شمير', 'حاضر', 'غير حاضر', 'رخصت', 'حاضري فيصدي',
    'غونډي نيټه', 'حاضري فيصدي', 'غړو شمير', 'حاضر', 'غير حاضر', 'رخصت',
    'يونټانو ايګزيکټيو', 'حاضر غونډو', 'حاضري فيصدي',
    'غونډو شمير', 'حاضر غونډو', 'حاضري فيصدي', 'غير فعاله يونټانو',
    'ټول ممبر شپ', 'فعاله ممبر شپ', 'حاضر فيصدي',
    'علاقائي کميټي', 'يونټو شمير', 'حاضر فيصدي',
    'کانفرنس يونټو', 'نوي شموليتونه',
    'پي ايس او يونټانو', 'غونډي کړي',
    'اولسي غونډي', 'شموليت پروګرامونه', 'تنظيمي دوره',
    'يونټ چنده', 'علاقې چنده', 'هنګامي چنده', 'ټوله چنده', 'خرڅ'
  ];

  const upperValues = [
    upper.execDate || '', upper.execSlots || '', upper.execPresent || '', upper.execAbsent || '', upper.execLeave || '', upper.execPct || '',
    upper.commDate || '', upper.commPct || '', upper.commTotal || '', upper.commPresent || '', upper.commAbsent || '', upper.commLeave || '',
    upper.buExecCount || '', upper.buExecPresent || '', upper.buExecPct || '',
    upper.buGbCount || '', upper.buGbPresent || '', upper.buGbPct || '', upper.buInactiveCount || '0',
    upper.totalMembers || '', upper.activeMembers || '', upper.memberPct || '',
    upper.studyAreaComm || '', upper.studyUnitsCount || '', upper.studyPct || '',
    upper.confUnitsCount || '', upper.newMembersCount || '',
    upper.psoUnitsCount || '', upper.psoMeetingsHeld || '',
    upper.publicEventsCount || '', upper.villagesWithoutUnit || '', upper.toursCount || '',
    upper.unitDonations || '', upper.areaDonations || '', upper.emergencyDonations || '', upper.totalDonations || '', upper.totalExpenses || ''
  ];

  ws.getRow(3).values = upperCols;
  ws.getRow(3).font = FONT_HEADER;
  ws.getRow(4).values = upperValues;
  ws.getRow(4).font = FONT_DATA;

  // Lower Table (Row 6+)
  ws.getCell('A6').value = 'علاقائي ايګزيکټيو کار او فعاليت ځانګړي (انفرادي) رپورټ';
  ws.getCell('A6').font = { name: 'Noto Naskh Arabic', size: 11, bold: true };

  const lowerHeaders = [
    'شمير', 'نوم او عهده', 'نيټه', 'علاقائي ايګزيکټيو', 'علاقائي کميټي', 'خپل ابتدائي يونټ',
    'يونټونو ايګزيکټيو', 'يونټونو غونډي', 'پي ايس او سره غونډي', 'پارټي کانفرنس', 'سيمينارونه',
    'سټډي سرکل', 'شموليت پروګرامونه', 'اتحاديانو سره غونډي', 'جلسے او جرګے', 'مياشتنئي چنده',
    'يونټي غونډي', 'دورہ', 'اولسي رابطے', 'تنظيمي رابطے', 'دفتر حاضري', 'فعاله / غير فعاله',
    'بلډ بينک، زکات', 'لوستنه سياسي نظرياتي'
  ];

  ws.getRow(7).values = lowerHeaders;
  ws.getRow(7).font = FONT_HEADER;

  execRows.forEach((r, idx) => {
    const rowNum = 8 + idx;
    ws.getRow(rowNum).values = [
      r.srNo || idx + 1, r.name?.replace(/\n/g, ' ') || '', r.meetingDate || '', r.areaExecMeetings || '',
      r.areaCommMeetings || '', r.ownBuMeetings || '', r.buExecMeetings || '', r.buMeetings || '',
      r.psoMeetings || '', r.conferences || '', r.seminars || '', r.studyCircles || '',
      r.inductions || '', r.alliedMeetings || '', r.ralliesAndJirgas || '', r.monthlyDues || '',
      r.unitMeetings || '', r.tours || '', r.publicOutreach || '', r.orgOutreach || '',
      r.officeAttendance || '', r.activeStatus || '', r.bloodPostsAndZakat || '', r.ideologicalReading || ''
    ];
    ws.getRow(rowNum).font = FONT_DATA;
  });

  return wb;
}

module.exports = {
  fetchForm1Data,
  generateForm1Html,
  generateForm1Excel,
};
