#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * PNAP-MIS Massive Data Populator & High-Fidelity Multi-Stream Seeder
 * ═════════════════════════════════════════════════════════════════════════════
 * Thoroughly populates the database with hundreds of realistic, relational records:
 * 1. 320+ Additional Members & Linked Users across all 32 Basic Units (total 640+)
 * 2. 150+ Multi-Stream Meetings (EXECUTIVE, COMMITTEE, JIRGA, CONGRESS, GENERAL_BODY) (total 230+)
 * 3. 110+ Field Activities (Jalsas, Protests, Door-to-door Campaigns, Seminars) (total 150+)
 * 4. 250+ Financial Donations with receipts, varying donor types & payment modes (total 320+)
 * 5. 160+ Financial Expenses across all categories with approval chains (total 200+)
 * 6. 60+ Inter-unit Fund Transfers (UP, DOWN, SAME_TIER) with audit trails (total 72+)
 * 7. Congress & Jirga Nominees Expansion
 * ═════════════════════════════════════════════════════════════════════════════
 */

'use strict';

const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Load environment configuration
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
const Meeting = require('../src/models/Meeting');
const Activity = require('../src/models/Activity');
const Donation = require('../src/models/Donation');
const Expense = require('../src/models/Expense');
const FundTransfer = require('../src/models/FundTransfer');
const Congress = require('../src/models/Congress');
const CongressMember = require('../src/models/CongressMember');
const JirgaMember = require('../src/models/JirgaMember');

// Coordinate registry for GPS anchoring
const COORDINATES = {
  CENTRAL: { lat: 33.6844, lng: 73.0479, venue: 'Central Secretariat, Islamabad' },
  CONGRESS: { lat: 33.7182, lng: 73.0924, venue: 'National Convention Centre, Islamabad' },
  JPK_QUETTA: { lat: 30.1798, lng: 66.9750, venue: 'Bacha Khan Chowk / Provincial Markaz, Quetta' },
  JPK_PISHIN: { lat: 30.5833, lng: 67.0000, venue: 'District Convention Hall, Pishin' },
  JPK_CHAMAN: { lat: 30.9167, lng: 66.4500, venue: 'Ulasi Jirga Ground, Chaman' },
  JPK_ZHOB: { lat: 31.3417, lng: 69.4486, venue: 'Community Center, Zhob' },
  KP_PESHAWAR: { lat: 34.0151, lng: 71.5249, venue: 'Bacha Khan Markaz, Peshawar' },
  KP_MARDAN: { lat: 34.1989, lng: 72.0403, venue: 'District Hall, Mardan' },
  KP_SWAT: { lat: 35.2227, lng: 72.4258, venue: 'Civic Center, Mingora Swat' },
  KP_BANNU: { lat: 32.9861, lng: 70.6042, venue: 'Jirga Hall, Bannu' },
};

// Helpers
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

const FIRST_NAMES = [
  'Asadullah', 'Mirwais', 'Khushal', 'Zarmina', 'Spogmai', 'Sher Ali', 'Gulalai', 'Farooq',
  'Abdul Samad', 'Kashif', 'Bakhtiar', 'Shahab', 'Jamil', 'Hidayat', 'Pariwash', 'Rehman',
  'Habibullah', 'Noorullah', 'Zubair', 'Najeebullah', 'Tor Khan', 'Baryalai', 'Zmarak',
  'Salma', 'Bibi Amina', 'Javed', 'Fakhar', 'Attaullah', 'Qudratullah', 'Sohail', 'Wahid'
];

const LAST_NAMES = [
  'Achakzai', 'Kakar', 'Khattak', 'Mandokhail', 'Yousafzai', 'Marwat', 'Tareen', 'Shinwari',
  'Afridi', 'Wazir', 'Mehsud', 'Bungash', 'Durrani', 'Mohmand', 'Uthmankhail', 'Baitanai',
  'Nasir', 'Luni', 'Ghilzai', 'Barech', 'Popalzai', 'Sadozai', 'Panni', 'Jogezai'
];

const FATHER_NAMES = [
  'Haji Abdul Rehman', 'Malik Mir Afzal', 'Khan Bahadur', 'Sardar Ghulam Nabi', 'Shah Wali Khan',
  'Mirza Mohammad', 'Arbab Jehangir', 'Qazi Inayatullah', 'Akhtar Mohammad', 'Dost Mohammad',
  'Sher Mohammad', 'Niamatullah Khan', 'Fazal Ur Rehman', 'Dr. Habibullah', 'Prof. Azizullah'
];

const OCCUPATIONS = [
  'Advocate High Court', 'Senior Secondary Teacher', 'Agriculturist & Fruit Orchardist',
  'Wholesale Dry Fruit Merchant', 'General Physician / Doctor', 'Civil Engineer',
  'Postgraduate University Student', 'Pharmacist', 'Journalist & Social Commentator',
  'Transporter & Logistics Contractor', 'College Lecturer', 'Banker'
];

const EDUCATIONS = [
  'Matric (Science)', 'F.Sc (Pre-Medical)', 'B.A. (Political Science)', 'B.Sc (Hons)',
  'LL.B (Hons)', 'M.A. (Pashto Literature)', 'M.Sc (Economics)', 'MBBS', 'B.E. Civil Engineering'
];

