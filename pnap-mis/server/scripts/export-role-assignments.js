#!/usr/bin/env node
// Role assignment register → XLSX. Read-only; writes nothing to the DB.
//
//   node server/scripts/export-role-assignments.js                    # last 24 hours
//   node server/scripts/export-role-assignments.js --since 2026-08-13
//   node server/scripts/export-role-assignments.js --since 2026-08-13T18:00 --until 2026-08-14T09:00
//   node server/scripts/export-role-assignments.js --all              # the whole register
//   node server/scripts/export-role-assignments.js --level AREA --state APPROVED
//   node server/scripts/export-role-assignments.js --out "C:/tmp/roles.xlsx"
//
// The window filters on createdAt — when the assignment was RECORDED,
// which is what "the roles I assigned last night" means. A role proposed
// last night and approved this morning is therefore in the file, with its
// approval columns filled in. Filter on the decision instead with
// --on decidedAt.
//
// Dates are written as real Excel date cells in the server's local
// timezone (stamped on the Summary sheet) so sorting and filtering work.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

const RoleAssignment = require('../src/models/RoleAssignment');
// Member and User are required for their side effect only — populate()
// resolves refs by model name, so both schemas must be registered.
require('../src/models/Member');
require('../src/models/User');
const Role = require('../src/models/Role');
const BasicUnit = require('../src/models/BasicUnit');
const Area = require('../src/models/Area');
const District = require('../src/models/District');
const Province = require('../src/models/Province');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis';
const BRAND = 'FF0A3A6E';           // same navy the in-app exports use
const DATE_FMT = 'yyyy-mm-dd hh:mm';
const UNIT_MODELS = { BASIC_UNIT: BasicUnit, AREA: Area, DISTRICT: District, PROVINCE: Province };

// ── args ───────────────────────────────────────────────────────────
function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}
const flag = (name) => process.argv.includes(`--${name}`);

// A bare date ("2026-08-13") is taken as LOCAL midnight, not UTC — the
// user asking for "since the 13th" means their own calendar day.
function parseWhen(s, label) {
  if (!s) return undefined;
  const bare = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = new Date(bare ? `${s}T00:00:00` : s);
  if (Number.isNaN(d.getTime())) {
    console.error(`[export] --${label}: "${s}" is not a date I can read. Use 2026-08-13 or 2026-08-13T18:00.`);
    process.exit(1);
  }
  return d;
}

const onField = arg('on') || 'createdAt';
if (!['createdAt', 'decidedAt', 'startedAt', 'initiatedAt'].includes(onField)) {
  console.error('[export] --on must be one of: createdAt, initiatedAt, decidedAt, startedAt');
  process.exit(1);
}
const all = flag('all');
const until = parseWhen(arg('until'), 'until');
// Default window: the last 24 hours, which covers "last night" from any
// hour of the following day.
const since = all ? undefined : (parseWhen(arg('since'), 'since') || new Date(Date.now() - 24 * 3600 * 1000));
const level = arg('level')?.toUpperCase();
const state = arg('state')?.toUpperCase();

