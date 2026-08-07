const asyncHandler = require('express-async-handler');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const Member = require('../models/Member');
const Meeting = require('../models/Meeting');
const Activity = require('../models/Activity');
const Donation = require('../models/Donation');
const Expense = require('../models/Expense');
const BasicUnit = require('../models/BasicUnit');
const Area = require('../models/Area');
const District = require('../models/District');
const Province = require('../models/Province');
const Responsibility = require('../models/Responsibility');
const { ApiError } = require('../utils/response');
const { resolveUnitChain } = require('../utils/unitScope');
const env = require('../config/env');
const settingsService = require('../services/settingsService');
const eventExportService = require('../services/eventExportService');

// Render a dynamicData value into a cell-friendly form. Numerics
// stay numeric so XLSX can format them; everything else stringifies
// safely. Mirrors eventExportService._renderValue but kept local so
// the export controller doesn't import private helpers.
function _formatDynamicValue(col, raw) {
  if (raw === null || raw === undefined) return '';
  switch (col.type) {
    case 'DATE': {
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    }
    case 'BOOL': return raw ? 'Yes' : 'No';
    case 'MULTISELECT': return Array.isArray(raw) ? raw.join(', ') : String(raw);
    case 'INT':
    case 'NUMBER':
    case 'CURRENCY': return Number(raw);
    default: return String(raw);
  }
}

// Resolve a `/uploads/<filename>` URL to a real disk path so PDFKit
// can embed the bytes. Returns null if the file is missing or the
// URL is anything other than a local upload path.
function uploadDiskPath(url) {
  if (!url || typeof url !== 'string') return null;
  if (!url.startsWith('/uploads/')) return null;
  const filename = url.replace(/^\/uploads\//, '');
  const safe = path.basename(filename);
  const full = path.resolve(process.cwd(), env.UPLOAD_DIR, safe);
  return fs.existsSync(full) ? full : null;
}

// PR B5 — branded report header. Pulls from SystemSettings on every
// render so admin edits to identity / theme / logos / report
// branding propagate to the next exported PDF without a server
// restart.
//
//   • Logo (if logos.print.url is set + file exists) at top-left
//   • Org name + report title centered/right
//   • Period subtitle in muted text
//   • Thin colored bar separator using the brand primary
//
// Safe defaults preserve the legacy header look (PKNAP red bar) when
// no custom branding has been configured. Helper returns the bottom
// y-coordinate so the caller knows where to start content.
function applyBrandedHeader(doc, branding, reportTitle, subtitle) {
  const id = branding?.identity || {};
  const logos = branding?.logos || {};
  const theme = branding?.theme?.light || {};
  const report = branding?.reportBranding || {};

  const orgName = id.organizationName || id.systemName || 'PKNAP';
  const headerColor = report.pdfHeaderColor || theme.primary || '#0a3a6e';
  const showLogo = report.showLogoOnPdf !== false;
  const logoPath = showLogo ? uploadDiskPath(logos.print?.url) : null;

  const startY = doc.y;
  let textX = 40;
  let textWidth = 515;

  // Logo at top-left when configured. PDFKit's image() preserves
  // aspect ratio when only one of width/height is given.
  if (logoPath) {
    try {
      doc.image(logoPath, 40, startY, { fit: [80, 60] });
      textX = 130;
      textWidth = 425;
    } catch {
      // Bad image — skip silently rather than failing the export.
    }
  }

  // Title block, centered within the available width.
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#1a1a1a')
    .text(`${orgName} ${reportTitle}`, textX, startY + 4, { width: textWidth, align: 'center' });
  if (subtitle) {
    doc.font('Helvetica').fontSize(12).fillColor('#374151')
      .text(subtitle, textX, doc.y + 2, { width: textWidth, align: 'center' });
  }

  // Push y past whichever (logo or title) is taller, plus margin.
  const titleEnd = doc.y;
  const logoEnd = logoPath ? startY + 60 : startY;
  doc.y = Math.max(titleEnd, logoEnd) + 8;

  // Brand-colored separator bar.
  doc.strokeColor(headerColor).lineWidth(2)
    .moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.6);
  doc.fillColor('#1a1a1a').strokeColor('#000000');
}

// Branded footer — single-line footer text from settings, drawn at
// the bottom of the CURRENT page. Caller invokes this once per page
// (typically right before doc.end() or before doc.addPage()).
function applyBrandedFooter(doc, branding) {
  const id = branding?.identity || {};
  const report = branding?.reportBranding || {};
  const text = report.pdfFooterText
    || id.copyrightText
    || id.footerText
    || `Generated ${new Date().toLocaleString()}`;
  doc.font('Helvetica-Oblique').fontSize(8).fillColor('#9aa3af')
    .text(text, 40, doc.page.height - 28, { width: 515, align: 'center' });
  doc.fillColor('#1a1a1a');
}

