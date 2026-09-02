#!/usr/bin/env node
/**
 * PNAP-MIS Full Seed Script
 * =========================
 * Wipes the database and re-populates it with a fully-linked test dataset.
 *
 * IMPORTANT: Stop the dev server before running this, otherwise server
 * background jobs will interfere with RoleAssignment states.
 *
 * Org Hierarchy : Central → 2 Provinces (Balochistan, KPK)
 *                 → 2 Districts each → 2 Areas each → 2 Basic Units each
 * Members       : 10 per Basic Unit (ACTIVE) → 160 total
 *                 Each member gets a linked User account with correct roles
 * Cabinet       : BU roles (members 0-5), Area roles (members 6-7 per area),
 *                 District roles (dedicated pool), Province/Central roles (dedicated)
 *                 RoleAssignments inserted directly into MongoDB (bypass hooks)
 * Meetings      : 4 per BU (3 FINALIZED + 1 SCHEDULED) + 1 per Area (FINALIZED)
 *                 + 1 per District (FINALIZED) + 1 per Province (SCHEDULED)
 * Activities    : 3 per BU (2 COMPLETED + 1 PLANNED)
 * Finance       : 3 Donations + 2 Expenses + 1 FundTransfer (BU→Area) per BU
 *                 + 1 FundTransfer (Area→District) per Area
 * Responsibilities: 1 per member
 * Announcements : 1 per Province (SUBTREE) + 1 Central (GLOBAL)
 * PermanentMemberships: 2 per Area, 1 per Province
 *
 * Usage:
 *   node server/scripts/seed-all.js           # DRY RUN (shows plan)
 *   node server/scripts/seed-all.js --yes     # wipe + seed
 *
 * Passwords: admins = 123456, members = Member@123
 */

'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const ObjectId = mongoose.Types.ObjectId;

// ── Model imports ──────────────────────────────────────────────────
const User                = require('../src/models/User');
const Member              = require('../src/models/Member');
const Province            = require('../src/models/Province');
const District            = require('../src/models/District');
const Area                = require('../src/models/Area');
const BasicUnit           = require('../src/models/BasicUnit');
const Central             = require('../src/models/Central');
const CabinetSlot         = require('../src/models/CabinetSlot');
const CabinetTemplate     = require('../src/models/CabinetTemplate');
const RoleAssignment      = require('../src/models/RoleAssignment');
const Meeting             = require('../src/models/Meeting');
const Activity            = require('../src/models/Activity');
const Donation            = require('../src/models/Donation');
const Expense             = require('../src/models/Expense');
const FundTransfer        = require('../src/models/FundTransfer');
const Responsibility      = require('../src/models/Responsibility');
const PermanentMembership = require('../src/models/PermanentMembership');
const Announcement        = require('../src/models/Announcement');
const Counter             = require('../src/models/Counter');
const Role                = require('../src/models/Role');
const EventTypeConfig     = require('../src/models/EventTypeConfig');
const { DEFAULT_PERMISSIONS } = require('../src/utils/permissions');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis';
const CONFIRMED = process.argv.includes('--yes');
const ADMIN_PW  = '123456';
const MEMBER_PW = 'Member@123';

let adminHash, memberHash;

// ── Helpers ────────────────────────────────────────────────────────
const slug = (n) => String(n).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const cnic = (n) => `35201-${String(n).padStart(7, '0')}-1`;
const phone = (n) => `0300${String(n).padStart(7, '0')}`;
const daysAgo = (d) => new Date(Date.now() - d * 86400000);
const daysAhead = (d) => new Date(Date.now() + d * 86400000);
const pick = (arr, i) => arr[i % arr.length];

const FIRST_NAMES  = ['Ali','Ahmed','Usman','Bilal','Tariq','Kamran','Nasir','Faisal','Hamza','Zubair','Imran','Aqib','Fatima','Ayesha','Zainab','Sana','Nadia','Maryam','Hina','Rukhsana'];
const LAST_NAMES   = ['Khan','Ahmed','Ali','Baloch','Bugti','Mengal','Kakar','Durrani','Raza','Qureshi','Sheikh','Iqbal','Rehman','Nawaz','Shah','Yousafzai','Khattak','Marwat','Afridi','Wazir'];
const FATHER_NAMES = ['Abdul Rahman','Muhammad Sadiq','Noor Khan','Haji Gul','Sardar Ali','Ghulam Haider','Bashir Ahmad','Riaz Hussain','Zafar Iqbal','Nek Muhammad'];
const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
const OCCUPATIONS  = ['Teacher','Engineer','Doctor','Lawyer','Farmer','Trader','Accountant','Driver'];
const EDUCATIONS   = ['Matric','Intermediate','Bachelor','Master','PhD'];

let memberCounter = 1;
const memberName = (i) => `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i)}`;

async function wipe() {
  const db = mongoose.connection.db;
  const cols = await db.listCollections().toArray();
  for (const c of cols) await db.collection(c.name).drop().catch(() => {});
  console.log(`[wipe] dropped ${cols.length} collection(s)`);
}

// ── Direct MongoDB insert (bypasses all Mongoose hooks/middleware) ──
// This is CRITICAL to prevent the dev server from interfering with
// RoleAssignment state — Mongoose post-save hooks were changing APPROVED→ENDED.
async function rawInsert(collectionName, doc) {
  const db = mongoose.connection.db;
  const now = new Date();
  const full = { _id: new ObjectId(), createdAt: now, updatedAt: now, __v: 0, ...doc };
  await db.collection(collectionName).insertOne(full);
  return full;
}

