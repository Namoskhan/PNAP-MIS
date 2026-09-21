#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * PNAP-MIS Level-by-Level Comprehensive Seeder
 * ═════════════════════════════════════════════════════════════════════════════
 * Thoroughly populates every single level and unit in the hierarchy:
 * - Central Level
 * - 2 Provinces (KP, JPK)
 * - 8 Districts (Peshawar, Mardan, Swat, Bannu, Quetta, Pishin, Chaman, Zhob)
 * - 16 Areas
 * - 32 Basic Units
 *
 * Populates:
 * 1. Responsibilities: Assigned by Senior Mawin / Executive to unit members
 *    (in PENDING, IN_PROGRESS, COMPLETED with completion notes & dates).
 * 2. Donations: Authored at that specific unit with receipt numbers, amounts,
 *    and donor diversity.
 * 3. Expenses: Authored at that specific unit across all 9 categories with
 *    approval chains.
 * 4. Harmonizes passwords so all Cabinet Users can log in using "123456" or "Member@123".
 * ═════════════════════════════════════════════════════════════════════════════
 */

'use strict';

const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

require('dotenv').config({ path: path.join(__dirname, '../.env') });
if (!process.env.MONGO_URI) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}

// Models
const Central = require('../src/models/Central');
const Province = require('../src/models/Province');
const District = require('../src/models/District');
const Area = require('../src/models/Area');
const BasicUnit = require('../src/models/BasicUnit');
const Member = require('../src/models/Member');
const User = require('../src/models/User');
const RoleAssignment = require('../src/models/RoleAssignment');
const Responsibility = require('../src/models/Responsibility');
const Donation = require('../src/models/Donation');
const Expense = require('../src/models/Expense');
const Meeting = require('../src/models/Meeting');
const Activity = require('../src/models/Activity');

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

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const RESPONSIBILITY_TITLES = [
  { title: 'Membership Verification & Register Audit', desc: 'Verify grassroots membership forms, validate CNICs, and reconcile with central database.' },
  { title: 'Coordinate Logistics for Upcoming Public Assembly', desc: 'Secure venue permissions, coordinate sound system, lighting, canopy tents, and rostrum arrangement.' },
  { title: 'Quarterly Financial Books & Voucher Reconciliation', desc: 'Audit local revenue receipts, voucher documentation, and prepare quarterly expense report.' },
  { title: 'Youth Wing Mobilization & Voter Registration Drive', desc: 'Lead field teams to assist young eligible citizens with voter registry enrollment and awareness.' },
  { title: 'Community Grievance Hearing & Dispute Resolution', desc: 'Convene local grievance hearing session with elders to resolve civic complaints and local disputes.' },
  { title: 'Publicity, Social Media & Press Release Coordination', desc: 'Draft official press statement on local civic issues and disseminate across media channels.' },
  { title: 'Flood & Disaster Relief Volunteer Roster Setup', desc: 'Organize emergency relief response team and manage distribution of essential rations.' },
  { title: 'Constitutional & Ideological Study Circle Facilitation', desc: 'Lead weekly study circle on party manifesto, federalism, and socio-economic rights.' },
  { title: 'Organize Ward-Level Corner Deliberation Sessions', desc: 'Convene street corner meetings to collect citizen feedback on infrastructure and public services.' },
  { title: 'Women Wing Outreach & Civic Empowerment Workshop', desc: 'Conduct consultative session addressing local healthcare, vocational training, and female civic participation.' },
  { title: 'Bazaar Traders Consultation on Local Taxation', desc: 'Engage merchant unions to formulate representation against arbitrary local tariffs and municipal duties.' },
  { title: 'Annual Performance Appraisal of Subordinate Units', desc: 'Review meeting attendance rates, activity execution, and documentation compliance of local chapters.' },
];

const EXPENSE_CATEGORIES = [
  'OFFICE', 'TRANSPORT', 'PRINTING', 'REFRESHMENTS', 'STAGE_EQUIPMENT',
  'COMMUNICATION', 'DONATIONS_OUT', 'SALARIES_STIPENDS', 'MISC'
];

