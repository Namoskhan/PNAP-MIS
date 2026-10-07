const ExcelJS = require('exceljs');
const { getBaseCss, getPashtoMonth } = require('./common');

async function fetchForm2Data({ areaId, month, year }) {
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

  const basicUnits = await BasicUnit.find({ areaId }).sort({ name: 1 }).lean();

  const m = parseInt(month, 10) || (new Date().getMonth() + 1);
  const y = parseInt(year, 10) || new Date().getFullYear();
  const startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  const monthLabel = getPashtoMonth(m);

  const rows = [];
  for (let i = 0; i < basicUnits.length; i++) {
    const bu = basicUnits[i];

    // Basic Unit Executive Meetings held in this month
    const execMeetings = await Meeting.find({
      unitLevel: 'BASIC_UNIT',
      $and: [
        { $or: [{ unitId: bu._id }, { basicUnitId: bu._id }] },
        { $or: [{ body: 'EXECUTIVE' }, { type: { $in: ['EXECUTIVE', 'EXC'] } }] },
        { startAt: { $gte: startDate, $lte: endDate } },
      ],
    }).sort({ startAt: -1 }).lean();

    // Basic Unit General Body Meetings held in this month
    const gbMeetings = await Meeting.find({
      unitLevel: 'BASIC_UNIT',
      $and: [
        { $or: [{ unitId: bu._id }, { basicUnitId: bu._id }] },
        { $or: [{ body: 'GENERAL_BODY' }, { type: { $in: ['GENERAL_BODY', 'GBM'] } }] },
        { startAt: { $gte: startDate, $lte: endDate } },
      ],
    }).sort({ startAt: -1 }).lean();

    const latestExec = execMeetings[0] || null;
    const execTotalSlots = (await CabinetSlot.countDocuments({
      unitLevel: 'BASIC_UNIT',
      unitId: bu._id,
      filledMemberId: { $exists: true, $ne: null },
    })) || 6;
    const execPresent = latestExec ? latestExec.attendance?.filter((a) => a.status === 'PRESENT').length ?? 0 : '';
    const execLeave = latestExec ? latestExec.attendance?.filter((a) => a.status === 'LATE').length ?? 0 : '';
    const execAbsent = latestExec ? latestExec.attendance?.filter((a) => a.status === 'ABSENT').length ?? 0 : '';
    const execPct = (latestExec && execTotalSlots > 0 && typeof execPresent === 'number')
      ? Math.round((execPresent / execTotalSlots) * 100)
      : '';

    const latestGb = gbMeetings[0] || null;
    const totalMembers = await Member.countDocuments({ basicUnitId: bu._id, status: 'ACTIVE' });
    const gbPresent = latestGb ? latestGb.attendance?.filter((a) => a.status === 'PRESENT').length ?? 0 : '';
    const gbLeave = latestGb ? latestGb.attendance?.filter((a) => a.status === 'LATE').length ?? 0 : '';
    const gbAbsent = latestGb ? latestGb.attendance?.filter((a) => a.status === 'ABSENT').length ?? 0 : '';
    const gbPct = (latestGb && totalMembers > 0 && typeof gbPresent === 'number')
      ? Math.round((gbPresent / totalMembers) * 100)
      : '';

    const seminars = await Activity.countDocuments({
      $and: [
        { $or: [{ basicUnitId: bu._id }, { unitId: bu._id }] },
        { $or: [{ type: { $in: ['SEMINAR', 'PARTY_CONFERENCE', 'SEM'] } }, { typeCode: { $in: ['SEMINAR', 'PARTY_CONFERENCE'] } }] },
        { startAt: { $gte: startDate, $lte: endDate } },
      ],
    });
    const studyCircles = await Activity.countDocuments({
      $and: [
        { $or: [{ basicUnitId: bu._id }, { unitId: bu._id }] },
        { $or: [{ type: { $in: ['STUDY_CIRCLE', 'STC'] } }, { typeCode: 'STUDY_CIRCLE' }] },
        { startAt: { $gte: startDate, $lte: endDate } },
      ],
    });
    const publicEvents = await Activity.countDocuments({
      $and: [
        { $or: [{ basicUnitId: bu._id }, { unitId: bu._id }] },
        { $or: [{ type: { $in: ['PROTEST', 'JALSA', 'PRT', 'JLS'] } }, { typeCode: { $in: ['PROTEST', 'JALSA'] } }] },
        { startAt: { $gte: startDate, $lte: endDate } },
      ],
    });
    const inductions = await Activity.countDocuments({
      $and: [
        { $or: [{ basicUnitId: bu._id }, { unitId: bu._id }] },
        { $or: [{ type: { $in: ['CAMPAIGN', 'INDUCTION'] } }, { typeCode: { $in: ['CAMPAIGN', 'INDUCTION'] } }] },
        { startAt: { $gte: startDate, $lte: endDate } },
      ],
    });

    const newMembers = await Member.countDocuments({
      basicUnitId: bu._id,
      createdAt: { $gte: startDate, $lte: endDate },
    });

    // PSO Meetings for this Unit
    const psoMeetings = await Meeting.find({
      $and: [
        { $or: [{ basicUnitId: bu._id }, { unitId: bu._id }] },
        { title: { $regex: /pso|student/i } },
        { startAt: { $gte: startDate, $lte: endDate } },
      ],
    }).lean();
    const psoAttendees = psoMeetings.reduce((sum, m) => sum + (m.attendance?.filter(a => a.status === 'PRESENT').length || 0), 0);
    const psoMembership = psoMeetings.length > 0 ? (psoAttendees || 1) : '';
    const psoPct = (psoMeetings.length > 0 && psoMembership > 0) ? Math.round((psoAttendees / psoMembership) * 100) : '';

    const donationsAgg = await Donation.aggregate([
      {
        $match: {
          $and: [
            { $or: [{ basicUnitId: bu._id }, { unitLevel: 'BASIC_UNIT', unitId: bu._id }] },
            { receivedAt: { $gte: startDate, $lte: endDate } },
            { $or: [{ state: 'APPROVED' }, { state: { $exists: false } }, { state: null }] },
          ],
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const unitDonations = donationsAgg[0]?.total || 0;

    const emergencyAgg = await Donation.aggregate([
      {
        $match: {
          $and: [
            { $or: [{ basicUnitId: bu._id }, { unitLevel: 'BASIC_UNIT', unitId: bu._id }] },
            { receivedAt: { $gte: startDate, $lte: endDate } },
            { $or: [{ donorType: 'EMERGENCY' }, { note: { $regex: /emergency|هنګامي/i } }] },
            { $or: [{ state: 'APPROVED' }, { state: { $exists: false } }, { state: null }] },
          ],
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const emergencyDonations = emergencyAgg[0]?.total || 0;

    const expensesAgg = await Expense.aggregate([
      {
        $match: {
          $and: [
            { $or: [{ basicUnitId: bu._id }, { unitLevel: 'BASIC_UNIT', unitId: bu._id }] },
            { incurredAt: { $gte: startDate, $lte: endDate } },
            { $or: [{ state: 'APPROVED' }, { state: { $exists: false } }, { state: null }] },
          ],
        },
      },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const totalExpenses = expensesAgg[0]?.total || 0;

    rows.push({
      srNo: i + 1,
      unitName: bu.name,
      execMeetingDate: latestExec?.startAt ? new Date(latestExec.startAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : '',
      execTotal: execTotalSlots ? String(execTotalSlots) : '',
      execPresent: execPresent !== '' ? String(execPresent) : '',
      execAbsent: execAbsent !== '' ? String(execAbsent) : '',
      execLeave: execLeave !== '' ? String(execLeave) : '',
      execPct,
      gbMeetingDate: latestGb?.startAt ? new Date(latestGb.startAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : '',
      gbTotalMembers: totalMembers ? String(totalMembers) : '',
      gbPresent: gbPresent !== '' ? String(gbPresent) : '',
      gbAbsent: gbAbsent !== '' ? String(gbAbsent) : '',
      gbLeave: gbLeave !== '' ? String(gbLeave) : '',
      gbPct,
      studyReading: studyCircles > 0 ? String(studyCircles) : '',
      seminarCount: seminars > 0 ? String(seminars) : '',
      studyCircleCount: studyCircles > 0 ? String(studyCircles) : '',
      newMembers: newMembers > 0 ? String(newMembers) : '',
      psoMembership: psoMembership ? String(psoMembership) : '',
      psoAttendees: psoAttendees > 0 ? String(psoAttendees) : '',
      psoPct,
      publicEventsCount: publicEvents > 0 ? String(publicEvents) : '',
      inductionPrograms: inductions > 0 ? String(inductions) : '',
      publicOutreach: (execMeetings.length + gbMeetings.length) > 0 ? String(execMeetings.length + gbMeetings.length) : '',
      inactiveContact: '',
      orgOutreach: (execMeetings.length + gbMeetings.length) > 0 ? String(execMeetings.length + gbMeetings.length) : '',
      unitDonations: unitDonations > 0 ? String(unitDonations) : '',
      emergencyDonations: emergencyDonations > 0 ? String(emergencyDonations) : '',
      totalExpenses: totalExpenses > 0 ? String(totalExpenses) : '',
      disciplinaryAction: '',
      bloodPosts: '',
      bloodCash: '',
      bloodTotalCash: '',
      zakat: '',
      unitStatus: bu.isActive !== false ? 'فعاله' : 'غير فعاله',
    });
  }

  return {
    areaName,
    month: monthLabel,
    year: String(y),
    rows,
  };
}

function generateForm2Html({ areaName = '', month = '', year = '', rows = [] } = {}) {
  const displayRows = [...rows];
  while (displayRows.length < 18) {
    displayRows.push({
      srNo: displayRows.length + 1,
      unitName: '',
      execMeetingDate: '',
      execTotal: '',
      execPresent: '',
      execAbsent: '',
      execLeave: '',
      execPct: '',
      gbMeetingDate: '',
      gbTotalMembers: '',
      gbPresent: '',
      gbAbsent: '',
      gbLeave: '',
      gbPct: '',
      studyReading: '',
      seminarCount: '',
      studyCircleCount: '',
      newMembers: '',
      psoMembership: '',
      psoAttendees: '',
      psoPct: '',
      publicEventsCount: '',
      inductionPrograms: '',
      publicOutreach: '',
      inactiveContact: '',
      orgOutreach: '',
      unitDonations: '',
      emergencyDonations: '',
      totalExpenses: '',
      disciplinaryAction: '',
      bloodPosts: '',
      bloodCash: '',
      bloodTotalCash: '',
      zakat: '',
      unitStatus: '',
    });
  }

  const tableRowsHtml = displayRows.map((r, i) => `
    <tr>
      <td style="width: 1.8%;">${r.srNo || (i + 1)}</td>
      <td style="width: 5.8%; font-weight: 600;">${r.unitName || ''}</td>
      <td>${r.execMeetingDate || ''}</td>
      <td>${r.execTotal || ''}</td>
      <td>${r.execPresent || ''}</td>
      <td>${r.execAbsent || ''}</td>
      <td>${r.execLeave || ''}</td>
      <td>${r.execPct ? r.execPct + '%' : ''}</td>
      <td>${r.gbMeetingDate || ''}</td>
      <td>${r.gbTotalMembers || ''}</td>
      <td>${r.gbPresent || ''}</td>
      <td>${r.gbAbsent || ''}</td>
      <td>${r.gbLeave || ''}</td>
      <td>${r.gbPct ? r.gbPct + '%' : ''}</td>
      <td>${r.studyReading || ''}</td>
      <td>${r.seminarCount || ''}</td>
      <td>${r.studyCircleCount || ''}</td>
      <td>${r.newMembers || ''}</td>
      <td>${r.psoMembership || ''}</td>
      <td>${r.psoAttendees || ''}</td>
      <td>${r.psoPct ? r.psoPct + '%' : ''}</td>
      <td>${r.publicEventsCount || ''}</td>
      <td>${r.inductionPrograms || ''}</td>
      <td>${r.publicOutreach || ''}</td>
      <td>${r.inactiveContact || ''}</td>
      <td>${r.orgOutreach || ''}</td>
      <td>${r.unitDonations || ''}</td>
      <td>${r.emergencyDonations || ''}</td>
      <td>${r.totalExpenses || ''}</td>
      <td>${r.disciplinaryAction || ''}</td>
      <td>${r.bloodPosts || ''}</td>
      <td>${r.bloodCash || ''}</td>
      <td>${r.bloodTotalCash || ''}</td>
      <td>${r.zakat || ''}</td>
      <td>${r.unitStatus || ''}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html lang="ps" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ابتدائي يونټانو کار او فعاليت مياشتنئي رپورټ</title>
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
        ابتدائي يونټانو کار او فعاليت مياشتنئي رپورټ
      </div>
      <div class="header-field">
        مياشت: <span class="line" style="min-width: 90px;">${month}</span>
        کال: <span class="line" style="min-width: 70px;">${year}</span>
      </div>
    </div>

    <table class="proforma-table">
      <thead>
        <tr>
          <th rowspan="2" style="width: 1.8%;">شمير</th>
          <th rowspan="2" style="width: 5.8%;">يونټ نوم</th>
          <th colspan="6">يونټ ايګزيکټيو غونډي</th>
          <th colspan="6">يونټ جنرل باډي غونډي</th>
          <th rowspan="2" style="width: 3.2%; font-size: 6.2pt;" class="nowrap">لوستنه<br>(مطالعه)</th>
          <th rowspan="2" style="width: 2.6%;">سيمينار</th>
          <th rowspan="2" style="width: 2.6%;">سټډي<br>سرکل</th>
          <th rowspan="2" style="width: 3.1%;">نوي<br>شموليتونه</th>
          <th colspan="3">پي ايس او</th>
          <th rowspan="2" style="width: 3.4%;">جلسے اولسي<br>غونډي جرګے<br>شمير</th>
          <th rowspan="2" style="width: 3.0%;">شموليت<br>پروګرام</th>
          <th colspan="3">رابطے</th>
          <th colspan="3">چنده</th>
          <th rowspan="2" style="width: 2.8%;">تاديبي<br>کاروائي</th>
          <th colspan="4">بلډ بينک</th>
          <th rowspan="2" style="width: 3.1%;">فعاله<br>/غير فعاله</th>
        </tr>
        <tr>
          <!-- يونټ ايګزيکټيو غونډي (6) -->
          <th style="width: 3.3%;">نيټه</th>
          <th style="width: 3.2%;">ايګزيکټيو<br>شمير</th>
          <th style="width: 2.4%;">حاضر</th>
          <th style="width: 2.4%;">غير<br>حاضر</th>
          <th style="width: 2.2%;">رخصت</th>
          <th style="width: 2.8%;">حاضري<br>فيصدي</th>

          <!-- يونټ جنرل باډي غونډي (6) -->
          <th style="width: 3.3%;">نيټه</th>
          <th style="width: 3.2%;">يونټ<br>ممبرشپ</th>
          <th style="width: 2.4%;">حاضر</th>
          <th style="width: 2.4%;">غير<br>حاضر</th>
          <th style="width: 2.2%;">رخصت</th>
          <th style="width: 2.8%;">حاضري<br>فيصدي</th>

          <!-- پي ايس او (3) -->
          <th style="width: 2.7%;">يونټ<br>ممبر شپ</th>
          <th style="width: 3.1%;">غونډو کي<br>حاضر شمير</th>
          <th style="width: 2.6%;">حاضري<br>فيصدي</th>

          <!-- رابطے (3) -->
          <th style="width: 2.5%;">اولسي</th>
          <th style="width: 4.2%; font-size: 6.2pt;">غير فعاله<br>ايګزيکټيو او<br>ملګرو سره</th>
          <th style="width: 2.5%;">تنظيمي</th>

          <!-- چنده (3) -->
          <th style="width: 3.0%;">يونټ<br>چنده</th>
          <th style="width: 2.5%;">هنګامي</th>
          <th style="width: 2.5%;">خرڅ</th>

          <!-- بلډ بينک (4) -->
          <th style="width: 2.5%;">پوستونه</th>
          <th style="width: 2.4%;">نغدي</th>
          <th style="width: 2.5%;">ټولي<br>نغدي</th>
          <th style="width: 2.3%;">زکات</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

async function generateForm2Excel({ areaName = '', month = '', year = '', rows = [] } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('ابتدائي يونټانو کار او فعاليت', {
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

  ws.mergeCells('L1:W1');
  ws.getCell('L1').value = 'ابتدائي يونټانو کار او فعاليت مياشتنئي رپورټ';
  ws.getCell('L1').font = { name: 'Noto Naskh Arabic', size: 14, bold: true };
  ws.getCell('L1').alignment = { horizontal: 'center' };

  ws.mergeCells('AF1:AI1');
  ws.getCell('AF1').value = `مياشت: ${month}  کال: ${year}`;
  ws.getCell('AF1').font = { name: 'Noto Naskh Arabic', size: 10, bold: true };

  const headers = [
    'شمير', 'يونټ نوم', 'ايګزيکټيو نيټه', 'ايګزيکټيو شمير', 'حاضر', 'غير حاضر', 'رخصت', 'حاضري فيصدي',
    'جنرل باډي نيټه', 'يونټ ممبرشپ', 'حاضر', 'غير حاضر', 'رخصت', 'حاضري فيصدي',
    'لوستنه', 'سيمينار', 'سټډي سرکل', 'نوي شموليتونه',
    'پي ايس او ممبر', 'حاضر شمير', 'حاضري فيصدي',
    'جلسے اولسي', 'شموليت پروګرام', 'اولسي رابطے', 'غير فعاله ملګري', 'تنظيمي رابطے',
    'يونټ چنده', 'هنګامي چنده', 'خرڅ', 'تاديبي کاروائي',
    'بلډ پوسټونه', 'نغدي', 'ټولي نغدي', 'زکات', 'فعاله/غير فعاله'
  ];

  ws.getRow(3).values = headers;
  ws.getRow(3).font = FONT_HEADER;

  rows.forEach((r, idx) => {
    const rowNum = 4 + idx;
    ws.getRow(rowNum).values = [
      r.srNo || idx + 1, r.unitName || '', r.execMeetingDate || '', r.execTotal || '', r.execPresent || '', r.execAbsent || '', r.execLeave || '', r.execPct ? `${r.execPct}%` : '',
      r.gbMeetingDate || '', r.gbTotalMembers || '', r.gbPresent || '', r.gbAbsent || '', r.gbLeave || '', r.gbPct ? `${r.gbPct}%` : '',
      r.studyReading || '', r.seminarCount || '', r.studyCircleCount || '', r.newMembers || '',
      r.psoMembership || '', r.psoAttendees || '', r.psoPct ? `${r.psoPct}%` : '',
      r.publicEventsCount || '', r.inductionPrograms || '', r.publicOutreach || '', r.inactiveContact || '', r.orgOutreach || '',
      r.unitDonations || '', r.emergencyDonations || '', r.totalExpenses || '', r.disciplinaryAction || '',
      r.bloodPosts || '', r.bloodCash || '', r.bloodTotalCash || '', r.zakat || '', r.unitStatus || ''
    ];
    ws.getRow(rowNum).font = FONT_DATA;
  });

  return wb;
}

module.exports = {
  fetchForm2Data,
  generateForm2Html,
  generateForm2Excel,
};
