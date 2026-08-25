#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════
 * PNAP-MIS Demo Dataset Excel Generator
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Extracts the full demo dataset from the database into a styled,
 * multi-tab Excel workbook saved to `server/exports/demo-dataset.xlsx`.
 *
 * Tabs generated:
 *   1. README & Quickstart (Instructions & Role-based Login Matrix)
 *   2. User Accounts (Administrative & Member Logins)
 *   3. Organization Structure (Provinces, Districts, Areas, Units)
 *   4. Members Directory (Demographics, Bio & Unit associations)
 *   5. Cabinet & Roles (All leadership assignments)
 *   6. Financial Ledger (Donations, Expenses & Fund Transfers)
 *   7. Events & Activities (Meetings & Outreach Campaigns)
 * ═════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

const User = require('../src/models/User');
const Member = require('../src/models/Member');
const Province = require('../src/models/Province');
const District = require('../src/models/District');
const Area = require('../src/models/Area');
const BasicUnit = require('../src/models/BasicUnit');
const Central = require('../src/models/Central');
const RoleAssignment = require('../src/models/RoleAssignment');
const Meeting = require('../src/models/Meeting');
const Activity = require('../src/models/Activity');
const Donation = require('../src/models/Donation');
const Expense = require('../src/models/Expense');
const FundTransfer = require('../src/models/FundTransfer');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis';

// Visual Style Palette
const BRAND_PRIMARY = '1E40AF'; // Deep Royal Blue
const BRAND_SECONDARY = '0284C7'; // Sky Blue
const BG_HEADER_DARK = '1E293B'; // Dark Slate
const BG_ZEBRA = 'F8FAFC'; // Light surface

function applyHeaderStyle(row, bgColor = BRAND_PRIMARY) {
  row.height = 26;
  row.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: `FF${bgColor}` },
    };
    cell.font = {
      name: 'Segoe UI',
      size: 11,
      bold: true,
      color: { argb: 'FFFFFFFF' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
      bottom: { style: 'medium', color: { argb: 'FF0F172A' } },
      right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    };
  });
}

function applyDataStyle(row, isEven = false) {
  row.height = 20;
  row.eachCell((cell) => {
    cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF0F172A' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    };
    if (isEven) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: `FF${BG_ZEBRA}` },
      };
    }
  });
}

