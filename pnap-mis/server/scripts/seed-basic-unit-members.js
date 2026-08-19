#!/usr/bin/env node
// Bulk-add members to every Basic Unit, and export the roster of what
// was created.
//
//   node server/scripts/seed-basic-unit-members.js                # DRY RUN
//   node server/scripts/seed-basic-unit-members.js --apply        # write
//   node server/scripts/seed-basic-unit-members.js --per-unit 3 --apply
//   node server/scripts/seed-basic-unit-members.js --province KP-1 --apply
//
// Dry run by default — same contract as dedupe-identity.js. Nothing is
// written, and the planned roster is printed so the numbering and name
// spread can be checked before committing.
//
// Identity fields continue the existing generated series rather than
// starting a new one. The 144 members already in the database run
// member1@gmail.com … member144@gmail.com with CNIC 35201-3000001-1 …
// 35201-3000144-1 and phone 0300-3000001 …, so this script finds the
// high-water mark and carries on from there. That keeps every generated
// member's four unique keys (CNIC, email, username, phone) collision-free
// by construction instead of by retry.
//
// Members are created through the Mongoose model, not insertMany, so the
// schema's validators and setters run and memberId comes from the same
// Counter-backed generator the registration flow uses. No role is
// assigned — this adds MEMBERSHIP only; cabinet roles stay a deliberate
// act in the Cabinet UI.

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

const Member = require('../src/models/Member');
const BasicUnit = require('../src/models/BasicUnit');
const Area = require('../src/models/Area');
const District = require('../src/models/District');
const Province = require('../src/models/Province');
const { generateMemberId } = require('../src/utils/memberId');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis';
const BRAND = 'FF0A3A6E';
const DATE_FMT = 'yyyy-mm-dd hh:mm';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}
const apply = process.argv.includes('--apply');
const perUnit = Number(arg('per-unit', 5));
const provinceFilter = arg('province');   // comma-separated province codes

if (!Number.isInteger(perUnit) || perUnit < 1 || perUnit > 50) {
  console.error('[seed-members] --per-unit must be an integer between 1 and 50.');
  process.exit(1);
}

// ── name pools ─────────────────────────────────────────────────────
// Matches the register already in the database: Pakistani given name +
// family name, with fatherOrHusbandName sharing the family name.
const MALE = ['Usman', 'Fahad', 'Danish', 'Ahmed', 'Junaid', 'Bilal', 'Hamza', 'Kamran', 'Shahid', 'Zubair',
  'Adnan', 'Imran', 'Naveed', 'Sajid', 'Waqar', 'Yasir', 'Faisal', 'Rizwan', 'Tahir', 'Asad',
  'Noman', 'Salman', 'Owais', 'Kashif', 'Arslan', 'Saeed', 'Waleed', 'Zeeshan', 'Haris', 'Talha'];
const FEMALE = ['Nimra', 'Komal', 'Nadia', 'Warda', 'Ayesha', 'Sana', 'Hina', 'Maryam', 'Rabia', 'Sadia',
  'Zainab', 'Fatima', 'Amna', 'Iqra', 'Saba', 'Nazia', 'Mehwish', 'Uzma', 'Sumaira', 'Kiran',
  'Bushra', 'Farah', 'Shazia', 'Anila', 'Naila', 'Tehmina', 'Rukhsana', 'Samina', 'Aqsa', 'Javeria'];
const ELDER = ['Bilal', 'Ehsan', 'Yasir', 'Tariq', 'Abdul', 'Ghulam', 'Nasir', 'Manzoor', 'Iftikhar', 'Riaz',
  'Sher', 'Habib', 'Rehmat', 'Zafar', 'Aslam', 'Mushtaq', 'Bashir', 'Sarfraz', 'Ijaz', 'Anwar'];
