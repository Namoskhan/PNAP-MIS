const ExcelJS = require('exceljs');
const { getBaseCss, getPashtoMonth } = require('./common');

/**
 * Fetch baseline data for Form 9
 * District Central & Provincial Organs Members Monthly Work & Activity Report
 * (ضلع کښي مرکزي، صوبائي ادارو د غړو کار او فعاليت رپورټ)
 */
async function fetchForm9Data({ districtId, areaId, month, year } = {}) {
  const District = require('../../models/District');
  const Area = require('../../models/Area');
  const Member = require('../../models/Member');
  const Meeting = require('../../models/Meeting');
  const Activity = require('../../models/Activity');

  let districtName = '';
  let areaName = '';

  if (districtId) {
    const d = await District.findById(districtId).lean();
    if (d) districtName = d.name;
  }
  if (areaId) {
    const a = await Area.findById(areaId).lean();
    if (a) {
      areaName = a.name;
      if (!districtName && a.districtId) {
        const d = await District.findById(a.districtId).lean();
        if (d) districtName = d.name;
      }
    }
  }

  const m = parseInt(month, 10) || (new Date().getMonth() + 1);
  const y = parseInt(year, 10) || new Date().getFullYear();
  const startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));

  // Query committee / organ members in district if available
  const memberQuery = { isActive: true };
  if (districtId) memberQuery.districtId = districtId;
  else if (areaId) memberQuery.areaId = areaId;

  const members = await Member.find(memberQuery)
    .sort({ lastName: 1, firstName: 1 })
    .limit(10)
    .lean();

  const sec1Members = (members.length > 0 ? members : []).map((mem, idx) => ({
    srNo: idx + 1,
    memberId: String(mem._id),
    name: [mem.firstName, mem.lastName].filter(Boolean).join(' ') || mem.name || '',
    designation: mem.designation || mem.role || '',
    date: '',
    distExecMeeting: 0,
    distCommMeeting: 0,
    areaExecMeeting: 0,
    areaCommMeeting: 0,
    buExecMeeting: 0,
    buGbMeeting: 0,
    psoMeeting: 0,
    conferences: 0,
    seminars: 0,
    studyCircles: 0,
    inductions: 0,
    alliesMeeting: 0,
    publicGatherings: 0,
    totalMeetings: 0,
    ideologicalReading: '',
    dues: 0,
    tours: 0,
  }));

  // Query public activities in period
  const actQuery = {
    startAt: { $gte: startDate, $lte: endDate },
  };
  if (districtId) actQuery.districtId = districtId;
  else if (areaId) actQuery.areaId = areaId;

  const activities = await Activity.find(actQuery).sort({ startAt: 1 }).limit(10).lean();

  const sec2PublicGatherings = activities
    .filter(a => ['RALLY', 'PROTEST', 'JIRGA', 'CORNER_MEETING', 'HARTAL', 'PUBLIC_GATHERING'].includes(a.type))
    .map((a, idx) => ({
      srNo: idx + 1,
      organName: a.arrangedBy || districtName || '',
      date: a.startAt ? new Date(a.startAt).toISOString().split('T')[0] : '',
      venue: a.venue || '',
      topic: a.title || a.topic || '',
      programType: a.type || '',
      speakers: (a.speakers || []).join(', ') || a.lead || '',
      comradesCount: a.participantsCount || 0,
      peopleCount: a.externalAttendance || 0,
    }));

  const sec3Conferences = activities
    .filter(a => ['CONFERENCE', 'SEMINAR', 'STUDY_CIRCLE'].includes(a.type))
    .map((a, idx) => ({
      srNo: idx + 1,
      organName: a.arrangedBy || districtName || '',
      date: a.startAt ? new Date(a.startAt).toISOString().split('T')[0] : '',
      venue: a.venue || '',
      topic: a.title || a.topic || '',
      programType: a.type || '',
      speakers: (a.speakers || []).join(', ') || a.lead || '',
      comradesCount: a.participantsCount || 0,
    }));

  return {
    districtId,
    areaId,
    districtName: districtName || 'District',
    areaName: areaName || '',
    month: m,
    year: y,
    sec1Members: sec1Members.length > 0 ? sec1Members : [
      { srNo: 1, name: '', designation: '', date: '', distExecMeeting: 0, distCommMeeting: 0, areaExecMeeting: 0, areaCommMeeting: 0, buExecMeeting: 0, buGbMeeting: 0, psoMeeting: 0, conferences: 0, seminars: 0, studyCircles: 0, inductions: 0, alliesMeeting: 0, publicGatherings: 0, totalMeetings: 0, ideologicalReading: '', dues: 0, tours: 0 }
    ],
    sec2PublicGatherings: sec2PublicGatherings.length > 0 ? sec2PublicGatherings : [],
    sec3Conferences: sec3Conferences.length > 0 ? sec3Conferences : [],
    sec4BloodBank: {
      eidHidesCount: 0,
      cash: 0,
      totalCash: 0,
      zakat: 0,
    },
    sec5Discipline: [],
    sec6Proposals: {
      political: { byUnit: '', byArea: '', byDistrict: '', proposals: '', demands: '' },
      organizational: { byUnit: '', byArea: '', byDistrict: '', proposals: '', demands: '' },
      social: { byUnit: '', byArea: '', byDistrict: '', proposals: '', demands: '' },
    },
    sec7Notes: {
      socialWorkReport: '',
      miscellaneousNotes: '',
      areaSecSignature: '',
      areaSeniorDeputySignature: '',
      signatureDate: '',
    },
  };
}

