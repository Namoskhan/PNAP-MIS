const ExcelJS = require('exceljs');
const { getBaseCss, getPashtoMonth } = require('./common');

/**
 * Fetch initial baseline data for Form 8:
 * District Central & Provincial Committee Members Work & Activity Monthly Report
 * (ضلع کښي مرکزي، صوبائي کميټي د غړو د کار او فعاليت رپورټ)
 */
async function fetchForm8Data({ districtId, month, year } = {}) {
  const District = require('../../models/District');
  const CabinetSlot = require('../../models/CabinetSlot');
  const Member = require('../../models/Member');
  const mongoose = require('mongoose');

  let district = null;
  if (districtId && mongoose.Types.ObjectId.isValid(districtId)) {
    district = await District.findById(districtId).lean();
  }
  const districtName = district ? district.name : '';

  const y = parseInt(year, 10) || new Date().getFullYear();
  const m = month ? parseInt(month, 10) : (new Date().getMonth() + 1);

  // Look for Central and Provincial committee members residing or assigned in this district
  let comrades = [];
  try {
    // 1. Members with Central / Provincial committee appointments in this district
    const slots = await CabinetSlot.find({
      $or: [
        { unitLevel: { $in: ['PROVINCE', 'CENTRAL', 'NATIONAL'] } },
        { unitId: districtId },
      ],
      filledMemberId: { $exists: true, $ne: null },
    })
      .populate('filledMemberId', 'fullName status phone bloodGroup districtId')
      .lean();

    // Filter to those affiliated with this district or province
    const matchedMembers = [];
    const seenMemberIds = new Set();

    slots.forEach((slot) => {
      const mem = slot.filledMemberId;
      if (mem && mem._id && !seenMemberIds.has(mem._id.toString())) {
        if (!districtId || !mem.districtId || mem.districtId.toString() === districtId.toString()) {
          seenMemberIds.add(mem._id.toString());
          matchedMembers.push({
            name: mem.fullName || slot.title || 'Comrade',
            activeStatus: mem.status === 'ACTIVE' ? 'فعاله' : 'غير فعاله',
          });
        }
      }
    });

    comrades = matchedMembers;
  } catch (err) {
    console.warn('Form 8 baseline comrades lookup warning:', err.message);
  }

  // Create baseline rows
  const rows = comrades.map((c, idx) => ({
    srNo: idx + 1,
    name: c.name,
    distCommMeeting: 0,
    areaExecMeeting: 0,
    areaCommMeeting: 0,
    ownBuMeeting: 0,
    buExecMeeting: 0,
    buMeeting: 0,
    psoMeeting: 0,
    conferences: 0,
    seminars: 0,
    studyCircles: 0,
    inductions: 0,
    publicGatherings: 0,
    totalMeetings: 0,
    monthlyDues: 0,
    tours: 0,
    contacts: 0,
    officeAttendance: 0,
    activeStatus: c.activeStatus || 'فعاله',
    ideologicalReading: '',
    bloodBank: '',
  }));

  // Pad to at least 15 rows for standard print sheet
  while (rows.length < 15) {
    rows.push({
      srNo: rows.length + 1,
      name: '',
      distCommMeeting: '',
      areaExecMeeting: '',
      areaCommMeeting: '',
      ownBuMeeting: '',
      buExecMeeting: '',
      buMeeting: '',
      psoMeeting: '',
      conferences: '',
      seminars: '',
      studyCircles: '',
      inductions: '',
      publicGatherings: '',
      totalMeetings: '',
      monthlyDues: '',
      tours: '',
      contacts: '',
      officeAttendance: '',
      activeStatus: '',
      ideologicalReading: '',
      bloodBank: '',
    });
  }

  return {
    districtId: districtId ? String(districtId) : '',
    districtName,
    month: m,
    year: y,
    pashtoMonth: getPashtoMonth(m),
    rows,
  };
}

/**
 * Generate A4 Landscape HTML template for Form 8 matching printed paper sheet
 */