// ── Cabinet Templates ──────────────────────────────────────────────
const CABINET_TEMPLATES = {
  BASIC_UNIT: [
    { roleCode: 'SECRETARY',         isMandatory: true,  sortOrder: 10 },
    { roleCode: 'SENIOR_MAWIN',      isMandatory: true,  sortOrder: 20 },
    { roleCode: 'FINANCE_SECRETARY', isMandatory: true,  sortOrder: 30 },
    { roleCode: 'PRESS_SECRETARY',   isMandatory: false, sortOrder: 40 },
    { roleCode: 'CULTURE_SECRETARY', isMandatory: false, sortOrder: 50 },
    { roleCode: 'SPORTS_SECRETARY',  isMandatory: false, sortOrder: 60 },
  ],
  AREA: [
    { roleCode: 'SECRETARY',         isMandatory: true,  sortOrder: 10 },
    { roleCode: 'SENIOR_MAWIN',      isMandatory: true,  sortOrder: 20 },
    { roleCode: 'FINANCE_SECRETARY', isMandatory: true,  sortOrder: 30 },
    { roleCode: 'PRESS_SECRETARY',   isMandatory: false, sortOrder: 40 },
    { roleCode: 'CULTURE_SECRETARY', isMandatory: false, sortOrder: 50 },
    { roleCode: 'SPORTS_SECRETARY',  isMandatory: false, sortOrder: 60 },
  ],
  DISTRICT: [
    { roleCode: 'SECRETARY',         isMandatory: true,  sortOrder: 10 },
    { roleCode: 'SENIOR_MAWIN',      isMandatory: true,  sortOrder: 20 },
    { roleCode: 'FINANCE_SECRETARY', isMandatory: true,  sortOrder: 30 },
    { roleCode: 'PRESS_SECRETARY',   isMandatory: false, sortOrder: 40 },
    { roleCode: 'CULTURE_SECRETARY', isMandatory: false, sortOrder: 50 },
    { roleCode: 'SPORTS_SECRETARY',  isMandatory: false, sortOrder: 60 },
  ],
  PROVINCE: [
    { roleCode: 'PRESIDENT',         isMandatory: true,  sortOrder: 10 },
    { roleCode: 'SR_VICE_PRESIDENT', isMandatory: true,  sortOrder: 15 },
    { roleCode: 'VICE_PRESIDENT',    isMandatory: true,  sortOrder: 20 },
    { roleCode: 'GENERAL_SECRETARY', isMandatory: true,  sortOrder: 25 },
    { roleCode: 'FINANCE_SECRETARY', isMandatory: true,  sortOrder: 30 },
    { roleCode: 'PRESS_SECRETARY',   isMandatory: false, sortOrder: 40 },
    { roleCode: 'CULTURE_SECRETARY', isMandatory: false, sortOrder: 50 },
    { roleCode: 'SPORTS_SECRETARY',  isMandatory: false, sortOrder: 60 },
  ],
  CENTRAL: [
    { roleCode: 'CHAIRMAN',          isMandatory: true,  sortOrder: 10 },
    { roleCode: 'CO_CHAIRMAN',       isMandatory: true,  sortOrder: 15 },
    { roleCode: 'SR_VICE_CHAIRMAN',  isMandatory: false, sortOrder: 20 },
    { roleCode: 'VICE_CHAIRMAN',     isMandatory: false, sortOrder: 25 },
    { roleCode: 'GENERAL_SECRETARY', isMandatory: true,  sortOrder: 30 },
    { roleCode: 'FIRST_SECRETARY',   isMandatory: false, sortOrder: 35 },
    { roleCode: 'FINANCE_SECRETARY', isMandatory: true,  sortOrder: 40 },
    { roleCode: 'PRESS_SECRETARY',   isMandatory: false, sortOrder: 50 },
    { roleCode: 'CULTURE_SECRETARY', isMandatory: false, sortOrder: 60 },
    { roleCode: 'SPORTS_SECRETARY',  isMandatory: false, sortOrder: 70 },
  ],
};

const ROLE_CATALOGUE = [
  { code: 'SUPER_ADMIN',       label: 'Super Admin'          },
  { code: 'CENTRAL_ADMIN',     label: 'Central Admin'        },
  { code: 'PROVINCE_ADMIN',    label: 'Province Admin'       },
  { code: 'DISTRICT_ADMIN',    label: 'District Admin'       },
  { code: 'AREA_ADMIN',        label: 'Area Admin'           },
  { code: 'SECRETARY',         label: 'Secretary'            },
  { code: 'SENIOR_MAWIN',      label: 'Senior Mawin'         },
  { code: 'FINANCE_SECRETARY', label: 'Finance Secretary'    },
  { code: 'PRESS_SECRETARY',   label: 'Press Secretary'      },
  { code: 'CULTURE_SECRETARY', label: 'Culture Secretary'    },
  { code: 'SPORTS_SECRETARY',  label: 'Sports Secretary'     },
  { code: 'GENERAL_SECRETARY', label: 'General Secretary'    },
  { code: 'FIRST_SECRETARY',   label: 'First Secretary'      },
  { code: 'PRESIDENT',         label: 'President'            },
  { code: 'VICE_PRESIDENT',    label: 'Vice President'       },
  { code: 'SR_VICE_PRESIDENT', label: 'Sr. Vice President'   },
  { code: 'CHAIRMAN',          label: 'Chairman'             },
  { code: 'CO_CHAIRMAN',       label: 'Co-Chairman'          },
  { code: 'VICE_CHAIRMAN',     label: 'Vice Chairman'        },
  { code: 'SR_VICE_CHAIRMAN',  label: 'Sr. Vice Chairman'    },
  { code: 'OTHER',             label: 'Other'                },
  { code: 'MEMBER',            label: 'Member'               },
];

// ── Org structure ──────────────────────────────────────────────────
const ORG = {
  provinces: [
    {
      name: 'Junubi Pakhtunkhwa', code: 'JPK',
      districts: [
        {
          name: 'Quetta', code: 'QTA',
          areas: [
            { name: 'Satellite Town', code: 'ST', basicUnits: ['ST Block A', 'ST Block B'] },
            { name: 'Cantt',          code: 'CN', basicUnits: ['Cantt Unit 1', 'Cantt Unit 2'] },
          ],
        },
        {
          name: 'Gwadar', code: 'GWD',
          areas: [
            { name: 'Gwadar City', code: 'GC', basicUnits: ['GC Unit 1', 'GC Unit 2'] },
            { name: 'Pasni',       code: 'PS', basicUnits: ['Pasni Unit 1', 'Pasni Unit 2'] },
          ],
        },
      ],
    },
    {
      name: 'Khyber Pakhtunkhwa', code: 'KP',
      districts: [
        {
          name: 'Peshawar', code: 'PSH',
          areas: [
            { name: 'University Town', code: 'UT', basicUnits: ['UT Block 1', 'UT Block 2'] },
            { name: 'Hayatabad',       code: 'HB', basicUnits: ['HB Phase 1', 'HB Phase 2'] },
          ],
        },
        {
          name: 'Mardan', code: 'MRD',
          areas: [
            { name: 'Mardan City', code: 'MC', basicUnits: ['MC Unit A', 'MC Unit B'] },
            { name: 'Rustam',      code: 'RT', basicUnits: ['Rustam Unit 1', 'Rustam Unit 2'] },
          ],
        },
      ],
    },
  ],
};