const SURNAME = ['Rehman', 'Iqbal', 'Chaudhry', 'Baloch', 'Yousafzai', 'Durrani', 'Achakzai', 'Khan', 'Kakar', 'Raza',
  'Afridi', 'Mengal', 'Bugti', 'Marri', 'Tareen', 'Shinwari', 'Wazir', 'Mohmand', 'Bangash', 'Orakzai',
  'Jamali', 'Rind', 'Lehri', 'Panezai', 'Sherani', 'Khattak', 'Bhittani', 'Zadran', 'Nasar', 'Barech'];
const EDUCATION = ['Matric', 'Intermediate', 'BA', 'BSc', 'B.Com', 'BS Computer Science', 'MA', 'MSc', 'MBA', 'LLB'];
const OCCUPATION = ['Farmer', 'Shopkeeper', 'Teacher', 'Driver', 'Labourer', 'Student', 'Clerk', 'Tailor',
  'Mechanic', 'Electrician', 'Nurse', 'Social Worker', 'Trader', 'Contractor'];
const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Deterministic PRNG (mulberry32). Seeded per member index so a dry run
// and the subsequent --apply produce byte-identical people, and a re-run
// after a failure resumes with the same names.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

// ── main ───────────────────────────────────────────────────────────
(async () => {
  await mongoose.connect(MONGO_URI, { autoIndex: false });
  if (!apply) console.log('[seed-members] DRY RUN — no writes. Re-run with --apply to commit.\n');

  const provinces = await Province.find().select('name code').lean();
  const wanted = provinceFilter
    ? provinces.filter((p) => provinceFilter.split(',').map((s) => s.trim().toUpperCase()).includes(String(p.code).toUpperCase()))
    : provinces;
  if (wanted.length === 0) {
    console.error(`[seed-members] no province matched --province ${provinceFilter}. Known codes: ${provinces.map((p) => p.code).join(', ')}`);
    await mongoose.disconnect();
    process.exit(1);
  }
  const provById = new Map(provinces.map((p) => [String(p._id), p]));
  const areaById = new Map((await Area.find().select('name code').lean()).map((a) => [String(a._id), a]));
  const distById = new Map((await District.find().select('name code').lean()).map((d) => [String(d._id), d]));

  const units = await BasicUnit.find({ provinceId: { $in: wanted.map((p) => p._id) } })
    .select('name code areaId districtId provinceId').lean();

  // Stable ordering: province → district → area → unit name. The
  // generated sequence numbers follow this, so the roster reads in
  // organizational order rather than insertion order.
  const label = (m, id) => m.get(String(id))?.name || '⟨unknown⟩';
  units.sort((a, b) => (
    label(provById, a.provinceId).localeCompare(label(provById, b.provinceId))
    || label(distById, a.districtId).localeCompare(label(distById, b.districtId))
    || label(areaById, a.areaId).localeCompare(label(areaById, b.areaId))
    || a.name.localeCompare(b.name)
  ));

  if (units.length === 0) {
    console.error('[seed-members] no basic units found for the selected province(s).');
    await mongoose.disconnect();
    process.exit(1);
  }

  // ── high-water mark of the existing generated series ─────────────
  const existing = await Member.find().select('cnic email username').lean();
  const highest = existing.reduce((max, m) => {
    const fromCnic = Number(String(m.cnic || '').split('-')[1]) - 3000000;
    const fromEmail = Number((String(m.email || '').match(/^member(\d+)@/) || [])[1]);
    const fromUser = Number((String(m.username || '').match(/^member(\d+)$/) || [])[1]);
    return Math.max(max, fromCnic || 0, fromEmail || 0, fromUser || 0);
  }, 0);
  const startAt = highest + 1;
  const total = units.length * perUnit;

  console.log(`[seed-members] province(s): ${wanted.map((p) => `${p.name} (${p.code})`).join(', ')}`);
  console.log(`[seed-members] ${units.length} basic unit(s) × ${perUnit} = ${total} new member(s)`);
  console.log(`[seed-members] existing members: ${existing.length}; series continues at member${startAt} / CNIC 35201-${3000000 + startAt}-1\n`);

  // ── build the roster ─────────────────────────────────────────────
  const planned = [];
  let n = startAt;
  for (const bu of units) {
    const prov = provById.get(String(bu.provinceId));
    const dist = distById.get(String(bu.districtId));
    const area = areaById.get(String(bu.areaId));
    for (let i = 0; i < perUnit; i += 1, n += 1) {
      const r = rng(n * 2654435761);
      const female = r() < 0.4;
      const surname = pick(r, SURNAME);
      const seq = String(3000000 + n);
      planned.push({
        seq: n,
        fullName: `${pick(r, female ? FEMALE : MALE)} ${surname}`,
        fatherOrHusbandName: `${pick(r, ELDER)} ${surname}`,
        cnic: `35201-${seq}-1`,
        phone: `0300-${seq}`,
        email: `member${n}@gmail.com`,
        username: `member${n}`,
        gender: female ? 'FEMALE' : 'MALE',
        // Same shape as the existing roster: unit, area, district, province.
        address: `${bu.name}, ${area?.name || '—'}, ${dist?.name || '—'}, ${prov?.name || '—'}`,
        bloodGroup: pick(r, BLOOD),
        education: pick(r, EDUCATION),
        occupation: pick(r, OCCUPATION),
        basicUnitId: bu._id,
        areaId: bu.areaId,
        districtId: bu.districtId,
        provinceId: bu.provinceId,
        status: 'ACTIVE',
        submittedVia: 'ADMIN',
        dateJoined: new Date(),
        // Report-only context, stripped before save.
        _unit: bu.code ? `${bu.name} (${bu.code})` : bu.name,
        _area: area?.name || '—',
        _district: dist?.name || '—',
        _province: prov?.name || '—',
      });
    }
  }

  // ── pre-flight: every unique key must be free ────────────────────
  const clash = await Member.find({
    $or: [
      { cnic: { $in: planned.map((p) => p.cnic) } },
      { email: { $in: planned.map((p) => p.email) } },
      { username: { $in: planned.map((p) => p.username) } },
      { phone: { $in: planned.map((p) => p.phone) } },
    ],
  }).select('fullName cnic email username phone').lean();
  if (clash.length) {
    console.error(`[seed-members] ABORT — ${clash.length} planned identity key(s) are already taken:`);
    clash.slice(0, 10).forEach((c) => console.error(`  ${c.fullName}  ${c.cnic}  ${c.email}  ${c.phone}`));
    console.error('  The generated series overlaps existing data. Nothing was written.');
    await mongoose.disconnect();
    process.exit(2);
  }

  if (!apply) {
    console.log('First 3 units of the plan:');
    let shown = null, count = 0;
    for (const p of planned) {
      if (p._unit !== shown) { shown = p._unit; count += 1; if (count > 3) break; console.log(`\n  ${p._province} · ${p._district} · ${p._area} · ${p._unit}`); }
      console.log(`    ${p.fullName.padEnd(22)} ${p.cnic}  ${p.phone}  ${p.username.padEnd(10)} ${p.gender}`);
    }
    console.log(`\n[seed-members] DRY RUN complete — ${total} member(s) would be created across ${units.length} unit(s).`);
    console.log('[seed-members] Re-run with --apply to write them and export the roster.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // ── write ────────────────────────────────────────────────────────
  const created = [];
  const failed = [];
  for (const p of planned) {
    const { _unit, _area, _district, _province, seq, ...fields } = p;
    try {
      const doc = new Member(fields);
      doc.memberId = await generateMemberId(doc);
      await doc.save();
      created.push({ ...p, _id: doc._id, memberId: doc.memberId });
      if (created.length % 40 === 0) console.log(`  … ${created.length}/${total}`);
    } catch (e) {
      failed.push({ ...p, error: e.message });
    }
  }
  console.log(`\n[seed-members] created ${created.length}/${total}${failed.length ? `, FAILED ${failed.length}` : ''}`);
  if (failed.length) {
    failed.slice(0, 10).forEach((f) => console.error(`  ✗ ${f.fullName} (${f.cnic}): ${f.error}`));
  }

  // ── export the roster ────────────────────────────────────────────
  if (created.length) {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'PNAP-MIS';
    wb.created = new Date();
    const ws = wb.addWorksheet('New Members');
    ws.columns = [
      { header: '#', key: 'n', width: 5 },
      { header: 'Member ID', key: 'memberId', width: 26 },
      { header: 'Full Name', key: 'fullName', width: 24 },
      { header: 'Father / Husband', key: 'father', width: 24 },
      { header: 'CNIC', key: 'cnic', width: 17 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Email', key: 'email', width: 26 },
      { header: 'Username', key: 'username', width: 13 },
      { header: 'Gender', key: 'gender', width: 9 },
      { header: 'Blood', key: 'blood', width: 7 },
      { header: 'Education', key: 'education', width: 20 },
      { header: 'Occupation', key: 'occupation', width: 16 },
      { header: 'Province', key: 'province', width: 15 },
      { header: 'District', key: 'district', width: 18 },
      { header: 'Area', key: 'area', width: 18 },
      { header: 'Basic Unit', key: 'unit', width: 26 },
      { header: 'Status', key: 'status', width: 10 },
      { header: 'Joined', key: 'joinedAt', width: 18 },
      { header: 'Record ID', key: 'id', width: 26 },
    ];
    created.forEach((c, i) => ws.addRow({
      n: i + 1,
      memberId: c.memberId,
      fullName: c.fullName,
      father: c.fatherOrHusbandName,
      cnic: c.cnic,
      phone: c.phone,
      email: c.email,
      username: c.username,
      gender: c.gender,
      blood: c.bloodGroup,
      education: c.education,
      occupation: c.occupation,
      province: c._province,
      district: c._district,
      area: c._area,
      unit: c._unit,
      status: c.status,
      joinedAt: c.dateJoined,
      id: String(c._id),
    }));
    const header = ws.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    header.alignment = { vertical: 'middle', wrapText: true };
    header.height = 22;
    ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
    ws.getColumn('joinedAt').numFmt = DATE_FMT;
    for (let r = 2; r <= ws.rowCount; r += 1) {
      if (r % 2 === 0) ws.getRow(r).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
    }

    // Per-unit tally, so "5 in every unit" is verifiable at a glance.
    const byUnit = wb.addWorksheet('By Basic Unit');
    byUnit.columns = [
      { header: 'Province', key: 'province', width: 15 },
      { header: 'District', key: 'district', width: 18 },
      { header: 'Area', key: 'area', width: 18 },
      { header: 'Basic Unit', key: 'unit', width: 26 },
      { header: 'Members Added', key: 'added', width: 15 },
      { header: 'Members Now In Unit', key: 'now', width: 20 },
    ];
    for (const bu of units) {
      const mine = created.filter((c) => String(c.basicUnitId) === String(bu._id));
      byUnit.addRow({
        province: label(provById, bu.provinceId),
        district: label(distById, bu.districtId),
        area: label(areaById, bu.areaId),
        unit: bu.code ? `${bu.name} (${bu.code})` : bu.name,
        added: mine.length,
        now: await Member.countDocuments({ basicUnitId: bu._id }),
      });
    }
    const h2 = byUnit.getRow(1);
    h2.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    h2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BRAND } };
    byUnit.views = [{ state: 'frozen', ySplit: 1 }];

    const out = arg('out')
      ? path.resolve(arg('out'))
      : path.join(__dirname, '..', 'exports', `new-members-${new Date().toISOString().slice(0, 10)}.xlsx`);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    await wb.xlsx.writeFile(out);
    console.log(`[seed-members] roster written to ${out}`);
  }

  await mongoose.disconnect();
  process.exit(failed.length ? 3 : 0);
})().catch(async (err) => {
  console.error('[seed-members] FAILED:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