// Helper — load settings safely. If the service fails (DB hiccup),
// return null and let the caller fall through to the legacy header
// rather than break the export.
async function _loadBrandingSafe() {
  try {
    return await settingsService.getAll();
  } catch {
    return null;
  }
}

// Member roster filter — uses the chain id (areaId / districtId /
// etc.) because members are rostered at BU only; "members in this
// area" is the union of its BU rosters.
function memberFilter(unitLevel, chain) {
  if (unitLevel === 'BASIC_UNIT') return { basicUnitId: chain.basicUnitId };
  if (unitLevel === 'AREA') return { areaId: chain.areaId };
  if (unitLevel === 'DISTRICT') return { districtId: chain.districtId };
  if (unitLevel === 'PROVINCE') return { provinceId: chain.provinceId };
  return {};
}

// Operational-record filter — meetings / activities / donations /
// expenses / responsibilities carry unitLevel + unitId for the level
// they were authored at. Filter by THAT pair so an Area report
// shows only what was recorded at the Area level, not aggregated
// from BUs below.
function ownFilter(unitLevel, unitId) {
  if (unitLevel === 'CENTRAL') return { unitLevel: 'CENTRAL' };
  return { unitLevel, unitId };
}

async function unitName(unitLevel, unitId) {
  const M = { BASIC_UNIT: BasicUnit, AREA: Area, DISTRICT: District, PROVINCE: Province }[unitLevel];
  if (!M) return 'CENTRAL';
  const doc = await M.findById(unitId).select('name').lean();
  return doc?.name || unitLevel;
}

async function gatherUnitData({ unitLevel, unitId, from, to }) {
  const chain = unitLevel === 'CENTRAL' ? {} : await resolveUnitChain(unitLevel, unitId);
  if (unitLevel !== 'CENTRAL' && !chain) throw new ApiError(400, 'INVALID_UNIT', 'Unit not found');
  const memberQ = memberFilter(unitLevel, chain);
  const ownQ = ownFilter(unitLevel, unitId);
  const dateFilter = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to) dateFilter.$lte = new Date(to);
  const startClause = (Object.keys(dateFilter).length) ? { startAt: dateFilter } : {};
  const recvClause = (Object.keys(dateFilter).length) ? { receivedAt: dateFilter } : {};
  const incurClause = (Object.keys(dateFilter).length) ? { incurredAt: dateFilter } : {};

  const [members, meetings, activities, donations, expenses, responsibilities] = await Promise.all([
    Member.find({ ...memberQ, status: 'ACTIVE' }).select('fullName memberId cnic phone').lean(),
    Meeting.find({ ...ownQ, ...startClause })
      .populate('chairpersonId', 'fullName memberId')
      .populate('attendance.memberId', 'fullName memberId')
      .lean(),
    Activity.find({ ...ownQ, ...startClause }).lean(),
    Donation.find({ ...ownQ, ...recvClause }).lean(),
    Expense.find({ ...ownQ, ...incurClause }).lean(),
    Responsibility.find(ownQ).populate('assignedToMemberId', 'fullName memberId').lean(),
  ]);

  const name = await unitName(unitLevel, unitId);
  return { name, unitLevel, members, meetings, activities, donations, expenses, responsibilities };
}

// ─── FINANCE-only Excel — Summary + Donations + Expenses ───────────
exports.unitFinanceXlsx = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, from, to } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');
  const data = await gatherUnitData({ unitLevel, unitId, from, to });

  const donTotal = data.donations.reduce((a, d) => a + (d.amount || 0), 0);
  const expApproved = data.expenses.filter((e) => e.state === 'APPROVED').reduce((a, e) => a + (e.amount || 0), 0);
  const expPending = data.expenses.filter((e) => e.state === 'PENDING').reduce((a, e) => a + (e.amount || 0), 0);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PKNAP';
  wb.created = new Date();

  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ header: 'Metric', key: 'k', width: 32 }, { header: 'Value', key: 'v', width: 24 }];
  sum.addRow({ k: 'Unit', v: `${data.unitLevel} · ${data.name}` });
  sum.addRow({ k: 'Period', v: `${from || 'all'} → ${to || 'all'}` });
  sum.addRow({ k: 'Donations Count', v: data.donations.length });
  sum.addRow({ k: 'Donations Total (PKR)', v: donTotal });
  sum.addRow({ k: 'Expenses Approved (PKR)', v: expApproved });
  sum.addRow({ k: 'Expenses Pending (PKR)', v: expPending });
  sum.addRow({ k: 'Net Balance (PKR)', v: donTotal - expApproved });
  sum.getRow(1).font = { bold: true };

  const don = wb.addWorksheet('Donations');
  don.columns = [
    { header: 'Receipt #', key: 'r', width: 14 },
    { header: 'Date', key: 'd', width: 14 },
    { header: 'Donor Type', key: 'dt', width: 14 },
    { header: 'Donor', key: 'dn', width: 28 },
    { header: 'CNIC', key: 'c', width: 18 },
    { header: 'Mode', key: 'm', width: 16 },
    { header: 'Amount (PKR)', key: 'a', width: 16 },
  ];
  data.donations
    .slice()
    .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
    .forEach((d) => don.addRow({
      r: d.receiptNo || '',
      d: new Date(d.receivedAt).toLocaleDateString(),
      dt: d.donorType,
      dn: d.donorType === 'ANONYMOUS' ? 'Anonymous' : (d.donorName || '(member)'),
      c: d.donorCnic || '',
      m: d.paymentMode,
      a: d.amount,
    }));
  don.getRow(1).font = { bold: true };

  const exp = wb.addWorksheet('Expenses');
  exp.columns = [
    { header: 'Date', key: 'd', width: 14 },
    { header: 'Category', key: 'c', width: 18 },
    { header: 'Description', key: 'desc', width: 36 },
    { header: 'Vendor', key: 'v', width: 24 },
    { header: 'Mode', key: 'm', width: 16 },
    { header: 'State', key: 's', width: 12 },
    { header: 'Amount (PKR)', key: 'a', width: 16 },
  ];
  data.expenses
    .slice()
    .sort((a, b) => new Date(b.incurredAt) - new Date(a.incurredAt))
    .forEach((e) => exp.addRow({
      d: new Date(e.incurredAt).toLocaleDateString(),
      c: e.category,
      desc: e.description || '',
      v: e.vendor || '',
      m: e.paymentMode,
      s: e.state,
      a: e.amount,
    }));
  exp.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${data.unitLevel}-${data.name}-finance.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ─── FINANCE-only PDF — summary + donations table + expenses table
