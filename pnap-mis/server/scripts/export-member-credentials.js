#!/usr/bin/env node
// Member credential + role sheet. Optionally (re)sets every member's
// password to one known value so the sheet's Password column is real.
//
//   node server/scripts/export-member-credentials.js                    # DRY RUN
//   node server/scripts/export-member-credentials.js --apply            # set passwords + export
//   node server/scripts/export-member-credentials.js --export-only      # export, touch no password
//   node server/scripts/export-member-credentials.js --password "X" --apply
//   node server/scripts/export-member-credentials.js --out "C:/path/sheet.xlsx" --apply
//
// WHY passwords get overwritten rather than read: Member.passwordHash is
// bcrypt, which is one-way. An existing password cannot be recovered for
// a sheet — it can only be replaced with one we know. --apply does that
// for EVERY member, so any password a member set themselves stops
// working. --export-only is the non-destructive path; it prints whether
// a password exists instead of what it is.
//
// The hash is computed ONCE and shared by every member. Per-member salts
// would be the norm, but they cost ~1s each in bcryptjs (≈6 min for this
// register) and protect nothing here: one password shared by everyone,
// printed in a spreadsheet, has no secrecy left to protect. This is a
// demo/staging convenience, not a production credential practice.
//
// The output contains PLAINTEXT LOGIN CREDENTIALS. Keep it out of git
// and off shared drives.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');

const Member = require('../src/models/Member');
const RoleAssignment = require('../src/models/RoleAssignment');
const Role = require('../src/models/Role');
const BasicUnit = require('../src/models/BasicUnit');
const Area = require('../src/models/Area');
const District = require('../src/models/District');
const Province = require('../src/models/Province');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis';
const BRAND = 'FF0A3A6E';
const REPO_ROOT = path.join(__dirname, '..', '..', '..');   // …/PNAP-MIS

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const apply = process.argv.includes('--apply');
const exportOnly = process.argv.includes('--export-only');
const PASSWORD = arg('password', 'Member@123');