const fmtStamp = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  + `_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;

// ── sheet styling — mirrors _styleSheet in exportController ────────
function styleSheet(ws, { freezeColumns = 0 } = {}) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  header.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  header.height = 22;
  ws.views = [{ state: 'frozen', xSplit: freezeColumns, ySplit: 1 }];
  if (ws.columnCount > 0 && ws.rowCount > 1) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  }
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    row.alignment = { vertical: 'top', wrapText: true };
    if (r % 2 === 0) row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
  }
  ws.columns.forEach((c) => { if (c.numFmt === undefined && c.key?.endsWith('At')) c.numFmt = DATE_FMT; });
}

(async () => {
  await mongoose.connect(MONGO_URI, { autoIndex: false });

  const q = {};
  if (since || until) {
    q[onField] = {};
    if (since) q[onField].$gte = since;
    if (until) q[onField].$lte = until;
  }
  if (level) q.unitLevel = level;
  if (state) q.state = state;

  const rows = await RoleAssignment.find(q)
    .sort({ [onField]: 1 })
    .populate('memberId', 'fullName memberId cnic phone status')
    .populate('initiatedBy', 'fullName username email')
    .populate('decidedBy', 'fullName username email')
    .populate('approvalChain.decidedBy', 'fullName username email')
    .lean();

  const window = all ? 'entire register'
    : `${since ? since.toLocaleString() : 'beginning'} → ${until ? until.toLocaleString() : 'now'} (on ${onField})`;
  console.log(`[export] ${rows.length} role assignment(s) — ${window}`);

  if (rows.length === 0) {
    console.log('[export] Nothing matched, so no file was written.');
    console.log('[export] Widen the window (--since 2026-08-01) or dump everything with --all.');
    await mongoose.disconnect();
    process.exit(2);
  }

  // ── resolve names in bulk: units, then role labels ───────────────
  const unitNames = new Map();                       // `${level}:${id}` → name
  const byLevel = rows.reduce((m, r) => {
    if (r.unitLevel !== 'CENTRAL') (m[r.unitLevel] ||= new Set()).add(String(r.unitId));
    return m;
  }, {});
  for (const [lvl, ids] of Object.entries(byLevel)) {
    const M = UNIT_MODELS[lvl];
    if (!M) continue;
    const docs = await M.find({ _id: { $in: [...ids] } }).select('name code').lean();
    docs.forEach((d) => unitNames.set(`${lvl}:${d._id}`, d.code ? `${d.name} (${d.code})` : d.name));
  }
  const unitOf = (r) => (r.unitLevel === 'CENTRAL' ? 'Central' : unitNames.get(`${r.unitLevel}:${r.unitId}`) || `⟨missing unit ${r.unitId}⟩`);

  const roleLabels = new Map(
    (await Role.find({ code: { $in: [...new Set(rows.map((r) => r.roleCode))] } }).select('code label').lean())
      .map((d) => [d.code, d.label])
  );
  // OTHER is the escape hatch — the real title lives in customRoleName.
  const roleOf = (r) => r.customRoleName || roleLabels.get(r.roleCode) || r.roleCode;
  const who = (u) => (u ? `${u.fullName}${u.username ? ` (${u.username})` : ''}` : '—');

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PNAP-MIS';
  wb.created = new Date();

  // ── Sheet 1: the register ────────────────────────────────────────
  const ws = wb.addWorksheet('Role Assignments');
  ws.columns = [
    { header: '#', key: 'n', width: 5 },
    { header: 'Recorded (createdAt)', key: 'createdAt', width: 18 },
    { header: 'Unit Level', key: 'unitLevel', width: 13 },
    { header: 'Unit', key: 'unit', width: 28 },
    { header: 'Member', key: 'member', width: 24 },
    { header: 'Member ID', key: 'memberCode', width: 16 },
    { header: 'CNIC', key: 'cnic', width: 17 },
    { header: 'Phone', key: 'phone', width: 15 },
    { header: 'Role', key: 'role', width: 24 },
    { header: 'Role Code', key: 'roleCode', width: 20 },
    { header: 'State', key: 'state', width: 13 },
    { header: 'Term Start', key: 'startedAt', width: 18 },
    { header: 'Term End', key: 'endedAt', width: 18 },
    { header: 'End Reason', key: 'endReason', width: 14 },
    { header: 'Proposed By', key: 'initiatedBy', width: 24 },
    { header: 'Proposed At', key: 'initiatedAt', width: 18 },
    { header: 'Decided By', key: 'decidedBy', width: 24 },
    { header: 'Decided At', key: 'decidedAt', width: 18 },
    { header: 'Decision Note', key: 'decisionNote', width: 34 },
    { header: 'Assignment ID', key: 'id', width: 26 },
  ];
  rows.forEach((r, i) => ws.addRow({
    n: i + 1,
    createdAt: r.createdAt,
    unitLevel: r.unitLevel.replace('_', ' '),
    unit: unitOf(r),
    member: r.memberId?.fullName || '⟨deleted member⟩',
    memberCode: r.memberId?.memberId || '—',
    cnic: r.memberId?.cnic || '—',
    phone: r.memberId?.phone || '—',
    role: roleOf(r),
    roleCode: r.roleCode,
    state: r.state,
    startedAt: r.startedAt,
    endedAt: r.endedAt,
    endReason: r.endReason || '—',
    initiatedBy: who(r.initiatedBy),
    initiatedAt: r.initiatedAt,
    decidedBy: who(r.decidedBy),
    decidedAt: r.decidedAt,
    decisionNote: r.decisionNote || '—',
    id: String(r._id),
  }));
  styleSheet(ws, { freezeColumns: 1 });

  // ── Sheet 2: approval trail — only when a chain was actually used ─
  const chained = rows.filter((r) => (r.approvalChain || []).length > 0);
  if (chained.length) {
    const tr = wb.addWorksheet('Approval Trail');
    tr.columns = [
      { header: 'Unit', key: 'unit', width: 28 },
      { header: 'Member', key: 'member', width: 24 },
      { header: 'Role', key: 'role', width: 24 },
      { header: 'Stage', key: 'stage', width: 24 },
      { header: 'Decision', key: 'decision', width: 13 },
      { header: 'Decided By', key: 'decidedBy', width: 24 },
      { header: 'Decided At', key: 'decidedAt', width: 18 },
      { header: 'Note', key: 'note', width: 34 },
    ];
    chained.forEach((r) => r.approvalChain.forEach((s) => tr.addRow({
      unit: unitOf(r),
      member: r.memberId?.fullName || '⟨deleted member⟩',
      role: roleOf(r),
      stage: s.stageName || s.stageCode || '—',
      decision: s.decision || 'PENDING',
      decidedBy: who(s.decidedBy),
      decidedAt: s.decidedAt,
      note: s.note || '—',
    })));
    styleSheet(tr);
  }

  // ── Sheet 3: summary ─────────────────────────────────────────────
  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ header: 'Metric', key: 'k', width: 34 }, { header: 'Value', key: 'v', width: 46 }];
  const tally = (fn) => {
    const m = new Map();
    rows.forEach((r) => { const k = fn(r); m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  sum.addRow({ k: 'Report', v: 'Role Assignment Register' });
  sum.addRow({ k: 'Generated', v: new Date() }).getCell(2).numFmt = DATE_FMT;
  sum.addRow({ k: 'Timezone', v: `${Intl.DateTimeFormat().resolvedOptions().timeZone} (all times local)` });
  sum.addRow({ k: 'Window', v: window });
  sum.addRow({ k: 'Filters', v: [level && `level=${level}`, state && `state=${state}`].filter(Boolean).join(', ') || 'none' });
  sum.addRow({ k: 'Total assignments', v: rows.length });
  sum.addRow({ k: 'Distinct members', v: new Set(rows.map((r) => String(r.memberId?._id))).size });
  sum.addRow({ k: '', v: '' });
  sum.addRow({ k: 'BY STATE', v: '' }).getCell(1).font = { bold: true };
  tally((r) => r.state).forEach(([k, v]) => sum.addRow({ k: `  ${k}`, v }));
  sum.addRow({ k: '', v: '' });
  sum.addRow({ k: 'BY UNIT', v: '' }).getCell(1).font = { bold: true };
  tally((r) => `${r.unitLevel.replace('_', ' ')} · ${unitOf(r)}`).forEach(([k, v]) => sum.addRow({ k: `  ${k}`, v }));
  sum.addRow({ k: '', v: '' });
  sum.addRow({ k: 'BY ROLE', v: '' }).getCell(1).font = { bold: true };
  tally(roleOf).forEach(([k, v]) => sum.addRow({ k: `  ${k}`, v }));
  sum.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sum.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
  sum.views = [{ state: 'frozen', ySplit: 1 }];

  // ── write ────────────────────────────────────────────────────────
  const out = arg('out')
    ? path.resolve(arg('out'))
    : path.join(__dirname, '..', 'exports', `role-assignments-${fmtStamp(new Date())}.xlsx`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await wb.xlsx.writeFile(out);

  console.log(`[export] wrote ${out}`);
  console.log(`[export] sheets: Role Assignments (${rows.length} rows)`
    + `${chained.length ? `, Approval Trail (${chained.reduce((n, r) => n + r.approvalChain.length, 0)} rows)` : ''}, Summary`);
  await mongoose.disconnect();
})().catch(async (err) => {
  console.error('[export] FAILED:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
