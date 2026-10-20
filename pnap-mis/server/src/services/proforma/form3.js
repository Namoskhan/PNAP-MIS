const ExcelJS = require('exceljs');
const { getBaseCss, getPashtoMonth } = require('./common');

async function fetchForm3Data({ areaId, month, year }) {
  const Area = require('../../models/Area');
  const BasicUnit = require('../../models/BasicUnit');
  const Meeting = require('../../models/Meeting');
  const Activity = require('../../models/Activity');
  const CabinetSlot = require('../../models/CabinetSlot');
  const Donation = require('../../models/Donation');
  const Member = require('../../models/Member');

  const area = await Area.findById(areaId).lean();
  const areaName = area ? area.name : '';

  const m = parseInt(month, 10) || (new Date().getMonth() + 1);
  const y = parseInt(year, 10) || new Date().getFullYear();
  const startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  // Inactive units in area
  const inactiveUnits = await BasicUnit.find({ areaId, isActive: false }).lean();

  // Basic units under area
  const basicUnits = await BasicUnit.find({ areaId }).lean();
  const buIds = basicUnits.map(b => b._id);

  // Meetings in the month
  const areaExecMeetings = await Meeting.find({
    unitLevel: 'AREA',
    unitId: areaId,
    $and: [
      { $or: [{ body: 'EXECUTIVE' }, { type: { $in: ['EXECUTIVE', 'EXC'] } }] },
      { startAt: { $gte: startDate, $lte: endDate } },
    ],
  }).sort({ startAt: -1 }).lean();

  const latestExec = areaExecMeetings[0] || null;

  const areaCommittees = await Meeting.find({
    unitLevel: 'AREA',
    unitId: areaId,
    $and: [
      { $or: [{ body: 'COMMITTEE' }, { type: { $in: ['COMMITTEE', 'CMP'] } }] },
      { startAt: { $gte: startDate, $lte: endDate } },
    ],
  }).sort({ startAt: -1 }).lean();

  const buExecMeetings = await Meeting.find({
    unitLevel: 'BASIC_UNIT',
    $and: [
      { $or: [{ areaId }, { unitId: { $in: buIds } }, { basicUnitId: { $in: buIds } }] },
      { $or: [{ body: 'EXECUTIVE' }, { type: { $in: ['EXECUTIVE', 'EXC'] } }] },
      { startAt: { $gte: startDate, $lte: endDate } },
    ],
  }).lean();

  const buGbMeetings = await Meeting.find({
    unitLevel: 'BASIC_UNIT',
    $and: [
      { $or: [{ areaId }, { unitId: { $in: buIds } }, { basicUnitId: { $in: buIds } }] },
      { $or: [{ body: 'GENERAL_BODY' }, { type: { $in: ['GENERAL_BODY', 'GBM'] } }] },
      { startAt: { $gte: startDate, $lte: endDate } },
    ],
  }).lean();

  const allPso = await Meeting.find({
    $and: [
      { $or: [{ areaId }, { unitId: areaId }, { unitId: { $in: buIds } }, { basicUnitId: { $in: buIds } }] },
      { title: { $regex: /pso|student/i } },
      { startAt: { $gte: startDate, $lte: endDate } },
    ],
  }).lean();

  // All activities in the month
  const allActivities = await Activity.find({
    $and: [
      { $or: [{ areaId }, { unitId: areaId }, { unitId: { $in: buIds } }, { basicUnitId: { $in: buIds } }] },
      { startAt: { $gte: startDate, $lte: endDate } },
    ],
  }).populate('leadMemberId', 'fullName').populate('participants', 'fullName').sort({ startAt: -1 }).lean();

  // Donations in the month
  const allDonations = await Donation.find({
    $and: [
      { $or: [{ areaId }, { unitId: areaId }, { unitId: { $in: buIds } }, { basicUnitId: { $in: buIds } }] },
      { receivedAt: { $gte: startDate, $lte: endDate } },
      { $or: [{ state: 'APPROVED' }, { state: { $exists: false } }, { state: null }] },
    ],
  }).lean();

  // Program type label dictionary in Pashto
  const programTypeLabels = {
    PROTEST: 'مظاهره / لاريون',
    JALSA: 'اولسي جلسه / جرګه',
    CAMPAIGN: 'شموليت پروګرام / مهم',
    COMMUNITY_SERVICE: 'ټولنيز خدمت',
    TASK: 'تنظيمي دوره / کار',
    SEMINAR: 'سيمينار',
    STUDY_CIRCLE: 'سټډي سرکل',
    PARTY_CONFERENCE: 'پارټي کانفرنس',
  };

  const roleTitles = {
    SECRETARY: 'سيکرټري',
    SENIOR_MAWIN: 'سينئر مرستيال',
    FINANCE_SECRETARY: 'مالياتي سيکرټري',
    PRESS_SECRETARY: 'اطلاعات سيکرټري',
    CULTURE_SECRETARY: 'کلتوري سيکرټري',
    SPORTS_SECRETARY: 'لوبو سيکرټري',
    PRESIDENT: 'صدر',
  };

  // Cabinet members in area
  const cabinetSlots = await CabinetSlot.find({
    unitLevel: 'AREA',
    unitId: areaId,
    filledMemberId: { $exists: true, $ne: null },
  }).populate('filledMemberId', 'fullName status').lean();

  const execDateFormatted = latestExec?.startAt
    ? new Date(latestExec.startAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })
    : '';

  const committeeMembers = cabinetSlots.map((slot, i) => {
    const member = slot.filledMemberId;
    const mId = member?._id ? String(member._id) : '';

    const areaExecAttended = areaExecMeetings.filter(mt =>
      mt.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT')
    ).length;

    const areaCommAttended = areaCommittees.filter(mt =>
      mt.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT')
    ).length;

    const buExecAttended = buExecMeetings.filter(mt =>
      mt.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT')
    ).length;

    const buGbAttended = buGbMeetings.filter(mt =>
      mt.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT')
    ).length;

    const psoAttended = allPso.filter(mt =>
      mt.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT') ||
      String(mt.leadMemberId) === mId
    ).length;

    const confAttended = allActivities.filter(a =>
      ['PARTY_CONFERENCE'].includes(a.type || a.typeCode) &&
      (String(a.leadMemberId?._id || a.leadMemberId) === mId || a.participants?.some(p => String(p._id || p) === mId))
    ).length;

    const seminarAttended = allActivities.filter(a =>
      ['SEMINAR', 'SEM'].includes(a.type || a.typeCode) &&
      (String(a.leadMemberId?._id || a.leadMemberId) === mId || a.participants?.some(p => String(p._id || p) === mId))
    ).length;

    const studyAttended = allActivities.filter(a =>
      ['STUDY_CIRCLE', 'STC'].includes(a.type || a.typeCode) &&
      (String(a.leadMemberId?._id || a.leadMemberId) === mId || a.participants?.some(p => String(p._id || p) === mId))
    ).length;

    const inductionAttended = allActivities.filter(a =>
      ['CAMPAIGN'].includes(a.type || a.typeCode) &&
      (String(a.leadMemberId?._id || a.leadMemberId) === mId || a.participants?.some(p => String(p._id || p) === mId))
    ).length;

    const rallyAttended = allActivities.filter(a =>
      ['PROTEST', 'JALSA'].includes(a.type || a.typeCode) &&
      (String(a.leadMemberId?._id || a.leadMemberId) === mId || a.participants?.some(p => String(p._id || p) === mId))
    ).length;

    const tourAttended = allActivities.filter(a =>
      a.title && /tour|دوره/i.test(a.title) &&
      (String(a.leadMemberId?._id || a.leadMemberId) === mId || a.participants?.some(p => String(p._id || p) === mId))
    ).length;

    const inactiveContactAttended = allActivities.filter(a =>
      (/inactive|غير فعاله/i.test(a.title || '') || /inactive|غير فعاله/i.test(a.description || '')) &&
      (String(a.leadMemberId?._id || a.leadMemberId) === mId || a.participants?.some(p => String(p._id || p) === mId))
    ).length;

    const memberDonations = allDonations.filter(d => String(d.donorMemberId) === mId);
    const duesTotal = memberDonations.reduce((sum, d) => sum + (d.amount || 0), 0);

    const roleName = roleTitles[slot.roleCode] || slot.roleCode || '';

    return {
      srNo: i + 1,
      name: member?.fullName || '',
      role: roleName,
      date: execDateFormatted,
      areaExec: areaExecMeetings.length > 0 ? String(areaExecAttended) : '',
      areaComm: areaCommittees.length > 0 ? String(areaCommAttended) : '',
      unitExec: buExecMeetings.length > 0 ? String(buExecAttended) : '',
      unitGb: buGbMeetings.length > 0 ? String(buGbAttended) : '',
      pso: allPso.length > 0 ? String(psoAttended) : '',
      conf: confAttended > 0 ? String(confAttended) : '',
      seminar: seminarAttended > 0 ? String(seminarAttended) : '',
      studyCircle: studyAttended > 0 ? String(studyAttended) : '',
      induction: inductionAttended > 0 ? String(inductionAttended) : '',
      rally: rallyAttended > 0 ? String(rallyAttended) : '',
      reading: studyAttended > 0 ? String(studyAttended) : '',
      inactiveContact: inactiveContactAttended > 0 ? String(inactiveContactAttended) : '',
      dues: duesTotal > 0 ? String(duesTotal) : '',
      tour: tourAttended > 0 ? String(tourAttended) : '',
    };
  });

  const buMap = new Map(basicUnits.map(b => [String(b._id), b.name]));
  const getOrgName = (a) => {
    if (a.unitLevel === 'BASIC_UNIT') {
      const buId = String(a.basicUnitId || a.unitId);
      return buMap.get(buId) || areaName;
    }
    return areaName;
  };

  // Deduplicate identical activities if duplicate runs occurred
  const seenActs = new Set();
  const dedupedActivities = allActivities.filter(a => {
    const key = `${a.title}_${a.venue}_${a.startAt ? new Date(a.startAt).getTime() : ''}`;
    if (seenActs.has(key)) return false;
    seenActs.add(key);
    return true;
  });

  const publicActivitiesList = dedupedActivities.filter(a =>
    ['PROTEST', 'JALSA', 'CAMPAIGN', 'COMMUNITY_SERVICE', 'TASK'].includes(a.type || a.typeCode)
  );

  const educationalActivitiesList = dedupedActivities.filter(a =>
    ['SEMINAR', 'STUDY_CIRCLE', 'PARTY_CONFERENCE', 'SEM', 'STC'].includes(a.type || a.typeCode)
  );

  const bloodDonations = allDonations.filter(d => /blood|بلډ/i.test(d.note || '') || /blood|بلډ/i.test(d.donorType || ''));
  const zakatDonations = allDonations.filter(d => /zakat|زکات/i.test(d.note || '') || /zakat|زکات/i.test(d.donorType || ''));
  const bloodCash = bloodDonations.reduce((sum, d) => sum + (d.amount || 0), 0);
  const zakat = zakatDonations.reduce((sum, d) => sum + (d.amount || 0), 0);
  const bloodPosts = allActivities.filter(a => /blood|بلډ/i.test(a.title || '') || /blood|بلډ/i.test(a.description || '')).length;

  return {
    areaName,
    month: getPashtoMonth(m),
    year: String(y),
    inactiveUnits: inactiveUnits.map((u, i) => ({
      srNo: i + 1,
      unitName: u.name,
      reason: u.customData?.inactiveReason || u.customData?.reason || u.description || '',
      suggestion: u.customData?.suggestion || '',
    })),
    committeeMembers,
    publicActivities: publicActivitiesList.map((a, i) => {
      const speakers = [
        a.leadMemberId?.fullName,
        ...(Array.isArray(a.participants) ? a.participants.map(p => p.fullName || p).slice(0, 2) : [])
      ].filter(Boolean);

      const memCount = (a.participants && a.participants.length > 0)
        ? String(a.participants.length)
        : (a.leadMemberId ? '1' : '');

      return {
        srNo: i + 1,
        orgName: getOrgName(a),
        date: a.startAt ? new Date(a.startAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : '',
        location: a.venue || '',
        topic: a.title || '',
        programType: programTypeLabels[a.type || a.typeCode] || a.type || a.typeCode || '',
        speakers: speakers.join('، ') || '',
        memberCount: memCount,
        publicCount: a.externalAttendanceEstimate > 0 ? String(a.externalAttendanceEstimate) : '',
      };
    }),
    educationalActivities: educationalActivitiesList.map((a, i) => {
      const speakers = [
        a.leadMemberId?.fullName,
        ...(Array.isArray(a.participants) ? a.participants.map(p => p.fullName || p).slice(0, 2) : [])
      ].filter(Boolean);

      const memCount = (a.participants && a.participants.length > 0)
        ? String(a.participants.length)
        : (a.leadMemberId ? '1' : '');

      return {
        srNo: i + 1,
        orgName: getOrgName(a),
        date: a.startAt ? new Date(a.startAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : '',
        location: a.venue || '',
        topic: a.title || '',
        programType: programTypeLabels[a.type || a.typeCode] || a.type || a.typeCode || '',
        speakers: speakers.join('، ') || '',
        memberCount: memCount,
      };
    }),
    disciplinaryActions: [
      { name: '', role: '', violation: '', action: '' },
      { name: '', role: '', violation: '', action: '' },
    ],
    bloodBank: {
      bloodPosts: bloodPosts > 0 ? bloodPosts : '',
      bloodCash: bloodCash > 0 ? bloodCash : '',
      bloodTotalCash: bloodCash > 0 ? bloodCash : '',
      zakat: zakat > 0 ? zakat : '',
    },
    proposals: {
      political: { exec: '', comm: '', ind: '' },
      organizational: { exec: '', comm: '', ind: '' },
      social: { exec: '', comm: '', ind: '' },
      demands: '',
    },
    officeActivity: '',
    socialReport: '',
    misc: '',
    secSignature: '',
    seniorSecSignature: '',
  };
}

function generateForm3Html({
  areaName = '',
  month = '',
  year = '',
  inactiveUnits = [],
  committeeMembers = [],
  publicActivities = [],
  educationalActivities = [],
  disciplinaryActions = [],
  bloodBank = {},
  proposals = {},
  officeActivity = '',
  socialReport = '',
  misc = '',
  notes = '',
  secSignature = '',
  seniorSecSignature = '',
} = {}) {
  // Pad inactive units table
  const dispInactive = Array.isArray(inactiveUnits) ? [...inactiveUnits] : [];
  while (dispInactive.length < 3) {
    dispInactive.push({ srNo: dispInactive.length + 1, unitName: '', reason: '', suggestion: '' });
  }

  // Pad committee members table
  const dispComm = Array.isArray(committeeMembers) ? [...committeeMembers] : [];
  while (dispComm.length < 5) {
    dispComm.push({
      srNo: dispComm.length + 1, name: '', role: '', date: '', areaExec: '', areaComm: '', unitExec: '', unitGb: '',
      pso: '', conf: '', seminar: '', studyCircle: '', induction: '', rally: '', reading: '', inactiveContact: '', dues: '', tour: '',
    });
  }

  // Pad public activities
  const dispPublic = Array.isArray(publicActivities) ? [...publicActivities] : [];
  while (dispPublic.length < 3) {
    dispPublic.push({ srNo: dispPublic.length + 1, orgName: '', date: '', location: '', topic: '', programType: '', speakers: '', memberCount: '', publicCount: '' });
  }

  // Pad educational activities
  const dispEdu = Array.isArray(educationalActivities) ? [...educationalActivities] : [];
  while (dispEdu.length < 3) {
    dispEdu.push({ srNo: dispEdu.length + 1, orgName: '', date: '', location: '', topic: '', programType: '', speakers: '', memberCount: '' });
  }

  // Pad disciplinary actions into paired rows
  const dispDisc = Array.isArray(disciplinaryActions) && disciplinaryActions.length > 0
    ? [...disciplinaryActions]
    : [{ name: '', role: '', violation: '', action: '' }, { name: '', role: '', violation: '', action: '' }];
  while (dispDisc.length < 2) {
    dispDisc.push({ name: '', role: '', violation: '', action: '' });
  }
  const discRows = [];
  for (let i = 0; i < dispDisc.length; i += 2) {
    discRows.push({
      left: dispDisc[i] || { name: '', role: '', violation: '', action: '' },
      right: dispDisc[i + 1] || { name: '', role: '', violation: '', action: '' },
    });
  }

  return `<!DOCTYPE html>
<html lang="ps" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>علاقائي يونټ تفصيلي راپور</title>
  <style>
    ${getBaseCss()}
    @page {
      size: A4 portrait;
      margin: 6mm 6mm 6mm 6mm;
    }
    table.proforma-table th {
      font-size: 6.8pt;
    }
    table.proforma-table td {
      height: 20px;
      font-size: 7.2pt;
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
        علاقائي يونټ مياشتنۍ تفصيلي کار او فعاليت رپورټ
      </div>
      <div class="header-field">
        مياشت: <span class="line" style="min-width: 80px;">${month}</span>
        کال: <span class="line" style="min-width: 60px;">${year}</span>
      </div>
    </div>

    <!-- SECTION 1: Inactive Basic Units -->
    <div class="table-section-title">
      علاقائي يونټ کښي غير فعاله ابتدائي يونټانو نومونه،وجوهات / وړانديزونه
    </div>
    <table class="proforma-table">
      <thead>
        <tr>
          <th style="width: 5%;">شمير</th>
          <th style="width: 25%;">يونټ نوم</th>
          <th style="width: 40%;">غير فعاليت وجوهات</th>
          <th style="width: 30%;">وړانديز (تجاويز)</th>
        </tr>
      </thead>
      <tbody>
        ${dispInactive.map(u => `
          <tr>
            <td>${u.srNo}</td>
            <td>${u.unitName}</td>
            <td>${u.reason}</td>
            <td>${u.suggestion}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- SECTION 2: Higher Committee Members Activity -->
    <div class="table-section-title">
      علاقائي يونټ کښي مرکزي، زونل،ضلعي،علاقائي کميټي د غړو کار او فعاليت رپورټ
    </div>
    <table class="proforma-table">
      <thead>
        <tr>
          <th style="width: 3%;">شمير</th>
          <th style="width: 10%;">ملګري نوم</th>
          <th style="width: 8%;">عهده</th>
          <th style="width: 6%;">نيټه</th>
          <th style="width: 5%;">علاقائي<br>ايګزيکټيو</th>
          <th style="width: 5%;">علاقائي<br>کميټي</th>
          <th style="width: 5%;">يونټ<br>ايګزيکټيو</th>
          <th style="width: 5%;">يونټ<br>جنرل باډي</th>
          <th style="width: 5%;">پي ايس او<br>غونډي</th>
          <th style="width: 5%;">کانفرنس</th>
          <th style="width: 5%;">سيمينار</th>
          <th style="width: 5%;">سټډي<br>سرکل</th>
          <th style="width: 5%;">شموليت<br>پروګرام</th>
          <th style="width: 6%;">جلسه مظاهره<br>جرګه</th>
          <th style="width: 5%;">لوستنه<br>(مطالعه)</th>
          <th style="width: 7%;">غير فعاله ايګزيکټيو<br>او ملګرو سره رابطه</th>
          <th style="width: 5%;">چنده</th>
          <th style="width: 5%;">دوره</th>
        </tr>
      </thead>
      <tbody>
        ${dispComm.map(c => `
          <tr>
            <td>${c.srNo}</td>
            <td>${c.name}</td>
            <td>${c.role}</td>
            <td>${c.date}</td>
            <td>${c.areaExec}</td>
            <td>${c.areaComm}</td>
            <td>${c.unitExec}</td>
            <td>${c.unitGb}</td>
            <td>${c.pso}</td>
            <td>${c.conf}</td>
            <td>${c.seminar}</td>
            <td>${c.studyCircle}</td>
            <td>${c.induction}</td>
            <td>${c.rally}</td>
            <td>${c.reading}</td>
            <td>${c.inactiveContact}</td>
            <td>${c.dues}</td>
            <td>${c.tour}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- SECTION 3: Public Gatherings, Jirgas, Protests -->
    <div class="table-section-title">
      علاقائي يونټ کي اولسي غونډي، جلسے،مظاهرے، جرګے،کارنر ميټنګ،شموليت پرګرامونو رپورټ
    </div>
    <table class="proforma-table">
      <thead>
        <tr>
          <th style="width: 4%;">شمير</th>
          <th style="width: 12%;">ادارے نوم</th>
          <th style="width: 8%;">نيټه</th>
          <th style="width: 12%;">ځاي نوم</th>
          <th style="width: 18%;">موضوع</th>
          <th style="width: 12%;">څه پروګرام وو</th>
          <th style="width: 18%;">ويناکونکو ملګرونومونه</th>
          <th style="width: 8%;">ملګرو شمير</th>
          <th style="width: 8%;">دخلګو شمير</th>
        </tr>
      </thead>
      <tbody>
        ${dispPublic.map(p => `
          <tr>
            <td>${p.srNo}</td>
            <td>${p.orgName}</td>
            <td>${p.date}</td>
            <td>${p.location}</td>
            <td>${p.topic}</td>
            <td>${p.programType}</td>
            <td>${p.speakers}</td>
            <td>${p.memberCount}</td>
            <td>${p.publicCount}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- SECTION 4: Seminars and Conferences -->
    <div class="table-section-title">
      علاقائي يونټ کښي پارټي کانفرنس، سيمينار او سټډي سرکل
    </div>
    <table class="proforma-table">
      <thead>
        <tr>
          <th style="width: 4%;">شمير</th>
          <th style="width: 14%;">ادارے نوم</th>
          <th style="width: 8%;">نيټه</th>
          <th style="width: 14%;">ځاي نوم</th>
          <th style="width: 20%;">موضوع</th>
          <th style="width: 14%;">څه پروګرام وو</th>
          <th style="width: 18%;">ويناکونکو ملګرونومونه</th>
          <th style="width: 8%;">ملګرو شمير</th>
        </tr>
      </thead>
      <tbody>
        ${dispEdu.map(e => `
          <tr>
            <td>${e.srNo}</td>
            <td>${e.orgName}</td>
            <td>${e.date}</td>
            <td>${e.location}</td>
            <td>${e.topic}</td>
            <td>${e.programType}</td>
            <td>${e.speakers}</td>
            <td>${e.memberCount}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- SECTION 5: Disciplinary Actions -->
    <div class="table-section-title">
      علاقه کي تاديبي کاروائي
    </div>
    <table class="proforma-table">
      <thead>
        <tr>
          <th style="width: 15%;">ملګري نوم</th>
          <th style="width: 10%;">عهده</th>
          <th style="width: 15%;">څه خلاف ورزي يے کړے وه</th>
          <th style="width: 10%;">تاديبي کاروئي</th>
          <th style="width: 15%;">ملګري نوم</th>
          <th style="width: 10%;">عهده</th>
          <th style="width: 15%;">څه خلاف ورزي يے کړے وه</th>
          <th style="width: 10%;">تاديبي کاروائي</th>
        </tr>
      </thead>
      <tbody>
        ${discRows.map(r => `
          <tr>
            <td>${r.left.name || '&nbsp;'}</td>
            <td>${r.left.role || ''}</td>
            <td>${r.left.violation || ''}</td>
            <td>${r.left.action || ''}</td>
            <td>${r.right.name || '&nbsp;'}</td>
            <td>${r.right.role || ''}</td>
            <td>${r.right.violation || ''}</td>
            <td>${r.right.action || ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- SECTION 6: Blood Bank & Zakat -->
    <div class="table-section-title">
      علاقائي يونټ کښي بلډ بينک د پاره پوستونه،نغدي او زکات رپورټ
    </div>
    <table class="proforma-table">
      <thead>
        <tr>
          <th style="width: 25%;">پوستونه شمير</th>
          <th style="width: 25%;">نغدي</th>
          <th style="width: 25%;">ټولي نغدي</th>
          <th style="width: 25%;">زکات</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${bloodBank?.bloodPosts ?? '&nbsp;'}</td>
          <td>${bloodBank?.bloodCash ? (typeof bloodBank.bloodCash === 'number' ? bloodBank.bloodCash.toLocaleString() : bloodBank.bloodCash) : ''}</td>
          <td>${bloodBank?.bloodTotalCash ? (typeof bloodBank.bloodTotalCash === 'number' ? bloodBank.bloodTotalCash.toLocaleString() : bloodBank.bloodTotalCash) : ''}</td>
          <td>${bloodBank?.zakat ? (typeof bloodBank.zakat === 'number' ? bloodBank.zakat.toLocaleString() : bloodBank.zakat) : ''}</td>
        </tr>
      </tbody>
    </table>

    <!-- SECTION 7: Proposals & Demands -->
    <div class="table-section-title">
      وړانديزونه (پيشنهادونه،تجاويز) او غوښتنې
    </div>
    <table class="proforma-table">
      <thead>
        <tr>
          <th rowspan="2" style="width: 15%;">ډول</th>
          <th colspan="3">وړانديزونه او غوښتني</th>
        </tr>
        <tr>
          <th style="width: 28%;">ايګزيکټيو لخوا</th>
          <th style="width: 28%;">يونټ او علاقائي کميټي لخوا</th>
          <th style="width: 29%;">فرد لخوا</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="font-weight: 700;">سياسي</td>
          <td style="height: 32px;">${proposals?.political?.exec || ''}</td>
          <td>${proposals?.political?.comm || ''}</td>
          <td>${proposals?.political?.ind || ''}</td>
        </tr>
        <tr>
          <td style="font-weight: 700;">تنظيمي</td>
          <td style="height: 32px;">${proposals?.organizational?.exec || ''}</td>
          <td>${proposals?.organizational?.comm || ''}</td>
          <td>${proposals?.organizational?.ind || ''}</td>
        </tr>
        <tr>
          <td style="font-weight: 700;">ټولنيزو کارو</td>
          <td style="height: 32px;">${proposals?.social?.exec || ''}</td>
          <td>${proposals?.social?.comm || ''}</td>
          <td>${proposals?.social?.ind || ''}</td>
        </tr>
      </tbody>
    </table>

    <!-- SECTION 8: Office Activity & Signatures -->
    <div style="margin-top: 14px; font-size: 8.5pt; line-height: 1.8;">
      <div><strong>۱۔ علاقائي دوتر فعاليت:</strong> <span style="display: inline-block; width: 80%; border-bottom: 1px dotted #000; padding: 0 4px;">${officeActivity || '&nbsp;'}</span></div>
      <div><strong>۲۔ ټولنيزو کارو لنډ رپورټ:</strong> <span style="display: inline-block; width: 79%; border-bottom: 1px dotted #000; padding: 0 4px;">${socialReport || '&nbsp;'}</span></div>
      <div style="margin-top: 8px;"><strong>۳۔ متفرق:</strong> <span style="display: inline-block; width: 88%; border-bottom: 1px dotted #000; padding: 0 4px;">${misc || notes || '&nbsp;'}</span></div>
    </div>

    <div style="display: flex; justify-content: space-between; margin-top: 24px; padding: 0 20px; font-size: 9pt; font-weight: 700;">
      <div>
        علاقائي سيکرټري لاسليک: <span class="line" style="min-width: 200px;">${secSignature || ''}</span>
      </div>
      <div>
        علاقائي سينئر معاون لاس ليک: <span class="line" style="min-width: 200px;">${seniorSecSignature || ''}</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function generateForm3Excel({
  areaName = '',
  month = '',
  year = '',
  inactiveUnits = [],
  committeeMembers = [],
  publicActivities = [],
  educationalActivities = [],
  disciplinaryActions = [],
  bloodBank = {},
  proposals = {},
  officeActivity = '',
  socialReport = '',
  misc = '',
  notes = '',
  secSignature = '',
  seniorSecSignature = '',
} = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('تفصيلي راپور', {
    views: [{ rightToLeft: true }],
    pageSetup: { orientation: 'portrait', paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });

  const FONT_TITLE = { name: 'Noto Naskh Arabic', size: 14, bold: true };
  const FONT_SEC = { name: 'Noto Naskh Arabic', size: 11, bold: true, color: { argb: 'FF1E293B' } };
  const FONT_HEADER = { name: 'Noto Naskh Arabic', size: 8, bold: true };
  const FONT_DATA = { name: 'Noto Naskh Arabic', size: 8 };

  let r = 1;
  ws.mergeCells(`A${r}:C${r}`);
  ws.getCell(`A${r}`).value = `علاقائي يونټ نوم: ${areaName}`;
  ws.getCell(`A${r}`).font = { name: 'Noto Naskh Arabic', size: 10, bold: true };

  ws.mergeCells(`D${r}:G${r}`);
  ws.getCell(`D${r}`).value = 'علاقائي يونټ مياشتنۍ تفصيلي کار او فعاليت رپورټ';
  ws.getCell(`D${r}`).font = FONT_TITLE;
  ws.getCell(`D${r}`).alignment = { horizontal: 'center' };

  ws.mergeCells(`H${r}:I${r}`);
  ws.getCell(`H${r}`).value = `مياشت: ${month}  کال: ${year}`;
  ws.getCell(`H${r}`).font = { name: 'Noto Naskh Arabic', size: 10, bold: true };

  // Section 1
  r += 2;
  ws.mergeCells(`A${r}:I${r}`);
  ws.getCell(`A${r}`).value = 'علاقائي يونټ کښي غير فعاله ابتدائي يونټانو نومونه،وجوهات / وړانديزونه';
  ws.getCell(`A${r}`).font = FONT_SEC;

  r += 1;
  ws.getRow(r).values = ['شمير', 'يونټ نوم', 'غير فعاليت وجوهات', 'وړانديز (تجاويز)'];
  ws.getRow(r).font = FONT_HEADER;

  if (inactiveUnits.length === 0) {
    r += 1;
    ws.getRow(r).values = [1, 'هيڅ نشته (ټول يونټونه فعاله دي)', '', ''];
    ws.getRow(r).font = FONT_DATA;
  } else {
    inactiveUnits.forEach((u, idx) => {
      r += 1;
      ws.getRow(r).values = [u.srNo || idx + 1, u.unitName, u.reason || '', u.suggestion || ''];
      ws.getRow(r).font = FONT_DATA;
    });
  }

  // Section 2
  r += 2;
  ws.mergeCells(`A${r}:R${r}`);
  ws.getCell(`A${r}`).value = 'علاقائي يونټ کښي مرکزي، زونل،ضلعي،علاقائي کميټي د غړو کار او فعاليت رپورټ';
  ws.getCell(`A${r}`).font = FONT_SEC;

  r += 1;
  ws.getRow(r).values = [
    'شمير', 'ملګري نوم', 'عهده', 'نيټه', 'علاقائي ايګزيکټيو', 'علاقائي کميټي',
    'يونټ ايګزيکټيو', 'يونټ جنرل باډي', 'پي ايس او غونډي', 'کانفرنس', 'سيمينار',
    'سټډي سرکل', 'شموليت پروګرام', 'جلسه مظاهره جرګه', 'لوستنه',
    'غير فعاله رابطه', 'چنده', 'دوره'
  ];
  ws.getRow(r).font = FONT_HEADER;

  committeeMembers.forEach((c, idx) => {
    r += 1;
    ws.getRow(r).values = [
      c.srNo || idx + 1, c.name, c.role, c.date, c.areaExec, c.areaComm,
      c.unitExec, c.unitGb, c.pso, c.conf, c.seminar, c.studyCircle,
      c.induction, c.rally, c.reading, c.inactiveContact, c.dues, c.tour
    ];
    ws.getRow(r).font = FONT_DATA;
  });

  // Section 3
  r += 2;
  ws.mergeCells(`A${r}:I${r}`);
  ws.getCell(`A${r}`).value = 'علاقائي يونټ کي اولسي غونډي، جلسے،مظاهرے، جرګے،کارنر ميټنګ،شموليت پرګرامونو رپورټ';
  ws.getCell(`A${r}`).font = FONT_SEC;

  r += 1;
  ws.getRow(r).values = [
    'شمير', 'ادارے نوم', 'نيټه', 'ځاي نوم', 'موضوع',
    'څه پروګرام وو', 'ويناکونکو ملګرونومونه', 'ملګرو شمير', 'دخلګو شمير'
  ];
  ws.getRow(r).font = FONT_HEADER;

  publicActivities.forEach((p, idx) => {
    r += 1;
    ws.getRow(r).values = [
      p.srNo || idx + 1, p.orgName, p.date, p.location, p.topic,
      p.programType, p.speakers, p.memberCount, p.publicCount
    ];
    ws.getRow(r).font = FONT_DATA;
  });

  // Section 4
  r += 2;
  ws.mergeCells(`A${r}:H${r}`);
  ws.getCell(`A${r}`).value = 'علاقائي يونټ کښي پارټي کانفرنس، سيمينار او سټډي سرکل';
  ws.getCell(`A${r}`).font = FONT_SEC;

  r += 1;
  ws.getRow(r).values = [
    'شمير', 'ادارے نوم', 'نيټه', 'ځاي نوم', 'موضوع',
    'څه پروګرام وو', 'ويناکونکو ملګرونومونه', 'ملګرو شمير'
  ];
  ws.getRow(r).font = FONT_HEADER;

  educationalActivities.forEach((e, idx) => {
    r += 1;
    ws.getRow(r).values = [
      e.srNo || idx + 1, e.orgName, e.date, e.location, e.topic,
      e.programType, e.speakers, e.memberCount
    ];
    ws.getRow(r).font = FONT_DATA;
  });

  // Section 5
  r += 2;
  ws.mergeCells(`A${r}:H${r}`);
  ws.getCell(`A${r}`).value = 'علاقه کي تاديبي کاروائي';
  ws.getCell(`A${r}`).font = FONT_SEC;

  r += 1;
  ws.getRow(r).values = [
    'ملګري نوم', 'عهده', 'څه خلاف ورزي يې کړې وه', 'تاديبي کاروايي',
    'ملګري نوم', 'عهده', 'څه خلاف ورزي يې کړې وه', 'تاديبي کاروايي'
  ];
  ws.getRow(r).font = FONT_HEADER;

  const dispDisc = Array.isArray(disciplinaryActions) && disciplinaryActions.length > 0
    ? [...disciplinaryActions]
    : [{ name: '', role: '', violation: '', action: '' }];
  for (let i = 0; i < dispDisc.length; i += 2) {
    const left = dispDisc[i] || {};
    const right = dispDisc[i + 1] || {};
    r += 1;
    ws.getRow(r).values = [
      left.name || '', left.role || '', left.violation || '', left.action || '',
      right.name || '', right.role || '', right.violation || '', right.action || ''
    ];
    ws.getRow(r).font = FONT_DATA;
  }

  // Section 6
  r += 2;
  ws.mergeCells(`A${r}:D${r}`);
  ws.getCell(`A${r}`).value = 'علاقائي يونټ کښي بلډ بينک د پاره پوستونه، نغدي او زکات رپورټ';
  ws.getCell(`A${r}`).font = FONT_SEC;

  r += 1;
  ws.getRow(r).values = ['پوستونه شمير', 'نغدي', 'ټولي نغدي', 'زکات'];
  ws.getRow(r).font = FONT_HEADER;

  r += 1;
  ws.getRow(r).values = [
    bloodBank?.bloodPosts || 0,
    bloodBank?.bloodCash || 0,
    bloodBank?.bloodTotalCash || 0,
    bloodBank?.zakat || 0
  ];
  ws.getRow(r).font = FONT_DATA;

  // Section 7
  r += 2;
  ws.mergeCells(`A${r}:D${r}`);
  ws.getCell(`A${r}`).value = 'وړانديزونه (پيشنهادونه، تجاویز) او غوښتنې';
  ws.getCell(`A${r}`).font = FONT_SEC;

  r += 1;
  ws.getRow(r).values = ['ډول', 'ايګزيکټيو لخوا', 'يونټ او علاقائي کميټي لخوا', 'فرد لخوا'];
  ws.getRow(r).font = FONT_HEADER;

  r += 1;
  ws.getRow(r).values = ['سياسي', proposals?.political?.exec || '', proposals?.political?.comm || '', proposals?.political?.ind || ''];
  ws.getRow(r).font = FONT_DATA;

  r += 1;
  ws.getRow(r).values = ['تنظيمي', proposals?.organizational?.exec || '', proposals?.organizational?.comm || '', proposals?.organizational?.ind || ''];
  ws.getRow(r).font = FONT_DATA;

  r += 1;
  ws.getRow(r).values = ['ټولنيزو کارو', proposals?.social?.exec || '', proposals?.social?.comm || '', proposals?.social?.ind || ''];
  ws.getRow(r).font = FONT_DATA;

  // Section 8
  r += 2;
  ws.mergeCells(`A${r}:F${r}`);
  ws.getCell(`A${r}`).value = 'علاقائي دفتر فعاليت، ټولنيز کارونه او لاسليکونه';
  ws.getCell(`A${r}`).font = FONT_SEC;

  r += 1;
  ws.getRow(r).values = ['۱۔ علاقائي دفتر فعاليت:', officeActivity || ''];
  ws.getRow(r).font = FONT_DATA;

  r += 1;
  ws.getRow(r).values = ['۲۔ ټولنيزو کارو لنډ رپورټ:', socialReport || ''];
  ws.getRow(r).font = FONT_DATA;

  r += 1;
  ws.getRow(r).values = ['۳۔ متفرق:', misc || notes || ''];
  ws.getRow(r).font = FONT_DATA;

  r += 1;
  ws.getRow(r).values = ['علاقائي سيکرټري لاسليک:', secSignature || '', '', 'علاقائي سينئر معاون لاس ليک:', seniorSecSignature || ''];
  ws.getRow(r).font = FONT_DATA;

  return wb;
}

module.exports = {
  fetchForm3Data,
  generateForm3Html,
  generateForm3Excel,
};
