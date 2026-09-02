#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════
 * PNAP-MIS Comprehensive Nationwide Demo Data Seeder
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Populates a complete, realistic, interconnected dataset across all tiers:
 *   - Central Organization & Headquarters
 *   - 5 Provinces (Punjab, Sindh, KPK, Balochistan, Islamabad/ICT)
 *   - 14 Districts & 28 Areas & 56 Basic Units
 *   - Administrative Users for every tier (Super, Central, Province, District, Area)
 *   - 120+ Realistic Members with full demographic and contact records
 *   - Cabinet Slots & Active/Pending Role Assignments
 *   - Historical & Upcoming Meetings (with minutes, attendance, action items)
 *   - Activities & Campaigns (with participant metrics and budgets)
 *   - Financial Records (Donations, Expenses with approval chains, Transfers)
 *   - Announcements & User Notifications
 *
 * All demo user accounts are provisioned with password: "123456"
 * Super Admin accounts: "super" / "123456" and "admin@pnap.local" / "Admin@12345"
 *
 * Usage:
 *   node server/scripts/seed-demo.js
 *   node server/scripts/seed-demo.js --reset   # Clears demo data first
 * ═════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Core models
const User = require('../src/models/User');
const Member = require('../src/models/Member');
const Province = require('../src/models/Province');
const District = require('../src/models/District');
const Area = require('../src/models/Area');
const BasicUnit = require('../src/models/BasicUnit');
const Central = require('../src/models/Central');
const CabinetSlot = require('../src/models/CabinetSlot');
const RoleAssignment = require('../src/models/RoleAssignment');
const Meeting = require('../src/models/Meeting');
const Activity = require('../src/models/Activity');
const Donation = require('../src/models/Donation');
const Expense = require('../src/models/Expense');
const FundTransfer = require('../src/models/FundTransfer');
const Announcement = require('../src/models/Announcement');
const Notification = require('../src/models/Notification');
const Counter = require('../src/models/Counter');

// Seed utilities
const { ensureCentralSingleton } = require('../src/utils/centralUnit');
const { ensureSuperAdmin } = require('../src/utils/superAdmin');
const { seedRoles } = require('../src/utils/seedRoles');
const { seedSystemSettings } = require('../src/utils/seedSystemSettings');
const { seedEventTypes } = require('../src/utils/seedEventTypes');
const { seedUnitTierConfigs } = require('../src/utils/seedUnitTierConfigs');
const { seedCabinetTemplates } = require('../src/utils/seedCabinetTemplates');
const { seedPerformanceRuleSets } = require('../src/utils/seedPerformanceRuleSets');
const { seedUnitPolicies } = require('../src/utils/seedUnitPolicies');
const { seedWorkflowConfigs } = require('../src/utils/seedWorkflowConfigs');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis';
const shouldReset = process.argv.includes('--reset');

// ── Demographic Name Pools ──────────────────────────────────────────
const FIRST_NAMES_MALE = [
  'Usman', 'Fahad', 'Danish', 'Ahmed', 'Junaid', 'Bilal', 'Hamza', 'Kamran',
  'Shahid', 'Zubair', 'Adnan', 'Imran', 'Naveed', 'Sajid', 'Waqar', 'Yasir',
  'Faisal', 'Rizwan', 'Tahir', 'Asad', 'Noman', 'Salman', 'Owais', 'Kashif',
  'Arslan', 'Saeed', 'Waleed', 'Zeeshan', 'Haris', 'Talha', 'Zafar', 'Babar',
  'Shaheen', 'Naseem', 'Haroon', 'Mansoor', 'Javed', 'Farhan', 'Shoaib', 'Ali'
];

const FIRST_NAMES_FEMALE = [
  'Nimra', 'Komal', 'Nadia', 'Warda', 'Ayesha', 'Sana', 'Hina', 'Maryam',
  'Rabia', 'Sadia', 'Zainab', 'Fatima', 'Amna', 'Iqra', 'Saba', 'Nazia',
  'Mehwish', 'Uzma', 'Sumaira', 'Kiran', 'Bushra', 'Farah', 'Shazia', 'Anila',
  'Naila', 'Tehmina', 'Rukhsana', 'Samina', 'Aqsa', 'Javeria', 'Sidra', 'Mahnoor'
];

const LAST_NAMES = [
  'Khan', 'Chaudhry', 'Baloch', 'Yousafzai', 'Durrani', 'Achakzai', 'Kakar',
  'Raza', 'Afridi', 'Mengal', 'Bugti', 'Marri', 'Tareen', 'Shinwari', 'Wazir',
  'Mohmand', 'Bangash', 'Jamali', 'Rind', 'Lehri', 'Khattak', 'Rehman', 'Iqbal',
  'Siddiqui', 'Malik', 'Abbasi', 'Butt', 'Qureshi', 'Mirza', 'Bhatti', 'Shah'
];

const OCCUPATIONS = [
  'Advocate / Lawyer', 'Educationist / Teacher', 'Software Engineer', 'Civil Engineer',
  'Medical Doctor', 'Business Owner', 'Chartered Accountant', 'Banker',
  'Social Worker', 'Journalist / Media', 'Student', 'Government Officer',
  'Pharmacist', 'Architect', 'Researcher'
];