const BLOOD_GROUPS = ['A+', 'B+', 'O+', 'AB+', 'A-', 'B-', 'O-'];

async function populateMassiveData() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis';
  console.log(`\n=================================================================`);
  console.log(`  PNAP-MIS Massive Data Populator`);
  console.log(`  Connecting to: ${mongoUri}`);
  console.log(`=================================================================`);

  await mongoose.connect(mongoUri);
  console.log('✓ Connected to MongoDB.\n');

  // Load organization hierarchy
  const central = await Central.findOne({});
  if (!central) {
    throw new Error('Central record not found. Please ensure base hierarchy is seeded.');
  }
  const provinces = await Province.find({ isActive: true });
  const districts = await District.find({ isActive: true });
  const areas = await Area.find({ isActive: true });
  const basicUnits = await BasicUnit.find({ isActive: true });
  const superAdmin = await User.findOne({ roles: 'SUPER_ADMIN' }) || await User.findOne({});

  console.log(`Loaded Organization Topography:`);
  console.log(`  - Central: ${central.name}`);
  console.log(`  - Provinces (${provinces.length}): ${provinces.map(p => p.name).join(', ')}`);
  console.log(`  - Districts (${districts.length}): ${districts.map(d => d.name).join(', ')}`);
  console.log(`  - Areas: ${areas.length}`);
  console.log(`  - Basic Units: ${basicUnits.length}`);

  // ═════════════════════════════════════════════════════════════════
  // 1. POPULATE 320+ ADDITIONAL MEMBERS & LINKED USERS
  // ═════════════════════════════════════════════════════════════════
  console.log('\n[1/6] Populating 320+ additional members across all 32 Basic Units...');

  const memberPasswordHash = await bcrypt.hash('Member@123', 10);
  const existingMembersCount = await Member.countDocuments();
  let memberSeq = existingMembersCount + 1;

  const newMembers = [];
  const newUsers = [];

  for (const bu of basicUnits) {
    const parentArea = areas.find(a => a._id.equals(bu.areaId));
    const parentDistrict = districts.find(d => d._id.equals(bu.districtId));
    const parentProvince = provinces.find(p => p._id.equals(bu.provinceId));

    // Generate 10 new members per basic unit (32 * 10 = 320 members)
    for (let i = 0; i < 10; i++) {
      const fName = pick(FIRST_NAMES);
      const lName = pick(LAST_NAMES);
      const fullName = `${fName} ${lName}`;
      const fatherOrHusbandName = pick(FATHER_NAMES);
      const seqStr = String(memberSeq).padStart(7, '0');
      const cnicPrefix = parentProvince?.code === 'KP' ? '17301' : '54400';
      const cnic = `${cnicPrefix}-${seqStr}-${(memberSeq % 9) + 1}`;
      const phone = `03${randomInt(10, 49)}${String(randomInt(1000000, 9999999))}`;
      const username = `${fName.toLowerCase().replace(/[^a-z]/g, '')}_${lName.toLowerCase().replace(/[^a-z]/g, '')}${randomInt(10, 999)}`;
      const email = `mem.${username}@pnap.org`;
      const gender = i % 4 === 0 ? 'FEMALE' : 'MALE';
      const status = i === 9 ? 'PENDING_APPROVAL' : (i === 8 ? 'INACTIVE' : 'ACTIVE');
      const joinDays = randomInt(30, 720);

      const memberDoc = new Member({
        memberId: `PNAP-M-${seqStr}`,
        fullName,
        fatherOrHusbandName,
        cnic,
        phone,
        email,
        username,
        gender,
        dateOfBirth: daysAgo(randomInt(20 * 365, 60 * 365)),
        address: `${bu.name}, ${parentArea?.name || 'Area'}, District ${parentDistrict?.name || 'District'}`,
        basicUnitId: bu._id,
        areaId: bu.areaId,
        districtId: bu.districtId,
        provinceId: bu.provinceId,
        bloodGroup: pick(BLOOD_GROUPS),
        education: pick(EDUCATIONS),
        occupation: pick(OCCUPATIONS),
        languagesSpoken: ['Pashto', 'Urdu', i % 2 === 0 ? 'English' : 'Balochi'],
        dateJoined: daysAgo(joinDays),
        status,
        passwordHash: memberPasswordHash,
        lastActivityAt: status === 'ACTIVE' ? daysAgo(randomInt(1, 45)) : null,
        submittedVia: 'ADMIN',
        approvedBy: status === 'ACTIVE' ? superAdmin._id : null,
        approvedAt: status === 'ACTIVE' ? daysAgo(joinDays - 2) : null,
      });

      newMembers.push(memberDoc);

      // Also create User record for active members
      if (status === 'ACTIVE') {
        newUsers.push(new User({
          fullName,
          email,
          username,
          cnic,
          passwordHash: memberPasswordHash,
          roles: ['MEMBER'],
          memberId: memberDoc._id,
          scope: {
            provinceId: bu.provinceId,
            districtId: bu.districtId,
            areaId: bu.areaId,
            basicUnitId: bu._id,
          },
          isActive: true,
          emailVerified: true,
        }));
      }

      memberSeq++;
    }
  }

  if (existingMembersCount < 600) {
    await Member.insertMany(newMembers);
    if (newUsers.length > 0) {
      await User.insertMany(newUsers);
    }
    console.log(`  ✓ Created and inserted ${newMembers.length} new members & ${newUsers.length} user logins.`);
  } else {
    console.log(`  ✓ Skipping member insertion: already have ${existingMembersCount} members in database.`);
  }

  // Reload all active members for linking in activities and meetings
  const allActiveMembers = await Member.find({ status: 'ACTIVE' });
  console.log(`  ✓ Total Active Members now available in pool: ${allActiveMembers.length}`);

  // ═════════════════════════════════════════════════════════════════
  // 2. EXPAND CONGRESS & JIRGA DELEGATES
  // ═════════════════════════════════════════════════════════════════
  console.log('\n[2/6] Expanding National Congress & Qomi/Sobayi Jirga delegates...');

  let congress = await Congress.findOne({ isActive: true });
  if (!congress) {
    congress = await Congress.create({
      label: '1st National Congress (Awwalin Milli Congress)',
      heldOn: daysAgo(180),
      venue: COORDINATES.CONGRESS.venue,
      notes: 'Apex Deliberative Congress convening delegates from across all chapters.',
      isActive: true,
      createdBy: superAdmin._id,
    });
  }

  // Nominate 40 new congress delegates
  const candidateCongressMembers = allActiveMembers.slice(20, 70);
  let congressAdded = 0;
  for (const m of candidateCongressMembers) {
    const exists = await CongressMember.findOne({ memberId: m._id });
    if (!exists) {
      await CongressMember.create({
        unitLevel: 'CENTRAL',
        unitId: central._id,
        memberId: m._id,
        assignedRoleSnapshot: {
          roleCode: 'CONGRESS_DELEGATE',
          customRoleName: 'National Congress Representative',
          unitLevel: 'CENTRAL',
          unitId: central._id,
          unitName: 'PKNAP Central',
        },
        nominationNote: `Elected as delegate representing ${m.address}.`,
        assignedBy: superAdmin._id,
        assignedAt: daysAgo(randomInt(90, 200)),
        isActive: true,
      });
      congressAdded++;
    }
  }
  console.log(`  ✓ Nominated ${congressAdded} additional National Congress Delegates.`);

  // Nominate Jirga members across Central and Provincial tiers
  let jirgaAdded = 0;
  const candidateJirgaMembers = allActiveMembers.slice(70, 120);
  for (const m of candidateJirgaMembers) {
    const exists = await JirgaMember.findOne({ memberId: m._id });
    if (!exists) {
      const isProv = Math.random() > 0.4;
      const targetUnitId = isProv ? m.provinceId : central._id;
      const targetLevel = isProv ? 'PROVINCE' : 'CENTRAL';

      await JirgaMember.create({
        unitLevel: targetLevel,
        unitId: targetUnitId,
        memberId: m._id,
        nominationNote: 'Esteemed elder nominated for community arbitration and peace consultative council.',
        assignedBy: superAdmin._id,
        assignedAt: daysAgo(randomInt(60, 250)),
        isActive: true,
      });
      jirgaAdded++;
    }
  }
  console.log(`  ✓ Nominated ${jirgaAdded} additional Qomi & Sobayi Jirga Members.`);

  // ═════════════════════════════════════════════════════════════════
  // 3. POPULATE 150+ MULTI-STREAM MEETINGS (WITH GPS & ATTENDANCE)
  // ═════════════════════════════════════════════════════════════════
  console.log('\n[3/6] Generating 150+ multi-stream meetings across all tiers and bodies...');

  const MEETING_BODIES = ['EXECUTIVE', 'COMMITTEE', 'GENERAL_BODY', 'JIRGA', 'CONGRESS'];
  const MEETING_TYPES = ['GBM', 'EXC', 'CMP', 'JRG', 'CNG', 'STC', 'SEM', 'OTH'];

  const MEETING_TEMPLATES = [
    {
      title: 'Quarterly Organizational Audit & Membership Strategy',
      desc: 'Comprehensive review of grassroots mobilization, membership verification drives, and cabinet accountability.',
      agenda: '1. Review of active vs inactive members\n2. Financial audit report\n3. Upcoming community engagement timeline',
      decisions: 'Resolved to expedite ward-level corner meetings and audit local chapter ledgers.',
      strategy: 'Organize targeted mass rallies and door-to-door membership verification.',
    },
    {
      title: 'Policy Consultation on Regional Infrastructure & Civic Rights',
      desc: 'Deliberations on clean water provision, highway road connectivity, and local youth employment opportunities.',
      agenda: '1. Civic charter discussion\n2. Delegation formation for meeting government officials\n3. Press release drafting',
      decisions: 'Approved the charter of demands and tasked the Information Secretary with press outreach.',
      strategy: 'Submit formal petitions to district commissioners and schedule solidarity demonstrations.',
    },
    {
      title: 'Ideological Study Circle: Historical Struggles for Autonomy',
      desc: 'Educational session exploring progressive constitutionalism, federalism, and socio-economic rights.',
      agenda: '1. Presentation on party manifesto\n2. Group discussion\n3. Literature distribution',
      decisions: 'Mandated monthly study circles across all local units.',
      strategy: 'Distribute 500 copies of the party ideological booklet.',
    },
    {
      title: 'Emergency Flood Relief & Community Welfare Coordination',
      desc: 'Urgent planning meeting to mobilize local volunteers, arrange relief tents, ration packs, and emergency medical kits.',
      agenda: '1. Rapid damage assessment\n2. Relief camp locations\n3. Volunteer assignments and fund collection',
      decisions: 'Established 3 central relief distribution points and dispatched medical volunteers.',
      strategy: 'Partner with local philanthropists and monitor flood-affected areas daily.',
    },
    {
      title: 'Peace & Reconciliation Jirga Assembly',
      desc: 'Traditional consultative council convening elders, legal scholars, and local chieftains to mediate territorial disputes.',
      agenda: '1. Boundary arbitration hearing\n2. Evidence review\n3. Unanimous peace resolution',
      decisions: 'Both parties agreed to peaceful mediation and signed the formal reconciliation accord.',
      strategy: 'Maintain a 5-member elder oversight committee to ensure lasting compliance.',
    },
    {
      title: 'National Congress Delegate Review & Policy Ratification',
      desc: 'Assembly of elected delegates to formulate proposals for the central supreme council and debate legislative resolutions.',
      agenda: '1. Provincial resolution review\n2. Economic policy charter\n3. Constitutional reforms debate',
      decisions: 'Ratified all 4 provincial resolutions and submitted them to the Central Standing Committee.',
      strategy: 'Publish ratified resolutions in party bulletin and convene regional follow-up sessions.',
    },
  ];

  const meetingsToInsert = [];

  // Helper for attendance
  function generateAttendance(membersList, count) {
    const selected = membersList.slice(0, Math.min(count, membersList.length));
    return selected.map((m, idx) => ({
      memberId: m._id,
      status: idx === 0 ? 'PRESENT' : pick(['PRESENT', 'PRESENT', 'PRESENT', 'ABSENT', 'LATE']),
    }));
  }

  // A. Central Level Meetings (15 meetings)
  for (let i = 0; i < 15; i++) {
    const tmpl = pick(MEETING_TEMPLATES);
    const body = pick(['EXECUTIVE', 'COMMITTEE', 'JIRGA', 'CONGRESS']);
    const isPast = i < 11;
    const meetingDate = isPast ? daysAgo(i * 20 + 5) : daysAhead((i - 10) * 15);
    const centralMembers = allActiveMembers.slice(0, 30);

    meetingsToInsert.push({
      unitLevel: 'CENTRAL',
      unitId: central._id,
      type: body === 'JIRGA' ? 'JRG' : (body === 'CONGRESS' ? 'CNG' : 'EXC'),
      body,
      title: `Central ${body} Assembly: ${tmpl.title}`,
      description: tmpl.desc,
      venue: COORDINATES.CENTRAL.venue,
      gps: { lat: COORDINATES.CENTRAL.lat, lng: COORDINATES.CENTRAL.lng },
      startAt: meetingDate,
      endAt: new Date(meetingDate.getTime() + 4 * 3600 * 1000),
      agenda: tmpl.agenda,
      decisions: isPast ? tmpl.decisions : undefined,
      upcomingStrategy: tmpl.strategy,
      notes: isPast ? 'Quorum achieved. Unanimous consensus on operational priorities.' : 'Preparatory notice issued to all delegates.',
      state: isPast ? 'FINALIZED' : 'SCHEDULED',
      chairpersonId: centralMembers[i % centralMembers.length]?._id,
      attendance: isPast ? generateAttendance(centralMembers, 18) : [],
      createdBy: superAdmin._id,
    });
  }

  // B. Provincial Level Meetings (2 provinces * 12 meetings = 24 meetings)
  for (const prov of provinces) {
    const isKP = /Khyber|KP/i.test(prov.name);
    const coord = isKP ? COORDINATES.KP_PESHAWAR : COORDINATES.JPK_QUETTA;
    const provMembers = allActiveMembers.filter(m => m.provinceId.equals(prov._id));

    for (let i = 0; i < 12; i++) {
      const tmpl = pick(MEETING_TEMPLATES);
      const body = pick(['EXECUTIVE', 'COMMITTEE', 'JIRGA']);
      const isPast = i < 9;
      const meetingDate = isPast ? daysAgo(i * 22 + 4) : daysAhead((i - 8) * 14);

      meetingsToInsert.push({
        unitLevel: 'PROVINCE',
        unitId: prov._id,
        provinceId: prov._id,
        type: body === 'JIRGA' ? 'JRG' : 'EXC',
        body,
        title: `${prov.name} ${body}: ${tmpl.title}`,
        description: tmpl.desc,
        venue: coord.venue,
        gps: { lat: coord.lat, lng: coord.lng },
        startAt: meetingDate,
        endAt: new Date(meetingDate.getTime() + 3.5 * 3600 * 1000),
        agenda: tmpl.agenda,
        decisions: isPast ? tmpl.decisions : undefined,
        upcomingStrategy: tmpl.strategy,
        notes: isPast ? 'High delegate participation across all regional chapters.' : 'Meeting scheduled at provincial secretariat.',
        state: isPast ? 'FINALIZED' : 'SCHEDULED',
        chairpersonId: provMembers[i % provMembers.length]?._id,
        attendance: isPast ? generateAttendance(provMembers, 14) : [],
        createdBy: superAdmin._id,
      });
    }
  }

  // C. District Level Meetings (8 districts * 6 meetings = 48 meetings)
  for (const dist of districts) {
    const distMembers = allActiveMembers.filter(m => m.districtId.equals(dist._id));
    const isKP = distMembers[0]?.provinceId?.equals(provinces.find(p => /Khyber|KP/i.test(p.name))?._id);
    const baseCoord = isKP ? COORDINATES.KP_MARDAN : COORDINATES.JPK_PISHIN;

    for (let i = 0; i < 6; i++) {
      const tmpl = pick(MEETING_TEMPLATES);
      const body = pick(['EXECUTIVE', 'COMMITTEE']);
      const isPast = i < 5;
      const meetingDate = isPast ? daysAgo(i * 35 + 8) : daysAhead((i - 4) * 20);

      meetingsToInsert.push({
        unitLevel: 'DISTRICT',
        unitId: dist._id,
        provinceId: dist.provinceId,
        districtId: dist._id,
        type: pick(['EXC', 'GBM', 'CMP']),
        body,
        title: `District ${dist.name} Session: ${tmpl.title}`,
        description: tmpl.desc,
        venue: `District Secretariat, ${dist.name}`,
        gps: { lat: baseCoord.lat + (Math.random() - 0.5) * 0.05, lng: baseCoord.lng + (Math.random() - 0.5) * 0.05 },
        startAt: meetingDate,
        endAt: new Date(meetingDate.getTime() + 3 * 3600 * 1000),
        agenda: tmpl.agenda,
        decisions: isPast ? tmpl.decisions : undefined,
        upcomingStrategy: tmpl.strategy,
        state: isPast ? 'FINALIZED' : 'SCHEDULED',
        chairpersonId: distMembers[i % distMembers.length]?._id,
        attendance: isPast ? generateAttendance(distMembers, 12) : [],
        createdBy: superAdmin._id,
      });
    }
  }

  // D. Area & Basic Unit Level Meetings (65+ meetings)
  for (const bu of basicUnits.slice(0, 22)) {
    const buMembers = allActiveMembers.filter(m => m.basicUnitId.equals(bu._id));
    for (let i = 0; i < 3; i++) {
      const tmpl = pick(MEETING_TEMPLATES);
      const isPast = i < 2;
      const meetingDate = isPast ? daysAgo(i * 45 + 10) : daysAhead(18);

      meetingsToInsert.push({
        unitLevel: 'BASIC_UNIT',
        unitId: bu._id,
        provinceId: bu.provinceId,
        districtId: bu.districtId,
        areaId: bu.areaId,
        basicUnitId: bu._id,
        type: 'GBM',
        body: 'GENERAL_BODY',
        title: `${bu.name} General Body: ${tmpl.title}`,
        description: tmpl.desc,
        venue: `Community Hall, ${bu.name}`,
        gps: { lat: 33.6844 + (Math.random() - 0.5) * 2, lng: 71.5249 + (Math.random() - 0.5) * 4 },
        startAt: meetingDate,
        endAt: new Date(meetingDate.getTime() + 2.5 * 3600 * 1000),
        agenda: tmpl.agenda,
        decisions: isPast ? tmpl.decisions : undefined,
        upcomingStrategy: tmpl.strategy,
        state: isPast ? 'FINALIZED' : 'SCHEDULED',
        chairpersonId: buMembers[i % buMembers.length]?._id,
        attendance: isPast ? generateAttendance(buMembers, 10) : [],
        createdBy: superAdmin._id,
      });
    }
  }

  const existingMeetingsCount = await Meeting.countDocuments();
  if (existingMeetingsCount < 200) {
    await Meeting.insertMany(meetingsToInsert);
    console.log(`  ✓ Inserted ${meetingsToInsert.length} new meetings across all tiers and streams.`);
  } else {
    console.log(`  ✓ Skipping meeting insertion: already have ${existingMeetingsCount} meetings in database.`);
  }

  // ═════════════════════════════════════════════════════════════════
  // 4. POPULATE 110+ FIELD ACTIVITIES
  // ═════════════════════════════════════════════════════════════════
  console.log('\n[4/6] Generating 110+ field activities (Jalsas, Rallies, Campaigns, Seminars)...');

  const ACTIVITY_TYPES = ['JALSA', 'PROTEST', 'CAMPAIGN', 'SEMINAR', 'STUDY_CIRCLE', 'COMMUNITY_SERVICE'];
  const ACTIVITY_TITLES = [
    { type: 'JALSA', title: 'Grand Public Jalsa & People’s Rights Assembly', desc: 'Mass gathering rallying citizens for democratic empowerment and provincial autonomy.' },
    { type: 'PROTEST', title: 'Peaceful Demonstration Against Inflation & Unjust Tariffs', desc: 'Mass protest march demanding reduction in power tariffs and fair agricultural price guarantees.' },
    { type: 'CAMPAIGN', title: 'Door-to-Door Voter Registration & Public Awareness Drive', desc: 'Active fieldwork mobilizing female and youth citizens for civic registration.' },
    { type: 'SEMINAR', title: 'Symposium on Climate Change, Water Scarcity & Afforestation', desc: 'Panel discussion with environmentalists, hydrologists, and community elders.' },
    { type: 'COMMUNITY_SERVICE', title: 'Free Medical Consultation & Eye Camp', desc: 'Providing diagnostic checkups, free medicines, and eye health screenings for underprivileged families.' },
    { type: 'STUDY_CIRCLE', title: 'Youth Ideology & Democratic Governance Workshop', desc: 'Interactive workshop training student leaders on parliamentary democracy and political ethics.' },
  ];

  const activitiesToInsert = [];

  for (let i = 0; i < 115; i++) {
    const actTmpl = pick(ACTIVITY_TITLES);
    const targetUnit = pick([
      { level: 'CENTRAL', id: central._id, pId: null, dId: null, aId: null, bId: null },
      { level: 'PROVINCE', id: pick(provinces)._id, pId: pick(provinces)._id, dId: null, aId: null, bId: null },
      { level: 'DISTRICT', id: pick(districts)._id, pId: pick(districts).provinceId, dId: pick(districts)._id, aId: null, bId: null },
      { level: 'AREA', id: pick(areas)._id, pId: pick(areas).provinceId, dId: pick(areas).districtId, aId: pick(areas)._id, bId: null },
      { level: 'BASIC_UNIT', id: pick(basicUnits)._id, pId: pick(basicUnits).provinceId, dId: pick(basicUnits).districtId, aId: pick(basicUnits).areaId, bId: pick(basicUnits)._id },
    ]);

    const isPast = i < 95;
    const actDate = isPast ? daysAgo(i * 6 + 2) : daysAhead((i - 94) * 5);
    const body = pick(['EXECUTIVE', 'COMMITTEE', 'JIRGA']);
    const relevantMembers = allActiveMembers.slice(i % 100, (i % 100) + 15);

    const isCampaign = actTmpl.type === 'CAMPAIGN';
    const campaignData = isCampaign ? {
      householdsVisited: randomInt(120, 850),
      peopleContacted: randomInt(350, 2400),
      pamphletsDistributed: randomInt(500, 5000),
      expectedJoiners: randomInt(30, 250),
      actualJoiners: isPast ? randomInt(15, 180) : 0,
      volunteerHours: randomInt(40, 320),
    } : undefined;

    activitiesToInsert.push({
      unitLevel: targetUnit.level,
      unitId: targetUnit.id,
      provinceId: targetUnit.pId,
      districtId: targetUnit.dId,
      areaId: targetUnit.aId,
      basicUnitId: targetUnit.bId,
      type: actTmpl.type,
      body,
      title: `${actTmpl.title} - Batch ${i + 1}`,
      description: actTmpl.desc,
      startAt: actDate,
      endAt: new Date(actDate.getTime() + 4 * 3600 * 1000),
      venue: `Main Bazaar / Public Ground, Regional Sector ${i + 1}`,
      gps: { lat: 30.1798 + (Math.random() - 0.5) * 4, lng: 67.0000 + (Math.random() - 0.5) * 5 },
      leadMemberId: relevantMembers[0]?._id,
      participants: relevantMembers.map(m => m._id),
      externalAttendanceEstimate: isPast ? randomInt(75, 4500) : 0,
      campaign: campaignData,
      outcomeNotes: isPast ? 'Resounding community reception, notable participation by youth and elders, peaceful conclusion.' : undefined,
      state: isPast ? 'COMPLETED' : 'PLANNED',
      createdBy: superAdmin._id,
    });
  }

  const existingActivitiesCount = await Activity.countDocuments();
  if (existingActivitiesCount < 140) {
    await Activity.insertMany(activitiesToInsert);
    console.log(`  ✓ Inserted ${activitiesToInsert.length} field activities.`);
  } else {
    console.log(`  ✓ Skipping activity insertion: already have ${existingActivitiesCount} activities in database.`);
  }

  // ═════════════════════════════════════════════════════════════════
  // 5. POPULATE 250+ DONATIONS & 160+ EXPENSES
  // ═════════════════════════════════════════════════════════════════
  console.log('\n[5/6] Populating extensive financial records (Donations & Expenses)...');

  // A. DONATIONS (260 donations)
  const donationsToInsert = [];
  const PAYMENT_MODES = ['CASH', 'BANK_TRANSFER', 'MOBILE_WALLET', 'CHEQUE'];
  const DONOR_TYPES = ['MEMBER', 'NON_MEMBER', 'CORPORATE', 'ANONYMOUS'];

  const allUnitsPool = [
    { level: 'CENTRAL', id: central._id, pId: null, dId: null, aId: null, bId: null },
    ...provinces.map(p => ({ level: 'PROVINCE', id: p._id, pId: p._id, dId: null, aId: null, bId: null })),
    ...districts.map(d => ({ level: 'DISTRICT', id: d._id, pId: d.provinceId, dId: d._id, aId: null, bId: null })),
    ...areas.map(a => ({ level: 'AREA', id: a._id, pId: a.provinceId, dId: a.districtId, aId: a._id, bId: null })),
    ...basicUnits.map(b => ({ level: 'BASIC_UNIT', id: b._id, pId: b.provinceId, dId: b.districtId, aId: b.areaId, bId: b._id })),
  ];

  let donationReceiptSeq = 5001;

  for (let i = 0; i < 260; i++) {
    const targetUnit = pick(allUnitsPool);
    const donorType = pick(DONOR_TYPES);
    const isMember = donorType === 'MEMBER';
    const donorMember = isMember ? pick(allActiveMembers) : null;
    const fiscalYear = pick([2024, 2025, 2026]);
    const amount = pick([500, 1000, 2500, 5000, 10000, 25000, 50000, 100000, 250000, 500000]);
    const receivedAt = daysAgo(randomInt(5, 500));

    donationsToInsert.push({
      unitLevel: targetUnit.level,
      unitId: targetUnit.id,
      provinceId: targetUnit.pId,
      districtId: targetUnit.dId,
      areaId: targetUnit.aId,
      basicUnitId: targetUnit.bId,
      body: pick(['EXECUTIVE', 'COMMITTEE', 'JIRGA']),
      receiptNo: `REC-${fiscalYear}-${donationReceiptSeq}`,
      fiscalYear,
      amount,
      currency: 'PKR',
      donorType,
      donorMemberId: donorMember?._id,
      donorName: isMember ? donorMember.fullName : `Philanthropist ${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      donorCnic: isMember ? donorMember.cnic : `17301-${randomInt(1000000, 9999999)}-1`,
      paymentMode: pick(PAYMENT_MODES),
      receivedAt,
      note: isMember ? 'Annual membership regular contribution & party solidarity fund.' : 'General contribution to public welfare and organizational activities.',
      recordedBy: superAdmin._id,
    });

    donationReceiptSeq++;
  }

  const existingDonationsCount = await Donation.countDocuments();
  if (existingDonationsCount < 300) {
    await Donation.insertMany(donationsToInsert);
    console.log(`  ✓ Inserted ${donationsToInsert.length} financial donations.`);
  } else {
    console.log(`  ✓ Skipping donation insertion: already have ${existingDonationsCount} donations in database.`);
  }

  // B. EXPENSES (165 expenses)
  const expensesToInsert = [];
  const EXPENSE_CATEGORIES = [
    'OFFICE', 'TRANSPORT', 'PRINTING', 'REFRESHMENTS', 'STAGE_EQUIPMENT',
    'COMMUNICATION', 'DONATIONS_OUT', 'SALARIES_STIPENDS', 'MISC'
  ];

  const EXPENSE_DESCRIPTIONS = {
    OFFICE: 'Monthly secretariat office rent, utilities (electricity & gas), and sanitation services.',
    TRANSPORT: 'Hired coaster buses and fuel reimbursement for convention delegates and workers.',
    PRINTING: 'Printing 10,000 party manifesto booklets, event banners, badges, and placards.',
    REFRESHMENTS: 'Tea, bottled water, and traditional refreshments for meeting participants and guests.',
    STAGE_EQUIPMENT: 'Sound audio system rental, LED screen hire, canopy tents, and rostrum arrangement.',
    COMMUNICATION: 'SMS broadcast bundle package and digital publicity campaign design.',
    DONATIONS_OUT: 'Charitable grant to local disaster-affected community families.',
    SALARIES_STIPENDS: 'Stipends for secretariat staff and field logistics volunteers.',
    MISC: 'Emergency generator diesel, stationary folders, and courier delivery charges.',
  };

  for (let i = 0; i < 165; i++) {
    const targetUnit = pick(allUnitsPool);
    const category = pick(EXPENSE_CATEGORIES);
    const amount = randomInt(3500, 185000);
    const state = i % 10 === 0 ? 'PENDING' : (i % 25 === 0 ? 'REJECTED' : 'APPROVED');
    const incurredAt = daysAgo(randomInt(3, 480));

    expensesToInsert.push({
      unitLevel: targetUnit.level,
      unitId: targetUnit.id,
      provinceId: targetUnit.pId,
      districtId: targetUnit.dId,
      areaId: targetUnit.aId,
      basicUnitId: targetUnit.bId,
      body: pick(['EXECUTIVE', 'COMMITTEE', 'JIRGA']),
      category,
      description: EXPENSE_DESCRIPTIONS[category],
      amount,
      currency: 'PKR',
      incurredAt,
      vendor: `Al-Madina Commercial & Services Corp (Vendor #${randomInt(101, 899)})`,
      paymentMode: pick(['CASH', 'BANK_TRANSFER', 'CHEQUE']),
      evidenceUrl: `/uploads/receipts/exp_evidence_${i + 1}.pdf`,
      state,
      approvedBy: state === 'APPROVED' ? superAdmin._id : undefined,
      approvedAt: state === 'APPROVED' ? new Date(incurredAt.getTime() + 24 * 3600 * 1000) : undefined,
      rejectedBy: state === 'REJECTED' ? superAdmin._id : undefined,
      rejectedAt: state === 'REJECTED' ? new Date(incurredAt.getTime() + 24 * 3600 * 1000) : undefined,
      recordedBy: superAdmin._id,
    });
  }

  const existingExpensesCount = await Expense.countDocuments();
  if (existingExpensesCount < 200) {
    await Expense.insertMany(expensesToInsert);
    console.log(`  ✓ Inserted ${expensesToInsert.length} financial expenses.`);
  } else {
    console.log(`  ✓ Skipping expense insertion: already have ${existingExpensesCount} expenses in database.`);
  }

  // ═════════════════════════════════════════════════════════════════
  // 6. POPULATE 60+ INTER-UNIT FUND TRANSFERS
  // ═════════════════════════════════════════════════════════════════
  console.log('\n[6/6] Populating 60+ inter-unit fund transfers across tiers and branches...');

  const transfersToInsert = [];

  for (let i = 0; i < 65; i++) {
    const transferType = pick(['DOWN', 'UP', 'SAME_TIER']);
    let sourceUnit, destUnit;

    if (transferType === 'DOWN') {
      // Central -> Province or Province -> District
      if (Math.random() > 0.5) {
        sourceUnit = { level: 'CENTRAL', id: central._id, name: 'PKNAP Central', pId: null, dId: null, aId: null, bId: null };
        const p = pick(provinces);
        destUnit = { level: 'PROVINCE', id: p._id, name: p.name };
      } else {
        const p = pick(provinces);
        sourceUnit = { level: 'PROVINCE', id: p._id, name: p.name, pId: p._id, dId: null, aId: null, bId: null };
        const d = pick(districts.filter(dist => dist.provinceId.equals(p._id)));
        destUnit = { level: 'DISTRICT', id: d._id, name: `District ${d.name}` };
      }
    } else if (transferType === 'UP') {
      // District -> Province or Area -> District
      const d = pick(districts);
      const p = provinces.find(prov => prov._id.equals(d.provinceId));
      sourceUnit = { level: 'DISTRICT', id: d._id, name: `District ${d.name}`, pId: d.provinceId, dId: d._id, aId: null, bId: null };
      destUnit = { level: 'PROVINCE', id: p._id, name: p.name };
    } else {
      // SAME_TIER: District -> District or Area -> Area
      const d1 = districts[0];
      const d2 = districts[1];
      sourceUnit = { level: 'DISTRICT', id: d1._id, name: `District ${d1.name}`, pId: d1.provinceId, dId: d1._id, aId: null, bId: null };
      destUnit = { level: 'DISTRICT', id: d2._id, name: `District ${d2.name}` };
    }

    const state = i % 8 === 0 ? 'PENDING_ACK' : (i % 20 === 0 ? 'REJECTED' : 'ACKNOWLEDGED');
    const transferDate = daysAgo(randomInt(2, 360));

    transfersToInsert.push({
      sourceLevel: sourceUnit.level,
      sourceUnitId: sourceUnit.id,
      destinationLevel: destUnit.level,
      destinationUnitId: destUnit.id,
      sourceName: sourceUnit.name,
      destinationName: destUnit.name,
      direction: transferType,
      provinceId: sourceUnit.pId,
      districtId: sourceUnit.dId,
      areaId: sourceUnit.aId,
      basicUnitId: sourceUnit.bId,
      body: 'EXECUTIVE',
      amount: pick([15000, 25000, 50000, 75000, 100000, 250000, 500000, 1000000]),
      currency: 'PKR',
      mode: pick(['BANK_TRANSFER', 'CHEQUE', 'MOBILE_WALLET', 'CASH']),
      reference: `FT-REF-${randomInt(100000, 999999)}`,
      note: `Inter-unit organizational fund grant (${transferType} direction) for local operations and development.`,
      receiptImageUrl: `/uploads/transfers/slip_${i + 1}.png`,
      state,
      initiatedAt: transferDate,
      initiatedBy: superAdmin._id,
      acknowledgedAt: state === 'ACKNOWLEDGED' ? new Date(transferDate.getTime() + 48 * 3600 * 1000) : undefined,
      acknowledgedBy: state === 'ACKNOWLEDGED' ? superAdmin._id : undefined,
      decisionNote: state === 'REJECTED' ? 'Destination unit requested revision in invoice breakdown.' : 'Acknowledged and reconciled with local treasury books.',
    });
  }

  const existingTransfersCount = await FundTransfer.countDocuments();
  if (existingTransfersCount < 70) {
    await FundTransfer.insertMany(transfersToInsert);
    console.log(`  ✓ Inserted ${transfersToInsert.length} inter-unit fund transfers.`);
  } else {
    console.log(`  ✓ Skipping fund transfer insertion: already have ${existingTransfersCount} transfers in database.`);
  }

  console.log('\n=================================================================');
  console.log('✓ SUCCESS! Massive data population completed thoroughly.');
  console.log('=================================================================\n');

  process.exit(0);
}

populateMassiveData().catch(err => {
  console.error('\n❌ Fatal Error during population:', err);
  process.exit(1);
});