function generateForm8Html({
  districtName = '',
  month = '',
  year = '',
  rows = [],
  distPresidentSignature = '',
  distSecSignature = '',
  signatureDate = '',
  distSignatureDate = '',
  submittedByName = '',
  submittedAt = null,
} = {}) {
  const displayRows = [...rows];
  while (displayRows.length < 15) {
    displayRows.push({
      srNo: displayRows.length + 1,
      name: '',
      distCommMeeting: '',
      areaExecMeeting: '',
      areaCommMeeting: '',
      ownBuMeeting: '',
      buExecMeeting: '',
      buMeeting: '',
      psoMeeting: '',
      conferences: '',
      seminars: '',
      studyCircles: '',
      inductions: '',
      publicGatherings: '',
      totalMeetings: '',
      monthlyDues: '',
      tours: '',
      contacts: '',
      officeAttendance: '',
      activeStatus: '',
      ideologicalReading: '',
      bloodBank: '',
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
    distCommMeeting: rows.reduce((s, r) => s + getNum(r.distCommMeeting), 0),
    areaExecMeeting: rows.reduce((s, r) => s + getNum(r.areaExecMeeting), 0),
    areaCommMeeting: rows.reduce((s, r) => s + getNum(r.areaCommMeeting), 0),
    ownBuMeeting: rows.reduce((s, r) => s + getNum(r.ownBuMeeting), 0),
    buExecMeeting: rows.reduce((s, r) => s + getNum(r.buExecMeeting), 0),
    buMeeting: rows.reduce((s, r) => s + getNum(r.buMeeting), 0),
    psoMeeting: rows.reduce((s, r) => s + getNum(r.psoMeeting), 0),
    conferences: rows.reduce((s, r) => s + getNum(r.conferences), 0),
    seminars: rows.reduce((s, r) => s + getNum(r.seminars), 0),
    studyCircles: rows.reduce((s, r) => s + getNum(r.studyCircles), 0),
    inductions: rows.reduce((s, r) => s + getNum(r.inductions), 0),
    publicGatherings: rows.reduce((s, r) => s + getNum(r.publicGatherings), 0),
    totalMeetings: rows.reduce((s, r) => s + getNum(r.totalMeetings), 0),
    monthlyDues: rows.reduce((s, r) => s + getNum(r.monthlyDues), 0),
    tours: rows.reduce((s, r) => s + getNum(r.tours), 0),
    contacts: rows.reduce((s, r) => s + getNum(r.contacts), 0),
    officeAttendance: rows.reduce((s, r) => s + getNum(r.officeAttendance), 0),
    activeCount: rows.filter((r) => r.activeStatus === 'فعاله').length,
    bloodBank: rows.reduce((s, r) => s + getNum(r.bloodBank), 0),
  };

  const effectiveSigDate = signatureDate || distSignatureDate || (submittedAt ? new Date(submittedAt).toISOString().split('T')[0] : '');

  return `<!DOCTYPE html>
<html lang="ps" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ضلع کښي مرکزي، صوبائي کميټي د غړو د کار او فعاليت رپورټ (Form 8)</title>
  <style>
    ${getBaseCss()}
    @page {
      size: A4 landscape;
      margin: 5mm 6mm;
    }
    body {
      font-size: 7.5pt;
      line-height: 1.2;
    }
    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
      padding: 0 4px;
    }
    .header-title {
      font-size: 15pt;
      font-weight: bold;
      text-align: center;
      flex: 1;
      color: #0f172a;
    }
    .header-meta {
      font-size: 9.5pt;
      font-weight: 600;
      white-space: nowrap;
    }
    .header-line {
      border-bottom: 1px dotted #333;
      padding: 0 10px;
      font-weight: bold;
      min-width: 70px;
      display: inline-block;
      text-align: center;
    }
    table.proforma-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 7pt;
      text-align: center;
    }
    table.proforma-table th, table.proforma-table td {
      border: 1px solid #111;
      padding: 2.5px 1px;
      height: 17px;
      overflow: hidden;
      white-space: nowrap;
    }
    table.proforma-table td.name-cell {
      text-overflow: ellipsis;
      text-align: right;
      padding: 0 4px;
      font-weight: 600;
    }
    table.proforma-table th {
      background: #f1f5f9;
      font-weight: bold;
      color: #000;
      vertical-align: middle;
      line-height: 1.15;
    }
    .footer-bar {
      display: flex;
      justify-content: space-between;
      margin-top: 10px;
      padding: 4px 10px;
      font-size: 8.5pt;
      font-weight: bold;
    }
    .sig-line {
      border-bottom: 1px dotted #333;
      display: inline-block;
      min-width: 130px;
      text-align: center;
      padding: 0 6px;
    }
  </style>
</head>
<body>
  <div class="proforma-container">
    <!-- Header Title -->
    <div class="header-title" style="margin-bottom: 6px;">
      ضلع کښي مرکزي، صوبائي کميټي د غړو د کار او فعاليت رپورټ
    </div>

    <!-- Top Metadata Bar -->
    <div class="header-bar">
      <div class="header-meta">
        ضلع نوم: <span class="header-line">${districtName || '_________________'}</span>
      </div>
      <div class="header-meta">
        مياشت: <span class="header-line">${month ? getPashtoMonth(month) : '_______'}</span>
        کال: <span class="header-line">${year || '_______'}</span>
      </div>
    </div>

    <!-- 22-Column Official Table -->
    <table class="proforma-table">
      <thead>
        <tr>
          <th style="width: 2.2%;">شمير</th>
          <th style="width: 8.8%;">ملګري نوم</th>
          <th style="width: 4.0%;">ضلعي کميټي<br>غونډي</th>
          <th style="width: 4.2%;">علاقائي ايګزيکټيو<br>غونډي</th>
          <th style="width: 4.2%;">علاقائي کميټي<br>غونډي</th>
          <th style="width: 4.0%;">خپل يونټ<br>غونډي</th>
          <th style="width: 4.2%;">يونټ ايګزيکټيو<br>غونډي</th>
          <th style="width: 4.2%;">ابتدائي يونټانو<br>غونډي</th>
          <th style="width: 3.6%;">PSO سره<br>غونډي</th>
          <th style="width: 3.8%;">پارټي<br>کانفرنسونه</th>
          <th style="width: 3.6%;">سيمينارونه</th>
          <th style="width: 3.6%;">سټډي<br>سرکل</th>
          <th style="width: 4.0%;">شموليت<br>پروګرام</th>
          <th style="width: 5.6%;">جلسے مظاهرے<br>جرګے اولسي غونډي</th>
          <th style="width: 3.8%; background: #e0f2fe;">ټولي<br>غونډي</th>
          <th style="width: 4.0%;">مياشتني<br>چنده</th>
          <th style="width: 3.2%;">دوره</th>
          <th style="width: 4.4%;">رابطے تنظيمي<br>اولسي</th>
          <th style="width: 3.4%;">دفتر<br>حاضري</th>
          <th style="width: 4.2%;">فعاله/غير<br>فعاله</th>
          <th style="width: 5.4%;">لوستنه (مطالعه)<br>سياسي نظرياتي</th>
          <th style="width: 4.2%;">بلډ بينک<br>پوست زکات</th>
        </tr>
      </thead>
      <tbody>
        ${displayRows.map((r, i) => `
        <tr>
          <td>${r.srNo || (i + 1)}</td>
          <td class="name-cell">${cleanVal(r.name)}</td>
          <td>${cleanVal(r.distCommMeeting)}</td>
          <td>${cleanVal(r.areaExecMeeting)}</td>
          <td>${cleanVal(r.areaCommMeeting)}</td>
          <td>${cleanVal(r.ownBuMeeting)}</td>
          <td>${cleanVal(r.buExecMeeting)}</td>
          <td>${cleanVal(r.buMeeting)}</td>
          <td>${cleanVal(r.psoMeeting)}</td>
          <td>${cleanVal(r.conferences)}</td>
          <td>${cleanVal(r.seminars)}</td>
          <td>${cleanVal(r.studyCircles)}</td>
          <td>${cleanVal(r.inductions)}</td>
          <td>${cleanVal(r.publicGatherings)}</td>
          <td style="font-weight: bold; background: #f0f9ff;">${cleanVal(r.totalMeetings)}</td>
          <td>${cleanVal(r.monthlyDues)}</td>
          <td>${cleanVal(r.tours)}</td>
          <td>${cleanVal(r.contacts)}</td>
          <td>${cleanVal(r.officeAttendance)}</td>
          <td style="font-size: 6.5pt;">${cleanVal(r.activeStatus)}</td>
          <td style="font-size: 6.5pt; text-align: right; padding: 0 3px;">${cleanVal(r.ideologicalReading)}</td>
          <td>${cleanVal(r.bloodBank)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr style="background: #f1f5f9; font-weight: bold;">
          <td colspan="2">ټول / Total</td>
          <td>${totals.distCommMeeting || ''}</td>
          <td>${totals.areaExecMeeting || ''}</td>
          <td>${totals.areaCommMeeting || ''}</td>
          <td>${totals.ownBuMeeting || ''}</td>
          <td>${totals.buExecMeeting || ''}</td>
          <td>${totals.buMeeting || ''}</td>
          <td>${totals.psoMeeting || ''}</td>
          <td>${totals.conferences || ''}</td>
          <td>${totals.seminars || ''}</td>
          <td>${totals.studyCircles || ''}</td>
          <td>${totals.inductions || ''}</td>
          <td>${totals.publicGatherings || ''}</td>
          <td style="font-weight: bold; background: #e0f2fe;">${totals.totalMeetings || ''}</td>
          <td>${totals.monthlyDues ? totals.monthlyDues.toLocaleString() : ''}</td>
          <td>${totals.tours || ''}</td>
          <td>${totals.contacts || ''}</td>
          <td>${totals.officeAttendance || ''}</td>
          <td style="font-size: 6.5pt;">${totals.activeCount} فعاله</td>
          <td></td>
          <td>${totals.bloodBank || ''}</td>
        </tr>
      </tfoot>
    </table>

    <!-- Leadership Signatures Footer -->
    <div class="footer-bar">
      <div>
        ضلعي سکرټري جنرل:
        <span class="sig-line" style="${distSecSignature ? 'border-bottom: 1.5px solid #0f172a; font-weight: bold; color: #0f172a; font-size: 8.5pt; display: inline-block; padding: 0 8px;' : ''}">
          ${distSecSignature ? cleanVal(distSecSignature) : ''}
        </span>
      </div>
      <div>
        ضلعي صدر:
        <span class="sig-line" style="${distPresidentSignature ? 'border-bottom: 1.5px solid #0f172a; font-weight: bold; color: #0f172a; font-size: 8.5pt; display: inline-block; padding: 0 8px;' : ''}">
          ${distPresidentSignature ? cleanVal(distPresidentSignature) : ''}
        </span>
      </div>
      <div>
        د دستخط نيټه:
        <span class="sig-line" style="width: 100px; ${effectiveSigDate ? 'border-bottom: 1.5px solid #0f172a; font-weight: bold; color: #0f172a; font-size: 8.5pt; display: inline-block; padding: 0 8px;' : ''}">
          ${effectiveSigDate ? cleanVal(effectiveSigDate) : ''}
        </span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate Excel workbook for Form 8 matching printed proforma structure
 */
async function generateForm8Excel({
  districtName = '',
  month = '',
  year = '',
  rows = [],
  distPresidentSignature = '',
  distSecSignature = '',
  signatureDate = '',
  distSignatureDate = '',
  submittedByName = '',
  submittedAt = null,
} = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PNAP-MIS';
  workbook.lastModifiedBy = 'PNAP-MIS';
  workbook.created = new Date();
  workbook.modified = new Date();

  const ws = workbook.addWorksheet('مرکزي، صوبائي کميټي کار', {
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
  ws.mergeCells('A1:V1');
  ws.getCell('A1').value = 'ضلع کښي مرکزي، صوبائي کميټي د غړو د کار او فعاليت رپورټ (Form 8)';
  ws.getCell('A1').font = { size: 14, bold: true, name: 'Arial' };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 26;

  // Metadata Row
  ws.mergeCells('A2:H2');
  ws.getCell('A2').value = `ضلع نوم: ${districtName}`;
  ws.getCell('A2').font = { size: 10, bold: true, name: 'Arial' };

  ws.mergeCells('P2:V2');
  ws.getCell('P2').value = `کال: ${year}    مياشت: ${getPashtoMonth(month) || month}`;
  ws.getCell('P2').font = { size: 10, bold: true, name: 'Arial' };
  ws.getCell('P2').alignment = { horizontal: 'left' };
  ws.getRow(2).height = 20;

  // Headers (Row 3)
  const headers = [
    'شمير',
    'ملګري نوم',
    'ضلعي کميټي غونډي',
    'علاقائي ايګزيکټيو غونډي',
    'علاقائي کميټي غونډي',
    'خپل يونټ غونډي',
    'يونټ ايګزيکټيو غونډي',
    'ابتدائي يونټانو غونډي',
    'PSO سره غونډي',
    'پارټي کانفرنسونه',
    'سيمينارونه',
    'سټډي سرکل',
    'شموليت پروګرام',
    'جلسے مظاهرے جرګے اولسي غونډي',
    'ټولي غونډي',
    'مياشتني چنده',
    'دوره',
    'رابطے تنظيمي اولسي',
    'دفتر حاضري',
    'فعاله/غير فعاله',
    'لوستنه (مطالعه) سياسي نظرياتي',
    'بلډ بينک پوست زکات',
  ];

  const headerRow = ws.getRow(3);
  headerRow.values = headers;
  headerRow.height = 28;
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, size: 8.5, name: 'Arial' };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF1F5F9' },
    };
    cell.border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' },
    };
  });

  // Data Rows
  let startRow = 4;
  rows.forEach((r, idx) => {
    const rowNum = startRow + idx;
    const values = [
      idx + 1,
      r.name || '',
      r.distCommMeeting || 0,
      r.areaExecMeeting || 0,
      r.areaCommMeeting || 0,
      r.ownBuMeeting || 0,
      r.buExecMeeting || 0,
      r.buMeeting || 0,
      r.psoMeeting || 0,
      r.conferences || 0,
      r.seminars || 0,
      r.studyCircles || 0,
      r.inductions || 0,
      r.publicGatherings || 0,
      r.totalMeetings || 0,
      r.monthlyDues || 0,
      r.tours || 0,
      r.contacts || 0,
      r.officeAttendance || 0,
      r.activeStatus || '',
      r.ideologicalReading || '',
      r.bloodBank || '',
    ];

    const dataRow = ws.getRow(rowNum);
    dataRow.values = values;
    dataRow.height = 19;
    dataRow.eachCell((cell, cNum) => {
      cell.font = { size: 9, name: 'Arial' };
      cell.alignment = {
        horizontal: cNum === 2 || cNum === 21 ? 'right' : 'center',
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

  // Columns with numeric sums: 3 to 19, 22
  const sumCols = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 22];
  sumCols.forEach((colIdx) => {
    const colLetter = ws.getColumn(colIdx).letter;
    if (rows.length > 0) {
      totalRow.getCell(colIdx).value = {
        formula: `SUM(${colLetter}4:${colLetter}${totalRowNum - 1})`,
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

  // Leadership Signatures Row in Excel
  const effectiveDate = signatureDate || distSignatureDate || (submittedAt ? new Date(submittedAt).toISOString().split('T')[0] : '');
  const sigRowNum = totalRowNum + 2;
  const sigRow = ws.getRow(sigRowNum);
  sigRow.height = 24;
  sigRow.getCell(2).value = `ضلعي سکرټري جنرل: ${distSecSignature || '________________'}`;
  sigRow.getCell(2).font = { bold: true, size: 10, name: 'Arial' };
  sigRow.getCell(9).value = `ضلعي صدر: ${distPresidentSignature || '________________'}`;
  sigRow.getCell(9).font = { bold: true, size: 10, name: 'Arial' };
  sigRow.getCell(16).value = `د دستخط نيټه: ${effectiveDate || '________________'}`;
  sigRow.getCell(16).font = { bold: true, size: 10, name: 'Arial' };

  // Explicit column widths
  ws.columns.forEach((col, idx) => {
    if (idx === 0) col.width = 5; // #
    else if (idx === 1) col.width = 20; // Comrade Name
    else if (idx === 13) col.width = 15; // Gatherings
    else if (idx === 19) col.width = 12; // Active Status
    else if (idx === 20) col.width = 18; // Reading
    else col.width = 8;
  });

  return workbook;
}

module.exports = {
  fetchForm8Data,
  generateForm8Html,
  generateForm8Excel,
};