const EDUCATIONS = [
  'Matriculation', 'FSc / Intermediate', 'BA / BSc', 'BS Computer Science',
  'B.Com', 'MA Political Science', 'MSc Economics', 'MBA', 'MS Software Engineering',
  'MBBS', 'LLB', 'LLM', 'PhD'
];

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Deterministic Pseudo-Random Generator
function createRng(seed = 123456) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = createRng(42);
const pick = (arr) => arr[Math.floor(rng() * arr.length)];
const randomInt = (min, max) => Math.floor(rng() * (max - min + 1)) + min;

function daysAgo(d) {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return date;
}

function daysAhead(d) {
  const date = new Date();
  date.setDate(date.getDate() + d);
  return date;
}

async function run() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNAP-MIS: Nationwide Demo Data Seeder');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Connecting to database: ${MONGO_URI}...`);
  await mongoose.connect(MONGO_URI, { autoIndex: false });
  console.log('✓ Database connected.\n');

  // Precompute default bcrypt hash once for high performance
  const DEFAULT_PW_HASH = await bcrypt.hash('123456', 10);

  if (shouldReset) {
    console.log('[reset] Clearing transactional and member collections...');
    await Promise.all([
      Member.deleteMany({}),
      Meeting.deleteMany({}),
      Activity.deleteMany({}),
      Donation.deleteMany({}),
      Expense.deleteMany({}),
      FundTransfer.deleteMany({}),
      Announcement.deleteMany({}),
      Notification.deleteMany({}),
      RoleAssignment.deleteMany({}),
      CabinetSlot.deleteMany({}),
      User.deleteMany({ roles: { $ne: 'SUPER_ADMIN' } }),
    ]);
    console.log('✓ Transactional collections reset.\n');
  }

  // ── Step 1: System Baseline Seeds ─────────────────────────────────
  console.log('[1/8] Bootstrapping system catalogues and configuration...');
  await seedRoles();
  await seedSystemSettings();
  await seedEventTypes();
  await seedUnitTierConfigs();
  await seedCabinetTemplates();
  await seedPerformanceRuleSets();
  await seedUnitPolicies();
  await seedWorkflowConfigs();
  const centralDoc = await ensureCentralSingleton();
  const centralUnitId = centralDoc._id;
  console.log('✓ System metadata, roles, and baseline configurations ready.');

  // ── Step 2: Ensure God-Mode Super Admin ────────────────────────────
  console.log('\n[2/8] Ensuring Super Admin accounts...');
  await ensureSuperAdmin();
  let rootAdmin = await User.findOne({ email: 'admin@pnap.local' });
  if (!rootAdmin) {
    rootAdmin = new User({
      email: 'admin@pnap.local',
      username: 'admin',
      fullName: 'System Administrator',
      roles: ['SUPER_ADMIN'],
      isActive: true,
      passwordHash: await bcrypt.hash('Admin@12345', 10),
    });
    await rootAdmin.save();
    console.log('✓ Created admin@pnap.local (PW: Admin@12345)');
  }
  console.log(`✓ Super Admin ready: super / 123456 and admin@pnap.local / Admin@12345`);

  // ── Step 3: Geographic Hierarchy ──────────────────────────────────
  console.log('\n[3/8] Seeding 5 Provinces, 14 Districts, 28 Areas, 56 Basic Units...');

  const PROVINCES_DATA = [
    { name: 'Punjab', code: 'PB' },
    { name: 'Sindh', code: 'SD' },
    { name: 'Khyber Pakhtunkhwa', code: 'KP' },
    { name: 'Junubi Pakhtunkhwa', code: 'BL' },
    { name: 'Islamabad Capital Territory', code: 'ICT' },
  ];

  const DISTRICTS_MAP = {
    PB: [
      { name: 'Lahore', code: 'LHR' },
      { name: 'Rawalpindi', code: 'RWP' },
      { name: 'Faisalabad', code: 'FSD' },
      { name: 'Multan', code: 'MUL' },
    ],
    SD: [
      { name: 'Karachi East', code: 'KHE' },
      { name: 'Karachi Central', code: 'KHC' },
      { name: 'Hyderabad', code: 'HYD' },
    ],
    KP: [
      { name: 'Peshawar', code: 'PSH' },
      { name: 'Mardan', code: 'MRD' },
      { name: 'Abbottabad', code: 'ABT' },
    ],
    BL: [
      { name: 'Quetta', code: 'QTA' },
      { name: 'Gwadar', code: 'GWD' },
    ],
    ICT: [
      { name: 'Islamabad', code: 'ISB' },
    ],
  };

  const AREAS_MAP = {
    LHR: ['Gulberg', 'Model Town', 'DHA Lahore', 'Township'],
    RWP: ['Saddar Rawalpindi', 'Satellite Town RWP'],
    FSD: ['Madina Town', 'Peoples Colony'],
    MUL: ['Shah Rukn-e-Alam', 'Bosan Town'],
    KHE: ['Gulshan-e-Iqbal', 'PECHS', 'Bahadurabad'],
    KHC: ['North Nazimabad', 'Federal B Area'],
    HYD: ['Latifabad', 'Qasimabad'],
    PSH: ['Hayatabad', 'University Town', 'Peshawar Cantt'],
    MRD: ['Mardan City', 'Sheikh Maltoon'],
    ABT: ['Mandian', 'Supply Abbottabad'],
    QTA: ['Satellite Town QTA', 'Zarghoon Road', 'Quetta Cantt'],
    GWD: ['Gwadar Port Area', 'New Town Gwadar'],
    ISB: ['Sector F-6', 'Sector F-7', 'Sector G-9', 'Sector I-8'],
  };

  const provinceDocs = {};
  for (const p of PROVINCES_DATA) {
    let doc = await Province.findOne({ $or: [{ name: p.name }, { code: p.code }] });
    if (!doc) {
      doc = await Province.create(p);
    }
    provinceDocs[p.code] = doc;
  }

  const districtDocs = {};
  for (const [pCode, dList] of Object.entries(DISTRICTS_MAP)) {
    const pDoc = provinceDocs[pCode];
    for (const d of dList) {
      let doc = await District.findOne({ provinceId: pDoc._id, name: d.name });
      if (!doc) doc = await District.create({ ...d, provinceId: pDoc._id });
      districtDocs[d.code] = doc;
    }
  }

  const areaDocs = {};
  for (const [dCode, aList] of Object.entries(AREAS_MAP)) {
    const dDoc = districtDocs[dCode];
    if (!dDoc) continue;
    for (const aName of aList) {
      let doc = await Area.findOne({ districtId: dDoc._id, name: aName });
      if (!doc) doc = await Area.create({ name: aName, districtId: dDoc._id, provinceId: dDoc.provinceId });
      areaDocs[aName] = doc;
    }
  }

  const allAreaDocsList = Object.values(areaDocs);
  const basicUnitDocs = [];
  for (const aDoc of allAreaDocsList) {
    for (const uName of ['Block A / Sector 1', 'Block B / Sector 2']) {
      let doc = await BasicUnit.findOne({ areaId: aDoc._id, name: uName });
      if (!doc) {
        doc = await BasicUnit.create({
          name: uName,
          areaId: aDoc._id,
          districtId: aDoc.districtId,
          provinceId: aDoc.provinceId,
        });
      }
      basicUnitDocs.push(doc);
    }
  }

  console.log(`✓ Geographic units ready: 5 Provinces, ${Object.keys(districtDocs).length} Districts, ${allAreaDocsList.length} Areas, ${basicUnitDocs.length} Basic Units.`);

  // ── Step 4: Tier Administrative Users ─────────────────────────────
  console.log('\n[4/8] Seeding Tier Administrative accounts (Password: 123456)...');
  const demoUsers = [];

  // Central Admin
  let centralAdmin = await User.findOne({ username: 'central.admin' });
  if (!centralAdmin) {
    centralAdmin = new User({
      username: 'central.admin',
      email: 'central.admin@pnap.local',
      fullName: 'National Central Administrator',
      roles: ['CENTRAL_ADMIN'],
      isActive: true,
      isEmailVerified: true,
      passwordHash: DEFAULT_PW_HASH,
    });
    await centralAdmin.save();
  }
  demoUsers.push(centralAdmin);

  // Province Admins
  const provinceAdmins = {};
  for (const p of PROVINCES_DATA) {
    const pDoc = provinceDocs[p.code];
    const username = `${p.code.toLowerCase()}.admin`;
    let user = await User.findOne({ username });
    if (!user) {
      user = new User({
        username,
        email: `${username}@pnap.local`,
        fullName: `${pDoc.name} Provincial Admin`,
        roles: ['PROVINCE_ADMIN'],
        scope: { provinceId: pDoc._id },
        isActive: true,
        isEmailVerified: true,
        passwordHash: DEFAULT_PW_HASH,
      });
      await user.save();
    }
    provinceAdmins[p.code] = user;
    demoUsers.push(user);
  }

  // Key District Admins
  const districtAdmins = {};
  for (const [code, dDoc] of Object.entries(districtDocs)) {
    const username = `${dDoc.code ? dDoc.code.toLowerCase() : 'dist' + String(dDoc._id).slice(-4)}.admin`;
    let user = await User.findOne({ username });
    if (!user) {
      user = new User({
        username,
        email: `${username}@pnap.local`,
        fullName: `${dDoc.name} District Admin`,
        roles: ['DISTRICT_ADMIN'],
        scope: { districtId: dDoc._id, provinceId: dDoc.provinceId },
        isActive: true,
        isEmailVerified: true,
        passwordHash: DEFAULT_PW_HASH,
      });
      await user.save();
    }
    districtAdmins[code] = user;
    demoUsers.push(user);
  }

  // Key Area Admins
  const areaAdmins = {};
  for (const aDoc of allAreaDocsList.slice(0, 15)) {
    const slug = aDoc.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    const username = `${slug.slice(0, 12)}.admin`;
    let user = await User.findOne({ username });
    if (!user) {
      user = new User({
        username,
        email: `${username}@pnap.local`,
        fullName: `${aDoc.name} Area Admin`,
        roles: ['AREA_ADMIN'],
        scope: { areaId: aDoc._id, districtId: aDoc.districtId, provinceId: aDoc.provinceId },
        isActive: true,
        isEmailVerified: true,
        passwordHash: DEFAULT_PW_HASH,
      });
      await user.save();
    }
    areaAdmins[aDoc.name] = user;
    demoUsers.push(user);
  }

  console.log(`✓ Seeded ${demoUsers.length} administrative user accounts across Central, Province, District, and Area tiers.`);

  // ── Step 5: Members & Member Accounts ─────────────────────────────
  console.log('\n[5/8] Seeding 120+ verified member profiles across the country...');
  const memberDocs = [];
  let memberIdx = 5001;

  for (let bIdx = 0; bIdx < basicUnitDocs.length; bIdx++) {
    const bDoc = basicUnitDocs[bIdx];
    const countInThisUnit = bIdx < 10 ? 4 : 2;

    for (let i = 0; i < countInThisUnit; i++) {
      const isMale = rng() > 0.3;
      const firstName = isMale ? pick(FIRST_NAMES_MALE) : pick(FIRST_NAMES_FEMALE);
      const lastName = pick(LAST_NAMES);
      const fullName = `${firstName} ${lastName}`;
      const fatherName = `${pick(FIRST_NAMES_MALE)} ${lastName}`;
      const cnic = `35201-${String(memberIdx).padStart(7, '0')}-1`;
      const phone = `0300${String(memberIdx).padStart(7, '0')}`;
      const username = `member${memberIdx}`;
      const email = `demo.member${memberIdx}@pnap.org`;

      let member = await Member.findOne({ cnic });
      if (!member) {
        member = new Member({
          fullName,
          fatherOrHusbandName: fatherName,
          cnic,
          phone,
          email,
          username,
          gender: isMale ? 'MALE' : 'FEMALE',
          dateOfBirth: new Date(1985 + (memberIdx % 20), (memberIdx % 12), 1 + (memberIdx % 28)),
          bloodGroup: pick(BLOOD_GROUPS),
          education: pick(EDUCATIONS),
          occupation: pick(OCCUPATIONS),
          address: `House #${10 + (memberIdx % 90)}, ${bDoc.name}`,
          provinceId: bDoc.provinceId,
          districtId: bDoc.districtId,
          areaId: bDoc.areaId,
          basicUnitId: bDoc._id,
          status: 'ACTIVE',
          statusReason: 'Approved regular membership',
          submittedVia: 'ADMIN',
          approvedAt: daysAgo(randomInt(30, 300)),
          dateJoined: daysAgo(randomInt(40, 400)),
          lastActivityAt: daysAgo(randomInt(1, 45)),
          passwordHash: DEFAULT_PW_HASH,
          memberId: `PNAP-2026-${String(memberIdx).padStart(6, '0')}`,
        });

        await member.save();

        let mUser = await User.findOne({ cnic: member.cnic });
        if (!mUser) {
          mUser = new User({
            fullName: member.fullName,
            email: member.email,
            cnic: member.cnic,
            username: member.username,
            roles: ['MEMBER'],
            memberId: member._id,
            scope: {
              provinceId: member.provinceId,
              districtId: member.districtId,
              areaId: member.areaId,
              basicUnitId: member.basicUnitId,
            },
            isActive: true,
            isEmailVerified: true,
            isPhoneVerified: true,
            passwordHash: DEFAULT_PW_HASH,
          });
          await mUser.save();
        }
      }
      memberDocs.push(member);
      memberIdx++;
    }
  }

  console.log(`✓ Seeded ${memberDocs.length} full member profiles with credentials.`);

  // ── Step 6: Cabinet Slots & Role Assignments ───────────────────────
  console.log('\n[6/8] Seeding Cabinet positions & Role Assignments...');

  await CabinetSlot.seedFor('CENTRAL', centralUnitId);
  for (const p of Object.values(provinceDocs)) await CabinetSlot.seedFor('PROVINCE', p._id);
  for (const d of Object.values(districtDocs)) await CabinetSlot.seedFor('DISTRICT', d._id);
  for (const a of allAreaDocsList) await CabinetSlot.seedFor('AREA', a._id);
  for (const u of basicUnitDocs) await CabinetSlot.seedFor('BASIC_UNIT', u._id);

  // Assign Central Cabinet Roles
  const centralAssignments = [
    { roleCode: 'CHAIRMAN', member: memberDocs[0] },
    { roleCode: 'CO_CHAIRMAN', member: memberDocs[1] },
    { roleCode: 'GENERAL_SECRETARY', member: memberDocs[2] },
    { roleCode: 'FINANCE_SECRETARY', member: memberDocs[3] },
    { roleCode: 'FIRST_SECRETARY', member: memberDocs[4] },
  ];

  for (const item of centralAssignments) {
    if (!item.member) continue;
    let ra = await RoleAssignment.findOne({ unitLevel: 'CENTRAL', unitId: centralUnitId, roleCode: item.roleCode });
    if (!ra) {
      ra = await RoleAssignment.create({
        unitLevel: 'CENTRAL',
        unitId: centralUnitId,
        memberId: item.member._id,
        roleCode: item.roleCode,
        state: 'APPROVED',
        startedAt: daysAgo(200),
        initiatedBy: rootAdmin._id,
        decidedBy: rootAdmin._id,
        decidedAt: daysAgo(200),
      });
      await CabinetSlot.updateOne(
        { unitLevel: 'CENTRAL', unitId: centralUnitId, roleCode: item.roleCode },
        { $set: { filledByAssignmentId: ra._id, filledMemberId: item.member._id } }
      );
      await User.updateOne({ memberId: item.member._id }, { $addToSet: { roles: item.roleCode } });
    }
  }

  // Assign Provincial Cabinet Roles
  let mPointer = 10;
  for (const pCode of Object.keys(provinceDocs)) {
    const pDoc = provinceDocs[pCode];
    const rolesToFill = ['PRESIDENT', 'GENERAL_SECRETARY', 'FINANCE_SECRETARY', 'SR_VICE_PRESIDENT'];

    for (const rCode of rolesToFill) {
      const assignedMem = memberDocs[mPointer++];
      if (!assignedMem) break;

      let ra = await RoleAssignment.findOne({ unitLevel: 'PROVINCE', unitId: pDoc._id, roleCode: rCode });
      if (!ra) {
        ra = await RoleAssignment.create({
          unitLevel: 'PROVINCE',
          unitId: pDoc._id,
          memberId: assignedMem._id,
          roleCode: rCode,
          state: 'APPROVED',
          startedAt: daysAgo(180),
          initiatedBy: rootAdmin._id,
          decidedBy: rootAdmin._id,
          decidedAt: daysAgo(180),
        });
        await CabinetSlot.updateOne(
          { unitLevel: 'PROVINCE', unitId: pDoc._id, roleCode: rCode },
          { $set: { filledByAssignmentId: ra._id, filledMemberId: assignedMem._id } }
        );
        await User.updateOne({ memberId: assignedMem._id }, { $addToSet: { roles: rCode } });
      }
    }
  }

  // Assign Key District & Area Cabinets
  for (let i = 0; i < Math.min(10, allAreaDocsList.length); i++) {
    const aDoc = allAreaDocsList[i];
    const secMem = memberDocs[mPointer++];
    const finMem = memberDocs[mPointer++];
    const pressMem = memberDocs[mPointer++];

    if (secMem) {
      let ra = await RoleAssignment.findOne({ unitLevel: 'AREA', unitId: aDoc._id, roleCode: 'SECRETARY' });
      if (!ra) {
        ra = await RoleAssignment.create({
          unitLevel: 'AREA',
          unitId: aDoc._id,
          memberId: secMem._id,
          roleCode: 'SECRETARY',
          state: 'APPROVED',
          startedAt: daysAgo(120),
          initiatedBy: rootAdmin._id,
          decidedBy: rootAdmin._id,
          decidedAt: daysAgo(120),
        });
        await CabinetSlot.updateOne({ unitLevel: 'AREA', unitId: aDoc._id, roleCode: 'SECRETARY' }, { $set: { filledByAssignmentId: ra._id, filledMemberId: secMem._id } });
        await User.updateOne({ memberId: secMem._id }, { $addToSet: { roles: 'SECRETARY' } });
      }
    }

    if (finMem) {
      let ra = await RoleAssignment.findOne({ unitLevel: 'AREA', unitId: aDoc._id, roleCode: 'FINANCE_SECRETARY' });
      if (!ra) {
        ra = await RoleAssignment.create({
          unitLevel: 'AREA',
          unitId: aDoc._id,
          memberId: finMem._id,
          roleCode: 'FINANCE_SECRETARY',
          state: 'APPROVED',
          startedAt: daysAgo(120),
          initiatedBy: rootAdmin._id,
          decidedBy: rootAdmin._id,
          decidedAt: daysAgo(120),
        });
        await CabinetSlot.updateOne({ unitLevel: 'AREA', unitId: aDoc._id, roleCode: 'FINANCE_SECRETARY' }, { $set: { filledByAssignmentId: ra._id, filledMemberId: finMem._id } });
        await User.updateOne({ memberId: finMem._id }, { $addToSet: { roles: 'FINANCE_SECRETARY' } });
      }
    }

    if (pressMem && i < 3) {
      let ra = await RoleAssignment.findOne({ unitLevel: 'AREA', unitId: aDoc._id, roleCode: 'PRESS_SECRETARY' });
      if (!ra) {
        await RoleAssignment.create({
          unitLevel: 'AREA',
          unitId: aDoc._id,
          memberId: pressMem._id,
          roleCode: 'PRESS_SECRETARY',
          state: 'PROPOSED',
          startedAt: new Date(),
          initiatedBy: rootAdmin._id,
        });
      }
    }
  }

  console.log('✓ Cabinet slots and role assignments seeded.');

  // ── Step 7: Meetings & Activities ─────────────────────────────────
  console.log('\n[7/8] Seeding Meetings, Seminars, Campaigns, and Conventions...');

  const MEETING_TOPICS = [
    { type: 'ROUTINE', title: 'Monthly Unit Review & Membership Progress', venue: 'Party Secretariat Conference Hall' },
    { type: 'GENERAL_BODY', title: 'Quarterly General Body Session on Public Issues', venue: 'Community Center Main Hall' },
    { type: 'EXECUTIVE', title: 'Executive Council Strategy & Policy Meeting', venue: 'Central Committee Room' },
    { type: 'WORKSHOP', title: 'Officeholder Digital Skills & MIS Training', venue: 'IT Training Lab' },
    { type: 'ROUTINE', title: 'Bi-Weekly Organizational Alignment Meeting', venue: 'District Head Office' },
  ];

  const meetingDocs = [];
  for (let i = 0; i < 40; i++) {
    const template = pick(MEETING_TOPICS);
    const isPast = i < 32;
    const meetingDate = isPast ? daysAgo((i + 1) * 7) : daysAhead((i - 30) * 5);
    const targetUnit = basicUnitDocs[i % basicUnitDocs.length];
    const attendeeCount = randomInt(4, 12);
    const attendees = memberDocs.slice(0, attendeeCount).map((m, idx) => ({
      memberId: m._id,
      status: idx === 0 ? 'PRESENT' : pick(['PRESENT', 'PRESENT', 'PRESENT', 'ABSENT', 'LATE']),
    }));

    const meeting = new Meeting({
      unitLevel: 'BASIC_UNIT',
      unitId: targetUnit._id,
      basicUnitId: targetUnit._id,
      areaId: targetUnit.areaId,
      districtId: targetUnit.districtId,
      provinceId: targetUnit.provinceId,
      type: template.type,
      body: 'EXECUTIVE',
      title: `${template.title} (${targetUnit.name})`,
      description: `Regular structured meeting to deliberate on local organizational growth, membership expansion, and community issues.`,
      venue: `${template.venue}, ${targetUnit.name}`,
      startAt: meetingDate,
      endAt: new Date(meetingDate.getTime() + 2 * 3600 * 1000),
      agenda: '1. Recitation\n2. Review of previous action items\n3. Membership drive review\n4. Finance and monthly dues\n5. Upcoming field activities',
      decisions: isPast ? '1. Approved monthly accounts.\n2. Scheduled next youth outreach camp.\n3. Assigned verification duties to Senior Mawin.' : '',
      actionItems: isPast ? [
        { task: 'Submit financial report', assigneeMemberId: memberDocs[0]._id, dueDate: daysAgo(5) },
        { task: 'Distribute 500 pamphlets', assigneeMemberId: memberDocs[1]._id, dueDate: daysAhead(7) },
      ] : [],
      notes: isPast ? 'Meeting concluded with high enthusiasm. All members committed to targets.' : 'Awaiting confirmation of guest speaker.',
      attendance: isPast ? attendees : [],
      state: isPast ? 'FINALIZED' : 'SCHEDULED',
      chairpersonId: memberDocs[0]._id,
      createdBy: rootAdmin._id,
    });
    await meeting.save();
    meetingDocs.push(meeting);
  }

  const ACTIVITY_TOPICS = [
    { type: 'CAMPAIGN', title: 'Nationwide Youth Membership Outreach 2026', desc: 'Door-to-door public interaction and voter awareness campaign.' },
    { type: 'SEMINAR', title: 'Constitutional Rights & Democratic Governance Seminar', desc: 'Educational symposium featuring guest speakers and legal scholars.' },
    { type: 'PROTEST', title: 'Peaceful Protest Rally Against Inflation & Utility Hikes', desc: 'Public demonstration highlighting citizen concerns and relief demands.' },
    { type: 'CHARITY', title: 'Free Medical Consultation & Ration Distribution Drive', desc: 'Community welfare initiative serving underprivileged families.' },
    { type: 'CONVENTION', title: 'Annual Provincial Workers Convention', desc: 'Grand delegate gathering with speeches from provincial leadership.' },
  ];

  const activityDocs = [];
  for (let i = 0; i < 30; i++) {
    const template = pick(ACTIVITY_TOPICS);
    const isPast = i < 24;
    const actDate = isPast ? daysAgo((i + 1) * 10) : daysAhead((i - 22) * 8);
    const targetUnit = allAreaDocsList[i % allAreaDocsList.length];

    const activity = new Activity({
      unitLevel: 'AREA',
      unitId: targetUnit._id,
      areaId: targetUnit._id,
      districtId: targetUnit.districtId,
      provinceId: targetUnit.provinceId,
      type: template.type,
      body: 'EXECUTIVE',
      title: `${template.title} - ${targetUnit.name}`,
      description: template.desc,
      venue: `Public Park / Central Square, ${targetUnit.name}`,
      startAt: actDate,
      endAt: new Date(actDate.getTime() + 4 * 3600 * 1000),
      leadMemberId: memberDocs[i % 10]._id,
      participants: memberDocs.slice(i, i + 8).map((m) => m._id),
      externalAttendanceEstimate: randomInt(50, 1500),
      campaign: template.type === 'CAMPAIGN' ? {
        householdsVisited: randomInt(80, 450),
        peopleContacted: randomInt(200, 1200),
        pamphletsDistributed: randomInt(300, 2000),
        expectedJoiners: randomInt(15, 80),
        actualJoiners: randomInt(8, 50),
        volunteerHours: randomInt(40, 200),
      } : undefined,
      outcomeNotes: isPast ? 'Event was a major success with high media coverage and strong local community engagement.' : '',
      state: isPast ? 'COMPLETED' : 'PLANNED',
      createdBy: rootAdmin._id,
    });
    await activity.save();
    activityDocs.push(activity);
  }

  console.log(`✓ Seeded ${meetingDocs.length} meetings and ${activityDocs.length} public activities.`);

  // ── Step 8: Financial Records & Broadcasts ─────────────────────────
  console.log('\n[8/8] Seeding Donations, Expenses, Fund Transfers, and Announcements...');

  // Donations
  const donationDocs = [];
  const fiscalYear = 2026;
  const paymentModes = ['CASH', 'BANK_TRANSFER', 'MOBILE_WALLET', 'CHEQUE'];

  for (let i = 0; i < 50; i++) {
    const isMemberDonation = i % 2 === 0;
    const targetUnit = basicUnitDocs[i % basicUnitDocs.length];
    const amount = pick([500, 1000, 1500, 2500, 5000, 10000, 25000, 50000]);
    const mem = memberDocs[i % memberDocs.length];

    const don = new Donation({
      unitLevel: 'BASIC_UNIT',
      unitId: targetUnit._id,
      basicUnitId: targetUnit._id,
      areaId: targetUnit.areaId,
      districtId: targetUnit.districtId,
      provinceId: targetUnit.provinceId,
      body: 'EXECUTIVE',
      receiptNo: `REC-2026-${String(i + 501).padStart(5, '0')}`,
      fiscalYear,
      amount,
      currency: 'PKR',
      donorType: isMemberDonation ? 'MEMBER' : 'NON_MEMBER',
      donorMemberId: isMemberDonation ? mem._id : undefined,
      donorName: isMemberDonation ? mem.fullName : `Syed ${pick(FIRST_NAMES_MALE)} ${pick(LAST_NAMES)}`,
      donorCnic: isMemberDonation ? mem.cnic : `42101-${randomInt(1000000, 9999999)}-1`,
      paymentMode: pick(paymentModes),
      receivedAt: daysAgo(randomInt(2, 180)),
      note: isMemberDonation ? 'Monthly membership fee & donation' : 'Public voluntary financial support',
      recordedBy: rootAdmin._id,
    });
    await don.save();
    donationDocs.push(don);
  }

  // Expenses
  const expenseDocs = [];
  const EXPENSE_CATEGORIES = ['OFFICE', 'TRANSPORT', 'PRINTING', 'REFRESHMENTS', 'STAGE_EQUIPMENT', 'COMMUNICATION'];

  for (let i = 0; i < 35; i++) {
    const targetUnit = allAreaDocsList[i % allAreaDocsList.length];
    const category = pick(EXPENSE_CATEGORIES);
    const amount = pick([1200, 2500, 4800, 8500, 15000, 28000, 45000]);
    const isApproved = i < 30;

    const exp = new Expense({
      unitLevel: 'AREA',
      unitId: targetUnit._id,
      areaId: targetUnit._id,
      districtId: targetUnit.districtId,
      provinceId: targetUnit.provinceId,
      body: 'EXECUTIVE',
      category,
      description: `${category} expenses for local field operations & meeting logistics`,
      amount,
      currency: 'PKR',
      incurredAt: daysAgo(randomInt(5, 120)),
      vendor: `${pick(LAST_NAMES)} Services & Suppliers`,
      paymentMode: pick(paymentModes),
      evidenceUrl: 'https://placehold.co/600x400/png?text=Receipt+Proof',
      state: isApproved ? 'APPROVED' : 'PENDING',
      approvedBy: isApproved ? rootAdmin._id : undefined,
      approvedAt: isApproved ? daysAgo(randomInt(1, 100)) : undefined,
      recordedBy: rootAdmin._id,
    });
    await exp.save();
    expenseDocs.push(exp);
  }

  // Fund Transfers
  const transferDocs = [];
  const provDocsList = Object.values(provinceDocs);
  const distDocsList = Object.values(districtDocs);

  for (let i = 0; i < 15; i++) {
    const pDoc = provDocsList[i % provDocsList.length];
    const dDoc = distDocsList[i % distDocsList.length];

    const ft = new FundTransfer({
      sourceLevel: 'PROVINCE',
      sourceUnitId: pDoc._id,
      destinationLevel: 'DISTRICT',
      destinationUnitId: dDoc._id,
      sourceName: `${pDoc.name} Provincial Office`,
      destinationName: `${dDoc.name} District Office`,
      direction: 'DOWN',
      provinceId: pDoc._id,
      districtId: dDoc._id,
      body: 'EXECUTIVE',
      amount: pick([25000, 50000, 100000, 150000]),
      currency: 'PKR',
      mode: 'BANK_TRANSFER',
      reference: `TRF-PKR-${2000 + i}`,
      note: 'Quarterly operational budget allocation',
      state: i < 12 ? 'ACKNOWLEDGED' : 'PENDING_ACK',
      initiatedAt: daysAgo((i + 1) * 8),
      initiatedBy: rootAdmin._id,
      acknowledgedAt: i < 12 ? daysAgo(i * 8) : undefined,
      acknowledgedBy: i < 12 ? rootAdmin._id : undefined,
    });
    await ft.save();
    transferDocs.push(ft);
  }

  // Announcements
  const ANNOUNCEMENTS_DATA = [
    {
      title: '🚨 Central Directive: Nationwide Membership Drive 2026',
      body: 'All Provincial and District Secretariats are hereby instructed to commence the special spring outreach campaign. Targets and materials have been dispatched.',
      unitLevel: 'CENTRAL',
      unitId: centralUnitId,
      scope: 'GLOBAL',
      pinned: true,
    },
    {
      title: '📅 Quarterly Performance Reports Submission Deadline',
      body: 'Unit Secretaries must ensure all meeting minutes, activity logs, and financial vouchers for Q1 are finalized in the MIS by the end of the month.',
      unitLevel: 'CENTRAL',
      unitId: centralUnitId,
      scope: 'GLOBAL',
      pinned: true,
    },
    {
      title: '📢 Punjab Provincial Advisory: Flood Relief Preparations',
      body: 'All District Cabinets in Punjab are requested to establish emergency relief contact committees in coordination with local welfare wings.',
      unitLevel: 'PROVINCE',
      unitId: provinceDocs.PB._id,
      provinceId: provinceDocs.PB._id,
      scope: 'SUBTREE',
      pinned: false,
    },
  ];

  for (const ann of ANNOUNCEMENTS_DATA) {
    await Announcement.create({
      ...ann,
      authorUserId: rootAdmin._id,
      authorName: 'System Administrator',
    });
  }

  // Notifications
  const notifTargets = [rootAdmin, provinceAdmins.PB, provinceAdmins.SD].filter(Boolean);
  for (const u of notifTargets) {
    await Notification.create({
      userId: u._id,
      type: 'MEMBER_REGISTERED',
      severity: 'INFO',
      title: 'New Member Registrations Pending Review',
      body: '5 new member registration applications are awaiting verification and approval.',
      link: '/admin/approvals',
      read: false,
    });
    await Notification.create({
      userId: u._id,
      type: 'EXPENSE_DECIDED',
      severity: 'SUCCESS',
      title: 'Monthly Operating Expense Approved',
      body: 'Your submitted operational expense claim has been approved by the Finance Committee.',
      link: '/unit/finance',
      read: true,
    });
  }

  console.log(`✓ Seeded ${donationDocs.length} donations, ${expenseDocs.length} expenses, ${transferDocs.length} fund transfers, announcements, and notifications.`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  DEMO DATA SEEDING COMPLETE!');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SUMMARY OF SEEDED DATA:');
  console.log(`  • Provinces:         ${provDocsList.length} (Punjab, Sindh, KPK, Balochistan, ICT)`);
  console.log(`  • Districts:         ${distDocsList.length}`);
  console.log(`  • Areas:             ${allAreaDocsList.length}`);
  console.log(`  • Basic Units:       ${basicUnitDocs.length}`);
  console.log(`  • Administrative:    ${demoUsers.length} test accounts across all tiers`);
  console.log(`  • Members:           ${memberDocs.length} members with full profiles & logins`);
  console.log(`  • Meetings:          ${meetingDocs.length} meetings (Past & Upcoming)`);
  console.log(`  • Activities:        ${activityDocs.length} campaigns & conventions`);
  console.log(`  • Donations:         ${donationDocs.length} records`);
  console.log(`  • Expenses:          ${expenseDocs.length} claims`);
  console.log(`  • Fund Transfers:    ${transferDocs.length} inter-tier transfers`);
  console.log('───────────────────────────────────────────────────────────────');
  console.log('DEMO LOGIN CREDENTIALS (All passwords: "123456"):');
  console.log('  • Super Admin:       super / 123456  (or admin@pnap.local / Admin@12345)');
  console.log('  • Central Admin:     central.admin / 123456');
  console.log('  • Punjab Admin:      pb.admin / 123456');
  console.log('  • Sindh Admin:       sd.admin / 123456');
  console.log('  • KPK Admin:         kp.admin / 123456');
  console.log('  • Balochistan Admin: bl.admin / 123456');
  console.log('  • Lahore Admin:      lhr.admin / 123456');
  console.log('  • Karachi Admin:     khe.admin / 123456');
  console.log('  • Peshawar Admin:    psh.admin / 123456');
  console.log('  • Quetta Admin:      qta.admin / 123456');
  console.log('  • Member Login:      member5001 / 123456 (or CNIC: 35201-0005001-1)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Trigger Excel Workbook Generation
  try {
    const { generateExcel } = require('./generate-demo-excel');
    await generateExcel();
  } catch (err) {
    console.warn('[seed] Excel generation notice:', err.message);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[seed-demo] Execution failed:', err);
  process.exit(1);
});
