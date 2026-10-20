const ExcelJS = require('exceljs');
const { getBaseCss, getPashtoMonth } = require('./common');

async function fetchForm5Data({ provinceId, fromDate, toDate, year, month }) {
  const Province = require('../../models/Province');
  const CabinetSlot = require('../../models/CabinetSlot');
  const Member = require('../../models/Member');
  const Meeting = require('../../models/Meeting');
  const Activity = require('../../models/Activity');
  const Donation = require('../../models/Donation');

  const mongoose = require('mongoose');
  let province = null;
  if (provinceId && mongoose.Types.ObjectId.isValid(provinceId)) {
    province = await Province.findById(provinceId).lean();
  }
  const provinceName = province ? province.name : '';

  const y = parseInt(year, 10) || new Date().getFullYear();
  const m = month ? parseInt(month, 10) : null;

  let startDate, endDate, dispFrom, dispTo;

  function parseInputDate(str, isEnd = false) {
    if (!str || typeof str !== 'string') return null;
    const trimmed = str.trim();
    if (!trimmed) return null;

    // DD/MM (e.g. "01/10" or "31/10")
    const dmMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (dmMatch) {
      const d = parseInt(dmMatch[1], 10);
      const mo = parseInt(dmMatch[2], 10);
      if (isEnd) return new Date(Date.UTC(y, mo - 1, d, 23, 59, 59, 999));
      return new Date(Date.UTC(y, mo - 1, d, 0, 0, 0, 0));
    }

    // DD/MM/YYYY
    const dmyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (dmyMatch) {
      const d = parseInt(dmyMatch[1], 10);
      const mo = parseInt(dmyMatch[2], 10);
      const yr = parseInt(dmyMatch[3], 10);
      if (isEnd) return new Date(Date.UTC(yr, mo - 1, d, 23, 59, 59, 999));
      return new Date(Date.UTC(yr, mo - 1, d, 0, 0, 0, 0));
    }

    // YYYY-MM-DD
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (ymdMatch) {
      const yr = parseInt(ymdMatch[1], 10);
      const mo = parseInt(ymdMatch[2], 10);
      const d = parseInt(ymdMatch[3], 10);
      if (isEnd) return new Date(Date.UTC(yr, mo - 1, d, 23, 59, 59, 999));
      return new Date(Date.UTC(yr, mo - 1, d, 0, 0, 0, 0));
    }

    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed;
    return null;
  }

  const parsedStart = parseInputDate(fromDate, false);
  const parsedEnd = parseInputDate(toDate, true);

  if (parsedStart && parsedEnd) {
    startDate = parsedStart;
    endDate = parsedEnd;
    dispFrom = fromDate.trim();
    dispTo = toDate.trim();
  } else if (m) {
    startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
    dispFrom = `01/${String(m).padStart(2, '0')}`;
    dispTo = `${new Date(y, m, 0).getDate()}/${String(m).padStart(2, '0')}`;
  } else {
    startDate = new Date(Date.UTC(y, 0, 1, 0, 0, 0));
    endDate = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
    dispFrom = '01/01';
    dispTo = '31/12';
  }

  // Provincial Cabinet members
  const cabinetSlots = await CabinetSlot.find({
    unitLevel: 'PROVINCE',
    unitId: provinceId,
    filledMemberId: { $exists: true, $ne: null },
  }).populate('filledMemberId', 'fullName status bloodGroup basicUnitId').lean();

  const memberIds = cabinetSlots.map(s => s.filledMemberId?._id).filter(Boolean);

  // All relevant meetings
  const allMeetings = await Meeting.find({
    $and: [
      {
        $or: [
          { provinceId },
          { unitLevel: 'CENTRAL' },
          { 'attendance.memberId': { $in: memberIds } },
        ],
      },
      { startAt: { $gte: startDate, $lte: endDate } },
    ],
  }).lean();

  // All relevant activities
  const allActivities = await Activity.find({
    $and: [
      {
        $or: [
          { provinceId },
          { unitId: provinceId },
          { leadMemberId: { $in: memberIds } },
          { participants: { $in: memberIds } },
        ],
      },
      { startAt: { $gte: startDate, $lte: endDate } },
    ],
  }).lean();

  // Donations by these members
  const allDonations = await Donation.find({
    donorMemberId: { $in: memberIds },
    receivedAt: { $gte: startDate, $lte: endDate },
    $or: [{ state: 'APPROVED' }, { state: { $exists: false } }, { state: null }],
  }).lean();

  const rows = cabinetSlots.map((slot, i) => {
    const mem = slot.filledMemberId;
    const mId = mem?._id ? String(mem._id) : '';
    const ownBuId = mem?.basicUnitId ? String(mem.basicUnitId) : '';

    const attended = (m) => m.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT');
    const actAttended = (a) => String(a.leadMemberId) === mId || a.participants?.some(p => String(p?._id || p) === mId);

    // Meetings by level & body
    const centralComm = allMeetings.filter(m => m.unitLevel === 'CENTRAL' && attended(m)).length;
    const provincialJirga = allMeetings.filter(m => m.unitLevel === 'PROVINCE' && m.body === 'JIRGA' && attended(m)).length;
    const provincialExec = allMeetings.filter(m => m.unitLevel === 'PROVINCE' && (m.body === 'EXECUTIVE' || ['EXECUTIVE', 'EXC'].includes(m.type)) && attended(m)).length;
    const provincialComm = allMeetings.filter(m => m.unitLevel === 'PROVINCE' && (m.body === 'COMMITTEE' || ['COMMITTEE', 'CMP'].includes(m.type)) && attended(m)).length;
    const districtExec = allMeetings.filter(m => m.unitLevel === 'DISTRICT' && (m.body === 'EXECUTIVE' || ['EXECUTIVE', 'EXC'].includes(m.type)) && attended(m)).length;
    const districtComm = allMeetings.filter(m => m.unitLevel === 'DISTRICT' && (m.body === 'COMMITTEE' || ['COMMITTEE', 'CMP'].includes(m.type)) && attended(m)).length;
    const areaExec = allMeetings.filter(m => m.unitLevel === 'AREA' && (m.body === 'EXECUTIVE' || ['EXECUTIVE', 'EXC'].includes(m.type)) && attended(m)).length;
    const areaComm = allMeetings.filter(m => m.unitLevel === 'AREA' && (m.body === 'COMMITTEE' || ['COMMITTEE', 'CMP'].includes(m.type)) && attended(m)).length;
    const basicUnitsExec = allMeetings.filter(m => m.unitLevel === 'BASIC_UNIT' && (m.body === 'EXECUTIVE' || ['EXECUTIVE', 'EXC'].includes(m.type)) && attended(m)).length;
    const basicUnitsGb = allMeetings.filter(m => m.unitLevel === 'BASIC_UNIT' && (m.body === 'GENERAL_BODY' || m.body === 'GENERAL' || ['GENERAL_BODY', 'GB'].includes(m.type) || !['EXECUTIVE', 'EXC'].includes(m.type)) && attended(m)).length;
    const ownBasicUnit = allMeetings.filter(m => ownBuId && (String(m.unitId) === ownBuId || String(m.basicUnitId) === ownBuId) && attended(m)).length;
    const psoMeetings = allMeetings.filter(m => /pso|student|پي ايس او/i.test(m.title || '') && attended(m)).length;

    // Activities by type
    const partyConferences = allActivities.filter(a => ['PARTY_CONFERENCE'].includes(a.type || a.typeCode) && actAttended(a)).length;
    const seminars = allActivities.filter(a => ['SEMINAR', 'SEM'].includes(a.type || a.typeCode) && actAttended(a)).length;
    const studyCircles = allActivities.filter(a => ['STUDY_CIRCLE', 'STC'].includes(a.type || a.typeCode) && actAttended(a)).length;
    const inductions = allActivities.filter(a => ['CAMPAIGN', 'INDUCTION'].includes(a.type || a.typeCode) && actAttended(a)).length;
    const ralliesAndProtests = allActivities.filter(a => ['JALSA', 'PROTEST'].includes(a.type || a.typeCode) && actAttended(a)).length;
    const jirgasAndCornerMeetings = allActivities.filter(a => (a.body === 'JIRGA' || /corner|جرګه/i.test(a.title || '')) && actAttended(a)).length;
    const pressConferences = allActivities.filter(a => (/press|پريس/i.test(a.title || '') || a.type === 'PRESS_CONFERENCE') && actAttended(a)).length;
    const alliedMeetings = allActivities.filter(a => (/allied|alliance|اتحادي/i.test(a.title || '') || /allied|alliance/i.test(a.description || '')) && actAttended(a)).length;

    const totalMeetings = centralComm + provincialJirga + provincialExec + provincialComm + districtExec + districtComm + areaExec + areaComm + basicUnitsExec + basicUnitsGb + ownBasicUnit + psoMeetings;

    const duesTotal = allDonations.filter(d => String(d.donorMemberId) === mId).reduce((s, d) => s + (d.amount || 0), 0);
    const tours = allActivities.filter(a => (/tour|دوره/i.test(a.title || '') || a.type === 'TASK') && actAttended(a)).length;

    return {
      srNo: i + 1,
      name: mem?.fullName || slot.roleCode || '',
      centralComm: centralComm > 0 ? String(centralComm) : '',
      provincialJirga: provincialJirga > 0 ? String(provincialJirga) : '',
      provincialExec: provincialExec > 0 ? String(provincialExec) : '',
      provincialComm: provincialComm > 0 ? String(provincialComm) : '',
      districtExec: districtExec > 0 ? String(districtExec) : '',
      districtComm: districtComm > 0 ? String(districtComm) : '',
      areaExec: areaExec > 0 ? String(areaExec) : '',
      areaComm: areaComm > 0 ? String(areaComm) : '',
      basicUnitsExec: basicUnitsExec > 0 ? String(basicUnitsExec) : '',
      basicUnitsGb: basicUnitsGb > 0 ? String(basicUnitsGb) : '',
      ownBasicUnit: ownBasicUnit > 0 ? String(ownBasicUnit) : '',
      psoMeetings: psoMeetings > 0 ? String(psoMeetings) : '',
      partyConferences: partyConferences > 0 ? String(partyConferences) : '',
      seminars: seminars > 0 ? String(seminars) : '',
      studyCircles: studyCircles > 0 ? String(studyCircles) : '',
      inductions: inductions > 0 ? String(inductions) : '',
      ralliesAndProtests: ralliesAndProtests > 0 ? String(ralliesAndProtests) : '',
      jirgasAndCornerMeetings: jirgasAndCornerMeetings > 0 ? String(jirgasAndCornerMeetings) : '',
      pressConferences: pressConferences > 0 ? String(pressConferences) : '',
      alliedMeetings: alliedMeetings > 0 ? String(alliedMeetings) : '',
      totalMeetings: totalMeetings > 0 ? String(totalMeetings) : '',
      dues: duesTotal > 0 ? String(duesTotal) : '',
      tours: tours > 0 ? String(tours) : '',
      reading: studyCircles > 0 ? String(studyCircles) : '',
      bloodBankPosts: mem?.bloodGroup ? String(mem.bloodGroup) : '',
    };
  });

  return {
    provinceName,
    fromDate: dispFrom,
    toDate: dispTo,
    year: String(y),
    rows,
  };
}