exports.unitFinancePdf = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, from, to } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');
  const data = await gatherUnitData({ unitLevel, unitId, from, to });
  const branding = await _loadBrandingSafe();
  const sectionColor = branding?.reportBranding?.pdfHeaderColor
    || branding?.theme?.light?.primary
    || '#0a3a6e';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${data.unitLevel}-${data.name}-finance.pdf"`);
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  const donTotal = data.donations.reduce((a, d) => a + (d.amount || 0), 0);
  const expApproved = data.expenses.filter((e) => e.state === 'APPROVED').reduce((a, e) => a + (e.amount || 0), 0);
  const expPending = data.expenses.filter((e) => e.state === 'PENDING').reduce((a, e) => a + (e.amount || 0), 0);

  // Branded header replaces the hardcoded "PKNAP Finance Report" title.
  applyBrandedHeader(doc, branding, 'Finance Report',
    `${data.unitLevel} · ${data.name}  ·  Period: ${from || 'all'} → ${to || 'all'}`);

  doc.fontSize(13).text('Summary', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(11);
  [
    ['Donations (count)', data.donations.length],
    ['Donations Total (PKR)', donTotal.toLocaleString()],
    ['Approved Expenses (PKR)', expApproved.toLocaleString()],
    ['Pending Expenses (PKR)', expPending.toLocaleString()],
    ['Net Balance (PKR)', (donTotal - expApproved).toLocaleString()],
  ].forEach(([k, v]) => doc.text(`${k}: ${v}`));
  doc.moveDown(1);

  doc.font('Helvetica-Bold').fontSize(14).fillColor(sectionColor).text(`Donations (${data.donations.length})`);
  doc.strokeColor(sectionColor).lineWidth(1).moveTo(40, doc.y + 2).lineTo(555, doc.y + 2).stroke();
  doc.moveDown(0.4);
  if (data.donations.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor('gray').text('No donations recorded in this period.');
    doc.fillColor('#1a1a1a').font('Helvetica');
  } else {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(sectionColor);
    doc.text('Receipt #          Date          Donor                              Mode               Amount (PKR)');
    doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
    data.donations
      .slice()
      .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
      .forEach((d) => {
        if (doc.y > doc.page.height - 60) doc.addPage();
        const receipt = (d.receiptNo || '—').padEnd(18).slice(0, 18);
        const date = new Date(d.receivedAt).toLocaleDateString().padEnd(12).slice(0, 12);
        const donorRaw = d.donorType === 'ANONYMOUS' ? 'Anonymous' : (d.donorName || '(member)');
        const donor = donorRaw.padEnd(34).slice(0, 34);
        const mode = (d.paymentMode || '—').padEnd(18).slice(0, 18);
        doc.text(`${receipt} ${date} ${donor} ${mode} ${(d.amount || 0).toLocaleString()}`);
      });
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(sectionColor).text(`Total Donations: PKR ${donTotal.toLocaleString()}`);
    doc.font('Helvetica').fillColor('#1a1a1a');
  }

  if (doc.y > doc.page.height - 200) doc.addPage(); else doc.moveDown(1);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(sectionColor).text(`Expenses (${data.expenses.length})`);
  doc.strokeColor(sectionColor).lineWidth(1).moveTo(40, doc.y + 2).lineTo(555, doc.y + 2).stroke();
  doc.moveDown(0.4);
  if (data.expenses.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor('gray').text('No expenses recorded in this period.');
    doc.fillColor('#1a1a1a').font('Helvetica');
  } else {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(sectionColor);
    doc.text('Date          Category               Description                          State        Amount (PKR)');
    doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
    data.expenses
      .slice()
      .sort((a, b) => new Date(b.incurredAt) - new Date(a.incurredAt))
      .forEach((e) => {
        if (doc.y > doc.page.height - 60) doc.addPage();
        const date = new Date(e.incurredAt).toLocaleDateString().padEnd(12).slice(0, 12);
        const category = (e.category || '—').padEnd(22).slice(0, 22);
        const desc = (e.description || e.vendor || '—').padEnd(36).slice(0, 36);
        const state = (e.state || '—').padEnd(12).slice(0, 12);
        doc.text(`${date} ${category} ${desc} ${state} ${(e.amount || 0).toLocaleString()}`);
      });
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(sectionColor).text(
      `Total Approved: PKR ${expApproved.toLocaleString()}` +
      (expPending ? `   ·   Pending: PKR ${expPending.toLocaleString()}` : '')
    );
    doc.font('Helvetica').fillColor('#1a1a1a');
  }

  applyBrandedFooter(doc, branding);
  doc.end();
});