/**
 * Generate A4 Portrait Print HTML for Form 9
 */
function generateForm9Html({
  districtName = '',
  areaName = '',
  month = '',
  year = '',
  sec1Members = [],
  sec2PublicGatherings = [],
  sec3Conferences = [],
  sec4BloodBank = {},
  sec5Discipline = [],
  sec6Proposals = {},
  sec7Notes = {},
  areaSecSignature = '',
  areaSeniorDeputySignature = '',
  signatureDate = '',
  socialWorkReport = '',
  miscellaneousNotes = '',
} = {}) {
  const pMonth = getPashtoMonth(month);

  // Pad Section 1 Members to at least 7 rows for authentic printed look
  const padSec1 = [...(sec1Members || [])];
  while (padSec1.length < 7) {
    padSec1.push({
      srNo: padSec1.length + 1,
      name: '',
      designation: '',
      date: '',
      distExecMeeting: '',
      distCommMeeting: '',
      areaExecMeeting: '',
      areaCommMeeting: '',
      buExecMeeting: '',
      buGbMeeting: '',
      psoMeeting: '',
      conferences: '',
      seminars: '',
      studyCircles: '',
      inductions: '',
      alliesMeeting: '',
      publicGatherings: '',
      totalMeetings: '',
      ideologicalReading: '',
      dues: '',
      tours: '',
    });
  }

  // Pad Section 2 to at least 3 rows
  const padSec2 = [...(sec2PublicGatherings || [])];
  while (padSec2.length < 3) {
    padSec2.push({ srNo: padSec2.length + 1, organName: '', date: '', venue: '', topic: '', programType: '', speakers: '', comradesCount: '', peopleCount: '' });
  }

  // Pad Section 3 to at least 2 rows
  const padSec3 = [...(sec3Conferences || [])];
  while (padSec3.length < 2) {
    padSec3.push({ srNo: padSec3.length + 1, organName: '', date: '', venue: '', topic: '', programType: '', speakers: '', comradesCount: '' });
  }

  // Pad Section 5 Discipline to at least 2 rows
  const padSec5 = [...(sec5Discipline || [])];
  while (padSec5.length < 2) {
    padSec5.push({ comradeName: '', designation: '', violation: '', actionTaken: '' });
  }

  const clean = (val) => (val === 0 ? '0' : (val || ''));

  const sumSec1 = (field) => (sec1Members || []).reduce((acc, r) => acc + (parseInt(r[field], 10) || 0), 0);

  const effectiveSec = areaSecSignature || sec7Notes?.areaSecSignature || '';
  const effectiveDeputy = areaSeniorDeputySignature || sec7Notes?.areaSeniorDeputySignature || '';
  const effectiveSigDate = signatureDate || sec7Notes?.signatureDate || '';
  const effectiveSocial = socialWorkReport || sec7Notes?.socialWorkReport || '';
  const effectiveMisc = miscellaneousNotes || sec7Notes?.miscellaneousNotes || '';

  const prop = sec6Proposals || {};
  const pol = prop.political || {};
  const org = prop.organizational || {};
  const soc = prop.social || {};

  const bBank = sec4BloodBank || {};

  return `<!DOCTYPE html>
<html lang="ps" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ضلع کښي مرکزي، صوبائي ادارو د غړو کار او فعاليت رپورټ</title>
  <style>
    ${getBaseCss()}

    @page {
      size: A4 portrait;
      margin: 8mm 7mm 8mm 7mm;
    }

    body {
      font-family: "Noto Naskh Arabic", "Arial", sans-serif;
      font-size: 7.5pt;
      line-height: 1.15;
      color: #000;
      background: #fff;
      direction: rtl;
    }

    .report-sheet {
      width: 100%;
      max-width: 195mm;
      margin: 0 auto;
    }

    .header-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
      padding-bottom: 2px;
      border-bottom: 1px solid #333;
    }

    .header-meta {
      font-size: 8.5pt;
      font-weight: bold;
    }

    .section-title {
      background: #f1f5f9;
      color: #0f172a;
      font-size: 8pt;
      font-weight: bold;
      text-align: center;
      padding: 3px 6px;
      margin-top: 6px;
      margin-bottom: 3px;
      border: 1px solid #000;
      border-radius: 2px;
    }

    table.f9-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 6.8pt;
      margin-bottom: 4px;
    }

    table.f9-table th, table.f9-table td {
      border: 0.75px solid #000;
      padding: 2px 2px;
      text-align: center;
      vertical-align: middle;
      word-wrap: break-word;
      overflow: hidden;
    }

    table.f9-table th {
      background: #f8fafc;
      font-weight: bold;
      color: #000;
    }

    .text-cell {
      text-align: right !important;
      padding-right: 4px !important;
    }

    .lines-area {
      border: 0.75px solid #000;
      padding: 4px 6px;
      min-height: 24px;
      font-size: 7.5pt;
      margin-bottom: 4px;
      line-height: 1.4;
      background: #fff;
    }

    .footer-signatures {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 8px;
      font-size: 8pt;
      font-weight: bold;
      padding: 0 10px;
    }

    .sig-line {
      display: inline-block;
      min-width: 130px;
      border-bottom: 1px solid #000;
      text-align: center;
      padding: 0 6px;
    }
  </style>
</head>
<body>
  <div class="report-sheet">
    <!-- Top Metadata Bar -->
    <div class="header-bar">
      <div class="header-meta">
        ضلع / علاقه: <u>${areaName ? `${areaName} (${districtName})` : (districtName || '______________')}</u>
      </div>
      <div style="font-size: 11pt; font-weight: bold; text-align: center; color: #000;">
        ضلع کښي مرکزي، صوبائي ادارو د غړو کار او فعاليت رپورټ
      </div>
      <div class="header-meta">
        مياشت: <u>${pMonth}</u> &nbsp;&nbsp; کال: <u>${year || '2026'}</u>
      </div>
    </div>

    <!-- ────────────────────────────────────────────────────────────────────────── -->
    <!-- 1. MERKAZI & PROVINCIAL ORGANS MEMBERS ACTIVITY -->
    <!-- ────────────────────────────────────────────────────────────────────────── -->
    <div class="section-title">ضلع کښي مرکزي، صوبائي ادارو د غړو کار او فعاليت رپورټ</div>
    <table class="f9-table">
      <thead>
        <tr>
          <th style="width: 14px;">شمير</th>
          <th style="width: 60px;">ملګري نوم</th>
          <th style="width: 44px;">عهده</th>
          <th style="width: 38px;">نيټه</th>
          <th style="width: 22px;">ضلعي ايګزيکټيو</th>
          <th style="width: 22px;">ضلعي کميټي</th>
          <th style="width: 22px;">علاقائي ايګزيکټيو</th>
          <th style="width: 22px;">علاقائي کميټي</th>
          <th style="width: 22px;">يونټ ايګزيکټيو</th>
          <th style="width: 22px;">يونټ جنرل باډي</th>
          <th style="width: 20px;">PSO غونډي</th>
          <th style="width: 20px;">کانفرنس</th>
          <th style="width: 20px;">سيمينار</th>
          <th style="width: 20px;">سټډي سرکل</th>
          <th style="width: 22px;">شموليت پروګرام</th>
          <th style="width: 24px;">اتحاديانو سره</th>
          <th style="width: 26px;">جلسه مظاهره</th>
          <th style="width: 22px; background: #e2e8f0;">ټولي غونډي</th>
          <th style="width: 38px;">لوستنه (مطالعه)</th>
          <th style="width: 22px;">چنده</th>
          <th style="width: 20px;">دوره</th>
        </tr>
      </thead>
      <tbody>
        ${padSec1.map((r, i) => `
          <tr>
            <td>${i + 1}</td>
            <td class="text-cell">${clean(r.name)}</td>
            <td>${clean(r.designation)}</td>
            <td>${clean(r.date)}</td>
            <td>${clean(r.distExecMeeting)}</td>
            <td>${clean(r.distCommMeeting)}</td>
            <td>${clean(r.areaExecMeeting)}</td>
            <td>${clean(r.areaCommMeeting)}</td>
            <td>${clean(r.buExecMeeting)}</td>
            <td>${clean(r.buGbMeeting)}</td>
            <td>${clean(r.psoMeeting)}</td>
            <td>${clean(r.conferences)}</td>
            <td>${clean(r.seminars)}</td>
            <td>${clean(r.studyCircles)}</td>
            <td>${clean(r.inductions)}</td>
            <td>${clean(r.alliesMeeting)}</td>
            <td>${clean(r.publicGatherings)}</td>
            <td style="font-weight: bold; background: #f8fafc;">${clean(r.totalMeetings)}</td>
            <td class="text-cell">${clean(r.ideologicalReading)}</td>
            <td>${clean(r.dues)}</td>
            <td>${clean(r.tours)}</td>
          </tr>
        `).join('')}
        <tr style="font-weight: bold; background: #f1f5f9;">
          <td colspan="4">ټول / Total</td>
          <td>${clean(sumSec1('distExecMeeting'))}</td>
          <td>${clean(sumSec1('distCommMeeting'))}</td>
          <td>${clean(sumSec1('areaExecMeeting'))}</td>
          <td>${clean(sumSec1('areaCommMeeting'))}</td>
          <td>${clean(sumSec1('buExecMeeting'))}</td>
          <td>${clean(sumSec1('buGbMeeting'))}</td>
          <td>${clean(sumSec1('psoMeeting'))}</td>
          <td>${clean(sumSec1('conferences'))}</td>
          <td>${clean(sumSec1('seminars'))}</td>
          <td>${clean(sumSec1('studyCircles'))}</td>
          <td>${clean(sumSec1('inductions'))}</td>
          <td>${clean(sumSec1('alliesMeeting'))}</td>
          <td>${clean(sumSec1('publicGatherings'))}</td>
          <td style="background: #e2e8f0;">${clean(sumSec1('totalMeetings'))}</td>
          <td>—</td>
          <td>${clean(sumSec1('dues'))}</td>
          <td>${clean(sumSec1('tours'))}</td>
        </tr>
      </tbody>
    </table>

    <!-- ────────────────────────────────────────────────────────────────────────── -->
    <!-- 2. PUBLIC GATHERINGS, RALLIES, PROTESTS, JIRGAS, HARTAL -->
    <!-- ────────────────────────────────────────────────────────────────────────── -->
    <div class="section-title">ضلع کښي اولسي غونډي، جلسے، مظاهرے، جرګے، کارنر ميټنګ، شموليت پرګرام، هړتال (کاربنديز) رپورټ</div>
    <table class="f9-table">
      <thead>
        <tr>
          <th style="width: 18px;">شمير</th>
          <th style="width: 65px;">ادارے نوم</th>
          <th style="width: 44px;">نيټه</th>
          <th style="width: 65px;">ځاي نوم</th>
          <th style="width: 85px;">موضوع</th>
          <th style="width: 65px;">څه پروګرام وو</th>
          <th style="width: 90px;">ويناکونکو ملګرو نومونه</th>
          <th style="width: 36px;">ملګرو شمير</th>
          <th style="width: 36px;">دخلکو شمير</th>
        </tr>
      </thead>
      <tbody>
        ${padSec2.map((g, i) => `
          <tr>
            <td>${i + 1}</td>
            <td class="text-cell">${clean(g.organName)}</td>
            <td>${clean(g.date)}</td>
            <td class="text-cell">${clean(g.venue)}</td>
            <td class="text-cell">${clean(g.topic)}</td>
            <td>${clean(g.programType)}</td>
            <td class="text-cell">${clean(g.speakers)}</td>
            <td>${clean(g.comradesCount)}</td>
            <td>${clean(g.peopleCount)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- ────────────────────────────────────────────────────────────────────────── -->
    <!-- 3. CONFERENCES, SEMINARS, STUDY CIRCLES -->
    <!-- ────────────────────────────────────────────────────────────────────────── -->
    <div class="section-title">ضلع کښي پارټي کانفرنسونو، سيمينارونو، سټډي سرکل رپورټ</div>
    <table class="f9-table">
      <thead>
        <tr>
          <th style="width: 18px;">شمير</th>
          <th style="width: 70px;">ادارے نوم</th>
          <th style="width: 46px;">نيټه</th>
          <th style="width: 75px;">ځاي نوم</th>
          <th style="width: 100px;">موضوع</th>
          <th style="width: 70px;">څه پروګرام وو</th>
          <th style="width: 100px;">ويناکونکو ملګرو نومونه</th>
          <th style="width: 40px;">ملګرو شمير</th>
        </tr>
      </thead>
      <tbody>
        ${padSec3.map((c, i) => `
          <tr>
            <td>${i + 1}</td>
            <td class="text-cell">${clean(c.organName)}</td>
            <td>${clean(c.date)}</td>
            <td class="text-cell">${clean(c.venue)}</td>
            <td class="text-cell">${clean(c.topic)}</td>
            <td>${clean(c.programType)}</td>
            <td class="text-cell">${clean(c.speakers)}</td>
            <td>${clean(c.comradesCount)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- ────────────────────────────────────────────────────────────────────────── -->
    <!-- 4. BLOOD BANK, POSTS, CASH & ZAKAT -->
    <!-- ────────────────────────────────────────────────────────────────────────── -->
    <div class="section-title">ضلع کي بلډ بينک د پاره پوستونه، نغدي او زکات رپورټ</div>
    <table class="f9-table">
      <thead>
        <tr>
          <th>اختر پوستونه شمير</th>
          <th>نغدي</th>
          <th>ټولي نغدي</th>
          <th>زکات</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${clean(bBank.eidHidesCount)}</td>
          <td>${clean(bBank.cash)}</td>
          <td>${clean(bBank.totalCash)}</td>
          <td>${clean(bBank.zakat)}</td>
        </tr>
      </tbody>
    </table>

    <!-- ────────────────────────────────────────────────────────────────────────── -->
    <!-- 5. DISCIPLINARY ACTIONS -->
    <!-- ────────────────────────────────────────────────────────────────────────── -->
    <div class="section-title">ضلع کي تاديبي کاروائي</div>
    <table class="f9-table">
      <thead>
        <tr>
          <th style="width: 90px;">ملګري نوم</th>
          <th style="width: 65px;">عهده</th>
          <th style="width: 180px;">څه خلاف ورزي يې کړې وه</th>
          <th style="width: 150px;">تاديبي کاروايي</th>
        </tr>
      </thead>
      <tbody>
        ${padSec5.map(d => `
          <tr>
            <td class="text-cell">${clean(d.comradeName)}</td>
            <td>${clean(d.designation)}</td>
            <td class="text-cell">${clean(d.violation)}</td>
            <td class="text-cell">${clean(d.actionTaken)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <!-- ────────────────────────────────────────────────────────────────────────── -->
    <!-- 6. PROPOSALS, SUGGESTIONS & DEMANDS MATRIX -->
    <!-- ────────────────────────────────────────────────────────────────────────── -->
    <div class="section-title">وړانديزونه (پيشنهادونه، تجاویز) او غوښتنې</div>
    <table class="f9-table">
      <thead>
        <tr>
          <th rowspan="2" style="width: 60px;">برخه</th>
          <th colspan="3">وړانديزونه او غوښتنې</th>
          <th rowspan="2" style="width: 150px;">وړانديزونه (پيشنهادونه، تجاویز)</th>
          <th rowspan="2" style="width: 150px;">غوښتنې</th>
        </tr>
        <tr>
          <th style="width: 60px;">يونټ لخوا</th>
          <th style="width: 60px;">علاقې لخوا</th>
          <th style="width: 60px;">ضلعې لخوا</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="font-weight: bold; background: #f8fafc;">سياسي</td>
          <td>${clean(pol.byUnit)}</td>
          <td>${clean(pol.byArea)}</td>
          <td>${clean(pol.byDistrict)}</td>
          <td class="text-cell">${clean(pol.proposals)}</td>
          <td class="text-cell">${clean(pol.demands)}</td>
        </tr>
        <tr>
          <td style="font-weight: bold; background: #f8fafc;">تنظيمي</td>
          <td>${clean(org.byUnit)}</td>
          <td>${clean(org.byArea)}</td>
          <td>${clean(org.byDistrict)}</td>
          <td class="text-cell">${clean(org.proposals)}</td>
          <td class="text-cell">${clean(org.demands)}</td>
        </tr>
        <tr>
          <td style="font-weight: bold; background: #f8fafc;">ټولنيزو کارو</td>
          <td>${clean(soc.byUnit)}</td>
          <td>${clean(soc.byArea)}</td>
          <td>${clean(soc.byDistrict)}</td>
          <td class="text-cell">${clean(soc.proposals)}</td>
          <td class="text-cell">${clean(soc.demands)}</td>
        </tr>
      </tbody>
    </table>

    <!-- ────────────────────────────────────────────────────────────────────────── -->
    <!-- 7. SOCIAL WORK BRIEF & MISCELLANEOUS -->
    <!-- ────────────────────────────────────────────────────────────────────────── -->
    <div style="margin-top: 4px;">
      <div style="font-weight: bold; font-size: 7.5pt; margin-bottom: 2px;">
        ۱۔ ټولنيزو کارو لنډ رپورټ:
      </div>
      <div class="lines-area">${clean(effectiveSocial) || '&nbsp;'}</div>

      <div style="font-weight: bold; font-size: 7.5pt; margin-bottom: 2px;">
        ۲۔ متفرق:
      </div>
      <div class="lines-area">${clean(effectiveMisc) || '&nbsp;'}</div>
    </div>

    <!-- Leadership Signatures -->
    <div class="footer-signatures">
      <div>
        علاقائي سيکرټري لاسليک:
        <span class="sig-line">${clean(effectiveSec)}</span>
      </div>
      <div>
        د دستخط نېټه:
        <span class="sig-line" style="min-width: 90px;">${clean(effectiveSigDate)}</span>
      </div>
      <div>
        علاقائي سينئر معاون لاسليک:
        <span class="sig-line">${clean(effectiveDeputy)}</span>
      </div>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Generate Excel workbook for Form 9
 */
async function generateForm9Excel({
  districtName = '',
  areaName = '',
  month = '',
  year = '',
  sec1Members = [],
  sec2PublicGatherings = [],
  sec3Conferences = [],
  sec4BloodBank = {},
  sec5Discipline = [],
  sec6Proposals = {},
  sec7Notes = {},
  areaSecSignature = '',
  areaSeniorDeputySignature = '',
  signatureDate = '',
  socialWorkReport = '',
  miscellaneousNotes = '',
} = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PNAP-MIS';

  const ws = workbook.addWorksheet('Form 9 - Organs Report', {
    views: [{ rightToLeft: true }],
  });

  const pMonth = getPashtoMonth(month);

  // Title Row
  ws.mergeCells('A1:U1');
  const titleCell = ws.getCell('A1');
  titleCell.value = 'ضلع کښي مرکزي، صوبائي ادارو د غړو کار او فعاليت رپورټ';
  titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
  ws.getRow(1).height = 28;

  // Metadata Row
  ws.mergeCells('A2:U2');
  const metaCell = ws.getCell('A2');
  metaCell.value = `ضلع / علاقه: ${areaName ? `${areaName} (${districtName})` : (districtName || 'District')}  |  مياشت: ${pMonth}  |  کال: ${year || '2026'}`;
  metaCell.font = { name: 'Arial', size: 10, bold: true };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(2).height = 20;

  let currentRow = 4;

  // Section 1: Members Activity Table
  ws.getCell(`A${currentRow}`).value = '۱. ضلع کښي مرکزي، صوبائي ادارو د غړو کار او فعاليت';
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 11 };
  currentRow++;

  const sec1Headers = [
    'شمير', 'ملګري نوم', 'عهده', 'نيټه', 'ضلعي ايګزيکټيو', 'ضلعي کميټي', 'علاقائي ايګزيکټيو', 'علاقائي کميټي',
    'يونټ ايګزيکټيو', 'يونټ جنرل باډي', 'PSO غونډي', 'کانفرنس', 'سيمينار', 'سټډي سرکل', 'شموليت پروګرام',
    'اتحاديانو سره', 'جلسه مظاهره', 'ټولي غونډي', 'لوستنه (مطالعه)', 'چنده', 'دوره'
  ];
  const hRow1 = ws.getRow(currentRow);
  hRow1.values = sec1Headers;
  hRow1.font = { bold: true, size: 9 };
  hRow1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  hRow1.alignment = { horizontal: 'center', vertical: 'middle' };
  currentRow++;

  const sec1Start = currentRow;
  (sec1Members || []).forEach((r, idx) => {
    const row = ws.getRow(currentRow);
    row.values = [
      idx + 1,
      r.name || '',
      r.designation || '',
      r.date || '',
      parseInt(r.distExecMeeting, 10) || 0,
      parseInt(r.distCommMeeting, 10) || 0,
      parseInt(r.areaExecMeeting, 10) || 0,
      parseInt(r.areaCommMeeting, 10) || 0,
      parseInt(r.buExecMeeting, 10) || 0,
      parseInt(r.buGbMeeting, 10) || 0,
      parseInt(r.psoMeeting, 10) || 0,
      parseInt(r.conferences, 10) || 0,
      parseInt(r.seminars, 10) || 0,
      parseInt(r.studyCircles, 10) || 0,
      parseInt(r.inductions, 10) || 0,
      parseInt(r.alliesMeeting, 10) || 0,
      parseInt(r.publicGatherings, 10) || 0,
      { formula: `SUM(E${currentRow}:Q${currentRow})` },
      r.ideologicalReading || '',
      parseInt(r.dues, 10) || 0,
      parseInt(r.tours, 10) || 0,
    ];
    row.font = { size: 9 };
    currentRow++;
  });

  // Section 1 Totals Row
  const sec1TotalRow = ws.getRow(currentRow);
  sec1TotalRow.getCell(1).value = 'مجموعه / ټول';
  ws.mergeCells(`A${currentRow}:D${currentRow}`);
  sec1TotalRow.font = { bold: true, size: 9 };
  sec1TotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'T', 'U'].forEach(col => {
    sec1TotalRow.getCell(col).value = { formula: `SUM(${col}${sec1Start}:${col}${currentRow - 1})` };
  });
  currentRow += 3;

  // Section 2: Public Gatherings
  ws.getCell(`A${currentRow}`).value = '۲. ضلع کښي اولسي غونډي، جلسے، مظاهرے، جرګے، هړتال';
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 11 };
  currentRow++;

  const sec2Headers = ['شمير', 'ادارے نوم', 'نيټه', 'ځاي نوم', 'موضوع', 'څه پروګرام وو', 'ويناکونکو ملګرو نومونه', 'ملګرو شمير', 'دخلکو شمير'];
  const hRow2 = ws.getRow(currentRow);
  hRow2.values = sec2Headers;
  hRow2.font = { bold: true, size: 9 };
  hRow2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  currentRow++;

  (sec2PublicGatherings || []).forEach((g, idx) => {
    const row = ws.getRow(currentRow);
    row.values = [
      idx + 1,
      g.organName || '',
      g.date || '',
      g.venue || '',
      g.topic || '',
      g.programType || '',
      g.speakers || '',
      parseInt(g.comradesCount, 10) || 0,
      parseInt(g.peopleCount, 10) || 0,
    ];
    row.font = { size: 9 };
    currentRow++;
  });
  currentRow += 2;

  // Section 3: Conferences & Study Circles
  ws.getCell(`A${currentRow}`).value = '۳. ضلع کښي پارټي کانفرنسونو، سيمينارونو، سټډي سرکل رپورټ';
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 11 };
  currentRow++;

  const sec3Headers = ['شمير', 'ادارے نوم', 'نيټه', 'ځاي نوم', 'موضوع', 'څه پروګرام وو', 'ويناکونکو ملګرو نومونه', 'ملګرو شمير'];
  const hRow3 = ws.getRow(currentRow);
  hRow3.values = sec3Headers;
  hRow3.font = { bold: true, size: 9 };
  hRow3.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  currentRow++;

  (sec3Conferences || []).forEach((c, idx) => {
    const row = ws.getRow(currentRow);
    row.values = [
      idx + 1,
      c.organName || '',
      c.date || '',
      c.venue || '',
      c.topic || '',
      c.programType || '',
      c.speakers || '',
      parseInt(c.comradesCount, 10) || 0,
    ];
    row.font = { size: 9 };
    currentRow++;
  });
  currentRow += 2;

  // Section 4: Blood Bank & Zakat
  ws.getCell(`A${currentRow}`).value = '۴. ضلع کي بلډ بينک د پاره پوستونه، نغدي او زکات';
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 11 };
  currentRow++;

  const bBank = sec4BloodBank || {};
  const hRow4 = ws.getRow(currentRow);
  hRow4.values = ['اختر پوستونه شمير', 'نغدي', 'ټولي نغدي', 'زکات'];
  hRow4.font = { bold: true, size: 9 };
  hRow4.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  currentRow++;

  const bRow = ws.getRow(currentRow);
  bRow.values = [
    parseInt(bBank.eidHidesCount, 10) || 0,
    parseInt(bBank.cash, 10) || 0,
    parseInt(bBank.totalCash, 10) || 0,
    parseInt(bBank.zakat, 10) || 0,
  ];
  bRow.font = { size: 9 };
  currentRow += 3;

  // Section 5: Disciplinary Actions
  ws.getCell(`A${currentRow}`).value = '۵. ضلع کي تاديبي کاروائي';
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 11 };
  currentRow++;

  const hRow5 = ws.getRow(currentRow);
  hRow5.values = ['ملګري نوم', 'عهده', 'څه خلاف ورزي يې کړې وه', 'تاديبي کاروايي'];
  hRow5.font = { bold: true, size: 9 };
  hRow5.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  currentRow++;

  (sec5Discipline || []).forEach(d => {
    const row = ws.getRow(currentRow);
    row.values = [d.comradeName || '', d.designation || '', d.violation || '', d.actionTaken || ''];
    row.font = { size: 9 };
    currentRow++;
  });
  currentRow += 2;

  // Signatures Row
  const effectiveSec = areaSecSignature || sec7Notes?.areaSecSignature || '';
  const effectiveDeputy = areaSeniorDeputySignature || sec7Notes?.areaSeniorDeputySignature || '';
  const effectiveSigDate = signatureDate || sec7Notes?.signatureDate || '';

  const sigRow = ws.getRow(currentRow);
  sigRow.getCell(2).value = `علاقائي سيکرټري لاسليک: ${effectiveSec || '________________'}`;
  sigRow.getCell(2).font = { bold: true, size: 10 };
  sigRow.getCell(8).value = `د دستخط نېټه: ${effectiveSigDate || '________________'}`;
  sigRow.getCell(8).font = { bold: true, size: 10 };
  sigRow.getCell(14).value = `علاقائي سينئر معاون لاسليک: ${effectiveDeputy || '________________'}`;
  sigRow.getCell(14).font = { bold: true, size: 10 };

  // Set explicit column widths
  ws.columns = [
    { width: 6 }, { width: 20 }, { width: 14 }, { width: 12 },
    { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 },
    { width: 10 }, { width: 10 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 18 }, { width: 10 }, { width: 10 },
  ];

  return workbook;
}

module.exports = {
  fetchForm9Data,
  generateForm9Html,
  generateForm9Excel,
};
