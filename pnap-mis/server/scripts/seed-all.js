#!/usr/bin/env node
/**
 * PNAP-MIS Master Full Seed Script
 * ================================
 * Wipes the database and re-populates it with a comprehensive, fully-linked dataset.
 *
 * Provinces:
 *   1. Khyber Pakhtunkhwa (Code: KP)
 *   2. Junubi Pakhtunkhwa (Balochistan) (Code: JPK)
 *
 * Full Hierarchy:
 *   Central → 2 Provinces → 4 Districts each (8 total) → 2 Areas each (16 total) → 2 Basic Units each (32 total)
 *
 * Populates:
 *   - Admins at every level (Super, Central, Province, District, Area) with password "123456"
 *   - 10 Members per Basic Unit = 320 members total, with linked User accounts
 *   - Full Cabinet at Central, Province, District, Area, and Basic Unit levels
 *   - 1st National Congress record & nominated Congress Delegates
 *   - Central Qomi Jirga & Provincial Sobayi Jirgas with nominated Jirga Members
 *   - Multi-stream Meetings (EXECUTIVE, COMMITTEE, JIRGA, CONGRESS) with GPS coordinates (SCHEDULED & FINALIZED)
 *   - Multi-stream Activities (EXECUTIVE, COMMITTEE, JIRGA, CONGRESS) (COMPLETED & PLANNED)
 *   - Multi-stream Donations across all bodies with healthy balances
 *   - Multi-stream Expenses with approval chains, evidence URLs, and categories
 *   - Multi-tier Inter-Unit Fund Transfers (ACKNOWLEDGED, PENDING_ACK, REJECTED)
 *   - Permanent Memberships, Announcements, and Responsibilities
 *
 * Execution:
 *   node server/scripts/seed-all.js           # DRY RUN (shows summary plan)
 *   node server/scripts/seed-all.js --yes     # WIPE & SEED DATABASE
 *
 * Passwords:
 *   All Admin accounts : 123456
 *   All Member accounts: Member@123
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

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
const Congress            = require('../src/models/Congress');
const CongressMember      = require('../src/models/CongressMember');
const JirgaMember         = require('../src/models/JirgaMember');
const Responsibility      = require('../src/models/Responsibility');
const PermanentMembership = require('../src/models/PermanentMembership');
const Announcement        = require('../src/models/Announcement');
const Counter             = require('../src/models/Counter');
const Role                = require('../src/models/Role');
const EventTypeConfig     = require('../src/models/EventTypeConfig');
const UnitTierConfig      = require('../src/models/UnitTierConfig');
const UnitPolicy          = require('../src/models/UnitPolicy');
const WorkflowConfig      = require('../src/models/WorkflowConfig');
const PerformanceRuleSet  = require('../src/models/PerformanceRuleSet');
const SystemSettings      = require('../src/models/SystemSettings');
const { DEFAULT_PERMISSIONS } = require('../src/utils/permissions');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis';
const CONFIRMED = process.argv.includes('--yes');
const ADMIN_PW  = '123456';
const MEMBER_PW = 'Member@123';

let adminHash, memberHash;

// ── Helper Utilities ───────────────────────────────────────────────
const slug = (n) => String(n).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const cnic = (n) => `35201-${String(n).padStart(7, '0')}-1`;
const phone = (n) => `0300${String(n).padStart(7, '0')}`;
const daysAgo = (d) => new Date(Date.now() - d * 86400000);
const daysAhead = (d) => new Date(Date.now() + d * 86400000);
const pick = (arr, i) => arr[i % arr.length];

const FIRST_NAMES  = [
  'Bacha', 'Mirwais', 'Asfandiyar', 'Zarghoon', 'Sher Dil', 'Malak', 'Khushal', 'Ahmad Shah',
  'Abdul Samad', 'Attaullah', 'Mehmood', 'Dost', 'Gul', 'Kareem', 'Sardar', 'Nasrullah',
  'Zmarai', 'Dawood', 'Jamal', 'Shahid', 'Bilal', 'Tariq', 'Kamran', 'Nasir',
  'Fatima', 'Palwasha', 'Zarmina', 'Bibi', 'Spogmai', 'Khatol', 'Nadia', 'Maryam'
];
const LAST_NAMES   = [
  'Kakar', 'Tareen', 'Achakzai', 'Mandokhail', 'Yousafzai', 'Khattak', 'Afridi', 'Mohmand',
  'Wazir', 'Marwat', 'Shinwari', 'Bangash', 'Orakzai', 'Durrani', 'Ghilzai', 'Luni'
];
const FATHER_NAMES = [
  'Khan Shaheed Abdul Samad Khan', 'Malak Sardar Khan', 'Haji Noor Mohammad', 'Ghulam Haider Khan',
  'Sardar Khair Bakhsh', 'Nawab Akbar Khan', 'Mir Afzal Khan', 'Haji Gul Mohammad',
  'Bashir Ahmad Khan', 'Nek Mohammad Kakar'
];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const OCCUPATIONS  = ['Advocate / Lawyer', 'Lecturer / Professor', 'Agriculturalist', 'Trader / Businessman', 'Civil Engineer', 'Medical Doctor', 'Social Organizer', 'Writer / Journalist'];
const EDUCATIONS   = ['LL.B / LL.M', 'Master of Arts', 'Bachelor of Science', 'M.Phil Political Science', 'MBBS', 'Matric / Intermediate'];

let memberCounter = 1;
const memberName = (i) => `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i)}`;

async function wipe() {
  const db = mongoose.connection.db;
  const cols = await db.listCollections().toArray();
  for (const c of cols) await db.collection(c.name).drop().catch(() => {});
  console.log(`[wipe] Dropped ${cols.length} collection(s).`);
}

// ── Role & Cabinet Metadata ─────────────────────────────────────────
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

// ── Target Two-Province Organization Structure ──────────────────────
const ORG = {
  provinces: [
    {
      name: 'Khyber Pakhtunkhwa',
      code: 'KP',
      districts: [
        {
          name: 'Peshawar', code: 'PSH',
          areas: [
            { name: 'Hayatabad',       code: 'HB', basicUnits: ['Hayatabad Phase 1', 'Hayatabad Phase 2'] },
            { name: 'University Town', code: 'UT', basicUnits: ['UT Block 1', 'UT Block 2'] },
          ],
        },
        {
          name: 'Mardan', code: 'MRD',
          areas: [
            { name: 'Mardan City', code: 'MC', basicUnits: ['MC Unit A', 'MC Unit B'] },
            { name: 'Rustam',      code: 'RT', basicUnits: ['Rustam Unit 1', 'Rustam Unit 2'] },
          ],
        },
        {
          name: 'Swat', code: 'SWT',
          areas: [
            { name: 'Mingora', code: 'MG', basicUnits: ['Mingora Unit 1', 'Mingora Unit 2'] },
            { name: 'Barikot', code: 'BK', basicUnits: ['Barikot Unit 1', 'Barikot Unit 2'] },
          ],
        },
        {
          name: 'Bannu', code: 'BNU',
          areas: [
            { name: 'Bannu City', code: 'BC', basicUnits: ['Bannu City Unit 1', 'Bannu City Unit 2'] },
            { name: 'Township',   code: 'TS', basicUnits: ['Township Unit 1', 'Township Unit 2'] },
          ],
        },
      ],
    },
    {
      name: 'Junubi Pakhtunkhwa (Balochistan)',
      code: 'JPK',
      districts: [
        {
          name: 'Quetta', code: 'QTA',
          areas: [
            { name: 'Satellite Town', code: 'ST', basicUnits: ['ST Block A', 'ST Block B'] },
            { name: 'Cantt',          code: 'CN', basicUnits: ['Cantt Unit 1', 'Cantt Unit 2'] },
          ],
        },
        {
          name: 'Pishin', code: 'PSN',
          areas: [
            { name: 'Pishin Bazar', code: 'PB', basicUnits: ['Bazar Unit 1', 'Bazar Unit 2'] },
            { name: 'Yaru',         code: 'YR', basicUnits: ['Yaru Unit 1', 'Yaru Unit 2'] },
          ],
        },
        {
          name: 'Chaman', code: 'CHM',
          areas: [
            { name: 'Chaman City', code: 'CC', basicUnits: ['CC Unit 1', 'CC Unit 2'] },
            { name: 'Boghra',      code: 'BG', basicUnits: ['Boghra Unit 1', 'Boghra Unit 2'] },
          ],
        },
        {
          name: 'Zhob', code: 'ZHB',
          areas: [
            { name: 'Zhob City', code: 'ZC', basicUnits: ['ZC Unit 1', 'ZC Unit 2'] },
            { name: 'Appozai',   code: 'AP', basicUnits: ['Appozai Unit 1', 'Appozai Unit 2'] },
          ],
        },
      ],
    },
  ],
};

// ── GPS Coordinates Catalog ────────────────────────────────────────
const GPS = {
  ISLAMABAD: { lat: 33.6844, lng: 73.0479, venue: 'Jinnah Convention Centre, Islamabad' },
  PESHAWAR:  { lat: 34.0151, lng: 71.5249, venue: 'Bacha Khan Markaz, Peshawar' },
  MARDAN:    { lat: 34.1989, lng: 72.0403, venue: 'District Party Secretariat, Mardan' },
  SWAT:      { lat: 35.2227, lng: 72.4258, venue: 'Swat Press Club Hall, Mingora' },
  BANNU:     { lat: 32.9861, lng: 70.6042, venue: 'Town Hall Auditorium, Bannu' },
  QUETTA:    { lat: 30.1798, lng: 66.9750, venue: 'Central Party Secretariat, Quetta' },
  PISHIN:    { lat: 30.5833, lng: 67.0000, venue: 'Malak Sardar Memorial Hall, Pishin' },
  CHAMAN:    { lat: 30.9167, lng: 66.4500, venue: 'Border Trade Union Complex, Chaman' },
  ZHOB:      { lat: 31.3417, lng: 69.4486, venue: 'Appozai Community Ground, Zhob' },
};

// ── Execution Entrypoint ───────────────────────────────────────────
async function run() {
  console.log('[seed-all] Connecting to MongoDB:', MONGO_URI);
  await mongoose.connect(MONGO_URI, { autoIndex: true });

  if (!CONFIRMED) {
    console.log('\n[seed-all] DRY RUN MODE — Planned changes:');
    console.log('  Provinces: 2 (Khyber Pakhtunkhwa & Junubi Pakhtunkhwa (Balochistan))');
    console.log('  Districts: 8 (4 in KP, 4 in JPK)');
    console.log('  Areas    : 16 (8 in KP, 8 in JPK)');
    console.log('  Units    : 32 Basic Units');
    console.log('  Members  : 320 Active Members with linked User accounts');
    console.log('  Admins   : Super Admin, Central Admin, 2 Province Admins, 8 District Admins, 16 Area Admins');
    console.log('  Bodies   : Congress, Jirga, Committee, Executive populated across all tiers');
    console.log('\nTo execute, run:\n  node server/scripts/seed-all.js --yes\n');
    await mongoose.disconnect();
    return;
  }

  // ── 0. Complete Clean Wipe ────────────────────────────────────────
  console.log('[seed-all] Wiping database collections...');
  await wipe();

  console.log('[seed-all] Pre-hashing standard passwords...');
  [adminHash, memberHash] = await Promise.all([
    bcrypt.hash(ADMIN_PW, 10),
    bcrypt.hash(MEMBER_PW, 10),
  ]);

  // ── 1. Roles & Permissions ────────────────────────────────────────
  console.log('[seed-all] Seeding Role catalogue...');
  for (const r of ROLE_CATALOGUE) {
    await Role.create({
      code: r.code,
      label: r.label,
      permissions: DEFAULT_PERMISSIONS[r.code] || [],
      isActive: true,
      isSystem: true,
    });
  }

  // ── 2. Cabinet Templates ──────────────────────────────────────────
  console.log('[seed-all] Seeding Cabinet templates (termDays: 0)...');
  for (const [tierCode, rows] of Object.entries(CABINET_TEMPLATES)) {
    for (const row of rows) {
      await CabinetTemplate.create({
        tierCode,
        roleCode: row.roleCode,
        isMandatory: row.isMandatory,
        sortOrder: row.sortOrder,
        appliesToBody: 'BOTH',
        termDays: 0,
        isActive: true,
        isSystem: true,
      });
    }
  }

  // ── 3. Event Type Configs ─────────────────────────────────────────
  console.log('[seed-all] Seeding Event Type configurations...');
  const MEETING_TYPES = [
    { code: 'GBM', label: 'General Body Meeting',  sortOrder: 10, description: 'Full membership / General Body meeting.' },
    { code: 'EXC', label: 'Executive Meeting',     sortOrder: 20, description: 'Cabinet / executive committee meeting.' },
    { code: 'CMP', label: 'Committee Meeting',     sortOrder: 30, description: 'Extended committee meeting.' },
    { code: 'JRG', label: 'Jirga Meeting',         sortOrder: 40, description: 'Jirga consultative assembly.' },
    { code: 'CNG', label: 'Congress Meeting',      sortOrder: 50, description: 'National Congress assembly sitting.' },
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
      photoPolicy: { required: false, minCount: 0, requireGps: false, requireExif: false },
      workflow: { extraStates: [], finalizeRequiresPhotos: false },
      fields: [], configVersion: 1,
    });
  }
  for (const t of ACTIVITY_TYPES) {
    await EventTypeConfig.create({
      entity: 'ACTIVITY', code: t.code, label: t.label, description: t.description || '',
      isSystem: true, isActive: true, sortOrder: t.sortOrder,
      appliesTo: { executive: true, committee: true },
      photoPolicy: { required: t.photoMin > 0, minCount: t.photoMin, requireGps: false, requireExif: false },
      workflow: { extraStates: [], finalizeRequiresPhotos: false },
      fields: [], configVersion: 1,
    });
  }

  // ── 4. Super Admin & Central Singleton ────────────────────────────
  console.log('[seed-all] Creating Super Admin & Central Admin...');
  const superAdmin = await User.create({
    username: 'super',
    email: 'super@admin.com',
    fullName: 'PNAP Super Admin',
    roles: ['SUPER_ADMIN'],
    passwordHash: adminHash,
    isActive: true,
    isBootstrap: true,
  });

  const central = await Central.create({ name: 'PKNAP Central', isActive: true });
  const centralAdmin = await User.create({
    username: 'central',
    email: 'central@admin.com',
    fullName: 'PKNAP Central Admin',
    roles: ['CENTRAL_ADMIN'],
    passwordHash: adminHash,
    isActive: true,
  });
  await CabinetSlot.seedFor('CENTRAL', central._id);

  // ── 5. Build Organization Hierarchy & Admins ──────────────────────
  console.log('[seed-all] Building 2-Province Organization Hierarchy...');
  const allProvinces = [], allDistricts = [], allAreas = [], allBUs = [];
  const provinceAdmins = {}, districtAdmins = {}, areaAdmins = {};

  for (const pd of ORG.provinces) {
    const province = await Province.create({ name: pd.name, code: pd.code, isActive: true });
    allProvinces.push(province);

    const isKP = pd.code === 'KP';
    const pUsername = isKP ? 'kpk' : 'balochistan';
    const pEmail = isKP ? 'kp@admin.com' : 'jpk@admin.com';

    const pAdmin = await User.create({
      email: pEmail,
      username: pUsername,
      fullName: `${pd.name} Provincial Admin`,
      roles: ['PROVINCE_ADMIN'],
      passwordHash: adminHash,
      scope: { provinceId: province._id },
      isActive: true,
    });
    provinceAdmins[province._id.toString()] = pAdmin;
    await CabinetSlot.seedFor('PROVINCE', province._id);

    for (const dd of pd.districts) {
      const district = await District.create({
        name: dd.name,
        code: dd.code,
        provinceId: province._id,
        isActive: true,
      });
      allDistricts.push(district);

      const dAdmin = await User.create({
        email: `district.${slug(dd.name)}@admin.com`,
        username: `district_${slug(dd.name)}`,
        fullName: `${dd.name} District Admin`,
        roles: ['DISTRICT_ADMIN'],
        passwordHash: adminHash,
        scope: { provinceId: province._id, districtId: district._id },
        isActive: true,
      });
      districtAdmins[district._id.toString()] = dAdmin;
      await CabinetSlot.seedFor('DISTRICT', district._id);

      for (const ad of dd.areas) {
        const area = await Area.create({
          name: ad.name,
          code: ad.code,
          districtId: district._id,
          provinceId: province._id,
          isActive: true,
        });
        allAreas.push(area);

        const aAdmin = await User.create({
          email: `area.${slug(ad.name)}@admin.com`,
          username: `area_${slug(ad.name)}`,
          fullName: `${ad.name} Area Admin`,
          roles: ['AREA_ADMIN'],
          passwordHash: adminHash,
          scope: { provinceId: province._id, districtId: district._id, areaId: area._id },
          isActive: true,
        });
        areaAdmins[area._id.toString()] = aAdmin;
        await CabinetSlot.seedFor('AREA', area._id);

        for (const buName of ad.basicUnits) {
          const bu = await BasicUnit.create({
            name: buName,
            areaId: area._id,
            districtId: district._id,
            provinceId: province._id,
            isActive: true,
          });
          allBUs.push({ bu, area, district, province });
          await CabinetSlot.seedFor('BASIC_UNIT', bu._id);
        }
      }
    }
  }

  console.log(`  ✓ Created ${allProvinces.length} provinces, ${allDistricts.length} districts, ${allAreas.length} areas, ${allBUs.length} basic units.`);

  // ── 6. Create Active Members & User Accounts ───────────────────────
  console.log('[seed-all] Creating 10 Members per Basic Unit (320 members total)...');
  const MEMBERS_PER_BU = 10;
  const buMemberSets = {}; // buId -> [{ member, user }]
  const allMembers = [];

  for (const { bu, area, district, province } of allBUs) {
    const set = [];
    for (let i = 0; i < MEMBERS_PER_BU; i++) {
      const idx = memberCounter;
      const full = memberName(idx);
      const seq = await Counter.next(`member:${province.code}:${district.code}:2026`);
      const memberId = `PNAP-${province.code}-${district.code}-2026-${String(seq).padStart(6, '0')}`;
      const memCnic = cnic(idx);
      const memPhone = phone(idx);
      const memUsername = `m${idx}`;
      const memEmail = `member${idx}@seed.test`;

      const member = await Member.create({
        memberId,
        fullName: full,
        fatherOrHusbandName: pick(FATHER_NAMES, idx),
        cnic: memCnic,
        phone: memPhone,
        email: memEmail,
        username: memUsername,
        gender: idx % 3 === 0 ? 'FEMALE' : 'MALE',
        bloodGroup: pick(BLOOD_GROUPS, idx),
        dateOfBirth: new Date(1975 + (idx % 30), idx % 12, 1),
        dateJoined: daysAgo(365 + (idx % 300)),
        address: `House ${idx}, Ward 4, ${area.name}, ${district.name}`,
        occupation: pick(OCCUPATIONS, idx),
        education: pick(EDUCATIONS, idx),
        basicUnitId: bu._id,
        areaId: area._id,
        districtId: district._id,
        provinceId: province._id,
        status: 'ACTIVE',
        passwordHash: memberHash,
        lastActivityAt: daysAgo(idx % 25),
        submittedVia: 'ADMIN',
      });

      const userAccount = await User.create({
        email: memEmail,
        cnic: memCnic,
        username: memUsername,
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
      allMembers.push(member);
      memberCounter++;
    }
    buMemberSets[bu._id.toString()] = set;
  }

  console.log(`  ✓ Created ${allMembers.length} active party members with linked user accounts.`);

  // ── 7. Populate Cabinet Slots & Approved Role Assignments ─────────
  console.log('[seed-all] Assigning approved cabinet positions...');
  const raCol = mongoose.connection.db.collection('roleassignments');
  const slotCol = mongoose.connection.db.collection('cabinetslots');
  const userCol = mongoose.connection.db.collection('users');
  const now = new Date();
  const recentStart = daysAgo(15);

  async function assignRole({ unitLevel, unitId, member, user, roleCode, initiatedBy, decidedBy }) {
    const raId = new ObjectId();
    await raCol.insertOne({
      _id: raId, __v: 0,
      unitLevel, unitId,
      memberId: member._id,
      roleCode,
      state: 'APPROVED',
      startedAt: recentStart,
      initiatedBy: initiatedBy._id,
      decidedBy: decidedBy._id,
      decidedAt: recentStart,
      decisionNote: 'Officially approved organizational assignment.',
      initiatedAt: daysAgo(20),
      approvalChain: [],
      createdAt: recentStart, updatedAt: now,
    });

    await slotCol.updateOne(
      { unitLevel, unitId, roleCode },
      { $set: { filledByAssignmentId: raId, filledMemberId: member._id, updatedAt: now } }
    );

    await userCol.updateOne(
      { _id: user._id },
      { $addToSet: { roles: roleCode }, $set: { updatedAt: now } }
    );
  }

  const BU_ROLES       = ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY', 'PRESS_SECRETARY', 'CULTURE_SECRETARY', 'SPORTS_SECRETARY'];
  const AREA_ROLES     = ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY', 'PRESS_SECRETARY', 'CULTURE_SECRETARY', 'SPORTS_SECRETARY'];
  const DISTRICT_ROLES = ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY', 'PRESS_SECRETARY', 'CULTURE_SECRETARY', 'SPORTS_SECRETARY'];
  const PROVINCE_ROLES = ['PRESIDENT', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY', 'FINANCE_SECRETARY', 'PRESS_SECRETARY', 'CULTURE_SECRETARY', 'SPORTS_SECRETARY'];
  const CENTRAL_ROLES  = ['CHAIRMAN', 'CO_CHAIRMAN', 'SR_VICE_CHAIRMAN', 'VICE_CHAIRMAN', 'GENERAL_SECRETARY', 'FIRST_SECRETARY', 'FINANCE_SECRETARY', 'PRESS_SECRETARY', 'CULTURE_SECRETARY', 'SPORTS_SECRETARY'];

  // BU Cabinets (members 0..5 of each BU)
  for (const { bu, area } of allBUs) {
    const mset = buMemberSets[bu._id.toString()];
    const aAdmin = areaAdmins[area._id.toString()];
    for (let i = 0; i < BU_ROLES.length; i++) {
      await assignRole({ unitLevel: 'BASIC_UNIT', unitId: bu._id, member: mset[i].member, user: mset[i].user, roleCode: BU_ROLES[i], initiatedBy: aAdmin, decidedBy: aAdmin });
    }
  }

  // Area Cabinets (members 6..7 across the 2 BUs of each Area)
  for (const area of allAreas) {
    const aAdmin = areaAdmins[area._id.toString()];
    const areaBUs = allBUs.filter(b => b.area._id.toString() === area._id.toString());
    const pool = areaBUs.flatMap(b => buMemberSets[b.bu._id.toString()].slice(6));
    for (let i = 0; i < Math.min(AREA_ROLES.length, pool.length); i++) {
      await assignRole({ unitLevel: 'AREA', unitId: area._id, member: pool[i].member, user: pool[i].user, roleCode: AREA_ROLES[i], initiatedBy: aAdmin, decidedBy: aAdmin });
    }
    await Area.updateOne({ _id: area._id }, {
      $set: { committee: { formedAt: daysAgo(40), formedBy: aAdmin._id, name: `${area.name} Elaqayi Committee` } },
    });
  }

  // District Cabinets (members 8..9 across BUs in District)
  for (const district of allDistricts) {
    const pAdmin = provinceAdmins[district.provinceId.toString()];
    const dBUs = allBUs.filter(b => b.district._id.toString() === district._id.toString());
    const pool = dBUs.flatMap(b => buMemberSets[b.bu._id.toString()].slice(8));
    for (let i = 0; i < Math.min(DISTRICT_ROLES.length, pool.length); i++) {
      await assignRole({ unitLevel: 'DISTRICT', unitId: district._id, member: pool[i].member, user: pool[i].user, roleCode: DISTRICT_ROLES[i], initiatedBy: pAdmin, decidedBy: pAdmin });
    }
    await District.updateOne({ _id: district._id }, {
      $set: { committee: { formedAt: daysAgo(50), formedBy: pAdmin._id, name: `${district.name} Zilla Committee` } },
    });
  }

  // Provincial Cabinets (dedicated pool across provincial BUs)
  for (const province of allProvinces) {
    const provBUs = allBUs.filter(b => b.province._id.toString() === province._id.toString());
    const pool = provBUs.map(b => buMemberSets[b.bu._id.toString()][8]);
    for (let i = 0; i < Math.min(PROVINCE_ROLES.length, pool.length); i++) {
      await assignRole({ unitLevel: 'PROVINCE', unitId: province._id, member: pool[i].member, user: pool[i].user, roleCode: PROVINCE_ROLES[i], initiatedBy: centralAdmin, decidedBy: centralAdmin });
    }
    await Province.updateOne({ _id: province._id }, {
      $set: { committee: { formedAt: daysAgo(60), formedBy: centralAdmin._id, name: `${province.name} Sobayi Committee` } },
    });
  }

  // Central Cabinet (cross-provincial senior member pool)
  const centralPool = allBUs.map(b => buMemberSets[b.bu._id.toString()][9]);
  for (let i = 0; i < Math.min(CENTRAL_ROLES.length, centralPool.length); i++) {
    await assignRole({ unitLevel: 'CENTRAL', unitId: central._id, member: centralPool[i].member, user: centralPool[i].user, roleCode: CENTRAL_ROLES[i], initiatedBy: superAdmin, decidedBy: superAdmin });
  }
  await Central.updateOne({ _id: central._id }, {
    $set: { committee: { formedAt: daysAgo(90), formedBy: superAdmin._id, name: 'PKNAP Central Committee' } },
  });

  const totalRA = await RoleAssignment.countDocuments();
  console.log(`  ✓ Assigned ${totalRA} active cabinet positions.`);

  // ── 8. National Congress & Jirga Assemblies ───────────────────────
  console.log('[seed-all] Setting up National Congress & Jirga Assemblies...');

  // National Congress
  const congress = await Congress.create({
    label: '1st National Congress (Awwalin Milli Congress)',
    heldOn: daysAgo(120),
    venue: GPS.ISLAMABAD.venue,
    notes: 'Supreme National Assembly convening delegates from Khyber Pakhtunkhwa and Junubi Pakhtunkhwa (Balochistan).',
    isActive: true,
    createdBy: superAdmin._id,
  });

  // Nominate 24 delegates from KP and JPK to National Congress
  const congressDelegates = allMembers.slice(0, 24);
  for (const mem of congressDelegates) {
    const prov = allProvinces.find(p => p._id.toString() === mem.provinceId.toString());
    await CongressMember.create({
      unitLevel: 'CENTRAL',
      unitId: central._id,
      memberId: mem._id,
      assignedRoleSnapshot: {
        roleCode: 'CONGRESS_DELEGATE',
        customRoleName: 'National Congress Delegate',
        unitLevel: 'PROVINCE',
        unitId: mem.provinceId,
        unitName: prov ? prov.name : 'Province',
      },
      nominationNote: `Elected delegate representing constituents from ${prov ? prov.name : 'the province'}.`,
      assignedBy: centralAdmin._id,
      assignedAt: daysAgo(130),
      isActive: true,
    });
  }

  // Central Qomi Jirga (16 members from both provinces)
  const centralJirgaMembers = allMembers.slice(24, 40);
  for (const mem of centralJirgaMembers) {
    await JirgaMember.create({
      unitLevel: 'CENTRAL',
      unitId: central._id,
      memberId: mem._id,
      nominationNote: 'Distinguished elder nominated to the Central Qomi Jirga for peace and reconciliation.',
      assignedBy: centralAdmin._id,
      assignedAt: daysAgo(140),
      isActive: true,
    });
  }

  // Sobayi Jirgas (12 members for KP, 12 members for JPK)
  for (const province of allProvinces) {
    const provMembers = allMembers.filter(m => m.provinceId.toString() === province._id.toString()).slice(10, 22);
    const pAdmin = provinceAdmins[province._id.toString()];
    for (const mem of provMembers) {
      await JirgaMember.create({
        unitLevel: 'PROVINCE',
        unitId: province._id,
        memberId: mem._id,
        nominationNote: `Nominated elder to the ${province.name} Sobayi Jirga.`,
        assignedBy: pAdmin._id,
        assignedAt: daysAgo(135),
        isActive: true,
      });
    }
  }

  console.log('  ✓ Created National Congress record with delegates & Provincial Sobayi Jirgas.');

  // ── 9. Multi-Stream Meetings ──────────────────────────────────────
  console.log('[seed-all] Creating Multi-Stream Meetings (Congress, Jirga, Committee, Executive)...');

  function makeAttendance(membersList, count = 8) {
    return membersList.slice(0, count).map((m, idx) => ({
      memberId: m._id,
      status: idx === 0 ? 'PRESENT' : (idx % 5 === 0 ? 'ABSENT' : 'PRESENT'),
    }));
  }

  // A. Central Meetings
  await Meeting.create({
    unitLevel: 'CENTRAL',
    unitId: central._id,
    type: 'CNG', typeCode: 'CNG', body: 'CONGRESS',
    title: 'National Congress Supreme Assembly Session - Plenary Deliberations',
    description: 'Convening all elected provincial delegates from KP and Junubi Pakhtunkhwa to debate party manifesto and provincial autonomy charter.',
    venue: GPS.ISLAMABAD.venue,
    gps: { lat: GPS.ISLAMABAD.lat, lng: GPS.ISLAMABAD.lng },
    startAt: daysAgo(120),
    endAt: new Date(daysAgo(120).getTime() + 6 * 3600000),
    agenda: '1. Presidential Opening Address\n2. Political & Economic Rights Resolution\n3. Adoption of Organizational By-laws',
    decisions: '1. Unanimously adopted the Peoples Rights Resolution.\n2. Formed regional organizing task forces.',
    upcomingStrategy: 'Organize regional congress rallies across Junubi Pakhtunkhwa and Khyber Pakhtunkhwa.',
    state: 'FINALIZED',
    chairpersonId: congressDelegates[0]._id,
    attendance: makeAttendance(congressDelegates, 20),
    createdBy: superAdmin._id,
  });

  await Meeting.create({
    unitLevel: 'CENTRAL',
    unitId: central._id,
    type: 'CNG', typeCode: 'CNG', body: 'CONGRESS',
    title: 'National Congress Implementation & Strategy Review',
    description: 'Follow-up sitting evaluating the progress of Congress mandates and regional organizing.',
    venue: GPS.ISLAMABAD.venue,
    gps: { lat: GPS.ISLAMABAD.lat, lng: GPS.ISLAMABAD.lng },
    startAt: daysAhead(20),
    endAt: new Date(daysAhead(20).getTime() + 4 * 3600000),
    agenda: '1. Review of Congress resolution roll-out\n2. Central audit committee report',
    state: 'SCHEDULED',
    chairpersonId: congressDelegates[1]._id,
    attendance: [],
    createdBy: centralAdmin._id,
  });

  await Meeting.create({
    unitLevel: 'CENTRAL',
    unitId: central._id,
    type: 'JRG', typeCode: 'JRG', body: 'JIRGA',
    title: 'Markazi Qomi Jirga - National Peace & Resources Assembly',
    description: 'Grand consultative assembly with tribal leaders and jurists on peace, water rights, and resource ownership.',
    venue: GPS.ISLAMABAD.venue,
    gps: { lat: GPS.ISLAMABAD.lat, lng: GPS.ISLAMABAD.lng },
    startAt: daysAgo(75),
    endAt: new Date(daysAgo(75).getTime() + 5 * 3600000),
    agenda: '1. Regional peace & border trade facilitation\n2. National consensus on resource distribution',
    decisions: 'Adopted the Qomi Jirga Declaration calling for peaceful coexistence and fair mineral resource shares.',
    state: 'FINALIZED',
    chairpersonId: centralJirgaMembers[0]._id,
    attendance: makeAttendance(centralJirgaMembers, 14),
    createdBy: centralAdmin._id,
  });

  await Meeting.create({
    unitLevel: 'CENTRAL',
    unitId: central._id,
    type: 'CMP', typeCode: 'CMP', body: 'COMMITTEE',
    title: 'Central Working Committee - Quarterly Performance Review',
    description: 'Quarterly assembly of provincial presidents, general secretaries, and central executive.',
    venue: GPS.ISLAMABAD.venue,
    gps: { lat: GPS.ISLAMABAD.lat, lng: GPS.ISLAMABAD.lng },
    startAt: daysAgo(40),
    endAt: new Date(daysAgo(40).getTime() + 4 * 3600000),
    agenda: '1. Provincial membership expansion review\n2. Financial audit and central budget allocation',
    decisions: 'Approved special operational grants for Khyber Pakhtunkhwa and Junubi Pakhtunkhwa.',
    state: 'FINALIZED',
    chairpersonId: centralPool[0].member._id,
    attendance: makeAttendance(allMembers, 12),
    createdBy: centralAdmin._id,
  });

  // B. Provincial Meetings (for both KP and JPK)
  for (const province of allProvinces) {
    const isKP = province.code === 'KP';
    const coords = isKP ? GPS.PESHAWAR : GPS.QUETTA;
    const pAdmin = provinceAdmins[province._id.toString()];
    const provMembers = allMembers.filter(m => m.provinceId.toString() === province._id.toString());

    // Sobayi Jirga
    await Meeting.create({
      unitLevel: 'PROVINCE',
      unitId: province._id,
      provinceId: province._id,
      type: 'JRG', typeCode: 'JRG', body: 'JIRGA',
      title: `Sobayi Jirga ${province.name} - Regional Rights & Consultation Assembly`,
      description: `Grand consultative assembly addressing local trade, mineral rights, and community reconciliation in ${province.name}.`,
      venue: coords.venue,
      gps: { lat: coords.lat, lng: coords.lng },
      startAt: daysAgo(35),
      endAt: new Date(daysAgo(35).getTime() + 4 * 3600000),
      agenda: '1. Regional trade crossing hurdles\n2. Local land dispute reconciliations\n3. Youth employment representation',
      decisions: 'Formed a 5-member delegation to engage government officials on cross-border trade facilities.',
      state: 'FINALIZED',
      chairpersonId: provMembers[2]._id,
      attendance: makeAttendance(provMembers, 12),
      createdBy: pAdmin._id,
    });

    // Sobayi Committee
    await Meeting.create({
      unitLevel: 'PROVINCE',
      unitId: province._id,
      provinceId: province._id,
      type: 'CMP', typeCode: 'CMP', body: 'COMMITTEE',
      title: `Sobayi Committee ${province.name} - Strategy & Organizational Review`,
      description: `Comprehensive review of district organizing committees and membership drives across ${province.name}.`,
      venue: coords.venue,
      gps: { lat: coords.lat, lng: coords.lng },
      startAt: daysAgo(20),
      endAt: new Date(daysAgo(20).getTime() + 3 * 3600000),
      agenda: '1. District membership target evaluation\n2. Provincial rally preparations',
      decisions: 'Sanctioned district tour itineraries for the provincial leadership.',
      state: 'FINALIZED',
      chairpersonId: provMembers[0]._id,
      attendance: makeAttendance(provMembers, 10),
      createdBy: pAdmin._id,
    });

    // Provincial Cabinet Executive
    await Meeting.create({
      unitLevel: 'PROVINCE',
      unitId: province._id,
      provinceId: province._id,
      type: 'EXC', typeCode: 'EXC', body: 'EXECUTIVE',
      title: `Provincial Cabinet Executive Sitting - ${province.name}`,
      description: `Monthly executive cabinet session for ${province.name}.`,
      venue: coords.venue,
      gps: { lat: coords.lat, lng: coords.lng },
      startAt: daysAgo(10),
      endAt: new Date(daysAgo(10).getTime() + 2 * 3600000),
      agenda: '1. Financial disbursement verification\n2. Media response coordination',
      decisions: 'Approved monthly operating expenditures.',
      state: 'FINALIZED',
      chairpersonId: provMembers[1]._id,
      attendance: makeAttendance(provMembers, 8),
      createdBy: pAdmin._id,
    });

    // Upcoming Provincial Scheduled Meeting
    await Meeting.create({
      unitLevel: 'PROVINCE',
      unitId: province._id,
      provinceId: province._id,
      type: 'CMP', typeCode: 'CMP', body: 'COMMITTEE',
      title: `Sobayi Committee ${province.name} - Annual General Assembly`,
      description: 'Annual gathering of all district officeholders.',
      venue: coords.venue,
      gps: { lat: coords.lat, lng: coords.lng },
      startAt: daysAhead(18),
      endAt: new Date(daysAhead(18).getTime() + 4 * 3600000),
      agenda: '1. Review of annual organizational accomplishments\n2. Approval of 2027 fiscal roadmap',
      state: 'SCHEDULED',
      chairpersonId: provMembers[0]._id,
      attendance: [],
      createdBy: pAdmin._id,
    });
  }

  // C. District, Area & Basic Unit Meetings
  for (const district of allDistricts) {
    const pAdmin = provinceAdmins[district.provinceId.toString()];
    const dMembers = allMembers.filter(m => m.districtId.toString() === district._id.toString());
    const dGps = GPS[district.name.toUpperCase()] || GPS.QUETTA;

    await Meeting.create({
      unitLevel: 'DISTRICT',
      unitId: district._id,
      districtId: district._id,
      provinceId: district.provinceId,
      type: 'EXC', typeCode: 'EXC', body: 'EXECUTIVE',
      title: `District Cabinet Executive Session — ${district.name}`,
      venue: `${district.name} District Secretariat`,
      gps: { lat: dGps.lat, lng: dGps.lng },
      startAt: daysAgo(25),
      endAt: new Date(daysAgo(25).getTime() + 2 * 3600000),
      chairpersonId: dMembers[0]?._id,
      attendance: makeAttendance(dMembers, 8),
      decisions: `Approved local action plan for ${district.name}.`,
      state: 'FINALIZED',
      createdBy: pAdmin._id,
    });
  }

  for (const { bu, area, district, province } of allBUs) {
    const mset = buMemberSets[bu._id.toString()];
    const aAdmin = areaAdmins[area._id.toString()];

    // BU Finalized General Body Meeting
    await Meeting.create({
      unitLevel: 'BASIC_UNIT',
      unitId: bu._id,
      basicUnitId: bu._id, areaId: area._id, districtId: district._id, provinceId: province._id,
      type: 'GBM', typeCode: 'GBM', body: 'GENERAL_BODY',
      title: `General Body Meeting — ${bu.name}`,
      description: `Monthly general assembly for members of ${bu.name}.`,
      venue: `${bu.name} Community Hall`,
      gps: { lat: GPS.QUETTA.lat, lng: GPS.QUETTA.lng },
      startAt: daysAgo(14),
      endAt: new Date(daysAgo(14).getTime() + 2 * 3600000),
      chairpersonId: mset[0].member._id,
      attendance: makeAttendance(mset.map(x => x.member), 10),
      decisions: 'Enrolled new volunteers and verified monthly dues.',
      state: 'FINALIZED',
      createdBy: aAdmin._id,
    });

    // BU Scheduled Meeting
    await Meeting.create({
      unitLevel: 'BASIC_UNIT',
      unitId: bu._id,
      basicUnitId: bu._id, areaId: area._id, districtId: district._id, provinceId: province._id,
      type: 'EXC', typeCode: 'EXC', body: 'EXECUTIVE',
      title: `Executive Cabinet Sitting — ${bu.name}`,
      venue: `${bu.name} Office`,
      gps: { lat: GPS.QUETTA.lat, lng: GPS.QUETTA.lng },
      startAt: daysAhead(12),
      endAt: new Date(daysAhead(12).getTime() + 2 * 3600000),
      agenda: '1. Review of local grievances\n2. Preparation for community service week',
      state: 'SCHEDULED',
      createdBy: aAdmin._id,
    });
  }

  const totalMeetings = await Meeting.countDocuments();
  console.log(`  ✓ Created ${totalMeetings} multi-stream meetings across all tiers.`);

  // ── 10. Multi-Stream Activities ───────────────────────────────────
  console.log('[seed-all] Creating Multi-Stream Activities & Public Campaigns...');

  // Central Activities
  await Activity.create({
    unitLevel: 'CENTRAL',
    unitId: central._id,
    type: 'JALSA', typeCode: 'JALSA', body: 'CONGRESS',
    title: 'National Congress Mass Public Gathering',
    description: 'Mammoth public gathering following the conclusion of the 1st National Congress proceedings.',
    venue: GPS.ISLAMABAD.venue,
    gps: { lat: GPS.ISLAMABAD.lat, lng: GPS.ISLAMABAD.lng },
    startAt: daysAgo(118),
    endAt: new Date(daysAgo(118).getTime() + 5 * 3600000),
    leadMemberId: congressDelegates[0]._id,
    externalAttendanceEstimate: 8500,
    outcomeNotes: 'Historic national gathering with overwhelming public participation and media coverage.',
    state: 'COMPLETED',
    createdBy: superAdmin._id,
  });

  await Activity.create({
    unitLevel: 'CENTRAL',
    unitId: central._id,
    type: 'SEMINAR', typeCode: 'SEMINAR', body: 'JIRGA',
    title: 'National Conference on Peace, Border Trade & Constitutional Rights',
    description: 'Intellectual and tribal elders panel on cross-border economic rights.',
    venue: GPS.ISLAMABAD.venue,
    gps: { lat: GPS.ISLAMABAD.lat, lng: GPS.ISLAMABAD.lng },
    startAt: daysAgo(70),
    endAt: new Date(daysAgo(70).getTime() + 4 * 3600000),
    leadMemberId: centralJirgaMembers[1]._id,
    externalAttendanceEstimate: 450,
    outcomeNotes: 'Comprehensive policy brief submitted to federal authorities.',
    state: 'COMPLETED',
    createdBy: centralAdmin._id,
  });

  // Provincial Activities
  for (const province of allProvinces) {
    const isKP = province.code === 'KP';
    const coords = isKP ? GPS.PESHAWAR : GPS.QUETTA;
    const pAdmin = provinceAdmins[province._id.toString()];
    const provMembers = allMembers.filter(m => m.provinceId.toString() === province._id.toString());

    await Activity.create({
      unitLevel: 'PROVINCE',
      unitId: province._id,
      provinceId: province._id,
      type: 'JALSA', typeCode: 'JALSA', body: 'EXECUTIVE',
      title: `Public Rally for Democratic Rights & Autonomy - ${province.name}`,
      description: `Grand public rally addressed by the party provincial leadership in ${coords.venue}.`,
      venue: coords.venue,
      gps: { lat: coords.lat, lng: coords.lng },
      startAt: daysAgo(28),
      endAt: new Date(daysAgo(28).getTime() + 4 * 3600000),
      leadMemberId: provMembers[0]._id,
      externalAttendanceEstimate: 4200,
      outcomeNotes: 'Massive delegate and citizen attendance. Resolutions passed unanimously.',
      state: 'COMPLETED',
      createdBy: pAdmin._id,
    });

    await Activity.create({
      unitLevel: 'PROVINCE',
      unitId: province._id,
      provinceId: province._id,
      type: 'PROTEST', typeCode: 'PROTEST', body: 'COMMITTEE',
      title: `Protest Demonstration Against Inflation & Load-Shedding - ${province.name}`,
      description: 'Peaceful protest demonstration for basic utilities and public rights.',
      venue: `${province.name} Press Club`,
      gps: { lat: coords.lat, lng: coords.lng },
      startAt: daysAgo(14),
      endAt: new Date(daysAgo(14).getTime() + 3 * 3600000),
      leadMemberId: provMembers[1]._id,
      externalAttendanceEstimate: 1200,
      outcomeNotes: 'Memorandum handed over to the district administration.',
      state: 'COMPLETED',
      createdBy: pAdmin._id,
    });

    await Activity.create({
      unitLevel: 'PROVINCE',
      unitId: province._id,
      provinceId: province._id,
      type: 'CAMPAIGN', typeCode: 'CAMPAIGN', body: 'EXECUTIVE',
      title: `Provincial Youth Ideological Training Workshop - ${province.name}`,
      description: 'Training future community organizers in constitutional rights and organization management.',
      venue: coords.venue,
      gps: { lat: coords.lat, lng: coords.lng },
      startAt: daysAhead(15),
      leadMemberId: provMembers[2]._id,
      state: 'PLANNED',
      createdBy: pAdmin._id,
    });
  }

  // Basic Unit Activities
  for (const { bu, area, district, province } of allBUs) {
    const mset = buMemberSets[bu._id.toString()];
    const aAdmin = areaAdmins[area._id.toString()];

    await Activity.create({
      unitLevel: 'BASIC_UNIT',
      unitId: bu._id,
      basicUnitId: bu._id, areaId: area._id, districtId: district._id, provinceId: province._id,
      type: 'CAMPAIGN', typeCode: 'CAMPAIGN', body: 'EXECUTIVE',
      title: `Door-to-Door Public Outreach — ${bu.name}`,
      description: 'Community listening campaign and voter registration awareness.',
      startAt: daysAgo(21),
      endAt: daysAgo(20),
      venue: area.name,
      leadMemberId: mset[0].member._id,
      participants: mset.slice(0, 5).map(x => x.member._id),
      externalAttendanceEstimate: 160,
      campaign: { householdsVisited: 85, peopleContacted: 120, pamphletsDistributed: 180, expectedJoiners: 15, actualJoiners: 11, volunteerHours: 48 },
      outcomeNotes: '11 new membership applications submitted.',
      state: 'COMPLETED',
      createdBy: aAdmin._id,
    });
  }

  const totalActivities = await Activity.countDocuments();
  console.log(`  ✓ Created ${totalActivities} multi-stream activities across all tiers.`);

  // ── 11. Multi-Stream Finance: Donations & Expenses ────────────────
  console.log('[seed-all] Creating Multi-Stream Donations & Expenses with healthy ledger balances...');
  let rcpCounter = 1;

  // A. Central Donations & Expenses
  const CENTRAL_DONATIONS = [
    { body: 'EXECUTIVE', amount: 500000, donorType: 'CORPORATE', donorName: 'Central Founders Trust & Overseas Patronate', mode: 'BANK_TRANSFER', note: 'Central party capital endowment and operational reserve fund' },
    { body: 'CONGRESS',  amount: 250000, donorType: 'CORPORATE', donorName: 'Pakhtun Traders Association Islamabad', mode: 'BANK_TRANSFER', note: 'National Congress logistics and venue sponsorship' },
    { body: 'CONGRESS',  amount: 150000, donorType: 'CORPORATE', donorName: 'National Chamber of Commerce & Industry', mode: 'BANK_TRANSFER', note: 'Congress policy papers sponsorship' },
    { body: 'CONGRESS',  amount: 100000, donorType: 'MEMBER', donorMemberId: allMembers[0]._id, donorName: allMembers[0].fullName, donorCnic: allMembers[0].cnic, mode: 'BANK_TRANSFER', note: 'Central leadership special congress donation' },
    { body: 'JIRGA',     amount: 85000,  donorType: 'NON_MEMBER', donorName: 'Malik Sardar Khan Tareen', mode: 'BANK_TRANSFER', note: 'Qomi Jirga traditional peace arbitration logistics' },
    { body: 'COMMITTEE', amount: 75000,  donorType: 'MEMBER', donorMemberId: allMembers[1]._id, donorName: allMembers[1].fullName, donorCnic: allMembers[1].cnic, mode: 'BANK_TRANSFER', note: 'Central Working Committee subscription' },
    { body: 'EXECUTIVE', amount: 150000, donorType: 'CORPORATE', donorName: 'Overseas Workers Solidarity Fund', mode: 'BANK_TRANSFER', note: 'Party central operational account grant' },
  ];

  for (const cd of CENTRAL_DONATIONS) {
    await Donation.create({
      unitLevel: 'CENTRAL',
      unitId: central._id,
      body: cd.body,
      receiptNo: `REC-2026-${String(rcpCounter++).padStart(5, '0')}`,
      fiscalYear: 2026,
      amount: cd.amount,
      currency: 'PKR',
      donorType: cd.donorType,
      donorMemberId: cd.donorMemberId,
      donorName: cd.donorName,
      donorCnic: cd.donorCnic || '42101-1234567-1',
      paymentMode: cd.mode,
      receivedAt: daysAgo(60),
      note: cd.note,
      recordedBy: centralAdmin._id,
    });
  }

  const CENTRAL_EXPENSES = [
    { body: 'CONGRESS',  category: 'STAGE_EQUIPMENT', amount: 120000, desc: 'Convention Centre sound system, LED screens and stage hire', mode: 'BANK_TRANSFER', state: 'APPROVED' },
    { body: 'CONGRESS',  category: 'REFRESHMENTS',    amount: 65000,  desc: 'Delegate hospitality and tea arrangements at Congress', mode: 'CASH', state: 'APPROVED' },
    { body: 'JIRGA',     category: 'TRANSPORT',      amount: 35000,  desc: 'Travel subsidy for tribal elders attending Qomi Jirga', mode: 'BANK_TRANSFER', state: 'APPROVED' },
    { body: 'EXECUTIVE', category: 'OFFICE',         amount: 45000,  desc: 'Central Secretariat internet, stationary, and utility bills', mode: 'BANK_TRANSFER', state: 'APPROVED' },
    { body: 'EXECUTIVE', category: 'PRINTING',       amount: 30000,  desc: 'Printing of ideological manifestos and constitution booklets', mode: 'BANK_TRANSFER', state: 'APPROVED' },
  ];

  for (const ce of CENTRAL_EXPENSES) {
    await Expense.create({
      unitLevel: 'CENTRAL',
      unitId: central._id,
      body: ce.body,
      category: ce.category,
      description: ce.desc,
      amount: ce.amount,
      currency: 'PKR',
      incurredAt: daysAgo(45),
      paymentMode: ce.mode,
      evidenceUrl: 'uploads/demo-receipt.jpg',
      state: ce.state,
      approvedBy: superAdmin._id,
      approvedAt: daysAgo(44),
      recordedBy: centralAdmin._id,
    });
  }

  // B. Provincial Donations & Expenses (for KP and JPK)
  for (const province of allProvinces) {
    const pAdmin = provinceAdmins[province._id.toString()];
    const provMembers = allMembers.filter(m => m.provinceId.toString() === province._id.toString());

    const PROV_DONATIONS = [
      { body: 'JIRGA',     amount: 70000, donorType: 'MEMBER', donorMemberId: provMembers[2]._id, donorName: provMembers[2].fullName, donorCnic: provMembers[2].cnic, mode: 'CASH', note: `Sobayi Jirga ${province.name} delegate hospitality` },
      { body: 'COMMITTEE', amount: 50000, donorType: 'MEMBER', donorMemberId: provMembers[3]._id, donorName: provMembers[3].fullName, donorCnic: provMembers[3].cnic, mode: 'BANK_TRANSFER', note: `${province.name} Committee campaign fund` },
      { body: 'EXECUTIVE', amount: 90000, donorType: 'MEMBER', donorMemberId: provMembers[4]._id, donorName: provMembers[4].fullName, donorCnic: provMembers[4].cnic, mode: 'BANK_TRANSFER', note: `${province.name} provincial executive operational dues` },
    ];

    for (const pd of PROV_DONATIONS) {
      await Donation.create({
        unitLevel: 'PROVINCE',
        unitId: province._id,
        provinceId: province._id,
        body: pd.body,
        receiptNo: `REC-2026-${String(rcpCounter++).padStart(5, '0')}`,
        fiscalYear: 2026,
        amount: pd.amount,
        currency: 'PKR',
        donorType: pd.donorType,
        donorMemberId: pd.donorMemberId,
        donorName: pd.donorName,
        donorCnic: pd.donorCnic,
        paymentMode: pd.mode,
        receivedAt: daysAgo(30),
        note: pd.note,
        recordedBy: pAdmin._id,
      });
    }

    const PROV_EXPENSES = [
      { body: 'EXECUTIVE', category: 'OFFICE',      amount: 35000, desc: `Provincial office rent and logistics - ${province.name}`, mode: 'BANK_TRANSFER', state: 'APPROVED' },
      { body: 'JIRGA',     category: 'REFRESHMENTS', amount: 20000, desc: `Sobayi Jirga session lunch and hospitality`, mode: 'CASH', state: 'APPROVED' },
      { body: 'COMMITTEE', category: 'PRINTING',     amount: 15000, desc: `Rally banners and pamphlet printing`, mode: 'BANK_TRANSFER', state: 'APPROVED' },
    ];

    for (const pe of PROV_EXPENSES) {
      await Expense.create({
        unitLevel: 'PROVINCE',
        unitId: province._id,
        provinceId: province._id,
        body: pe.body,
        category: pe.category,
        description: pe.desc,
        amount: pe.amount,
        currency: 'PKR',
        incurredAt: daysAgo(25),
        paymentMode: pe.mode,
        evidenceUrl: 'uploads/demo-receipt.jpg',
        state: pe.state,
        approvedBy: centralAdmin._id,
        approvedAt: daysAgo(24),
        recordedBy: pAdmin._id,
      });
    }
  }

  // C. Basic Unit Donations & Expenses
  for (const { bu, area, district, province } of allBUs) {
    const mset = buMemberSets[bu._id.toString()];
    const aAdmin = areaAdmins[area._id.toString()];
    const finSecretaryUser = mset[2].user;

    // 2 Donations per BU
    for (let d = 0; d < 2; d++) {
      await Donation.create({
        unitLevel: 'BASIC_UNIT',
        unitId: bu._id,
        basicUnitId: bu._id, areaId: area._id, districtId: district._id, provinceId: province._id,
        body: 'EXECUTIVE',
        receiptNo: `REC-2026-${String(rcpCounter++).padStart(5, '0')}`,
        fiscalYear: 2026,
        amount: [5000, 7500, 10000][(rcpCounter + d) % 3],
        currency: 'PKR',
        donorType: 'MEMBER',
        donorMemberId: mset[d].member._id,
        donorName: mset[d].member.fullName,
        donorCnic: mset[d].member.cnic,
        paymentMode: d === 0 ? 'CASH' : 'BANK_TRANSFER',
        receivedAt: daysAgo(20 + d * 5),
        note: `Monthly membership subscription - ${bu.name}`,
        recordedBy: finSecretaryUser._id,
      });
    }

    // 1 Approved Expense per BU
    await Expense.create({
      unitLevel: 'BASIC_UNIT',
      unitId: bu._id,
      basicUnitId: bu._id, areaId: area._id, districtId: district._id, provinceId: province._id,
      body: 'EXECUTIVE',
      category: 'OFFICE',
      description: `Meeting venue rental and tea for ${bu.name}`,
      amount: 2500,
      currency: 'PKR',
      incurredAt: daysAgo(12),
      paymentMode: 'CASH',
      evidenceUrl: 'uploads/demo-receipt.jpg',
      state: 'APPROVED',
      approvedBy: aAdmin._id,
      approvedAt: daysAgo(11),
      recordedBy: finSecretaryUser._id,
    });
  }

  const totalDonations = await Donation.countDocuments();
  const totalExpenses = await Expense.countDocuments();
  console.log(`  ✓ Created ${totalDonations} donations and ${totalExpenses} expenses.`);

  // ── 12. Inter-Tier Fund Transfers ─────────────────────────────────
  console.log('[seed-all] Creating Multi-Tier Fund Transfers (Central ↔ Province ↔ District ↔ Area ↔ Unit)...');

  const jpkProvince = allProvinces.find(p => p.code === 'JPK');
  const kpProvince  = allProvinces.find(p => p.code === 'KP');
  const jpkAdmin    = provinceAdmins[jpkProvince._id.toString()];
  const kpAdmin     = provinceAdmins[kpProvince._id.toString()];

  const quettaDistrict   = allDistricts.find(d => d.name === 'Quetta');
  const peshawarDistrict = allDistricts.find(d => d.name === 'Peshawar');
  const quettaAdmin      = districtAdmins[quettaDistrict._id.toString()];
  const peshawarAdmin    = districtAdmins[peshawarDistrict._id.toString()];

  const stArea = allAreas.find(a => a.name === 'Satellite Town');
  const hbArea = allAreas.find(a => a.name === 'Hayatabad');
  const stAdmin = areaAdmins[stArea._id.toString()];
  const hbAdmin = areaAdmins[hbArea._id.toString()];

  const TRANSFER_SPECS = [
    // 1. Central -> Junubi Pakhtunkhwa (DOWN, ACKNOWLEDGED)
    {
      body: 'EXECUTIVE',
      sourceLevel: 'CENTRAL', sourceUnitId: central._id, sourceName: central.name,
      destinationLevel: 'PROVINCE', destinationUnitId: jpkProvince._id, destinationName: jpkProvince.name,
      direction: 'DOWN', amount: 150000, mode: 'BANK_TRANSFER', reference: 'FT-2026-0001',
      note: 'Central administrative subvention for Junubi Pakhtunkhwa Secretariat',
      state: 'ACKNOWLEDGED', initiatedDaysAgo: 40, ackDaysAgo: 38,
      initiatedBy: centralAdmin._id, acknowledgedBy: jpkAdmin._id,
      decNote: 'Received and verified into provincial treasury accounts.',
    },
    // 2. Central -> Khyber Pakhtunkhwa (DOWN, ACKNOWLEDGED)
    {
      body: 'EXECUTIVE',
      sourceLevel: 'CENTRAL', sourceUnitId: central._id, sourceName: central.name,
      destinationLevel: 'PROVINCE', destinationUnitId: kpProvince._id, destinationName: kpProvince.name,
      direction: 'DOWN', amount: 150000, mode: 'BANK_TRANSFER', reference: 'FT-2026-0002',
      note: 'Central operational grant for Khyber Pakhtunkhwa Secretariat',
      state: 'ACKNOWLEDGED', initiatedDaysAgo: 40, ackDaysAgo: 38,
      initiatedBy: centralAdmin._id, acknowledgedBy: kpAdmin._id,
      decNote: 'Received and verified into KP provincial operational funds.',
    },
    // 3. Central -> Junubi Pakhtunkhwa (JIRGA stream, ACKNOWLEDGED)
    {
      body: 'JIRGA',
      sourceLevel: 'CENTRAL', sourceUnitId: central._id, sourceName: central.name,
      destinationLevel: 'PROVINCE', destinationUnitId: jpkProvince._id, destinationName: jpkProvince.name,
      direction: 'DOWN', amount: 60000, mode: 'BANK_TRANSFER', reference: 'FT-2026-0003',
      note: 'Markazi subvention for Sobayi Jirga Quetta arbitration logistics',
      state: 'ACKNOWLEDGED', initiatedDaysAgo: 30, ackDaysAgo: 29,
      initiatedBy: centralAdmin._id, acknowledgedBy: jpkAdmin._id,
      decNote: 'Acknowledged and added to Sobayi Jirga operational books.',
    },
    // 4. Central -> Khyber Pakhtunkhwa (JIRGA stream, ACKNOWLEDGED)
    {
      body: 'JIRGA',
      sourceLevel: 'CENTRAL', sourceUnitId: central._id, sourceName: central.name,
      destinationLevel: 'PROVINCE', destinationUnitId: kpProvince._id, destinationName: kpProvince.name,
      direction: 'DOWN', amount: 60000, mode: 'BANK_TRANSFER', reference: 'FT-2026-0004',
      note: 'Special grant for Khyber Pakhtunkhwa Tribal Jirga delegate hospitality',
      state: 'ACKNOWLEDGED', initiatedDaysAgo: 30, ackDaysAgo: 29,
      initiatedBy: centralAdmin._id, acknowledgedBy: kpAdmin._id,
      decNote: 'Acknowledged into KP Jirga accounts.',
    },
    // 5. Inter-Provincial Solidarity Grant: JPK -> KP (SAME_TIER, ACKNOWLEDGED)
    {
      body: 'EXECUTIVE',
      sourceLevel: 'PROVINCE', sourceUnitId: jpkProvince._id, sourceName: jpkProvince.name,
      destinationLevel: 'PROVINCE', destinationUnitId: kpProvince._id, destinationName: kpProvince.name,
      direction: 'SAME_TIER', amount: 35000, mode: 'BANK_TRANSFER', reference: 'FT-2026-0005',
      note: 'Inter-provincial solidarity grant: Junubi Pakhtunkhwa to KP flood relief workers',
      state: 'ACKNOWLEDGED', initiatedDaysAgo: 22, ackDaysAgo: 21,
      initiatedBy: jpkAdmin._id, acknowledgedBy: kpAdmin._id,
      decNote: 'Received with profound gratitude from fraternal provincial chapter.',
    },
    // 6. Junubi Pakhtunkhwa -> Quetta District (DOWN, ACKNOWLEDGED)
    {
      body: 'EXECUTIVE',
      sourceLevel: 'PROVINCE', sourceUnitId: jpkProvince._id, sourceName: jpkProvince.name,
      destinationLevel: 'DISTRICT', destinationUnitId: quettaDistrict._id, destinationName: quettaDistrict.name,
      direction: 'DOWN', amount: 50000, mode: 'BANK_TRANSFER', reference: 'FT-2026-0006',
      note: 'Disbursement of quarterly district fund to Quetta East',
      state: 'ACKNOWLEDGED', initiatedDaysAgo: 18, ackDaysAgo: 17,
      initiatedBy: jpkAdmin._id, acknowledgedBy: quettaAdmin._id,
      decNote: 'Received into Quetta District account.',
    },
    // 7. Khyber Pakhtunkhwa -> Peshawar District (DOWN, ACKNOWLEDGED)
    {
      body: 'EXECUTIVE',
      sourceLevel: 'PROVINCE', sourceUnitId: kpProvince._id, sourceName: kpProvince.name,
      destinationLevel: 'DISTRICT', destinationUnitId: peshawarDistrict._id, destinationName: peshawarDistrict.name,
      direction: 'DOWN', amount: 50000, mode: 'BANK_TRANSFER', reference: 'FT-2026-0007',
      note: 'Quarterly district organizational support for Peshawar District',
      state: 'ACKNOWLEDGED', initiatedDaysAgo: 18, ackDaysAgo: 17,
      initiatedBy: kpAdmin._id, acknowledgedBy: peshawarAdmin._id,
      decNote: 'Received into Peshawar District account.',
    },
    // 8. Quetta District -> Satellite Town Area (DOWN, ACKNOWLEDGED)
    {
      body: 'EXECUTIVE',
      sourceLevel: 'DISTRICT', sourceUnitId: quettaDistrict._id, sourceName: quettaDistrict.name,
      destinationLevel: 'AREA', destinationUnitId: stArea._id, destinationName: stArea.name,
      direction: 'DOWN', amount: 20000, mode: 'BANK_TRANSFER', reference: 'FT-2026-0008',
      note: 'Elaqayi organizational expansion support for Satellite Town',
      state: 'ACKNOWLEDGED', initiatedDaysAgo: 12, ackDaysAgo: 11,
      initiatedBy: quettaAdmin._id, acknowledgedBy: stAdmin._id,
      decNote: 'Received by Area Finance Secretary.',
    },
    // 9. Peshawar District -> Hayatabad Area (DOWN, ACKNOWLEDGED)
    {
      body: 'EXECUTIVE',
      sourceLevel: 'DISTRICT', sourceUnitId: peshawarDistrict._id, sourceName: peshawarDistrict.name,
      destinationLevel: 'AREA', destinationUnitId: hbArea._id, destinationName: hbArea.name,
      direction: 'DOWN', amount: 20000, mode: 'BANK_TRANSFER', reference: 'FT-2026-0009',
      note: 'Elaqayi organizational expansion support for Hayatabad',
      state: 'ACKNOWLEDGED', initiatedDaysAgo: 12, ackDaysAgo: 11,
      initiatedBy: peshawarAdmin._id, acknowledgedBy: hbAdmin._id,
      decNote: 'Received by Hayatabad Area Finance Secretary.',
    },
    // 10. In-Transit: Central -> Junubi Pakhtunkhwa (DOWN, PENDING_ACK)
    {
      body: 'EXECUTIVE',
      sourceLevel: 'CENTRAL', sourceUnitId: central._id, sourceName: central.name,
      destinationLevel: 'PROVINCE', destinationUnitId: jpkProvince._id, destinationName: jpkProvince.name,
      direction: 'DOWN', amount: 45000, mode: 'BANK_TRANSFER', reference: 'FT-2026-0010',
      note: 'Supplementary operational grant for border district liaison',
      state: 'PENDING_ACK', initiatedDaysAgo: 3,
      initiatedBy: centralAdmin._id,
    },
    // 11. In-Transit: Central -> Khyber Pakhtunkhwa (DOWN, PENDING_ACK)
    {
      body: 'EXECUTIVE',
      sourceLevel: 'CENTRAL', sourceUnitId: central._id, sourceName: central.name,
      destinationLevel: 'PROVINCE', destinationUnitId: kpProvince._id, destinationName: kpProvince.name,
      direction: 'DOWN', amount: 40000, mode: 'BANK_TRANSFER', reference: 'FT-2026-0011',
      note: 'Supplementary grant for Swat regional office setup',
      state: 'PENDING_ACK', initiatedDaysAgo: 2,
      initiatedBy: centralAdmin._id,
    },
    // 12. Rejected: Quetta District -> Junubi Pakhtunkhwa (UP, REJECTED)
    {
      body: 'EXECUTIVE',
      sourceLevel: 'DISTRICT', sourceUnitId: quettaDistrict._id, sourceName: quettaDistrict.name,
      destinationLevel: 'PROVINCE', destinationUnitId: jpkProvince._id, destinationName: jpkProvince.name,
      direction: 'UP', amount: 30000, mode: 'BANK_TRANSFER', reference: 'FT-2026-0012',
      note: 'District surplus remittance with erroneous ledger calculation',
      state: 'REJECTED', initiatedDaysAgo: 15, ackDaysAgo: 14,
      initiatedBy: quettaAdmin._id, acknowledgedBy: jpkAdmin._id,
      decNote: 'Rejected: Please reconcile local basic unit shares before remitting surplus upward.',
    },
  ];

  for (const ts of TRANSFER_SPECS) {
    const isDecided = ts.state === 'ACKNOWLEDGED' || ts.state === 'REJECTED';
    await FundTransfer.create({
      sourceLevel: ts.sourceLevel,
      sourceUnitId: ts.sourceUnitId,
      sourceName: ts.sourceName,
      destinationLevel: ts.destinationLevel,
      destinationUnitId: ts.destinationUnitId,
      destinationName: ts.destinationName,
      direction: ts.direction,
      body: ts.body,
      amount: ts.amount,
      currency: 'PKR',
      mode: ts.mode,
      reference: ts.reference,
      note: ts.note,
      receiptImageUrl: 'uploads/demo-transfer-receipt.jpg',
      state: ts.state,
      initiatedAt: daysAgo(ts.initiatedDaysAgo),
      initiatedBy: ts.initiatedBy,
      acknowledgedAt: isDecided ? daysAgo(ts.ackDaysAgo) : undefined,
      acknowledgedBy: isDecided ? ts.acknowledgedBy : undefined,
      decisionNote: ts.decNote,
      approvalChain: [
        {
          stageCode: 'DEST_FS_ACK',
          stageName: 'Destination Finance Secretary Review',
          decision: ts.state === 'ACKNOWLEDGED' ? 'APPROVED' : (ts.state === 'REJECTED' ? 'REJECTED' : 'SKIPPED'),
          decidedBy: isDecided ? ts.acknowledgedBy : undefined,
          decidedAt: isDecided ? daysAgo(ts.ackDaysAgo) : undefined,
          note: ts.decNote,
        }
      ],
    });
  }

  const totalFT = await FundTransfer.countDocuments();
  console.log(`  ✓ Created ${totalFT} multi-tier fund transfers.`);

  // ── 13. Permanent Memberships, Announcements & Responsibilities ──
  console.log('[seed-all] Creating Permanent Memberships, Announcements & Member Responsibilities...');

  for (const area of allAreas) {
    const aAdmin = areaAdmins[area._id.toString()];
    const areaMembers = allMembers.filter(m => m.areaId.toString() === area._id.toString());
    for (const mem of areaMembers.slice(6, 8)) {
      await PermanentMembership.create({
        unitLevel: 'AREA',
        unitId: area._id,
        memberId: mem._id,
        nominationNote: 'Nominated as permanent voting member of Elaqayi Committee.',
        nominatedBy: aAdmin._id,
        isActive: true,
      });
    }
  }

  for (const province of allProvinces) {
    const pAdmin = provinceAdmins[province._id.toString()];
    const provMembers = allMembers.filter(m => m.provinceId.toString() === province._id.toString());
    await PermanentMembership.create({
      unitLevel: 'PROVINCE',
      unitId: province._id,
      memberId: provMembers[8]._id,
      nominationNote: `Eminent senior permanent member of ${province.name} Sobayi Committee.`,
      nominatedBy: pAdmin._id,
      isActive: true,
    });

    await Announcement.create({
      authorUserId: pAdmin._id,
      authorName: pAdmin.fullName,
      title: `Quarterly Organizational Directives — ${province.name}`,
      body: `All district and area cabinets in ${province.name} are instructed to finalize quarterly financial statements and verify local basic unit registers.`,
      unitLevel: 'PROVINCE',
      unitId: province._id,
      provinceId: province._id,
      scope: 'SUBTREE',
      pinned: true,
      expiresAt: daysAhead(45),
    });
  }

  await Announcement.create({
    authorUserId: centralAdmin._id,
    authorName: 'PKNAP Central Secretariat',
    title: 'Resolution of the 1st National Congress — Official Party Directive',
    body: 'The Supreme National Assembly has ratified the Party Autonomy & Welfare Charter. All regional committees in Khyber Pakhtunkhwa and Junubi Pakhtunkhwa are mandated to hold local seminars.',
    unitLevel: 'CENTRAL',
    unitId: central._id,
    scope: 'GLOBAL',
    pinned: true,
    expiresAt: daysAhead(60),
  });

  // Assign Member Responsibilities across Basic Units
  const TASK_TITLES = [
    'Distribute party manifesto folders in neighborhood',
    'Collect monthly membership subscriptions and record receipts',
    'Coordinate voter registration camp with local elders',
    'Organize logistics for upcoming General Body Meeting',
    'Submit monthly performance & grievance summary report',
  ];

  for (const { bu, area, district, province } of allBUs) {
    const mset = buMemberSets[bu._id.toString()];
    const aAdmin = areaAdmins[area._id.toString()];
    for (let i = 0; i < 5; i++) {
      await Responsibility.create({
        unitLevel: 'BASIC_UNIT',
        unitId: bu._id,
        basicUnitId: bu._id, areaId: area._id, districtId: district._id, provinceId: province._id,
        title: TASK_TITLES[i % TASK_TITLES.length],
        description: `Assigned duty for ${mset[i].member.fullName}`,
        dueDate: daysAhead(10 + i * 4),
        assignedToMemberId: mset[i].member._id,
        assignedByUserId: aAdmin._id,
        state: i === 1 ? 'COMPLETED' : (i === 0 ? 'IN_PROGRESS' : 'PENDING'),
        completionNote: i === 1 ? 'Task executed successfully on schedule.' : undefined,
        completedAt: i === 1 ? daysAgo(3) : undefined,
      });
    }
  }

  // ── 14. Final Verification Summary ────────────────────────────────
  const counts = {
    roles:                await Role.countDocuments(),
    cabinetTemplates:     await CabinetTemplate.countDocuments(),
    eventTypeConfigs:     await EventTypeConfig.countDocuments(),
    users:                await User.countDocuments(),
    members:              await Member.countDocuments(),
    provinces:            await Province.countDocuments(),
    districts:            await District.countDocuments(),
    areas:                await Area.countDocuments(),
    basicUnits:           await BasicUnit.countDocuments(),
    cabinetSlots:         await CabinetSlot.countDocuments(),
    roleAssignments:      await RoleAssignment.countDocuments(),
    congressSessions:     await Congress.countDocuments(),
    congressDelegates:    await CongressMember.countDocuments(),
    jirgaMembers:         await JirgaMember.countDocuments(),
    meetings:             await Meeting.countDocuments(),
    activities:           await Activity.countDocuments(),
    donations:            await Donation.countDocuments(),
    expenses:             await Expense.countDocuments(),
    fundTransfers:        await FundTransfer.countDocuments(),
    permanentMemberships: await PermanentMembership.countDocuments(),
    announcements:        await Announcement.countDocuments(),
    responsibilities:     await Responsibility.countDocuments(),
  };

  console.log('\n[seed-all] ═══════════════════════════════════════════════════════════');
  console.log('[seed-all] SEED COMPLETE — Two-Province Master Database State:');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`  ${k.padEnd(25)} : ${v}`);
  }
  console.log('[seed-all] ═══════════════════════════════════════════════════════════');

  console.log('\n[seed-all] ── KEY ADMIN ACCOUNTS (Password: 123456) ─────────────');
  console.log('  Super Admin         : username="super"               email="super@admin.com"');
  console.log('  Central Admin       : username="central"             email="central@admin.com"');
  console.log('  KP Province Admin   : username="kpk"                 email="kp@admin.com"');
  console.log('  JPK Province Admin  : username="balochistan"         email="jpk@admin.com"');
  console.log('  District Admins     : username="district_<name>"     (e.g. district_peshawar, district_quetta)');
  console.log('  Area Admins         : username="area_<name>"         (e.g. area_hayatabad, area_satellite-town)');
  console.log('\n[seed-all] ── MEMBER PORTAL ACCOUNTS (Password: Member@123) ────');
  console.log('  Members 1 to 320    : username="m1" to "m320", or log in via Member CNIC');
  console.log('[seed-all] ═══════════════════════════════════════════════════════════\n');

  await mongoose.disconnect();
}

run().catch(err => {
  console.error('[seed-all] FATAL ERROR during seed execution:', err);
  process.exit(1);
});