// ─── MEETINGS-only Excel — Summary + Meetings + Activities + Members + Responsibilities
exports.unitMeetingsXlsx = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, from, to } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');
  const data = await gatherUnitData({ unitLevel, unitId, from, to });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PKNAP';
  wb.created = new Date();

  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ header: 'Metric', key: 'k', width: 32 }, { header: 'Value', key: 'v', width: 24 }];
  sum.addRow({ k: 'Unit', v: `${data.unitLevel} · ${data.name}` });
  sum.addRow({ k: 'Period', v: `${from || 'all'} → ${to || 'all'}` });
  sum.addRow({ k: 'Active Members', v: data.members.length });
  sum.addRow({ k: 'Meetings', v: data.meetings.length });
  sum.addRow({ k: 'Finalized Meetings', v: data.meetings.filter((m) => m.state === 'FINALIZED').length });
  sum.addRow({ k: 'Activities', v: data.activities.length });
  sum.addRow({ k: 'Responsibilities Pending', v: data.responsibilities.filter((r) => r.state === 'PENDING').length });
  sum.addRow({ k: 'Responsibilities Completed', v: data.responsibilities.filter((r) => r.state === 'COMPLETED').length });
  sum.getRow(1).font = { bold: true };

  // Dynamic columns — union of `reporting.includeInExport` fields
  // across every snapshot referenced by the result set. Stable
  // ordering: exportOrder then key. Missing values render as ''.
  const meetingDynCols = await eventExportService.columnsForMany(
    data.meetings.map((m) => m.configSnapshotId).filter(Boolean),
  );
  const activityDynCols = await eventExportService.columnsForMany(
    data.activities.map((a) => a.configSnapshotId).filter(Boolean),
  );

  const mt = wb.addWorksheet('Meetings');
  mt.columns = [
    { header: 'Date', key: 'd', width: 22 },
    { header: 'Type', key: 't', width: 8 },
    { header: 'Title', key: 'tt', width: 32 },
    { header: 'Description', key: 'desc', width: 40 },
    { header: 'Venue', key: 'v', width: 28 },
    { header: 'Chair', key: 'c', width: 24 },
    { header: 'Attendance', key: 'a', width: 12 },
    { header: 'Photos', key: 'p', width: 10 },
    { header: 'State', key: 's', width: 14 },
    { header: 'Supervisor', key: 'sup', width: 12 },
    ...meetingDynCols.map((c) => ({ header: c.label, key: `dyn_${c.key}`, width: 20 })),
  ];
  data.meetings.forEach((m) => {
    const row = {
      d: new Date(m.startAt).toLocaleString(),
      t: m.type,
      tt: m.title || '',
      desc: m.description || '',
      v: m.venue,
      c: m.chairpersonId?.fullName || '',
      a: (m.attendance || []).filter((x) => x.status === 'PRESENT').length,
      p: (m.photos || []).length,
      s: m.state,
      sup: m.supervisorAttended ? 'Yes' : 'No',
    };
    const dyn = m.dynamicData || {};
    for (const col of meetingDynCols) {
      row[`dyn_${col.key}`] = _formatDynamicValue(col, dyn[col.key]);
    }
    mt.addRow(row);
  });
  mt.getRow(1).font = { bold: true };

  const ac = wb.addWorksheet('Activities');
  ac.columns = [
    { header: 'Date', key: 'd', width: 22 },
    { header: 'Type', key: 't', width: 14 },
    { header: 'Title', key: 'tt', width: 32 },
    { header: 'Venue', key: 'v', width: 24 },
    { header: 'Attendees Est.', key: 'ae', width: 14 },
    { header: 'State', key: 's', width: 14 },
    { header: 'Expected Joiners', key: 'ej', width: 14 },
    { header: 'Actual Joiners', key: 'aj', width: 14 },
    { header: 'People Contacted', key: 'pc', width: 16 },
    ...activityDynCols.map((c) => ({ header: c.label, key: `dyn_${c.key}`, width: 20 })),
  ];
  data.activities.forEach((a) => {
    const row = {
      d: new Date(a.startAt).toLocaleString(),
      t: a.type,
      tt: a.title,
      v: a.venue || '',
      ae: a.externalAttendanceEstimate || 0,
      s: a.state,
      ej: a.campaign?.expectedJoiners || '',
      aj: a.campaign?.actualJoiners || '',
      pc: a.campaign?.peopleContacted || '',
    };
    const dyn = a.dynamicData || {};
    for (const col of activityDynCols) {
      row[`dyn_${col.key}`] = _formatDynamicValue(col, dyn[col.key]);
    }
    ac.addRow(row);
  });
  ac.getRow(1).font = { bold: true };

  const mb = wb.addWorksheet('Members');
  mb.columns = [
    { header: 'Member ID', key: 'mid', width: 28 },
    { header: 'Full Name', key: 'fn', width: 28 },
    { header: 'CNIC', key: 'c', width: 18 },
    { header: 'Phone', key: 'p', width: 16 },
  ];
  data.members.forEach((m) => mb.addRow({ mid: m.memberId, fn: m.fullName, c: m.cnic, p: m.phone }));
  mb.getRow(1).font = { bold: true };

  const rb = wb.addWorksheet('Responsibilities');
  rb.columns = [
    { header: 'Title', key: 't', width: 36 },
    { header: 'Assigned To', key: 'a', width: 28 },
    { header: 'Due', key: 'd', width: 16 },
    { header: 'State', key: 's', width: 14 },
    { header: 'Completed', key: 'c', width: 18 },
  ];
  data.responsibilities.forEach((r) => rb.addRow({
    t: r.title,
    a: r.assignedToMemberId?.fullName || '',
    d: r.dueDate ? new Date(r.dueDate).toLocaleDateString() : '',
    s: r.state,
    c: r.completedAt ? new Date(r.completedAt).toLocaleDateString() : '',
  }));
  rb.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${data.unitLevel}-${data.name}-meetings.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ─── MEETINGS-only PDF — full per-meeting detail with embedded photos