(async () => {
  await mongoose.connect(MONGO_URI, { autoIndex: false });

  const [members, provinces, districts, areas, units, roles] = await Promise.all([
    Member.find().select('memberId fullName cnic phone email username status basicUnitId areaId districtId provinceId').lean(),
    Province.find().select('name code').lean(),
    District.find().select('name code').lean(),
    Area.find().select('name code').lean(),
    BasicUnit.find().select('name code').lean(),
    Role.find().select('code label').lean(),
  ]);
  const byId = (arr) => new Map(arr.map((x) => [String(x._id), x]));
  const P = byId(provinces); const D = byId(districts); const A = byId(areas); const U = byId(units);
  const roleLabel = new Map(roles.map((r) => [r.code, r.label]));
  const nameOf = (map, id) => map.get(String(id))?.name || '—';

  // Active cabinet roles only: APPROVED and not ended. A member can hold
  // a role at a level above their own basic unit, so the role's own unit
  // is carried alongside the label rather than assumed.
  const assignments = await RoleAssignment.find({ state: 'APPROVED', endedAt: null })
    .select('memberId roleCode customRoleName unitLevel unitId startedAt').lean();
  const unitLabel = (lvl, id) => {
    if (lvl === 'CENTRAL') return 'Central';
    const m = { BASIC_UNIT: U, AREA: A, DISTRICT: D, PROVINCE: P }[lvl];
    return m ? nameOf(m, id) : lvl;
  };
  const rolesByMember = new Map();
  for (const a of assignments) {
    const entry = {
      label: a.customRoleName || roleLabel.get(a.roleCode) || a.roleCode,
      where: `${a.unitLevel.replace('_', ' ')} · ${unitLabel(a.unitLevel, a.unitId)}`,
      since: a.startedAt,
    };
    const k = String(a.memberId);
    (rolesByMember.get(k) || rolesByMember.set(k, []).get(k)).push(entry);
  }

  const withPw = await mongoose.connection.db.collection('members')
    .countDocuments({ passwordHash: { $exists: true, $ne: null } });

  console.log(`[credentials] ${members.length} member(s); ${withPw} currently have a password; ${rolesByMember.size} hold an active role.`);

  if (!apply && !exportOnly) {
    console.log('\n[credentials] DRY RUN — nothing written, no file produced.');
    console.log(`  --apply        set every member's password to "${PASSWORD}" and write the sheet`);
    console.log('  --export-only  write the sheet without touching any password');
    await mongoose.disconnect();
    process.exit(0);
  }

  // ── password reset ───────────────────────────────────────────────
  if (apply) {
    console.log(`[credentials] hashing "${PASSWORD}" (bcrypt, cost 12)…`);
    const hash = await bcrypt.hash(PASSWORD, 12);
    const r = await Member.updateMany({}, { $set: { passwordHash: hash } });
    console.log(`[credentials] password set on ${r.modifiedCount} member(s) (${r.matchedCount} matched).`);
    // Prove the stored hash actually verifies before publishing a sheet
    // that tells people it will.
    const probe = await Member.findOne().select('+passwordHash cnic fullName');
    const okProbe = await probe.verifyPassword(PASSWORD);
    console.log(`[credentials] verification probe on ${probe.fullName} (${probe.cnic}): ${okProbe ? 'PASS' : 'FAIL'}`);
    if (!okProbe) {
      console.error('[credentials] ABORT — the stored hash does not verify. Sheet not written.');
      await mongoose.disconnect();
      process.exit(2);
    }
  }

  // ── sheet ────────────────────────────────────────────────────────
  members.sort((a, b) => (
    nameOf(P, a.provinceId).localeCompare(nameOf(P, b.provinceId))
    || nameOf(D, a.districtId).localeCompare(nameOf(D, b.districtId))
    || nameOf(A, a.areaId).localeCompare(nameOf(A, b.areaId))
    || nameOf(U, a.basicUnitId).localeCompare(nameOf(U, b.basicUnitId))
    || String(a.memberId).localeCompare(String(b.memberId))
  ));

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PNAP-MIS';
  wb.created = new Date();

  // One literal shared by both sheets. Do NOT derive the second sheet's
  // columns from ws.columns — ExcelJS Column exposes header/key/width as
  // prototype accessors, so spreading a Column copies none of them and
  // the sheet silently ends up with no keys and no rows.
  const COLUMNS = [
    { header: '#', key: 'n', width: 5 },
    { header: 'Member ID', key: 'memberId', width: 26 },
    { header: 'Full Name', key: 'fullName', width: 24 },
    { header: 'Province', key: 'province', width: 14 },
    { header: 'District', key: 'district', width: 18 },
    { header: 'Area', key: 'area', width: 18 },
    { header: 'Basic Unit', key: 'unit', width: 24 },
    { header: 'Assigned Role', key: 'role', width: 26 },
    { header: 'Role Held At', key: 'roleUnit', width: 30 },
    { header: 'CNIC', key: 'cnic', width: 18 },
    { header: 'Mobile Number', key: 'phone', width: 16 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Username', key: 'username', width: 13 },
    { header: 'Password', key: 'password', width: 22 },
    { header: 'Status', key: 'status', width: 11 },
  ];

  const ws = wb.addWorksheet('Members');
  ws.columns = COLUMNS;
  members.forEach((m, i) => {
    const held = rolesByMember.get(String(m._id)) || [];
    ws.addRow({
      n: i + 1,
      memberId: m.memberId || '—',
      fullName: m.fullName,
      province: nameOf(P, m.provinceId),
      district: nameOf(D, m.districtId),
      area: nameOf(A, m.areaId),
      unit: nameOf(U, m.basicUnitId),
      role: held.length ? held.map((h) => h.label).join(', ') : '— no role —',
      roleUnit: held.length ? held.map((h) => h.where).join(', ') : '—',
      cnic: m.cnic,
      phone: m.phone,
      email: m.email || '—',
      username: m.username || '—',
      password: apply ? PASSWORD : '⟨set — not recoverable⟩',
      status: m.status,
    });
  });

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', wrapText: true };
  header.height = 22;
  ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    if (r % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
    // Role-holders are the rows anyone actually looks for — make the
    // role read at a glance instead of hiding in a wall of "no role".
    const roleCell = row.getCell(8);
    if (String(roleCell.value).startsWith('—')) roleCell.font = { color: { argb: 'FF9AA5B1' } };
    else roleCell.font = { bold: true, color: { argb: BRAND } };
  }

  // Officers-only view — the same data narrowed to members who hold a role.
  const off = wb.addWorksheet('Role Holders');
  off.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  members.filter((m) => rolesByMember.has(String(m._id))).forEach((m, i) => {
    const held = rolesByMember.get(String(m._id));
    off.addRow({
      n: i + 1,
      memberId: m.memberId || '—',
      fullName: m.fullName,
      province: nameOf(P, m.provinceId),
      district: nameOf(D, m.districtId),
      area: nameOf(A, m.areaId),
      unit: nameOf(U, m.basicUnitId),
      role: held.map((h) => h.label).join(', '),
      roleUnit: held.map((h) => h.where).join(', '),
      cnic: m.cnic,
      phone: m.phone,
      email: m.email || '—',
      username: m.username || '—',
      password: apply ? PASSWORD : '⟨set — not recoverable⟩',
      status: m.status,
    });
  });
  // Some active assignments point at a memberId with no surviving Member
  // document — the person was deleted while the role stayed APPROVED.
  // They are listed rather than dropped, so this sheet reconciles against
  // "active role assignments" in the database instead of quietly
  // disagreeing with it by the number of orphans.
  const liveIds = new Set(members.map((m) => String(m._id)));
  const orphans = [...rolesByMember.entries()].filter(([id]) => !liveIds.has(id));
  orphans.forEach(([id, held], i) => {
    const row = off.addRow({
      n: off.rowCount,
      memberId: '⟨orphaned assignment⟩',
      fullName: '⟨member record missing⟩',
      province: '—', district: '—', area: '—', unit: '—',
      role: held.map((h) => h.label).join(', '),
      roleUnit: held.map((h) => h.where).join(', '),
      cnic: '—', phone: '—', email: '—', username: '—',
      password: '—',
      status: `NO MEMBER (${id})`,
    });
    row.font = { color: { argb: 'FFB42318' } };
  });
  if (orphans.length) {
    console.log(`[credentials] NOTE: ${orphans.length} active role assignment(s) reference a deleted member — listed at the bottom of Role Holders.`);
  }

  const h2 = off.getRow(1);
  h2.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  h2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  h2.height = 22;
  off.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
  off.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: off.columnCount } };

  // How to sign in, next to the credentials themselves.
  const info = wb.addWorksheet('How To Log In');
  info.columns = [{ key: 'k', width: 26 }, { key: 'v', width: 82 }];
  const line = (k, v, bold = false) => { const r = info.addRow({ k, v }); if (bold) r.font = { bold: true }; return r; };
  line('MEMBER LOGIN', '', true);
  line('Identifier', 'CNIC (as printed in the CNIC column) or the email address — either works.');
  line('Password', apply ? PASSWORD : 'unchanged — this sheet does not carry it');
  line('Requirement', 'Member status must be ACTIVE. A cabinet role is NOT required to log in; role-less members sign in as MEMBER.');
  line('', '');
  line('WHAT THE COLUMNS MEAN', '', true);
  line('Assigned Role', 'Currently active cabinet role (APPROVED, not ended). "— no role —" means the member holds none.');
  line('Role Held At', 'The unit the role is held at, which can sit above the member\'s own basic unit.');
  line('Username', 'Login handle derived from the first name; the CNIC and email are the supported login identifiers.');
  line('', '');
  line('SECURITY', '', true);
  line('Plaintext', 'This file lists working passwords in plain text. Do not commit it to git or share it.');
  line('Shared secret', apply ? `Every member shares the password "${PASSWORD}". Change it before anything resembling real use.` : 'No password was changed by this export.');
  info.getColumn('v').alignment = { wrapText: true, vertical: 'top' };
  info.getColumn('k').font = { bold: false };

  const out = arg('out') ? path.resolve(arg('out'))
    : path.join(REPO_ROOT, `PNAP-MIS-member-credentials-${new Date().toISOString().slice(0, 10)}.xlsx`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await wb.xlsx.writeFile(out);

  console.log(`[credentials] wrote ${out}`);
  console.log(`[credentials] sheets: Members (${members.length}), Role Holders (${rolesByMember.size}), How To Log In`);
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error('[credentials] FAILED:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