// ── Main ───────────────────────────────────────────────────────────
async function run() {
  console.log('[seed-all] connecting to', MONGO_URI);
  await mongoose.connect(MONGO_URI, { autoIndex: true });

  if (!CONFIRMED) {
    console.log('\n[seed-all] DRY RUN — would seed:');
    console.log('  2 Provinces, 4 Districts, 8 Areas, 16 Basic Units');
    console.log('  10 Members per BU = 160 members, each with a User account');
    console.log('  Full cabinet at every level (APPROVED, inserted via raw MongoDB)');
    console.log('  4 Meetings per BU + area/district/province level meetings');
    console.log('  3 Activities per BU');
    console.log('  3 Donations + 2 Expenses + 2 FundTransfers per BU');
    console.log('\nPass --yes to execute:\n  node server/scripts/seed-all.js --yes');
    await mongoose.disconnect();
    return;
  }

  // ── 0. Wipe ────────────────────────────────────────────────────
  console.log('[seed-all] wiping database…');
  await wipe();

  console.log('[seed-all] pre-hashing passwords…');
  [adminHash, memberHash] = await Promise.all([
    bcrypt.hash(ADMIN_PW, 12),
    bcrypt.hash(MEMBER_PW, 12),
  ]);

  // ── 1. Role catalogue ──────────────────────────────────────────
  console.log('[seed-all] seeding role catalogue…');
  for (const r of ROLE_CATALOGUE) {
    await Role.create({ 
      code: r.code, 
      label: r.label, 
      permissions: DEFAULT_PERMISSIONS[r.code] || [], 
      isActive: true, 
      isSystem: true 
    });
  }

  // ── 2. Cabinet templates ───────────────────────────────────────
  console.log('[seed-all] seeding cabinet templates…');
  for (const [tierCode, rows] of Object.entries(CABINET_TEMPLATES)) {
    for (const row of rows) {
      await CabinetTemplate.create({
        tierCode, roleCode: row.roleCode,
        isMandatory: row.isMandatory, sortOrder: row.sortOrder,
        isActive: true, isSystem: true,
      });
    }
  }

  // ── 3. Event type configs ──────────────────────────────────────
  console.log('[seed-all] seeding event type configs…');
  const MEETING_TYPES = [
    { code: 'GBM', label: 'General Body Meeting',  sortOrder: 10, description: 'Full membership / General Body meeting.' },
    { code: 'EXC', label: 'Executive Meeting',     sortOrder: 20, description: 'Cabinet / executive committee meeting.' },
    { code: 'CMP', label: 'Committee Meeting',     sortOrder: 30, description: 'Extended committee meeting.' },
    { code: 'JRG', label: 'Jirga Meeting',         sortOrder: 40, description: 'Jirga assembly meeting.' },
    { code: 'CNG', label: 'Congress Meeting',      sortOrder: 50, description: 'National Congress assembly meeting.' },
  ];
  const ACTIVITY_TYPES = [
    { code: 'PROTEST',           label: 'Protest',           sortOrder: 10, photoMin: 2 },
    { code: 'JALSA',             label: 'Jalsa',             sortOrder: 20, photoMin: 2 },
    { code: 'CAMPAIGN',          label: 'Campaign',          sortOrder: 30, photoMin: 2 },
    { code: 'SEMINAR',           label: 'Seminar',           sortOrder: 40, photoMin: 0 },
    { code: 'STUDY_CIRCLE',      label: 'Study Circle',      sortOrder: 50, photoMin: 0 },
    { code: 'TASK',              label: 'Task',              sortOrder: 60, photoMin: 0 },
    { code: 'COMMUNITY_SERVICE', label: 'Community Service', sortOrder: 70, photoMin: 0 },
  ];
  for (const t of MEETING_TYPES) {
    await EventTypeConfig.create({
      entity: 'MEETING', code: t.code, label: t.label, description: t.description || '',
      isSystem: true, isActive: true, sortOrder: t.sortOrder,
      appliesTo: { executive: true, committee: true },
      photoPolicy: { required: true, minCount: 1, requireGps: true, requireExif: true },
      workflow: { extraStates: [], finalizeRequiresPhotos: true },
      fields: [], configVersion: 1,
    });
  }
  for (const t of ACTIVITY_TYPES) {
    await EventTypeConfig.create({
      entity: 'ACTIVITY', code: t.code, label: t.label, description: t.description || '',
      isSystem: true, isActive: true, sortOrder: t.sortOrder,
      appliesTo: { executive: true, committee: true },
      photoPolicy: { required: t.photoMin > 0, minCount: t.photoMin, requireGps: true, requireExif: true },
      workflow: { extraStates: [], finalizeRequiresPhotos: false },
      fields: [], configVersion: 1,
    });
  }
  console.log(`[seed-all] ${MEETING_TYPES.length} meeting types, ${ACTIVITY_TYPES.length} activity types`);

  // ── 4. Super Admin ─────────────────────────────────────────────
  console.log('[seed-all] creating admins…');
  const superAdmin = await User.create({
    username: 'super', fullName: 'PNAP Super Admin',
    roles: ['SUPER_ADMIN'], passwordHash: adminHash, isActive: true, isBootstrap: true,
  });

  // ── 5. Central singleton + Central Admin ───────────────────────
  const central = await Central.create({ name: 'PKNAP Central', isActive: true });
  const centralAdmin = await User.create({
    email: 'central@admin.com', username: 'central', fullName: 'Central Admin',
    roles: ['CENTRAL_ADMIN'], passwordHash: adminHash, isActive: true,
  });
  await CabinetSlot.seedFor('CENTRAL', central._id);

  // ── 6. Build org hierarchy + per-level admins ──────────────────
  console.log('[seed-all] building org hierarchy…');

  const allProvinces = [], allDistricts = [], allAreas = [], allBUs = [];
  const provinceAdmins = {}, districtAdmins = {}, areaAdmins = {};

  for (const pd of ORG.provinces) {
    const province = await Province.create({ name: pd.name, code: pd.code });
    allProvinces.push(province);

    const pAdmin = await User.create({
      email: `${slug(pd.name)}@admin.com`,
      username: slug(pd.name),
      fullName: `${pd.name} Province Admin`,
      roles: ['PROVINCE_ADMIN'], passwordHash: adminHash,
      scope: { provinceId: province._id }, isActive: true,
    });
    provinceAdmins[province._id.toString()] = pAdmin;
    await CabinetSlot.seedFor('PROVINCE', province._id);

    for (const dd of pd.districts) {
      const district = await District.create({ name: dd.name, code: dd.code, provinceId: province._id });
      allDistricts.push(district);

      const dAdmin = await User.create({
        email: `${slug(dd.name)}.${slug(pd.code)}@admin.com`,
        username: `${slug(dd.name)}-${slug(pd.code)}`,
        fullName: `${dd.name} District Admin`,
        roles: ['DISTRICT_ADMIN'], passwordHash: adminHash,
        scope: { provinceId: province._id, districtId: district._id }, isActive: true,
      });
      districtAdmins[district._id.toString()] = dAdmin;
      await CabinetSlot.seedFor('DISTRICT', district._id);

      for (const ad of dd.areas) {
        const area = await Area.create({
          name: ad.name, code: ad.code,
          districtId: district._id, provinceId: province._id,
        });
        allAreas.push(area);

        const aAdmin = await User.create({
          email: `${slug(ad.name)}.area@admin.com`,
          username: `${slug(ad.name)}-area`,
          fullName: `${ad.name} Area Admin`,
          roles: ['AREA_ADMIN'], passwordHash: adminHash,
          scope: { provinceId: province._id, districtId: district._id, areaId: area._id },
          isActive: true,
        });
        areaAdmins[area._id.toString()] = aAdmin;
        await CabinetSlot.seedFor('AREA', area._id);

        for (const buName of ad.basicUnits) {
          const bu = await BasicUnit.create({
            name: buName, areaId: area._id,
            districtId: district._id, provinceId: province._id,
          });
          allBUs.push({ bu, area, district, province });
          await CabinetSlot.seedFor('BASIC_UNIT', bu._id);
        }
      }
    }
  }
  console.log(`[seed-all] ${allProvinces.length} provinces, ${allDistricts.length} districts, ${allAreas.length} areas, ${allBUs.length} basic units`);

  // ── 7. Create Members (10 per BU) ─────────────────────────────
  console.log('[seed-all] creating members…');
  const MEMBERS_PER_BU = 10;
  const buMemberSets = {}; // buId → [{member, user}]

  for (const { bu, area, district, province } of allBUs) {
    const set = [];
    for (let i = 0; i < MEMBERS_PER_BU; i++) {
      const idx  = memberCounter;
      const full = memberName(idx);
      const seq  = await Counter.next(`member:${province.code}:${district.code}:2025`);
      const memberId = `PNAP-${province.code}-${district.code}-2025-${String(seq).padStart(6,'0')}`;

      const member = await Member.create({
        memberId,
        fullName: full,
        fatherOrHusbandName: pick(FATHER_NAMES, idx),
        cnic: cnic(idx),
        phone: phone(idx),
        email: `member${idx}@seed.test`,
        username: `m${idx}`,
        gender: idx % 2 === 0 ? 'MALE' : 'FEMALE',
        bloodGroup: pick(BLOOD_GROUPS, idx),
        dateOfBirth: new Date(1975 + (idx % 30), idx % 12, 1),
        dateJoined: new Date(2022, idx % 12, 1),
        address: `House ${idx}, ${area.name}`,
        occupation: pick(OCCUPATIONS, idx),
        education: pick(EDUCATIONS, idx),
        basicUnitId: bu._id,
        areaId: area._id,
        districtId: district._id,
        provinceId: province._id,
        status: 'ACTIVE',
        passwordHash: memberHash,
        lastActivityAt: daysAgo(idx % 30),
        submittedVia: 'ADMIN',
      });

      // Linked User — roles start at ['MEMBER'], cabinet roles added below
      const userAccount = await User.create({
        email: `member${idx}@seed.test`,
        cnic: cnic(idx),
        username: `m${idx}`,
        fullName: full,
        roles: ['MEMBER'],
        passwordHash: memberHash,
        memberId: member._id,
        scope: {
          provinceId: province._id,
          districtId: district._id,
          areaId: area._id,
          basicUnitId: bu._id,
        },
        isActive: true,
      });

      set.push({ member, user: userAccount });
      memberCounter++;
    }
    buMemberSets[bu._id.toString()] = set;
  }
  console.log(`[seed-all] created ${(memberCounter - 1)} members`);

  // ── 8. Cabinet Role Assignments ────────────────────────────────
  // Strategy:
  //   BU cabinet    → members[0..5]  of that BU
  //   Area cabinet  → members[6..7]  from each BU in the area (rotated)
  //   District cab  → members[8..9]  from district's first BU
  //   Province cab  → members[8..9]  from province's first BU of each district
  //   Central cab   → members[8..9]  from ALL provinces first BU
  //
  // This guarantees nobody holds two cabinet roles at the SAME level.
  // Cross-level overlap (e.g. m1 is BU Secretary AND Area member) is fine
  // and realistic for a small org.

  console.log('[seed-all] assigning cabinet roles via raw insert (bypasses hooks)…');

  const raCol = mongoose.connection.db.collection('roleassignments');
  const slotCol = mongoose.connection.db.collection('cabinetslots');
  const userCol = mongoose.connection.db.collection('users');
  const now = new Date();

  // Helper: raw-insert a RoleAssignment + fill slot + patch User.roles
  async function assignRole({ unitLevel, unitId, member, user, roleCode, initiatedBy, decidedBy }) {
    const raId = new ObjectId();
    await raCol.insertOne({
      _id: raId, __v: 0,
      unitLevel, unitId,
      memberId: member._id,
      roleCode,
      state: 'APPROVED',
      startedAt: now,
      initiatedBy: initiatedBy._id,
      decidedBy: decidedBy._id,
      decidedAt: now,
      decisionNote: 'Seeded by seed-all.js',
      initiatedAt: now,
      approvalChain: [],
      createdAt: now, updatedAt: now,
    });
    // Fill the CabinetSlot
    await slotCol.updateOne(
      { unitLevel, unitId, roleCode },
      { $set: { filledByAssignmentId: raId, filledMemberId: member._id, updatedAt: now } }
    );
    // Add roleCode to the User's roles array
    await userCol.updateOne(
      { _id: user._id },
      { $addToSet: { roles: roleCode }, $set: { updatedAt: now } }
    );
  }

  const BU_ROLES       = ['SECRETARY','SENIOR_MAWIN','FINANCE_SECRETARY','PRESS_SECRETARY','CULTURE_SECRETARY','SPORTS_SECRETARY'];
  const AREA_ROLES     = ['SECRETARY','SENIOR_MAWIN','FINANCE_SECRETARY','PRESS_SECRETARY','CULTURE_SECRETARY','SPORTS_SECRETARY'];
  const DISTRICT_ROLES = ['SECRETARY','SENIOR_MAWIN','FINANCE_SECRETARY','PRESS_SECRETARY','CULTURE_SECRETARY','SPORTS_SECRETARY'];
  const PROVINCE_ROLES = ['PRESIDENT','SR_VICE_PRESIDENT','VICE_PRESIDENT','GENERAL_SECRETARY','FINANCE_SECRETARY','PRESS_SECRETARY','CULTURE_SECRETARY','SPORTS_SECRETARY'];
  const CENTRAL_ROLES  = ['CHAIRMAN','CO_CHAIRMAN','SR_VICE_CHAIRMAN','VICE_CHAIRMAN','GENERAL_SECRETARY','FIRST_SECRETARY','FINANCE_SECRETARY','PRESS_SECRETARY','CULTURE_SECRETARY','SPORTS_SECRETARY'];

  // BU cabinet — members 0..5
  for (const { bu, area, district, province } of allBUs) {
    const mset   = buMemberSets[bu._id.toString()];
    const aAdmin = areaAdmins[area._id.toString()];
    for (let i = 0; i < BU_ROLES.length; i++) {
      await assignRole({ unitLevel: 'BASIC_UNIT', unitId: bu._id, member: mset[i].member, user: mset[i].user, roleCode: BU_ROLES[i], initiatedBy: aAdmin, decidedBy: aAdmin });
    }
  }

  // Area cabinet — use members[6..7] from the 2 BUs of this area alternately
  for (const area of allAreas) {
    const aAdmin   = areaAdmins[area._id.toString()];
    const areaBUs  = allBUs.filter(b => b.area._id.toString() === area._id.toString());
    // flatten members 6-9 from all BUs in area to fill area slots
    const pool = areaBUs.flatMap(b => buMemberSets[b.bu._id.toString()].slice(6));
    for (let i = 0; i < Math.min(AREA_ROLES.length, pool.length); i++) {
      await assignRole({ unitLevel: 'AREA', unitId: area._id, member: pool[i].member, user: pool[i].user, roleCode: AREA_ROLES[i], initiatedBy: aAdmin, decidedBy: aAdmin });
    }
    await Area.updateOne({ _id: area._id }, {
      $set: { committee: { formedAt: now, formedBy: aAdmin._id, name: `${area.name} Elaqayi Committee` } },
    });
  }

  // District cabinet — use members[8..9] of the district's first BU
  for (const district of allDistricts) {
    const pAdmin  = provinceAdmins[district.provinceId.toString()];
    const dBUs    = allBUs.filter(b => b.district._id.toString() === district._id.toString());
    const pool    = dBUs.flatMap(b => buMemberSets[b.bu._id.toString()].slice(8));
    for (let i = 0; i < Math.min(DISTRICT_ROLES.length, pool.length); i++) {
      await assignRole({ unitLevel: 'DISTRICT', unitId: district._id, member: pool[i].member, user: pool[i].user, roleCode: DISTRICT_ROLES[i], initiatedBy: pAdmin, decidedBy: pAdmin });
    }
    await District.updateOne({ _id: district._id }, {
      $set: { committee: { formedAt: now, formedBy: pAdmin._id, name: `${district.name} Zilla Committee` } },
    });
  }

  // Province cabinet — one member per district's last BU, member[8]
  for (const province of allProvinces) {
    const pAdmin  = provinceAdmins[province._id.toString()];
    const provBUs = allBUs.filter(b => b.province._id.toString() === province._id.toString());
    const pool    = provBUs.map(b => buMemberSets[b.bu._id.toString()][8]);
    for (let i = 0; i < Math.min(PROVINCE_ROLES.length, pool.length); i++) {
      await assignRole({ unitLevel: 'PROVINCE', unitId: province._id, member: pool[i].member, user: pool[i].user, roleCode: PROVINCE_ROLES[i], initiatedBy: centralAdmin, decidedBy: centralAdmin });
    }
    await Province.updateOne({ _id: province._id }, {
      $set: { committee: { formedAt: now, formedBy: centralAdmin._id, name: `${province.name} Sobayi Committee` } },
    });
  }

  // Central cabinet — member[9] of each BU, cycling through
  const centralPool = allBUs.map(b => buMemberSets[b.bu._id.toString()][9]);
  for (let i = 0; i < Math.min(CENTRAL_ROLES.length, centralPool.length); i++) {
    await assignRole({ unitLevel: 'CENTRAL', unitId: central._id, member: centralPool[i].member, user: centralPool[i].user, roleCode: CENTRAL_ROLES[i], initiatedBy: superAdmin, decidedBy: superAdmin });
  }
  await Central.updateOne({ _id: central._id }, {
    $set: { committee: { formedAt: now, formedBy: superAdmin._id, name: 'PKNAP Central Committee' } },
  });

  const totalRA = await RoleAssignment.countDocuments();
  console.log(`[seed-all] ${totalRA} role assignments created (APPROVED)`);

  // ── 9. Permanent Memberships ───────────────────────────────────
  console.log('[seed-all] creating permanent memberships…');
  for (const area of allAreas) {
    const aAdmin  = areaAdmins[area._id.toString()];
    const areaBUs = allBUs.filter(b => b.area._id.toString() === area._id.toString());
    const pool    = areaBUs.flatMap(b => buMemberSets[b.bu._id.toString()]);
    for (const pm of pool.slice(-2)) { // last 2 members = permanent members
      await PermanentMembership.create({
        unitLevel: 'AREA', unitId: area._id,
        memberId: pm.member._id, nominationNote: 'Seeded permanent member',
        nominatedBy: aAdmin._id, isActive: true,
      });
    }
  }
  for (const province of allProvinces) {
    const pAdmin  = provinceAdmins[province._id.toString()];
    const provBUs = allBUs.filter(b => b.province._id.toString() === province._id.toString());
    const pool    = provBUs.flatMap(b => buMemberSets[b.bu._id.toString()]);
    const pm      = pool[pool.length - 1];
    await PermanentMembership.create({
      unitLevel: 'PROVINCE', unitId: province._id,
      memberId: pm.member._id, nominationNote: 'Seeded permanent provincial member',
      nominatedBy: pAdmin._id, isActive: true,
    });
  }

  // ── 10. Meetings ───────────────────────────────────────────────
  console.log('[seed-all] creating meetings…');

  const MONTHS = ['January','February','March','April','May','June'];
  const MEET_TYPES_BU = ['GBM','EXC','CMP','GBM'];

  for (const { bu, area, district, province } of allBUs) {
    const mset    = buMemberSets[bu._id.toString()];
    const aAdmin  = areaAdmins[area._id.toString()];
    const chair   = mset[0].member._id; // secretary chairs
    const attendance = mset.map(m => ({ memberId: m.member._id, status: m === mset[0] ? 'PRESENT' : (Math.random() > 0.2 ? 'PRESENT' : 'ABSENT') }));

    // 3 finalized meetings (Jan–Mar)
    for (let m = 0; m < 3; m++) {
      const startAt = new Date(`2025-0${m + 1}-10T10:00:00`);
      await Meeting.create({
        unitLevel: 'BASIC_UNIT', unitId: bu._id,
        basicUnitId: bu._id, areaId: area._id, districtId: district._id, provinceId: province._id,
        type: MEET_TYPES_BU[m], typeCode: MEET_TYPES_BU[m],
        body: m === 0 ? 'GENERAL_BODY' : 'EXECUTIVE',
        title: `${MONTHS[m]} Meeting — ${bu.name}`,
        description: `${MONTHS[m]} ${m === 0 ? 'General Body' : 'Executive'} meeting`,
        venue: `${bu.name} Office`,
        startAt, endAt: new Date(startAt.getTime() + 2 * 3600000),
        chairpersonId: chair,
        agenda: `1. Attendance\n2. Reports\n3. ${MONTHS[m]} planning`,
        decisions: `Approved ${MONTHS[m]} budget and action plan`,
        notes: 'Meeting concluded successfully',
        attendance,
        state: 'FINALIZED',
        finalizedAt: new Date(startAt.getTime() + 3 * 3600000),
        finalizedHash: `HASH-${bu._id}-M${m + 1}`,
        createdBy: aAdmin._id,
      });
    }

    // 1 upcoming scheduled GBM
    await Meeting.create({
      unitLevel: 'BASIC_UNIT', unitId: bu._id,
      basicUnitId: bu._id, areaId: area._id, districtId: district._id, provinceId: province._id,
      type: 'GBM', typeCode: 'GBM', body: 'GENERAL_BODY',
      title: `September GBM — ${bu.name}`,
      venue: `${bu.name} Community Hall`,
      startAt: daysAhead(14), endAt: daysAhead(14),
      agenda: '1. Q3 review\n2. Budget approval\n3. Upcoming activities',
      state: 'SCHEDULED',
      createdBy: aAdmin._id,
    });
  }

  // 1 Finalized meeting per Area
  for (const area of allAreas) {
    const aAdmin  = areaAdmins[area._id.toString()];
    const areaBUs = allBUs.filter(b => b.area._id.toString() === area._id.toString());
    const mset    = buMemberSets[areaBUs[0].bu._id.toString()];
    const { district, province } = areaBUs[0];
    await Meeting.create({
      unitLevel: 'AREA', unitId: area._id,
      areaId: area._id, districtId: district._id, provinceId: province._id,
      type: 'EXC', typeCode: 'EXC', body: 'EXECUTIVE',
      title: `Area Executive Meeting — ${area.name}`,
      venue: `${area.name} Office`,
      startAt: daysAgo(60), endAt: new Date(daysAgo(60).getTime() + 2 * 3600000),
      chairpersonId: mset[6].member._id,
      attendance: mset.slice(6).map(m => ({ memberId: m.member._id, status: 'PRESENT' })),
      decisions: 'Coordinated BU activities for Q2',
      state: 'FINALIZED',
      finalizedAt: daysAgo(59),
      finalizedHash: `HASH-AREA-${area._id}`,
      createdBy: aAdmin._id,
    });
  }

  // 1 Finalized meeting per District
  for (const district of allDistricts) {
    const pAdmin  = provinceAdmins[district.provinceId.toString()];
    const distBUs = allBUs.filter(b => b.district._id.toString() === district._id.toString());
    const mset    = buMemberSets[distBUs[0].bu._id.toString()];
    const { province } = distBUs[0];
    await Meeting.create({
      unitLevel: 'DISTRICT', unitId: district._id,
      districtId: district._id, provinceId: province._id,
      type: 'EXC', typeCode: 'EXC', body: 'EXECUTIVE',
      title: `District Cabinet Meeting — ${district.name}`,
      venue: `${district.name} District Office`,
      startAt: daysAgo(45), endAt: new Date(daysAgo(45).getTime() + 2 * 3600000),
      chairpersonId: mset[8].member._id,
      attendance: mset.slice(8).map(m => ({ memberId: m.member._id, status: 'PRESENT' })),
      decisions: 'Approved district budget and reviewed performance reports',
      state: 'FINALIZED',
      finalizedAt: daysAgo(44),
      finalizedHash: `HASH-DIST-${district._id}`,
      createdBy: pAdmin._id,
    });
  }

  // 1 Scheduled meeting per Province
  for (const province of allProvinces) {
    const pAdmin = provinceAdmins[province._id.toString()];
    await Meeting.create({
      unitLevel: 'PROVINCE', unitId: province._id,
      provinceId: province._id,
      type: 'GBM', typeCode: 'GBM', body: 'COMMITTEE',
      title: `Sobayi Committee Meeting — ${province.name}`,
      venue: `${province.name} Province Headquarters`,
      startAt: daysAhead(30), endAt: daysAhead(30),
      agenda: '1. Provincial performance review\n2. Annual budget\n3. Upcoming elections',
      state: 'SCHEDULED',
      createdBy: pAdmin._id,
    });
  }

  const totalMeetings = await Meeting.countDocuments();
  console.log(`[seed-all] ${totalMeetings} meetings created`);

  // ── 11. Activities ─────────────────────────────────────────────
  console.log('[seed-all] creating activities…');

  const ACT_TYPES = ['CAMPAIGN','SEMINAR','COMMUNITY_SERVICE'];

  for (const { bu, area, district, province } of allBUs) {
    const mset   = buMemberSets[bu._id.toString()];
    const aAdmin = areaAdmins[area._id.toString()];

    // COMPLETED campaign (2 months ago)
    await Activity.create({
      unitLevel: 'BASIC_UNIT', unitId: bu._id,
      basicUnitId: bu._id, areaId: area._id, districtId: district._id, provinceId: province._id,
      type: 'CAMPAIGN', typeCode: 'CAMPAIGN', body: 'EXECUTIVE',
      title: `Membership Drive — ${bu.name}`,
      description: 'Door-to-door membership recruitment campaign',
      startAt: daysAgo(60), endAt: daysAgo(59),
      venue: area.name,
      leadMemberId: mset[0].member._id,
      participants: mset.slice(0, 5).map(m => m.member._id),
      externalAttendanceEstimate: 120,
      campaign: { householdsVisited: 60, peopleContacted: 90, pamphletsDistributed: 120, expectedJoiners: 12, actualJoiners: 8, volunteerHours: 40 },
      outcomeNotes: '8 new applications received. Good community response.',
      state: 'COMPLETED',
      createdBy: aAdmin._id,
    });

    // COMPLETED seminar (1 month ago)
    await Activity.create({
      unitLevel: 'BASIC_UNIT', unitId: bu._id,
      basicUnitId: bu._id, areaId: area._id, districtId: district._id, provinceId: province._id,
      type: 'SEMINAR', typeCode: 'SEMINAR', body: 'EXECUTIVE',
      title: `Civic Awareness Seminar — ${bu.name}`,
      description: 'Seminar on civic rights and responsibilities',
      startAt: daysAgo(30), endAt: new Date(daysAgo(30).getTime() + 3 * 3600000),
      venue: `${bu.name} Hall`,
      leadMemberId: mset[1].member._id,
      participants: mset.map(m => m.member._id),
      externalAttendanceEstimate: 45,
      outcomeNotes: 'Positive feedback. 30 externals attended.',
      state: 'COMPLETED',
      createdBy: aAdmin._id,
    });

    // PLANNED upcoming activity
    await Activity.create({
      unitLevel: 'BASIC_UNIT', unitId: bu._id,
      basicUnitId: bu._id, areaId: area._id, districtId: district._id, provinceId: province._id,
      type: 'COMMUNITY_SERVICE', typeCode: 'COMMUNITY_SERVICE', body: 'EXECUTIVE',
      title: `Community Clean-up — ${bu.name}`,
      description: 'Neighbourhood clean-up and tree plantation drive',
      startAt: daysAhead(10),
      venue: `${area.name} Park`,
      leadMemberId: mset[2].member._id,
      participants: mset.slice(0, 6).map(m => m.member._id),
      state: 'PLANNED',
      createdBy: aAdmin._id,
    });
  }

  // 1 Activity per Area (COMPLETED jalsa)
  for (const area of allAreas) {
    const aAdmin  = areaAdmins[area._id.toString()];
    const areaBUs = allBUs.filter(b => b.area._id.toString() === area._id.toString());
    const { district, province } = areaBUs[0];
    const mset = buMemberSets[areaBUs[0].bu._id.toString()];
    await Activity.create({
      unitLevel: 'AREA', unitId: area._id,
      areaId: area._id, districtId: district._id, provinceId: province._id,
      type: 'JALSA', typeCode: 'JALSA', body: 'EXECUTIVE',
      title: `Area Public Gathering — ${area.name}`,
      description: 'Annual public jalsa for area members and community',
      startAt: daysAgo(90), endAt: new Date(daysAgo(90).getTime() + 5 * 3600000),
      venue: `${area.name} Ground`,
      leadMemberId: mset[6].member._id,
      participants: mset.slice(6).map(m => m.member._id),
      externalAttendanceEstimate: 500,
      outcomeNotes: 'Large turnout. Media covered the event.',
      state: 'COMPLETED',
      createdBy: aAdmin._id,
    });
  }

  const totalActivities = await Activity.countDocuments();
  console.log(`[seed-all] ${totalActivities} activities created`);

  // ── 12. Donations ──────────────────────────────────────────────
  console.log('[seed-all] creating donations…');
  let rcpNo = 1;

  for (const { bu, area, district, province } of allBUs) {
    const mset       = buMemberSets[bu._id.toString()];
    const finUser    = mset[2].user; // FINANCE_SECRETARY
    const MONTHS_DON = [1, 2, 3];
    const AMOUNTS    = [1000, 1500, 2500, 500, 3000];

    for (let d = 0; d < 3; d++) {
      await Donation.create({
        unitLevel: 'BASIC_UNIT', unitId: bu._id,
        basicUnitId: bu._id, areaId: area._id, districtId: district._id, provinceId: province._id,
        body: 'EXECUTIVE',
        receiptNo: `RCP-${String(rcpNo).padStart(5,'0')}`,
        fiscalYear: 2025,
        amount: pick(AMOUNTS, rcpNo),
        currency: 'PKR',
        donorType: d < 2 ? 'MEMBER' : 'NON_MEMBER',
        donorMemberId: d < 2 ? mset[d].member._id : undefined,
        donorName: d < 2 ? mset[d].member.fullName : 'Anonymous Donor',
        donorCnic: d < 2 ? mset[d].member.cnic : undefined,
        paymentMode: ['CASH','BANK_TRANSFER','MOBILE_WALLET'][d % 3],
        receivedAt: new Date(`2025-0${MONTHS_DON[d]}-15`),
        note: `Monthly contribution - ${MONTHS[d]}`,
        recordedBy: finUser._id,
      });
      rcpNo++;
    }
  }

  // ── 13. Expenses ───────────────────────────────────────────────
  console.log('[seed-all] creating expenses…');
  const EXP_CATS = ['OFFICE','TRANSPORT','PRINTING','REFRESHMENTS','COMMUNICATION'];

  for (const { bu, area, district, province } of allBUs) {
    const mset   = buMemberSets[bu._id.toString()];
    const aAdmin = areaAdmins[area._id.toString()];
    const finU   = mset[2].user;

    for (let e = 0; e < 2; e++) {
      await Expense.create({
        unitLevel: 'BASIC_UNIT', unitId: bu._id,
        basicUnitId: bu._id, areaId: area._id, districtId: district._id, provinceId: province._id,
        body: 'EXECUTIVE',
        category: pick(EXP_CATS, e),
        description: `${pick(EXP_CATS, e).toLowerCase()} expense for ${bu.name}`,
        amount: [1500, 2500, 800, 1200, 600][e % 5],
        currency: 'PKR',
        incurredAt: daysAgo(30 - e * 10),
        vendor: ['Al-Noor Stationery','City Courier','Fast Print'][e % 3],
        paymentMode: e % 2 === 0 ? 'CASH' : 'BANK_TRANSFER',
        paidByMemberId: mset[0].member._id,
        evidenceUrl: 'https://placeholder.seed/receipt.jpg',
        state: 'APPROVED',
        approvedBy: aAdmin._id,
        approvedAt: daysAgo(29 - e * 10),
        recordedBy: finU._id,
      });
    }
  }

  // ── 14. Fund Transfers ─────────────────────────────────────────
  console.log('[seed-all] creating fund transfers…');
  let trf = 1;

  // BU → Area (one per BU)
  for (const { bu, area, district, province } of allBUs) {
    const mset    = buMemberSets[bu._id.toString()];
    const finUser = mset[2].user;
    const aAdmin  = areaAdmins[area._id.toString()];
    await FundTransfer.create({
      sourceLevel: 'BASIC_UNIT', sourceUnitId: bu._id,
      destinationLevel: 'AREA', destinationUnitId: area._id,
      sourceName: bu.name, destinationName: area.name,
      direction: 'UP',
      basicUnitId: bu._id, areaId: area._id, districtId: district._id, provinceId: province._id,
      body: 'EXECUTIVE',
      amount: 3000 + (trf * 250),
      currency: 'PKR',
      mode: 'BANK_TRANSFER',
      reference: `BU-AREA-${String(trf).padStart(4,'0')}`,
      note: `Monthly surplus from ${bu.name} to ${area.name}`,
      state: 'ACKNOWLEDGED',
      initiatedBy: finUser._id,
      initiatedAt: daysAgo(15),
      acknowledgedAt: daysAgo(12),
      acknowledgedBy: aAdmin._id,
    });
    trf++;
  }

  // Area → District (one per Area)
  for (const area of allAreas) {
    const aAdmin  = areaAdmins[area._id.toString()];
    const areaBUs = allBUs.filter(b => b.area._id.toString() === area._id.toString());
    const { district, province } = areaBUs[0];
    const dAdmin  = districtAdmins[district._id.toString()];
    const finUser = buMemberSets[areaBUs[0].bu._id.toString()][2].user;
    await FundTransfer.create({
      sourceLevel: 'AREA', sourceUnitId: area._id,
      destinationLevel: 'DISTRICT', destinationUnitId: district._id,
      sourceName: area.name, destinationName: district.name,
      direction: 'UP',
      areaId: area._id, districtId: district._id, provinceId: province._id,
      body: 'EXECUTIVE',
      amount: 8000 + (trf * 500),
      currency: 'PKR',
      mode: 'BANK_TRANSFER',
      reference: `AREA-DIST-${String(trf).padStart(4,'0')}`,
      note: `Quarterly levy from ${area.name} to ${district.name}`,
      state: 'PENDING_ACK',
      initiatedBy: finUser._id,
      initiatedAt: daysAgo(3),
    });
    trf++;
  }

  const totalFT = await FundTransfer.countDocuments();
  console.log(`[seed-all] ${totalFT} fund transfers created`);

  // ── 15. Responsibilities ───────────────────────────────────────
  console.log('[seed-all] creating responsibilities…');
  const TASKS = [
    'Distribute pamphlets in the area',
    'Collect monthly membership fees',
    'Conduct voter registration outreach',
    'Organize next GBM logistics',
    'Submit monthly performance report',
    'Recruit 3 new members this month',
    'Attend district-level training session',
    'Coordinate with area admin on campaign',
    'Prepare financial statement for Q3',
    'Follow up on pending member applications',
  ];

  for (const { bu, area, district, province } of allBUs) {
    const mset   = buMemberSets[bu._id.toString()];
    const aAdmin = areaAdmins[area._id.toString()];
    for (let i = 0; i < mset.length; i++) {
      await Responsibility.create({
        unitLevel: 'BASIC_UNIT', unitId: bu._id,
        basicUnitId: bu._id, areaId: area._id, districtId: district._id, provinceId: province._id,
        title: pick(TASKS, i),
        description: `Assigned to ${mset[i].member.fullName}`,
        dueDate: daysAhead(14 + i * 3),
        assignedToMemberId: mset[i].member._id,
        assignedByUserId: aAdmin._id,
        state: i === 0 ? 'IN_PROGRESS' : i === 1 ? 'COMPLETED' : 'PENDING',
        completionNote: i === 1 ? 'Completed on time. All fees collected.' : undefined,
        completedAt: i === 1 ? daysAgo(5) : undefined,
      });
    }
  }

  // ── 16. Announcements ──────────────────────────────────────────
  console.log('[seed-all] creating announcements…');

  for (const province of allProvinces) {
    const pAdmin = provinceAdmins[province._id.toString()];
    await Announcement.create({
      authorUserId: pAdmin._id, authorName: pAdmin.fullName,
      title: `Q3 Reporting Deadline — ${province.name}`,
      body: `All district and area admins must submit Q3 performance reports by 30 September 2025. Non-compliance will be escalated.`,
      unitLevel: 'PROVINCE', unitId: province._id, provinceId: province._id,
      scope: 'SUBTREE', pinned: true, expiresAt: new Date('2025-09-30'),
    });

    await Announcement.create({
      authorUserId: pAdmin._id, authorName: pAdmin.fullName,
      title: `New Member Registration Drive — ${province.name}`,
      body: `Each basic unit must recruit a minimum of 5 new members before October. Incentive awards will be given to top-performing units.`,
      unitLevel: 'PROVINCE', unitId: province._id, provinceId: province._id,
      scope: 'SUBTREE', pinned: false, expiresAt: new Date('2025-10-31'),
    });
  }

  await Announcement.create({
    authorUserId: centralAdmin._id, authorName: 'Central Admin',
    title: 'PKNAP National Convention 2025 — Save the Date',
    body: 'The PKNAP National Convention will be held on 15 November 2025 in Islamabad. All provincial presidents and general secretaries must confirm attendance by 31 October.',
    unitLevel: 'CENTRAL', unitId: central._id,
    scope: 'GLOBAL', pinned: true, expiresAt: new Date('2025-11-15'),
  });

  // ── Final Summary ──────────────────────────────────────────────
  const counts = {
    roles:               await Role.countDocuments(),
    eventTypeConfigs:    await EventTypeConfig.countDocuments(),
    cabinetTemplates:    await CabinetTemplate.countDocuments(),
    users:               await User.countDocuments(),
    members:             await Member.countDocuments(),
    provinces:           await Province.countDocuments(),
    districts:           await District.countDocuments(),
    areas:               await Area.countDocuments(),
    basicUnits:          await BasicUnit.countDocuments(),
    cabinetSlots:        await CabinetSlot.countDocuments(),
    roleAssignments:     await RoleAssignment.countDocuments(),
    meetings:            await Meeting.countDocuments(),
    activities:          await Activity.countDocuments(),
    donations:           await Donation.countDocuments(),
    expenses:            await Expense.countDocuments(),
    fundTransfers:       await FundTransfer.countDocuments(),
    responsibilities:    await Responsibility.countDocuments(),
    permanentMemberships: await PermanentMembership.countDocuments(),
    announcements:       await Announcement.countDocuments(),
  };

  console.log('\n[seed-all] ════════════════════════════════════════════');
  console.log('[seed-all] SEED COMPLETE — Database Summary:');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(26)} ${v}`);
  }
  console.log('[seed-all] ════════════════════════════════════════════');

  console.log('\n[seed-all] ADMIN ACCOUNTS (password: 123456):');
  console.log('  username=super                 Super Admin');
  console.log('  email=central@admin.com        Central Admin');
  for (const p of allProvinces) {
    console.log(`  email=${slug(p.name)}@admin.com`.padEnd(40) + `${p.name} Province Admin`);
  }
  for (const d of allDistricts) {
    const p = allProvinces.find(pr => pr._id.toString() === d.provinceId.toString());
    console.log(`  email=${slug(d.name)}.${slug(p.code)}@admin.com`.padEnd(40) + `${d.name} District Admin`);
  }
  for (const a of allAreas) {
    console.log(`  email=${slug(a.name)}.area@admin.com`.padEnd(40) + `${a.name} Area Admin`);
  }

  console.log(`\n[seed-all] MEMBER ACCOUNTS (password: Member@123):`);
  console.log(`  email=member1@seed.test … member${memberCounter - 1}@seed.test`);
  console.log(`  username=m1 … m${memberCounter - 1}`);
  console.log('[seed-all] Done.\n');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('[seed-all] FATAL:', err);
  process.exit(1);
});