exports.unitMeetingsPdf = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, from, to } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');
  const data = await gatherUnitData({ unitLevel, unitId, from, to });
  const branding = await _loadBrandingSafe();
  const sectionColor = branding?.reportBranding?.pdfHeaderColor
    || branding?.theme?.light?.primary
    || '#0a3a6e';

  // Per-snapshot dynamic-field column lists. Each record renders
  // ONLY its own snapshot's exportable fields (per §10) so a 2025
  // meeting always uses 2025 columns, even when re-exported later.
  const meetingPdfDynColsBySnapshot = new Map();
  for (const id of new Set(data.meetings.map((m) => String(m.configSnapshotId || '')).filter(Boolean))) {
    meetingPdfDynColsBySnapshot.set(id, await eventExportService.columnsForMany([id]));
  }
  const activityPdfDynColsBySnapshot = new Map();
  for (const id of new Set(data.activities.map((a) => String(a.configSnapshotId || '')).filter(Boolean))) {
    activityPdfDynColsBySnapshot.set(id, await eventExportService.columnsForMany([id]));
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${data.unitLevel}-${data.name}-meetings.pdf"`);
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  applyBrandedHeader(doc, branding, 'Meetings & Activities Report',
    `${data.unitLevel} · ${data.name}  ·  Period: ${from || 'all'} → ${to || 'all'}`);

  doc.fontSize(13).text('Summary', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(11);
  const rows = [
    ['Active Members', data.members.length],
    ['Meetings', data.meetings.length],
    ['Finalized Meetings', data.meetings.filter((m) => m.state === 'FINALIZED').length],
    ['Activities', data.activities.length],
    ['Pending Responsibilities', data.responsibilities.filter((r) => r.state === 'PENDING').length],
    ['Completed Responsibilities', data.responsibilities.filter((r) => r.state === 'COMPLETED').length],
  ];
  rows.forEach(([k, v]) => doc.text(`${k}: ${v}`));
  doc.moveDown(1);

  // ─── Detailed per-meeting blocks with embedded photos ─────────────
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(16).fillColor(sectionColor).text(`Meetings (${data.meetings.length})`, { align: 'center' });
  doc.moveDown(0.3);
  doc.strokeColor(sectionColor).lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.6);

  if (data.meetings.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(11).fillColor('gray').text('No meetings recorded in this period.').fillColor('black');
  }

  data.meetings.forEach((m, idx) => {
    // Start each meeting on a fresh space if remaining is small.
    if (doc.y > doc.page.height - 280) doc.addPage();

    // Meeting header
    doc.font('Helvetica-Bold').fontSize(13).fillColor(sectionColor)
      .text(`${idx + 1}. ${m.title || m.type}`);
    doc.font('Helvetica').fontSize(9).fillColor('#555c66')
      .text(`${m.type} · ${m.state} · ${new Date(m.startAt).toLocaleString()}`);
    doc.fillColor('#1a1a1a').moveDown(0.3);

    // Meta lines
    doc.fontSize(10);
    doc.text(`Venue: ${m.venue || '—'}`);
    if (m.gpsLat != null && m.gpsLng != null) {
      doc.text(`Venue GPS: ${m.gpsLat.toFixed(6)}, ${m.gpsLng.toFixed(6)}`);
    }
    doc.text(`Chair: ${m.chairpersonId?.fullName || '—'}`);
    if (m.body) doc.text(`Body: ${m.body}`);
    if (m.supervisorAttended) doc.text('Supervisor: attended');

    // Attendance summary
    const att = m.attendance || [];
    if (att.length > 0) {
      const present = att.filter((a) => a.status === 'PRESENT').length;
      const late = att.filter((a) => a.status === 'LATE').length;
      const absent = att.filter((a) => a.status === 'ABSENT').length;
      doc.text(`Attendance: ${present} present, ${late} late, ${absent} absent (of ${att.length} on roster)`);
    }

    // Description / agenda / notes / strategy (compact)
    // Description leads: it is the meeting's own account of itself and
    // reads as the lead-in to the agenda, not as another meta line.
    if (m.description) {
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(sectionColor).text('Description');
      doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a').text(m.description, { align: 'justify' });
    }
    if (m.agenda) {
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(sectionColor).text('Agenda');
      doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a').text(m.agenda, { align: 'justify' });
    }
    if (m.activityNotes) {
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(sectionColor).text('Activity Notes');
      doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a').text(m.activityNotes, { align: 'justify' });
    }
    if (m.upcomingStrategy) {
      doc.moveDown(0.2);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(sectionColor).text('Upcoming Strategy');
      doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a').text(m.upcomingStrategy, { align: 'justify' });
    }

    // Dynamic custom fields — pinned from the meeting's own snapshot
    // so historical exports keep their original column set.
    const mDynCols = meetingPdfDynColsBySnapshot.get(String(m.configSnapshotId || ''));
    if (mDynCols && mDynCols.length > 0) {
      const dyn = m.dynamicData || {};
      const visible = mDynCols.filter((c) => {
        const v = dyn[c.key];
        return v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);
      });
      if (visible.length > 0) {
        doc.moveDown(0.2);
        doc.font('Helvetica-Bold').fontSize(9).fillColor(sectionColor).text('Custom Fields');
        doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
        for (const col of visible) {
          const raw = _formatDynamicValue(col, dyn[col.key]);
          doc.text(`${col.label}: ${raw}`);
        }
      }
    }

    // Embedded photos
    const photos = (m.photos || []).filter((p) => uploadDiskPath(p.url));
    if (photos.length > 0) {
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(sectionColor).text(`Photographs (${photos.length})`);
      doc.moveDown(0.2);
      photos.forEach((p, i) => {
        const diskPath = uploadDiskPath(p.url);
        if (!diskPath) return;
        // New page if not enough room for image + caption (~ 230pt).
        if (doc.y > doc.page.height - 240) doc.addPage();
        try {
          doc.image(diskPath, { fit: [460, 200], align: 'center', valign: 'top' });
        } catch (err) {
          doc.font('Helvetica-Oblique').fontSize(8).fillColor('#dc2626')
            .text(`[Photo ${i + 1}: failed to embed — ${err.message}]`);
        }
        doc.moveDown(0.25);
        doc.font('Helvetica').fontSize(8).fillColor('#555c66');
        const cap = `Photo ${i + 1}/${photos.length}` +
          ` · ${p.capturedAt ? new Date(p.capturedAt).toLocaleString() : 'no timestamp'}` +
          (p.gps?.lat != null && p.gps?.lng != null ? ` · GPS ${Number(p.gps.lat).toFixed(5)}, ${Number(p.gps.lng).toFixed(5)}` : '');
        doc.text(cap, { align: 'center' });
        doc.moveDown(0.4);
        doc.fillColor('#1a1a1a');
      });
    }

    // Separator
    doc.moveDown(0.4);
    doc.strokeColor('#c9ced6').lineWidth(0.5).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.6);
  });

  doc.fontSize(13).text('Activities', { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10);
  if (data.activities.length === 0) doc.fillColor('gray').text('(none)').fillColor('black');
  data.activities.slice(0, 30).forEach((a) => {
    doc.text(`• ${new Date(a.startAt).toLocaleDateString()} · ${a.type} · ${a.title} · ${a.state}`);
    const aDynCols = activityPdfDynColsBySnapshot.get(String(a.configSnapshotId || ''));
    if (aDynCols && aDynCols.length > 0) {
      const dyn = a.dynamicData || {};
      const visible = aDynCols.filter((c) => {
        const v = dyn[c.key];
        return v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);
      });
      if (visible.length > 0) {
        doc.font('Helvetica').fontSize(9).fillColor('#374151');
        const parts = visible.map((c) => `${c.label}: ${_formatDynamicValue(c, dyn[c.key])}`);
        doc.text(`   ${parts.join(' · ')}`, { indent: 12 });
        doc.fillColor('#1a1a1a').fontSize(10);
      }
    }
  });

  applyBrandedFooter(doc, branding);
  doc.end();
});