function generateForm5Html({ provinceName = '', fromDate = '', toDate = '', year = '', rows = [] } = {}) {
  const dispRows = [...rows];
  while (dispRows.length < 16) {
    dispRows.push({
      srNo: dispRows.length + 1,
      name: '',
      centralComm: '',
      provincialJirga: '',
      provincialExec: '',
      provincialComm: '',
      districtExec: '',
      districtComm: '',
      areaExec: '',
      areaComm: '',
      basicUnitsExec: '',
      basicUnitsGb: '',
      ownBasicUnit: '',
      psoMeetings: '',
      partyConferences: '',
      seminars: '',
      studyCircles: '',
      inductions: '',
      ralliesAndProtests: '',
      jirgasAndCornerMeetings: '',
      pressConferences: '',
      alliedMeetings: '',
      totalMeetings: '',
      dues: '',
      tours: '',
      reading: '',
      bloodBankPosts: '',
    });
  }

  return `<!DOCTYPE html>
<html lang="ps" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>پښتونخوا نېشنل عوامي پارټي صوبائي ايګزيکټيو ځانګړي (انفرادي) کار او فعاليت رپورټ</title>
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
        صوبے نوم: <span class="line">${provinceName}</span>
      </div>
      <div class="report-title">
        پښتونخوا نېشنل عوامي پارټي صوبائي ايګزيکټيو ځانګړي (انفرادي) کار او فعاليت رپورټ
      </div>
      <div class="header-field">
        کال: <span class="line" style="min-width: 50px;">${year}</span>
        مياشت او نيټه څخه: <span class="line" style="min-width: 70px;">${fromDate}</span>
        تر مياشت او نيټه پوري: <span class="line" style="min-width: 70px;">${toDate}</span>
      </div>
    </div>

    <table class="proforma-table">
      <thead>
        <tr>
          <th rowspan="2" style="width: 1.8%;">شمير</th>
          <th rowspan="2" style="width: 7.2%;">ايګزيکټيو نوم</th>
          <th rowspan="2" style="width: 3.4%;">مرکزي<br>کميټي<br>غونډي</th>
          <th rowspan="2" style="width: 3.4%;">صوبائي<br>جرګے<br>غونډي</th>
          <th rowspan="2" style="width: 3.4%;">صوبائي<br>ايګزيکټيو<br>غونډي</th>
          <th rowspan="2" style="width: 3.4%;">صوبائي<br>کميټي<br>غونډي</th>
          <th rowspan="2" style="width: 3.4%;">ضلع<br>ايګزيکټيو<br>غونډي</th>
          <th rowspan="2" style="width: 3.4%;">ضلعي<br>کميټي<br>غونډي</th>
          <th rowspan="2" style="width: 3.4%;">علاقائي<br>ايګزيکټيو<br>غونډي</th>
          <th rowspan="2" style="width: 3.4%;">علاقائي<br>کميټي<br>غونډي</th>
          <th rowspan="2" style="width: 3.8%;">ابتدائي يونټانو<br>ايګزيکټيو<br>غونډي</th>
          <th rowspan="2" style="width: 3.4%;">ابتدائي يونټانو<br>غونډي</th>
          <th rowspan="2" style="width: 3.4%;">خپل ابتدائي<br>يونټ<br>غونډي</th>
          <th rowspan="2" style="width: 2.8%;">PSO<br>غونډي</th>
          <th rowspan="2" style="width: 3.4%;">پارټي<br>کانفرنسونه</th>
          <th rowspan="2" style="width: 3.0%;">سيمينارونه</th>
          <th rowspan="2" style="width: 2.8%;">سټډي<br>سرکل</th>
          <th rowspan="2" style="width: 3.8%;">نوي شموليت<br>پروګرامونه</th>
          <th colspan="2">اولسي غونډي</th>
          <th rowspan="2" style="width: 3.4%;">پريس<br>کانفرنسونه</th>
          <th rowspan="2" style="width: 4.2%;">اتحاديانو / سياسي<br>پارټيانو سره غونډي</th>
          <th rowspan="2" style="width: 2.8%;">ټولي<br>غونډي</th>
          <th rowspan="2" style="width: 2.8%;">چنده</th>
          <th rowspan="2" style="width: 2.6%;">دوره</th>
          <th rowspan="2" style="width: 3.4%;">لوستنه<br>(مطالعه)</th>
          <th rowspan="2" style="width: 3.2%;">بلډ بينک<br>پوست</th>
        </tr>
        <tr>
          <th style="width: 3.0%;">جلسے<br>مظاهرے</th>
          <th style="width: 3.4%;">جرګے کارنر<br>ميټنګونه</th>
        </tr>
      </thead>
      <tbody>
        ${dispRows.map((r, i) => `
          <tr>
            <td>${r.srNo || (i + 1)}</td>
            <td style="font-weight: 600;">${r.name || ''}</td>
            <td>${r.centralComm || ''}</td>
            <td>${r.provincialJirga || ''}</td>
            <td>${r.provincialExec || ''}</td>
            <td>${r.provincialComm || ''}</td>
            <td>${r.districtExec || ''}</td>
            <td>${r.districtComm || ''}</td>
            <td>${r.areaExec || ''}</td>
            <td>${r.areaComm || ''}</td>
            <td>${r.basicUnitsExec || ''}</td>
            <td>${r.basicUnitsGb || ''}</td>
            <td>${r.ownBasicUnit || ''}</td>
            <td>${r.psoMeetings || ''}</td>
            <td>${r.partyConferences || ''}</td>
            <td>${r.seminars || ''}</td>
            <td>${r.studyCircles || ''}</td>
            <td>${r.inductions || ''}</td>
            <td>${r.ralliesAndProtests || ''}</td>
            <td>${r.jirgasAndCornerMeetings || ''}</td>
            <td>${r.pressConferences || ''}</td>
            <td>${r.alliedMeetings || ''}</td>
            <td>${r.totalMeetings || ''}</td>
            <td>${r.dues || ''}</td>
            <td>${r.tours || ''}</td>
            <td>${r.reading || ''}</td>
            <td>${r.bloodBankPosts || ''}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

async function generateForm5Excel({ provinceName = '', fromDate = '', toDate = '', year = '', rows = [] } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('صوبائي ايګزيکټيو رپورټ', {
    views: [{ rightToLeft: true }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1 },
  });

  const FONT_TITLE = { name: 'Noto Naskh Arabic', size: 13, bold: true };
  const FONT_HEADER = { name: 'Noto Naskh Arabic', size: 8, bold: true };
  const FONT_DATA = { name: 'Noto Naskh Arabic', size: 8 };

  ws.mergeCells('A1:C1');
  ws.getCell('A1').value = `صوبې نوم: ${provinceName}`;
  ws.getCell('A1').font = { name: 'Noto Naskh Arabic', size: 10, bold: true };

  ws.mergeCells('H1:T1');
  ws.getCell('H1').value = 'پښتونخوا نېشنل عوامي پارټي صوبائي ايګزيکټيو ځانګړي (انفرادي) کار او فعاليت رپورټ';
  ws.getCell('H1').font = FONT_TITLE;
  ws.getCell('H1').alignment = { horizontal: 'center' };

  ws.mergeCells('V1:AA1');
  ws.getCell('V1').value = `کال: ${year}  مياشت او نيټه څخه: ${fromDate}  تر مياشت او نيټه پوري: ${toDate}`;
  ws.getCell('V1').font = { name: 'Noto Naskh Arabic', size: 9, bold: true };

  const headers = [
    'شمير', 'ايګزيکټيو نوم', 'مرکزي کميټي غونډي', 'صوبائي جرګے غونډي', 'صوبائي ايګزيکټيو غونډي', 'صوبائي کميټي غونډي',
    'ضلع ايګزيکټيو غونډي', 'ضلعي کميټي غونډي', 'علاقائي ايګزيکټيو غونډي', 'علاقائي کميټي غونډي', 'ابتدائي يونټانو ايګزيکټيو غونډي',
    'ابتدائي يونټانو غونډي', 'خپل ابتدائي يونټ غونډي', 'PSO غونډي', 'پارټي کانفرنسونه', 'سيمينارونه', 'سټډي سرکل', 'نوي شموليت پروګرامونه',
    'جلسے مظاهرے', 'جرګے کارنر ميټنګونه', 'پريس کانفرنسونه', 'اتحاديانو / سياسي پارټيانو سره غونډي', 'ټولي غونډي', 'چنده',
    'دوره', 'لوستنه (مطالعه)', 'بلډ بينک پوسټ'
  ];

  ws.getRow(3).values = headers;
  ws.getRow(3).font = FONT_HEADER;

  rows.forEach((r, idx) => {
    const rowNum = 4 + idx;
    ws.getRow(rowNum).values = [
      r.srNo || idx + 1, r.name || '', r.centralComm || '', r.provincialJirga || '', r.provincialExec || '', r.provincialComm || '',
      r.districtExec || '', r.districtComm || '', r.areaExec || '', r.areaComm || '', r.basicUnitsExec || '', r.basicUnitsGb || '',
      r.ownBasicUnit || '', r.psoMeetings || '', r.partyConferences || '', r.seminars || '', r.studyCircles || '',
      r.inductions || '', r.ralliesAndProtests || '', r.jirgasAndCornerMeetings || '', r.pressConferences || '',
      r.alliedMeetings || '', r.totalMeetings || '', r.dues || '', r.tours || '', r.reading || '', r.bloodBankPosts || ''
    ];
    ws.getRow(rowNum).font = FONT_DATA;
  });

  return wb;
}

module.exports = {
  fetchForm5Data,
  generateForm5Html,
  generateForm5Excel,
};