const EXPENSE_DETAILS = {
  OFFICE: 'Secretariat monthly rent, utility bills (electricity/gas), and office maintenance.',
  TRANSPORT: 'Rented passenger coasters, vehicle fuel, and toll tax reimbursements for workers.',
  PRINTING: 'Printing party literature, event banner streamers, member registration badges, and flyers.',
  REFRESHMENTS: 'Traditional green tea, bakery refreshments, and mineral water for participants.',
  STAGE_EQUIPMENT: 'Sound audio system rental, stage carpeting, wireless microphones, and rostrum setup.',
  COMMUNICATION: 'Broadband internet subscription and mobile notification broadcast bundle.',
  DONATIONS_OUT: 'Welfare financial aid provided to vulnerable community families.',
  SALARIES_STIPENDS: 'Monthly administrative staff stipends and logistics volunteer honorariums.',
  MISC: 'Emergency generator backup diesel, stationery files, and courier dispatches.',
};

const PAYMENT_MODES = ['CASH', 'BANK_TRANSFER', 'MOBILE_WALLET', 'CHEQUE'];
const DONOR_TYPES = ['MEMBER', 'NON_MEMBER', 'CORPORATE', 'ANONYMOUS'];

async function run() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis';
  console.log(`\n=================================================================`);
  console.log(`  PNAP-MIS Level-by-Level Seeder`);
  console.log(`  Target: ${mongoUri}`);
  console.log(`=================================================================`);

  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB.\n');

  const superAdmin = await User.findOne({ roles: 'SUPER_ADMIN' }) || await User.findOne({});
  const central = await Central.findOne({});
  const provinces = await Province.find().lean();
  const districts = await District.find().lean();
  const areas = await Area.find().lean();
  const basicUnits = await BasicUnit.find().lean();
  const allMembers = await Member.find().lean();
  const allUsers = await User.find().lean();

  console.log(`Loaded Structure:`);
  console.log(`  - 1 Central`);
  console.log(`  - ${provinces.length} Provinces`);
  console.log(`  - ${districts.length} Districts`);
  console.log(`  - ${areas.length} Areas`);
  console.log(`  - ${basicUnits.length} Basic Units`);
  console.log(`  - ${allMembers.length} Members, ${allUsers.length} Users`);

  // 1. Password standardization for all members & cabinet users
  console.log('\n[1/4] Ensuring all Member and Cabinet User passwords verify with 123456 / Member@123...');
  const unifiedHash = await bcrypt.hash('123456', 10);
  await Member.updateMany({}, { $set: { passwordHash: unifiedHash } });
  await User.updateMany({ roles: { $ne: 'SUPER_ADMIN' } }, { $set: { passwordHash: unifiedHash, isActive: true } });
  console.log('  ✓ Standardized credentials across all Member and Cabinet User accounts to "123456".');

  // Load role assignments
  const assignments = await RoleAssignment.find({ state: 'APPROVED', endedAt: null }).lean();

  // Helper to find Senior Mawin or Secretary of a unit
  function findUnitLeaderUser(level, unitId) {
    const ra = assignments.find(a => a.unitLevel === level && String(a.unitId) === String(unitId) && (a.roleCode === 'SENIOR_MAWIN' || a.roleCode === 'SECRETARY' || a.roleCode === 'PRESIDENT'));
    if (ra) {
      const u = allUsers.find(user => String(user.memberId) === String(ra.memberId));
      if (u) return u;
    }
    return superAdmin;
  }

  let receiptCounter = 8000;

  // 2. Seeding Helper for a Unit
  async function seedUnitData({ level, unitId, unitName, provinceId, districtId, areaId, basicUnitId, targetResp = 10, targetDon = 10, targetExp = 8 }) {
    // A. Responsibilities
    const existingResp = await Responsibility.countDocuments({ unitLevel: level, unitId });
    const neededResp = Math.max(0, targetResp - existingResp);

    if (neededResp > 0) {
      const leaderUser = findUnitLeaderUser(level, unitId);
      // Candidates for assignment: members belonging to this unit hierarchy
      let unitMembers = allMembers.filter(m => {
        if (level === 'BASIC_UNIT') return String(m.basicUnitId) === String(unitId);
        if (level === 'AREA') return String(m.areaId) === String(unitId);
        if (level === 'DISTRICT') return String(m.districtId) === String(unitId);
        if (level === 'PROVINCE') return String(m.provinceId) === String(unitId);
        return true; // Central: any member
      });

      if (unitMembers.length === 0) unitMembers = allMembers.slice(0, 20);

      const respDocs = [];
      for (let i = 0; i < neededResp; i++) {
        const tmpl = pick(RESPONSIBILITY_TITLES);
        const assignedMember = pick(unitMembers);
        const state = pick(['COMPLETED', 'COMPLETED', 'IN_PROGRESS', 'PENDING']);
        const isCompleted = state === 'COMPLETED';
        const dueDays = randomInt(5, 60);

        respDocs.push({
          unitLevel: level,
          unitId,
          provinceId,
          districtId,
          areaId,
          basicUnitId,
          title: `${tmpl.title} (${unitName})`,
          description: `${tmpl.desc} Assigned as a priority task for ${unitName}.`,
          dueDate: isCompleted ? daysAgo(dueDays - 5) : daysAhead(dueDays),
          assignedToMemberId: assignedMember._id,
          assignedByUserId: leaderUser._id,
          state,
          completionNote: isCompleted ? 'Task completed satisfactorily in full compliance with party guidelines and submitted for verification.' : undefined,
          completedAt: isCompleted ? daysAgo(randomInt(1, dueDays - 1)) : undefined,
          createdAt: daysAgo(dueDays + 10),
        });
      }

      await Responsibility.insertMany(respDocs);
    }

    // B. Donations
    const existingDon = await Donation.countDocuments({ unitLevel: level, unitId });
    const neededDon = Math.max(0, targetDon - existingDon);

    if (neededDon > 0) {
      let unitMembers = allMembers.filter(m => {
        if (level === 'BASIC_UNIT') return String(m.basicUnitId) === String(unitId);
        if (level === 'AREA') return String(m.areaId) === String(unitId);
        if (level === 'DISTRICT') return String(m.districtId) === String(unitId);
        if (level === 'PROVINCE') return String(m.provinceId) === String(unitId);
        return true;
      });
      if (unitMembers.length === 0) unitMembers = allMembers.slice(0, 15);

      const donDocs = [];
      for (let i = 0; i < neededDon; i++) {
        const fiscalYear = pick([2024, 2025, 2026]);
        const donorType = pick(DONOR_TYPES);
        const isMem = donorType === 'MEMBER';
        const m = isMem ? pick(unitMembers) : null;
        receiptCounter++;

        donDocs.push({
          unitLevel: level,
          unitId,
          provinceId,
          districtId,
          areaId,
          basicUnitId,
          body: pick(['EXECUTIVE', 'COMMITTEE', 'JIRGA']),
          receiptNo: `REC-${fiscalYear}-${receiptCounter}`,
          fiscalYear,
          amount: pick([1000, 2000, 5000, 10000, 25000, 50000, 100000]),
          currency: 'PKR',
          donorType,
          donorMemberId: m?._id,
          donorName: isMem ? m.fullName : `Local Contributor ${pick(['Haji', 'Malik', 'Dr.', 'Engr.'])} ${pick(['Farooq', 'Zahid', 'Rehman', 'Javed'])}`,
          donorCnic: isMem ? m.cnic : `17301-${randomInt(1000000, 9999999)}-1`,
          paymentMode: pick(PAYMENT_MODES),
          receivedAt: daysAgo(randomInt(5, 360)),
          note: `Operational contribution credited to ${unitName} treasury books.`,
          recordedBy: superAdmin._id,
        });
      }

      await Donation.insertMany(donDocs);
    }

    // C. Expenses
    const existingExp = await Expense.countDocuments({ unitLevel: level, unitId });
    const neededExp = Math.max(0, targetExp - existingExp);

    if (neededExp > 0) {
      const expDocs = [];
      for (let i = 0; i < neededExp; i++) {
        const cat = pick(EXPENSE_CATEGORIES);
        const amount = randomInt(4000, 85000);
        const state = pick(['APPROVED', 'APPROVED', 'APPROVED', 'PENDING', 'REJECTED']);
        const incDays = randomInt(3, 300);

        expDocs.push({
          unitLevel: level,
          unitId,
          provinceId,
          districtId,
          areaId,
          basicUnitId,
          body: pick(['EXECUTIVE', 'COMMITTEE', 'JIRGA']),
          category: cat,
          description: `${EXPENSE_DETAILS[cat]} Authorized for ${unitName} local office.`,
          amount,
          currency: 'PKR',
          incurredAt: daysAgo(incDays),
          vendor: `Local Services Provider (${unitName} vendor #${randomInt(101, 499)})`,
          paymentMode: pick(['CASH', 'BANK_TRANSFER', 'CHEQUE']),
          evidenceUrl: `/uploads/receipts/${level.toLowerCase()}_receipt_${randomInt(1000, 9999)}.pdf`,
          state,
          approvedBy: state === 'APPROVED' ? superAdmin._id : undefined,
          approvedAt: state === 'APPROVED' ? daysAgo(incDays - 1) : undefined,
          rejectedBy: state === 'REJECTED' ? superAdmin._id : undefined,
          rejectedAt: state === 'REJECTED' ? daysAgo(incDays - 1) : undefined,
          recordedBy: superAdmin._id,
        });
      }

      await Expense.insertMany(expDocs);
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // LEVEL BY LEVEL EXECUTION
  // ═════════════════════════════════════════════════════════════════

  // LEVEL 1: CENTRAL
  console.log('\n[2/4] Seeding Level: CENTRAL (PKNAP Central)...');
  await seedUnitData({
    level: 'CENTRAL',
    unitId: central._id,
    unitName: 'PKNAP Central',
    provinceId: null,
    districtId: null,
    areaId: null,
    basicUnitId: null,
    targetResp: 20,
    targetDon: 25,
    targetExp: 20,
  });
  console.log('  ✓ Central level fully seeded with responsibilities, donations, and expenses.');

  // LEVEL 2: PROVINCES
  console.log('\n[3/4] Seeding Level: PROVINCES (KP & JPK)...');
  for (const p of provinces) {
    await seedUnitData({
      level: 'PROVINCE',
      unitId: p._id,
      unitName: p.name,
      provinceId: p._id,
      districtId: null,
      areaId: null,
      basicUnitId: null,
      targetResp: 16,
      targetDon: 18,
      targetExp: 15,
    });
    console.log(`  ✓ Province "${p.name}" seeded.`);
  }

  // LEVEL 3: DISTRICTS (All 8 Districts including Mardan)
  console.log('\n[4/4] Seeding Level: DISTRICTS (All 8 Districts)...');
  for (const d of districts) {
    await seedUnitData({
      level: 'DISTRICT',
      unitId: d._id,
      unitName: `District ${d.name}`,
      provinceId: d.provinceId,
      districtId: d._id,
      areaId: null,
      basicUnitId: null,
      targetResp: 14,
      targetDon: 14,
      targetExp: 12,
    });
    console.log(`  ✓ District "${d.name}" (Senior Mawin, Secretary & Finance) seeded.`);
  }

  // LEVEL 4: AREAS (All 16 Areas)
  console.log('\nSeeding Level: AREAS (All 16 Areas)...');
  for (const a of areas) {
    await seedUnitData({
      level: 'AREA',
      unitId: a._id,
      unitName: `Area ${a.name}`,
      provinceId: a.provinceId,
      districtId: a.districtId,
      areaId: a._id,
      basicUnitId: null,
      targetResp: 8,
      targetDon: 10,
      targetExp: 8,
    });
    console.log(`  ✓ Area "${a.name}" seeded.`);
  }

  // LEVEL 5: BASIC UNITS (All 32 Basic Units)
  console.log('\nSeeding Level: BASIC UNITS (All 32 Units)...');
  for (const bu of basicUnits) {
    await seedUnitData({
      level: 'BASIC_UNIT',
      unitId: bu._id,
      unitName: bu.name,
      provinceId: bu.provinceId,
      districtId: bu.districtId,
      areaId: bu.areaId,
      basicUnitId: bu._id,
      targetResp: 6,
      targetDon: 8,
      targetExp: 6,
    });
  }
  console.log(`  ✓ All 32 Basic Units seeded.`);

  console.log('\n=================================================================');
  console.log('✓ All levels thoroughly and completely populated!');
  console.log('=================================================================\n');

  process.exit(0);
}

run().catch(err => {
  console.error('Fatal error during level-by-level seeding:', err);
  process.exit(1);
});