exports.memberPerformancePdf = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { from, to } = req.query;
  const m = await Member.findById(id).lean();
  if (!m) throw new ApiError(404, 'NOT_FOUND', 'Member not found');

  const dateFilter = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to) dateFilter.$lte = new Date(to);
  const startClause = (Object.keys(dateFilter).length) ? { startAt: dateFilter } : {};

  const [meetingsTotal, meetingsPresent, meetingsLate, activitiesPart, activitiesLed, donAgg, respPending, respCompleted] = await Promise.all([
    Meeting.countDocuments({ 'attendance.memberId': m._id, state: 'FINALIZED', ...startClause }),
    Meeting.countDocuments({ attendance: { $elemMatch: { memberId: m._id, status: 'PRESENT' } }, state: 'FINALIZED', ...startClause }),
    Meeting.countDocuments({ attendance: { $elemMatch: { memberId: m._id, status: 'LATE' } }, state: 'FINALIZED', ...startClause }),
    Activity.countDocuments({ participants: m._id, ...startClause }),
    Activity.countDocuments({ leadMemberId: m._id, ...startClause }),
    Donation.aggregate([
      { $match: { donorMemberId: m._id, ...(Object.keys(dateFilter).length ? { receivedAt: dateFilter } : {}) } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Responsibility.countDocuments({ assignedToMemberId: m._id, state: 'PENDING' }),
    Responsibility.countDocuments({ assignedToMemberId: m._id, state: 'COMPLETED' }),
  ]);

  const branding = await _loadBrandingSafe();

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="member-${m.memberId || m._id}-performance.pdf"`);
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  applyBrandedHeader(doc, branding, 'Member Performance Report',
    `${m.fullName}  ·  ${m.memberId || ''}${m.cnic ? `  ·  CNIC ${m.cnic}` : ''}`);

  doc.fontSize(12);
  doc.text(`Period: ${from || 'all'} → ${to || 'all'}`);
  doc.moveDown(0.5);
  doc.text(`Meetings (roster, finalized): ${meetingsTotal}`);
  doc.text(`  • Present: ${meetingsPresent}`);
  doc.text(`  • Late: ${meetingsLate}`);
  doc.text(`  • Absent: ${Math.max(0, meetingsTotal - meetingsPresent - meetingsLate)}`);
  if (meetingsTotal) doc.text(`  • Attendance rate: ${Math.round(((meetingsPresent + meetingsLate) / meetingsTotal) * 100)}%`);
  doc.moveDown(0.5);
  doc.text(`Activities participated: ${activitiesPart}`);
  doc.text(`Activities led: ${activitiesLed}`);
  doc.moveDown(0.5);
  doc.text(`Donations: ${donAgg[0]?.count || 0} (PKR ${(donAgg[0]?.total || 0).toLocaleString()})`);
  doc.moveDown(0.5);
  doc.text(`Responsibilities pending: ${respPending}`);
  doc.text(`Responsibilities completed: ${respCompleted}`);

  applyBrandedFooter(doc, branding);
  doc.end();
});

// ─── Per-meeting PDF — full details + embedded photographs ──────────
//
// Includes: header (type + title + state + venue + start/end + GPS),
// chairperson, agenda, attendance roster (Present/Late/Absent), notes,
// next-strategy, study-circle contributions if any, and every photo
// rendered with its capture timestamp + GPS coordinates.
exports.meetingPdf = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const m = await Meeting.findById(id)
    .populate('chairpersonId', 'fullName cnic memberId')
    .populate('attendance.memberId', 'fullName cnic memberId')
    .lean();
  if (!m) throw new ApiError(404, 'NOT_FOUND', 'Meeting not found');

  const filename = `meeting-${(m.title || m.type || 'minutes').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${id.slice(-6)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const branding = await _loadBrandingSafe();
  const sectionColor = branding?.reportBranding?.pdfHeaderColor
    || branding?.theme?.light?.primary
    || '#0a3a6e';

  const doc = new PDFDocument({ margin: 40, size: 'A4', autoFirstPage: true });
  doc.pipe(res);

  // ─── Header (branded)
  applyBrandedHeader(doc, branding, 'Meeting Minutes',
    `${m.title || m.type}  ·  Type: ${m.type}  ·  State: ${m.state}`);

  // ─── Meta block
  doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor).text('Details');
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a');
  const fmt = (d) => d ? new Date(d).toLocaleString() : '—';
  doc.text(`Start:  ${fmt(m.startAt)}`);
  if (m.endAt) doc.text(`End:    ${fmt(m.endAt)}`);
  doc.text(`Venue:  ${m.venue || '—'}`);
  if (m.gpsLat != null && m.gpsLng != null) {
    doc.text(`Venue GPS: ${m.gpsLat.toFixed(6)}, ${m.gpsLng.toFixed(6)}`);
  }
  doc.text(`Chair:  ${m.chairpersonId?.fullName || '—'}${m.chairpersonId?.memberId ? ` (${m.chairpersonId.memberId})` : ''}`);
  if (m.body) doc.text(`Body:   ${m.body}`);
  if (m.supervisorAttended) doc.text(`Supervisor: attended`);
  doc.moveDown(0.6);

  // ─── Description / agenda / notes
  if (m.description) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor).text('Description');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a').text(m.description, { align: 'justify' });
    doc.moveDown(0.6);
  }
  if (m.agenda) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor).text('Agenda');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a').text(m.agenda, { align: 'justify' });
    doc.moveDown(0.6);
  }
  if (m.activityNotes) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor).text('Activity Notes');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a').text(m.activityNotes, { align: 'justify' });
    doc.moveDown(0.6);
  }
  if (m.upcomingStrategy) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor).text('Upcoming Strategy');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a').text(m.upcomingStrategy, { align: 'justify' });
    doc.moveDown(0.6);
  }

  // ─── Attendance roster
  const att = m.attendance || [];
  if (att.length > 0) {
    const present = att.filter((a) => a.status === 'PRESENT').length;
    const late = att.filter((a) => a.status === 'LATE').length;
    const absent = att.filter((a) => a.status === 'ABSENT').length;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor)
      .text(`Attendance (${present} present · ${late} late · ${absent} absent · ${att.length} on roster)`);
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
    att.forEach((a) => {
      const name = a.memberId?.fullName || '(unknown)';
      const code = a.memberId?.memberId ? ` · ${a.memberId.memberId}` : '';
      doc.text(`  • [${a.status || '—'}] ${name}${code}`);
    });
    doc.moveDown(0.6);
  }

  // ─── Guest attendees (non-members)
  if (m.guestAttendees && m.guestAttendees.length > 0) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor).text(`Guest Attendees (${m.guestAttendees.length})`);
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
    m.guestAttendees.forEach((g) => doc.text(`  • ${g.name}${g.cnic ? ` (${g.cnic})` : ''}`));
    doc.moveDown(0.6);
  }

  // ─── Study-circle contributions
  if (m.studyContributions && m.studyContributions.length > 0) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor).text('Study Contributions');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
    m.studyContributions.forEach((s) => {
      doc.text(`  • ${s.topic || '(topic)'}: ${s.summary || ''}`);
    });
    doc.moveDown(0.6);
  }

  // ─── Photos — embed each one with metadata caption
  const photos = (m.photos || []).filter((p) => uploadDiskPath(p.url));
  if (photos.length > 0) {
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(15).fillColor(sectionColor).text(`Photographs (${photos.length})`, { align: 'center' });
    doc.moveDown(0.4);
    doc.strokeColor(sectionColor).lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.6);

    photos.forEach((p, i) => {
      const diskPath = uploadDiskPath(p.url);
      if (!diskPath) return;
      // Each photo gets a roughly half-page block: image + caption.
      // Add a new page if remaining space is too small.
      const remaining = doc.page.height - doc.y - doc.page.margins.bottom;
      const blockHeight = 320;
      if (remaining < blockHeight) doc.addPage();

      const startY = doc.y;
      try {
        // Centre image, max 480 wide, max 280 tall — preserves aspect.
        doc.image(diskPath, { fit: [480, 280], align: 'center', valign: 'top' });
      } catch (err) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#dc2626')
          .text(`[Could not embed photo ${i + 1}: ${err.message}]`);
      }
      // Caption block
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(sectionColor).text(`Photo ${i + 1} of ${photos.length}`);
      doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
      doc.text(`Captured: ${p.capturedAt ? new Date(p.capturedAt).toLocaleString() : 'not recorded'}`);
      if (p.gps?.lat != null && p.gps?.lng != null) {
        doc.text(`GPS:      ${Number(p.gps.lat).toFixed(6)}, ${Number(p.gps.lng).toFixed(6)}`);
      } else {
        doc.text(`GPS:      not recorded`);
      }
      if (p.sha256) {
        doc.fontSize(8).fillColor('#555c66').text(`SHA-256:  ${p.sha256.slice(0, 32)}…`);
      }
      doc.moveDown(0.8);
    });
  }

  // ─── Footer (branded — falls back to settings.reportBranding /
  //              identity.copyrightText, with timestamp as last resort)
  applyBrandedFooter(doc, branding);

  doc.end();
});

// PR U7 — exposed so reportTemplateService can reuse the data
// gathering layer without duplication. The existing controller
// actions above keep using the local function reference; the new
// service consumes the same code via this export.
module.exports.gatherUnitData = gatherUnitData;