function autoFitColumns(worksheet, minWidth = 12) {
  worksheet.columns.forEach((column) => {
    let maxLen = 0;
    column.eachCell({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    column.width = Math.max(maxLen + 4, minWidth);
  });
}

async function generateExcel() {
  const isDirectRun = require.main === module;
  if (isDirectRun) {
    console.log('[export-excel] Connecting to database...');
    await mongoose.connect(MONGO_URI, { autoIndex: false });
  }

  console.log('[export-excel] Querying collections for demo export...');
  const [
    users,
    members,
    provinces,
    districts,
    areas,
    basicUnits,
    roleAssignments,
    meetings,
    activities,
    donations,
    expenses,
    transfers,
  ] = await Promise.all([
    User.find().lean(),
    Member.find().populate('provinceId districtId areaId basicUnitId').lean(),
    Province.find().lean(),
    District.find().populate('provinceId').lean(),
    Area.find().populate('districtId provinceId').lean(),
    BasicUnit.find().populate('areaId districtId provinceId').lean(),
    RoleAssignment.find().populate('memberId').lean(),
    Meeting.find().populate('provinceId districtId areaId basicUnitId').lean(),
    Activity.find().populate('provinceId districtId areaId').lean(),
    Donation.find().populate('provinceId districtId areaId basicUnitId').lean(),
    Expense.find().populate('provinceId districtId areaId').lean(),
    FundTransfer.find().lean(),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PNAP-MIS Management Information System';
  workbook.created = new Date();

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 1: README & Quickstart
  // ═══════════════════════════════════════════════════════════════════
  const wsGuide = workbook.addWorksheet('README & Quickstart');
  wsGuide.views = [{ showGridLines: true }];

  wsGuide.mergeCells('A1:F1');
  const titleCell = wsGuide.getCell('A1');
  titleCell.value = 'PNAP-MIS: DEMO LOGIN DIRECTORY & SYSTEM GUIDE';
  titleCell.font = { name: 'Segoe UI', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${BRAND_PRIMARY}` } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  wsGuide.getRow(1).height = 36;

  wsGuide.addRow([]);
  wsGuide.addRow(['Welcome to the PNAP-MIS nationwide demo dataset. Below are tested credentials for each administrative tier.']);
  wsGuide.addRow(['All demo passwords are set to "123456" (unless specified otherwise for the root admin).']);
  wsGuide.addRow([]);

  const guideHeader = wsGuide.addRow(['Role / Tier', 'Username', 'Email / Alternate Login', 'Default Password', 'Assigned Scope', 'Primary Capabilities']);
  applyHeaderStyle(guideHeader, BG_HEADER_DARK);

  const demoLogins = [
    ['Super Admin', 'super', 'admin@pnap.local', '123456 (or Admin@12345)', 'Global / Central', 'Complete system god-mode, audit logs, role permissions, settings'],
    ['Central Admin', 'central.admin', 'central.admin@pnap.local', '123456', 'National Central', 'National leadership, central cabinet & provincial structuring'],
    ['Punjab Province Admin', 'pb.admin', 'pb.admin@pnap.local', '123456', 'Punjab Province (PB)', 'Provincial oversight, district creation, province cabinet'],
    ['Sindh Province Admin', 'sd.admin', 'sd.admin@pnap.local', '123456', 'Sindh Province (SD)', 'Provincial oversight, district creation, province cabinet'],
    ['KPK Province Admin', 'kp.admin', 'kp.admin@pnap.local', '123456', 'Khyber Pakhtunkhwa (KP)', 'Provincial oversight, district creation, province cabinet'],
    ['Balochistan Province Admin', 'bl.admin', 'bl.admin@pnap.local', '123456', 'Balochistan (BL)', 'Provincial oversight, district creation, province cabinet'],
    ['Islamabad Admin', 'ict.admin', 'ict.admin@pnap.local', '123456', 'Islamabad Capital (ICT)', 'Federal territory oversight & district governance'],
    ['Lahore District Admin', 'lhr.admin', 'lhr.admin@pnap.local', '123456', 'Lahore District (LHR)', 'District management, area admins administration'],
    ['Karachi East Admin', 'khe.admin', 'khe.admin@pnap.local', '123456', 'Karachi East District', 'District management, area admins administration'],
    ['Peshawar District Admin', 'psh.admin', 'psh.admin@pnap.local', '123456', 'Peshawar District (PSH)', 'District management, area admins administration'],
    ['Quetta District Admin', 'qta.admin', 'qta.admin@pnap.local', '123456', 'Quetta District (QTA)', 'District management, area admins administration'],
    ['Gulberg Area Admin', 'gulberg.admin', 'gulberg.admin@pnap.local', '123456', 'Gulberg Area (Lahore)', 'Member registration approvals, basic units, local cabinet'],
    ['Gulshan Area Admin', 'gulshan.admin', 'gulshan.admin@pnap.local', '123456', 'Gulshan Area (Karachi)', 'Member registration approvals, basic units, local cabinet'],
    ['Member Portal Login', 'member1001', 'CNIC: 35201-0001001-1', '123456', 'Assigned Basic Unit', 'View profile, attendance, activities, unit dashboard'],
  ];

  demoLogins.forEach((row, idx) => {
    const r = wsGuide.addRow(row);
    applyDataStyle(r, idx % 2 === 1);
  });

  autoFitColumns(wsGuide, 14);

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 2: User Accounts
  // ═══════════════════════════════════════════════════════════════════
  const wsUsers = workbook.addWorksheet('User Accounts');
  const uHeader = wsUsers.addRow(['Username', 'Full Name', 'Email', 'CNIC', 'Roles', 'Active', 'Created At']);
  applyHeaderStyle(uHeader);

  users.forEach((u, idx) => {
    const r = wsUsers.addRow([
      u.username || '—',
      u.fullName,
      u.email || '—',
      u.cnic || '—',
      (u.roles || []).join(', '),
      u.isActive ? 'YES' : 'NO',
      u.createdAt ? new Date(u.createdAt).toISOString().split('T')[0] : '—',
    ]);
    applyDataStyle(r, idx % 2 === 1);
  });
  autoFitColumns(wsUsers, 14);

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 3: Organization Structure
  // ═══════════════════════════════════════════════════════════════════
  const wsOrg = workbook.addWorksheet('Organization Hierarchy');
  const orgHeader = wsOrg.addRow(['Province Code', 'Province Name', 'District Code', 'District Name', 'Area Name', 'Basic Unit Name']);
  applyHeaderStyle(orgHeader);

  basicUnits.forEach((bu, idx) => {
    const r = wsOrg.addRow([
      bu.provinceId?.code || '—',
      bu.provinceId?.name || '—',
      bu.districtId?.code || '—',
      bu.districtId?.name || '—',
      bu.areaId?.name || '—',
      bu.name,
    ]);
    applyDataStyle(r, idx % 2 === 1);
  });
  autoFitColumns(wsOrg, 14);

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 4: Members Directory
  // ═══════════════════════════════════════════════════════════════════
  const wsMembers = workbook.addWorksheet('Members Directory');
  const mHeader = wsMembers.addRow([
    'Member ID', 'Full Name', 'Father / Husband Name', 'CNIC', 'Phone', 'Email',
    'Username', 'Gender', 'Blood Group', 'Education', 'Occupation',
    'Province', 'District', 'Area', 'Basic Unit', 'Status', 'Date Joined'
  ]);
  applyHeaderStyle(mHeader);

  members.forEach((m, idx) => {
    const r = wsMembers.addRow([
      m.memberId || '—',
      m.fullName,
      m.fatherOrHusbandName,
      m.cnic,
      m.phone,
      m.email || '—',
      m.username || '—',
      m.gender,
      m.bloodGroup || '—',
      m.education || '—',
      m.occupation || '—',
      m.provinceId?.name || '—',
      m.districtId?.name || '—',
      m.areaId?.name || '—',
      m.basicUnitId?.name || '—',
      m.status,
      m.dateJoined ? new Date(m.dateJoined).toISOString().split('T')[0] : '—',
    ]);
    applyDataStyle(r, idx % 2 === 1);
  });
  autoFitColumns(wsMembers, 14);

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 5: Cabinet & Roles
  // ═══════════════════════════════════════════════════════════════════
  const wsRoles = workbook.addWorksheet('Cabinet & Roles');
  const rHeader = wsRoles.addRow(['Unit Level', 'Role Code', 'Member Name', 'Member ID', 'CNIC', 'Phone', 'Status', 'Term Started']);
  applyHeaderStyle(rHeader);

  roleAssignments.forEach((ra, idx) => {
    const r = wsRoles.addRow([
      ra.unitLevel,
      ra.roleCode,
      ra.memberId?.fullName || '—',
      ra.memberId?.memberId || '—',
      ra.memberId?.cnic || '—',
      ra.memberId?.phone || '—',
      ra.state,
      ra.startedAt ? new Date(ra.startedAt).toISOString().split('T')[0] : '—',
    ]);
    applyDataStyle(r, idx % 2 === 1);
  });
  autoFitColumns(wsRoles, 14);

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 6: Financial Ledger
  // ═══════════════════════════════════════════════════════════════════
  const wsFin = workbook.addWorksheet('Financial Ledger');
  const finHeader = wsFin.addRow([
    'Type', 'Receipt / Ref #', 'Unit Level', 'Unit Location', 'Category / Purpose',
    'Amount (PKR)', 'Payment Mode', 'Date', 'Status'
  ]);
  applyHeaderStyle(finHeader);

  let finRowIdx = 0;
  donations.forEach((d) => {
    const r = wsFin.addRow([
      'DONATION',
      d.receiptNo,
      d.unitLevel,
      d.basicUnitId?.name || d.areaId?.name || d.provinceId?.name || 'Central',
      `${d.donorType} (${d.donorName || 'Anonymous'})`,
      d.amount,
      d.paymentMode,
      d.receivedAt ? new Date(d.receivedAt).toISOString().split('T')[0] : '—',
      'RECEIVED',
    ]);
    applyDataStyle(r, finRowIdx++ % 2 === 1);
  });

  expenses.forEach((e) => {
    const r = wsFin.addRow([
      'EXPENSE',
      `EXP-${String(e._id).slice(-6)}`,
      e.unitLevel,
      e.areaId?.name || e.districtId?.name || e.provinceId?.name || 'Central',
      `${e.category}: ${e.description.slice(0, 35)}...`,
      e.amount,
      e.paymentMode,
      e.incurredAt ? new Date(e.incurredAt).toISOString().split('T')[0] : '—',
      e.state,
    ]);
    applyDataStyle(r, finRowIdx++ % 2 === 1);
  });

  transfers.forEach((t) => {
    const r = wsFin.addRow([
      'FUND TRANSFER',
      t.reference || `TRF-${String(t._id).slice(-6)}`,
      `${t.sourceLevel} → ${t.destinationLevel}`,
      `${t.sourceName} to ${t.destinationName}`,
      t.note || 'Inter-tier transfer',
      t.amount,
      t.mode,
      t.initiatedAt ? new Date(t.initiatedAt).toISOString().split('T')[0] : '—',
      t.state,
    ]);
    applyDataStyle(r, finRowIdx++ % 2 === 1);
  });
  autoFitColumns(wsFin, 14);

  // ═══════════════════════════════════════════════════════════════════
  // Sheet 7: Events & Activities
  // ═══════════════════════════════════════════════════════════════════
  const wsEvents = workbook.addWorksheet('Events & Activities');
  const evHeader = wsEvents.addRow([
    'Type', 'Category / Code', 'Title', 'Unit Level', 'Venue',
    'Date', 'Status', 'Attendance / Participants'
  ]);
  applyHeaderStyle(evHeader);

  let evRowIdx = 0;
  meetings.forEach((m) => {
    const r = wsEvents.addRow([
      'MEETING',
      m.type,
      m.title,
      m.unitLevel,
      m.venue || '—',
      m.startAt ? new Date(m.startAt).toISOString().replace('T', ' ').slice(0, 16) : '—',
      m.state,
      (m.attendance || []).length > 0 ? `${(m.attendance || []).length} members` : '—',
    ]);
    applyDataStyle(r, evRowIdx++ % 2 === 1);
  });

  activities.forEach((a) => {
    const r = wsEvents.addRow([
      'ACTIVITY',
      a.type,
      a.title,
      a.unitLevel,
      a.venue || '—',
      a.startAt ? new Date(a.startAt).toISOString().replace('T', ' ').slice(0, 16) : '—',
      a.state,
      a.externalAttendanceEstimate ? `~${a.externalAttendanceEstimate} participants` : `${(a.participants || []).length} members`,
    ]);
    applyDataStyle(r, evRowIdx++ % 2 === 1);
  });
  autoFitColumns(wsEvents, 14);

  // ── Save Workbook to exports directory ────────────────────────────
  const exportDir = path.resolve(__dirname, '../exports');
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

  const exportPath = path.join(exportDir, 'demo-dataset.xlsx');
  await workbook.xlsx.writeFile(exportPath);
  console.log(`✓ Excel demo dataset generated successfully at:\n  -> ${exportPath}`);

  if (isDirectRun) {
    await mongoose.disconnect();
  }
  return exportPath;
}

if (require.main === module) {
  generateExcel().catch((err) => {
    console.error('[export-excel] Failed to generate Excel workbook:', err);
    process.exit(1);
  });
}

module.exports = { generateExcel };
