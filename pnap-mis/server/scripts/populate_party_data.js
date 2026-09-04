#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════
 * PNAP-MIS Comprehensive Database Updater & Multi-Stream Data Populator
 * ═════════════════════════════════════════════════════════════════════════
 * 1. Renames Provinces:
 *    - Balochistan -> Junubi Pakhtunkhwa
 *    - KPK -> Khyber Pakhtunkhwa
 *    Updates all matching users, announcements, fund transfers, meetings, logs.
 *
 * 2. Populates realistic, interconnected data across all streams:
 *    - Executive (EXECUTIVE)
 *    - Committees (COMMITTEE)
 *    - Jirgas (JIRGA)
 *    - National Congress (CONGRESS)
 *
 *    Includes:
 *    - Meetings (SCHEDULED, FINALIZED with mandatory Venue GPS coordinates!)
 *    - Activities (COMPLETED, PLANNED with outcomes, attendance, GPS)
 *    - Financial Data:
 *      * Donations (diverse payment modes, receipt numbers, member & non-member)
 *      * Expenses (APPROVED, REJECTED, PENDING with categories and receipts)
 *      * Fund Transfers (APPROVED/ACKNOWLEDGED, REJECTED with notes, PENDING)
 *    - Congress session & Congress/Jirga member nominations
 * ═════════════════════════════════════════════════════════════════════════
 */

const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Load environment from server/.env, with fallback to root .env
require('dotenv').config({ path: path.join(__dirname, '../.env') });
if (!process.env.MONGO_URI) {
  require('dotenv').config({ path: path.join(__dirname, '../../.env') });
}

// Models
const Province = require('../src/models/Province');
const District = require('../src/models/District');
const Area = require('../src/models/Area');
const BasicUnit = require('../src/models/BasicUnit');
const Central = require('../src/models/Central');
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

// Coordinate anchors for key hubs
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
  SINDH_KHI: { lat: 24.8607, lng: 67.0011, venue: 'Provincial Office, Karachi' },
};

async function run(mongoUri) {
  const targetUri = mongoUri || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis';
  console.log(`\n===============================================================`);
  console.log(`  Connecting to: ${targetUri}`);
  console.log(`===============================================================`);

  await mongoose.connect(targetUri);
  console.log('✓ Connected to MongoDB.\n');

  const db = mongoose.connection.db;

  // ═════════════════════════════════════════════════════════════════
  // PART 1: Rename Balochistan -> Junubi Pakhtunkhwa & KPK -> Khyber Pakhtunkhwa
  // ═════════════════════════════════════════════════════════════════
  console.log('[1/4] Renaming Balochistan and KPK across database...');

  // 1. Provinces
  const updateBalochistan = await db.collection('provinces').updateMany(
    { name: { $in: ['Balochistan', 'balochistan', 'BALOCHISTAN', 'Junubi Pakhtunkhwa'] } },
    { $set: { name: 'Junubi Pakhtunkhwa (Balochistan)', code: 'JPK' } }
  );
  const updateKPK = await db.collection('provinces').updateMany(
    { name: { $in: ['KPK', 'kpk', 'KpK'] } },
    { $set: { name: 'Khyber Pakhtunkhwa', code: 'KP' } }
  );
  // Clean up any empty legacy provinces with 0 members
  await db.collection('provinces').deleteMany({ name: { $nin: ['Khyber Pakhtunkhwa', 'Junubi Pakhtunkhwa (Balochistan)'] } });
  console.log(`  ✓ Provinces updated: Balochistan -> Junubi Pakhtunkhwa (Balochistan), KPK -> Khyber Pakhtunkhwa`);

  // 2. Users (Province admins & names)
  await db.collection('users').updateMany(
    { fullName: /Balochistan/i },
    { $set: { fullName: 'Junubi Pakhtunkhwa Province Admin' } }
  );
  await db.collection('users').updateMany(
    { fullName: /KPK/i },
    { $set: { fullName: 'Khyber Pakhtunkhwa Province Admin' } }
  );
  console.log(`  ✓ Users updated with renamed province designations.`);

  // 3. Announcements
  const announcements = await db.collection('announcements').find({}).toArray();
  for (const ann of announcements) {
    let changed = false;
    let title = ann.title || '';
    let body = ann.body || '';
    let targetUnitName = ann.targetUnitName || '';

    if (/Balochistan/i.test(title) || /Balochistan/i.test(body) || /Balochistan/i.test(targetUnitName)) {
      title = title.replace(/Balochistan/gi, 'Junubi Pakhtunkhwa');
      body = body.replace(/Balochistan/gi, 'Junubi Pakhtunkhwa');
      targetUnitName = targetUnitName.replace(/Balochistan/gi, 'Junubi Pakhtunkhwa');
      changed = true;
    }
    if (/KPK/i.test(title) || /KPK/i.test(body) || /KPK/i.test(targetUnitName)) {
      title = title.replace(/KPK/gi, 'Khyber Pakhtunkhwa');
      body = body.replace(/KPK/gi, 'Khyber Pakhtunkhwa');
      targetUnitName = targetUnitName.replace(/KPK/gi, 'Khyber Pakhtunkhwa');
      changed = true;
    }
    if (changed) {
      await db.collection('announcements').updateOne({ _id: ann._id }, { $set: { title, body, targetUnitName } });
    }
  }
  console.log(`  ✓ Announcements updated.`);

  // 4. Fund Transfers
  const transfers = await db.collection('fundtransfers').find({}).toArray();
  for (const t of transfers) {
    let changed = false;
    let sName = t.sourceName || '';
    let dName = t.destinationName || '';
    let note = t.note || '';

    if (/Balochistan/i.test(sName) || /Balochistan/i.test(dName) || /Balochistan/i.test(note)) {
      sName = sName.replace(/Balochistan/gi, 'Junubi Pakhtunkhwa');
      dName = dName.replace(/Balochistan/gi, 'Junubi Pakhtunkhwa');
      note = note.replace(/Balochistan/gi, 'Junubi Pakhtunkhwa');
      changed = true;
    }
    if (/KPK/i.test(sName) || /KPK/i.test(dName) || /KPK/i.test(note)) {
      sName = sName.replace(/KPK/gi, 'Khyber Pakhtunkhwa');
      dName = dName.replace(/KPK/gi, 'Khyber Pakhtunkhwa');
      note = note.replace(/KPK/gi, 'Khyber Pakhtunkhwa');
      changed = true;
    }
    if (changed) {
      await db.collection('fundtransfers').updateOne({ _id: t._id }, { $set: { sourceName: sName, destinationName: dName, note } });
    }
  }
  console.log(`  ✓ Fund transfers denormalized names updated.`);

  // 5. Meetings
  const existingMeetings = await db.collection('meetings').find({}).toArray();
  for (const m of existingMeetings) {
    let changed = false;
    let title = m.title || '';
    let description = m.description || '';
    let venue = m.venue || '';

    if (/Balochistan/i.test(title) || /Balochistan/i.test(description) || /Balochistan/i.test(venue)) {
      title = title.replace(/Balochistan/gi, 'Junubi Pakhtunkhwa');
      description = description.replace(/Balochistan/gi, 'Junubi Pakhtunkhwa');
      venue = venue.replace(/Balochistan/gi, 'Junubi Pakhtunkhwa');
      changed = true;
    }
    if (/KPK/i.test(title) || /KPK/i.test(description) || /KPK/i.test(venue)) {
      title = title.replace(/KPK/gi, 'Khyber Pakhtunkhwa');
      description = description.replace(/KPK/gi, 'Khyber Pakhtunkhwa');
      venue = venue.replace(/KPK/gi, 'Khyber Pakhtunkhwa');
      changed = true;
    }
    if (changed) {
      await db.collection('meetings').updateOne({ _id: m._id }, { $set: { title, description, venue } });
    }
  }
  console.log(`  ✓ Existing meetings updated.`);

  // ═════════════════════════════════════════════════════════════════
  // PART 2: Load Active Organization Tree & Users
  // ═════════════════════════════════════════════════════════════════
  console.log('\n[2/4] Loading organization structure and leadership...');

  let central = await Central.findOne({});
  if (!central) {
    central = await Central.create({
      name: 'PKNAP Central',
      description: 'Central Supreme Headquarters of Pashtunkhwa National Awami Party',
      code: 'CENTRAL',
    });
  }

  const provinces = await Province.find({ isActive: true });
  const districts = await District.find({ isActive: true });
  const areas = await Area.find({ isActive: true });
  const basicUnits = await BasicUnit.find({ isActive: true });
  const members = await Member.find({ status: 'ACTIVE' });
  let adminUser = await User.findOne({ roles: 'SUPER_ADMIN' }) || await User.findOne({});
  if (!adminUser) {
    adminUser = await User.create({
      username: 'super',
      email: 'super@admin.com',
      fullName: 'PNAP Super Admin',
      roles: ['SUPER_ADMIN'],
      passwordHash: await bcrypt.hash('123456', 10),
      isActive: true,
      isBootstrap: true,
    });
  }

  console.log(`  ✓ Organization loaded:`);
  console.log(`    - Central: ${central.name} (${central._id})`);
  console.log(`    - Provinces: ${provinces.length} (${provinces.map(p => p.name).join(', ')})`);
  console.log(`    - Districts: ${districts.length}`);
  console.log(`    - Areas: ${areas.length}`);
  console.log(`    - Basic Units: ${basicUnits.length}`);
  console.log(`    - Active Members: ${members.length}`);

  // Find provinces by name
  const jpkProvince = provinces.find(p => /Junubi|Balochistan/i.test(p.name)) || provinces[0];
  const kpProvince = provinces.find(p => /Khyber|KPK/i.test(p.name)) || provinces[1] || provinces[0];

  // ═════════════════════════════════════════════════════════════════
  // PART 3: Ensure National Congress & Assembly Memberships
  // ═════════════════════════════════════════════════════════════════
  console.log('\n[3/4] Ensuring National Congress & Jirga memberships...');

  let congress = await Congress.findOne({ isActive: true });
  if (!congress) {
    congress = await Congress.create({
      label: '1st National Congress (Awwalin Milli Congress)',
      heldOn: daysAgo(150),
      venue: COORDINATES.CONGRESS.venue,
      notes: 'Supreme National Assembly convening delegates from Junubi Pakhtunkhwa, Khyber Pakhtunkhwa, Sindh, and Overseas Units.',
      isActive: true,
      createdBy: adminUser._id,
    });
    console.log(`  ✓ Created National Congress record: ${congress.label}`);
  }

  // Ensure Congress members
  if (members.length > 0) {
    const congressNominees = members.slice(0, Math.min(25, members.length));
    for (const mem of congressNominees) {
      await CongressMember.findOneAndUpdate(
        { unitLevel: 'CENTRAL', unitId: central._id, memberId: mem._id },
        {
          $setOnInsert: {
            unitLevel: 'CENTRAL',
            unitId: central._id,
            memberId: mem._id,
            assignedRoleSnapshot: {
              roleCode: 'CONGRESS_DELEGATE',
              customRoleName: 'National Congress Delegate',
              unitLevel: 'CENTRAL',
              unitId: central._id,
              unitName: 'PKNAP Central',
            },
            nominationNote: 'Elected delegate to the National Congress representing regional constituents.',
            assignedBy: adminUser._id,
            assignedAt: daysAgo(160),
            isActive: true,
          }
        },
        { upsert: true, new: true }
      );
    }
    console.log(`  ✓ Ensured ${congressNominees.length} National Congress Delegates.`);

    // Ensure Jirga members (Central Qomi Jirga & Provincial Sobayi Jirgas)
    const jirgaNominees = members.slice(5, Math.min(30, members.length));
    for (const mem of jirgaNominees) {
      // Central Qomi Jirga
      await JirgaMember.findOneAndUpdate(
        { unitLevel: 'CENTRAL', unitId: central._id, memberId: mem._id },
        {
          $setOnInsert: {
            unitLevel: 'CENTRAL',
            unitId: central._id,
            memberId: mem._id,
            nominationNote: 'Distinguished elder nominated to the Central Qomi Jirga for peace and reconciliation.',
            assignedBy: adminUser._id,
            assignedAt: daysAgo(180),
            isActive: true,
          }
        },
        { upsert: true, new: true }
      );
    }

    if (jpkProvince) {
      const jpkNominees = members.slice(10, Math.min(35, members.length));
      for (const mem of jpkNominees) {
        await JirgaMember.findOneAndUpdate(
          { unitLevel: 'PROVINCE', unitId: jpkProvince._id, memberId: mem._id },
          {
            $setOnInsert: {
              unitLevel: 'PROVINCE',
              unitId: jpkProvince._id,
              memberId: mem._id,
              nominationNote: 'Nominated to Sobayi Jirga Junubi Pakhtunkhwa.',
              assignedBy: adminUser._id,
              assignedAt: daysAgo(170),
              isActive: true,
            }
          },
          { upsert: true, new: true }
        );
      }
    }
    console.log(`  ✓ Ensured Jirga representative memberships.`);
  }

  // ═════════════════════════════════════════════════════════════════
  // PART 4: Populate Meetings, Activities, Financial Data, Transfers
  // ═════════════════════════════════════════════════════════════════
  console.log('\n[4/4] Populating multi-stream meetings, activities, donations, expenses & fund transfers...');

  const BODIES = ['CONGRESS', 'JIRGA', 'COMMITTEE', 'EXECUTIVE'];

  // Helper to build attendance
  function getAttendanceList(unitMembers, count = 8) {
    const list = unitMembers.slice(0, Math.min(count, unitMembers.length));
    return list.map((m, idx) => ({
      memberId: m._id,
      status: idx === 0 ? 'PRESENT' : pick(['PRESENT', 'PRESENT', 'PRESENT', 'ABSENT', 'LATE']),
    }));
  }

  // ── A. MEETINGS ──────────────────────────────────────────────────
  console.log('\n  Creating comprehensive meetings for all 4 bodies with mandatory GPS...');

  const newMeetings = [
    // 1. CONGRESS MEETINGS (at CENTRAL)
    {
      unitLevel: 'CENTRAL',
      unitId: central._id,
      type: 'CNG',
      typeCode: 'CNG',
      body: 'CONGRESS',
      title: 'National Congress Supreme Assembly Session - Plenary Deliberations',
      description: 'Convening all elected provincial delegates, senators, and officeholders to debate ideological goals, socio-economic policy, and party manifesto.',
      venue: COORDINATES.CONGRESS.venue,
      gps: { lat: COORDINATES.CONGRESS.lat, lng: COORDINATES.CONGRESS.lng },
      startAt: daysAgo(45),
      endAt: new Date(daysAgo(45).getTime() + 6 * 3600 * 1000),
      agenda: '1. Congress Presidential Address\n2. Political & Economic Resolution\n3. Provincial Autonomy Charter\n4. Adoption of Organizational By-laws',
      decisions: '1. Unanimously adopted the 2026 People’s Rights Resolution.\n2. Mandated district organizing committees to expand basic units.\n3. Established National Congress Working Sub-Committees.',
      upcomingStrategy: 'Organize regional congress rallies across Junubi Pakhtunkhwa and Khyber Pakhtunkhwa.',
      notes: 'Historical attendance with 94% delegate participation across all regional chapters.',
      state: 'FINALIZED',
      chairpersonId: members[0]?._id,
      attendance: getAttendanceList(members, 15),
      createdBy: adminUser._id,
    },
    {
      unitLevel: 'CENTRAL',
      unitId: central._id,
      type: 'CNG',
      typeCode: 'CNG',
      body: 'CONGRESS',
      title: 'National Congress Implementation & Strategy Follow-up',
      description: 'Quarterly review of decisions and policy directives enacted by the 1st National Congress.',
      venue: COORDINATES.CENTRAL.venue,
      gps: { lat: COORDINATES.CENTRAL.lat, lng: COORDINATES.CENTRAL.lng },
      startAt: daysAhead(14),
      endAt: new Date(daysAhead(14).getTime() + 4 * 3600 * 1000),
      agenda: '1. Review of Congress resolution roll-out\n2. Progress on ideological training academy\n3. Central audit committee report',
      state: 'SCHEDULED',
      chairpersonId: members[1]?._id,
      attendance: [],
      createdBy: adminUser._id,
    },

    // 2. JIRGA MEETINGS (at CENTRAL, PROVINCE, DISTRICT)
    {
      unitLevel: 'CENTRAL',
      unitId: central._id,
      type: 'JRG',
      typeCode: 'JRG',
      body: 'JIRGA',
      title: 'Markazi Qomi Jirga - National Peace, Autonomy & Rights Assembly',
      description: 'Grand consultative assembly with tribal leaders, elder statesmen, jurists, and community representatives on peace and provincial mineral rights.',
      venue: 'Federal Convention Hall, Islamabad',
      gps: { lat: 33.6938, lng: 73.0652 },
      startAt: daysAgo(60),
      endAt: new Date(daysAgo(60).getTime() + 5 * 3600 * 1000),
      agenda: '1. Consultation on peace and security in border regions\n2. National consensus on resource ownership\n3. Jirga declaration release',
      decisions: 'Adopted the Qomi Jirga Declaration calling for peaceful coexistence, end to illegal check-posts, and fair share in natural resources.',
      upcomingStrategy: 'Convene regional follow-up Jirgas in Quetta, Peshawar, and Bannu.',
      notes: 'All participants signed the unanimous declaration.',
      state: 'FINALIZED',
      chairpersonId: members[2]?._id,
      attendance: getAttendanceList(members, 14),
      createdBy: adminUser._id,
    },
    {
      unitLevel: 'PROVINCE',
      unitId: jpkProvince._id,
      provinceId: jpkProvince._id,
      type: 'JRG',
      typeCode: 'JRG',
      body: 'JIRGA',
      title: 'Sobayi Jirga Junubi Pakhtunkhwa - Regional Consultation Assembly',
      description: 'Provincial assembly addressing border trade facilitation at Chaman, water scarcity, and judicial delays.',
      venue: COORDINATES.JPK_QUETTA.venue,
      gps: { lat: COORDINATES.JPK_QUETTA.lat, lng: COORDINATES.JPK_QUETTA.lng },
      startAt: daysAgo(30),
      endAt: new Date(daysAgo(30).getTime() + 4 * 3600 * 1000),
      agenda: '1. Border commerce & local livelihood issues\n2. Land settlement and tribal reconciliations\n3. Youth employment representation',
      decisions: '1. Formed a 7-member delegation to meet federal authorities on trade crossing hurdles.\n2. Successfully reconciled two local land disputes in Pishin.',
      upcomingStrategy: 'Take delegation to Islamabad and follow up on cross-border ease of passage.',
      notes: 'Elders praised the party for providing a neutral, transparent platform.',
      state: 'FINALIZED',
      chairpersonId: members[3]?._id,
      attendance: getAttendanceList(members, 12),
      createdBy: adminUser._id,
    },
    {
      unitLevel: 'PROVINCE',
      unitId: kpProvince._id,
      provinceId: kpProvince._id,
      type: 'JRG',
      typeCode: 'JRG',
      body: 'JIRGA',
      title: 'Sobayi Jirga Khyber Pakhtunkhwa - Tribal & Regional Rights Forum',
      description: 'Consultative Jirga on post-merger integration challenges, NFC award allocations, and law & order.',
      venue: COORDINATES.KP_PESHAWAR.venue,
      gps: { lat: COORDINATES.KP_PESHAWAR.lat, lng: COORDINATES.KP_PESHAWAR.lng },
      startAt: daysAgo(20),
      endAt: new Date(daysAgo(20).getTime() + 4 * 3600 * 1000),
      agenda: '1. Post-merger development promises and funding audit\n2. Power load shedding and industrial tariff rates\n3. Local governance empowers',
      decisions: 'Drafted resolution urging immediate release of tribal development funds and local government empowerments.',
      notes: 'Over 120 regional notables and party officeholders attended.',
      state: 'FINALIZED',
      chairpersonId: members[4]?._id,
      attendance: getAttendanceList(members, 12),
      createdBy: adminUser._id,
    },
    {
      unitLevel: 'PROVINCE',
      unitId: jpkProvince._id,
      provinceId: jpkProvince._id,
      type: 'JRG',
      typeCode: 'JRG',
      body: 'JIRGA',
      title: 'Upcoming Provincial Jirga on Agricultural Water Rights & Tube-Well Solarization',
      description: 'Planning community recommendations for farmers, tube-well subsidies, and groundwater recharge dams in northern districts.',
      venue: COORDINATES.JPK_PISHIN.venue,
      gps: { lat: COORDINATES.JPK_PISHIN.lat, lng: COORDINATES.JPK_PISHIN.lng },
      startAt: daysAhead(18),
      endAt: new Date(daysAhead(18).getTime() + 3 * 3600 * 1000),
      agenda: '1. Solarization of agricultural tube-wells\n2. Rainwater preservation check-dams\n3. Farmer subsidy mechanism',
      state: 'SCHEDULED',
      chairpersonId: members[5]?._id,
      attendance: [],
      createdBy: adminUser._id,
    },

    // 3. COMMITTEE MEETINGS (CENTRAL, PROVINCE, DISTRICT, AREA, BASIC_UNIT)
    {
      unitLevel: 'CENTRAL',
      unitId: central._id,
      type: 'CMP',
      typeCode: 'CMP',
      body: 'COMMITTEE',
      title: 'Markazi Committee - Bi-Monthly Executive & Permanent Member Assembly',
      description: 'Comprehensive meeting of Central Cabinet, Provincial Representatives, and Permanent Members for nationwide oversight.',
      venue: COORDINATES.CENTRAL.venue,
      gps: { lat: COORDINATES.CENTRAL.lat, lng: COORDINATES.CENTRAL.lng },
      startAt: daysAgo(35),
      endAt: new Date(daysAgo(35).getTime() + 4 * 3600 * 1000),
      agenda: '1. Review of party membership registrations\n2. Central finance & audit report\n3. Provincial performance index review\n4. Digital MIS expansion',
      decisions: '1. Approved expansion of mobile MIS app access.\n2. Directed Provincial Committees to complete area elections by Q3.\n3. Verified Central Q1 accounts.',
      upcomingStrategy: 'Send central inspection teams to Khyber Pakhtunkhwa and Junubi Pakhtunkhwa.',
      notes: 'Strong consensus on modernizing organizational reporting.',
      state: 'FINALIZED',
      chairpersonId: members[0]?._id,
      attendance: getAttendanceList(members, 14),
      createdBy: adminUser._id,
    },
    {
      unitLevel: 'PROVINCE',
      unitId: jpkProvince._id,
      provinceId: jpkProvince._id,
      type: 'CMP',
      typeCode: 'CMP',
      body: 'COMMITTEE',
      title: 'Sobayi Committee Junubi Pakhtunkhwa - Quarterly Performance & Strategy Meeting',
      description: 'Executive cabinet and permanent members meeting to evaluate district operations and public engagement.',
      venue: COORDINATES.JPK_QUETTA.venue,
      gps: { lat: COORDINATES.JPK_QUETTA.lat, lng: COORDINATES.JPK_QUETTA.lng },
      startAt: daysAgo(25),
      endAt: new Date(daysAgo(25).getTime() + 3 * 3600 * 1000),
      agenda: '1. Review of Quetta, Pishin, Chaman and Zhob district reports\n2. Membership drive targets\n3. Anti-inflation protest planning',
      decisions: '1. Allocated special relief funds to Pishin chapter.\n2. Fixed target of 5,000 new registered members in next 60 days.',
      upcomingStrategy: 'Launch district-wide membership caravans.',
      state: 'FINALIZED',
      chairpersonId: members[1]?._id,
      attendance: getAttendanceList(members, 10),
      createdBy: adminUser._id,
    },
    {
      unitLevel: 'PROVINCE',
      unitId: kpProvince._id,
      provinceId: kpProvince._id,
      type: 'CMP',
      typeCode: 'CMP',
      body: 'COMMITTEE',
      title: 'Sobayi Committee Khyber Pakhtunkhwa - Organizational Coordination Session',
      description: 'Provincial council review on district organizational elections and public welfare drives.',
      venue: COORDINATES.KP_PESHAWAR.venue,
      gps: { lat: COORDINATES.KP_PESHAWAR.lat, lng: COORDINATES.KP_PESHAWAR.lng },
      startAt: daysAgo(15),
      endAt: new Date(daysAgo(15).getTime() + 3 * 3600 * 1000),
      agenda: '1. District cabinet formation status\n2. Membership card issuance\n3. Youth wing mobilization',
      decisions: '1. Formed provincial oversight committee for district student wing.\n2. Finalized venue for workers convention.',
      state: 'FINALIZED',
      chairpersonId: members[2]?._id,
      attendance: getAttendanceList(members, 10),
      createdBy: adminUser._id,
    },
    {
      unitLevel: 'PROVINCE',
      unitId: jpkProvince._id,
      provinceId: jpkProvince._id,
      type: 'CMP',
      typeCode: 'CMP',
      body: 'COMMITTEE',
      title: 'Upcoming Provincial Committee Review - Budget Allocation & Media Strategy',
      description: 'Strategic planning session for Q3 party communications, press releases, and unit subventions.',
      venue: COORDINATES.JPK_QUETTA.venue,
      gps: { lat: COORDINATES.JPK_QUETTA.lat, lng: COORDINATES.JPK_QUETTA.lng },
      startAt: daysAhead(10),
      endAt: new Date(daysAhead(10).getTime() + 3 * 3600 * 1000),
      agenda: '1. Digital media outreach strategy\n2. Provincial annual budget estimate\n3. Coordination with coalition partners',
      state: 'SCHEDULED',
      chairpersonId: members[3]?._id,
      attendance: [],
      createdBy: adminUser._id,
    },

    // 4. EXECUTIVE MEETINGS (CENTRAL & PROVINCIAL CABINETS)
    {
      unitLevel: 'CENTRAL',
      unitId: central._id,
      type: 'EXC',
      typeCode: 'EXC',
      body: 'EXECUTIVE',
      title: 'Central Executive Cabinet - Monthly Policy & Operations Review',
      description: 'Cabinet session of President, General Secretary, Finance Secretary, and key officeholders.',
      venue: COORDINATES.CENTRAL.venue,
      gps: { lat: COORDINATES.CENTRAL.lat, lng: COORDINATES.CENTRAL.lng },
      startAt: daysAgo(10),
      endAt: new Date(daysAgo(10).getTime() + 3 * 3600 * 1000),
      agenda: '1. Review of national socio-economic situation\n2. Central bank account reconciliations\n3. Approval of party public statements',
      decisions: '1. Approved monthly accounts.\n2. Released press statement on electricity bills.\n3. Scheduled next Central Committee sitting.',
      upcomingStrategy: 'Hold press conference at National Press Club.',
      notes: 'All central ministers/cabinet members present.',
      state: 'FINALIZED',
      chairpersonId: members[0]?._id,
      attendance: getAttendanceList(members, 8),
      createdBy: adminUser._id,
    },
    {
      unitLevel: 'PROVINCE',
      unitId: jpkProvince._id,
      provinceId: jpkProvince._id,
      type: 'EXC',
      typeCode: 'EXC',
      body: 'EXECUTIVE',
      title: 'Provincial Cabinet Executive Session - Junubi Pakhtunkhwa',
      description: 'Cabinet meeting on district administrative coordination and officeholder performance.',
      venue: COORDINATES.JPK_QUETTA.venue,
      gps: { lat: COORDINATES.JPK_QUETTA.lat, lng: COORDINATES.JPK_QUETTA.lng },
      startAt: daysAgo(5),
      endAt: new Date(daysAgo(5).getTime() + 2 * 3600 * 1000),
      agenda: '1. Security updates in border areas\n2. Provincial secretariat administrative expenses\n3. Review of active fund transfers',
      decisions: 'Approved provincial office maintenance and authorized transfer acknowledgement.',
      state: 'FINALIZED',
      chairpersonId: members[1]?._id,
      attendance: getAttendanceList(members, 7),
      createdBy: adminUser._id,
    },
    {
      unitLevel: 'PROVINCE',
      unitId: kpProvince._id,
      provinceId: kpProvince._id,
      type: 'EXC',
      typeCode: 'EXC',
      body: 'EXECUTIVE',
      title: 'Provincial Cabinet Executive Session - Khyber Pakhtunkhwa',
      description: 'Routine cabinet review on Peshawar and Mardan field campaigns.',
      venue: COORDINATES.KP_PESHAWAR.venue,
      gps: { lat: COORDINATES.KP_PESHAWAR.lat, lng: COORDINATES.KP_PESHAWAR.lng },
      startAt: daysAhead(7),
      endAt: new Date(daysAhead(7).getTime() + 2 * 3600 * 1000),
      agenda: '1. Preparation for upcoming workers convention\n2. Finance secretary budget presentation\n3. Legal aid committee formation',
      state: 'SCHEDULED',
      chairpersonId: members[2]?._id,
      attendance: [],
      createdBy: adminUser._id,
    },
  ];

  // Also add District & Area Committee Meetings
  for (let i = 0; i < Math.min(6, districts.length); i++) {
    const dist = districts[i];
    newMeetings.push({
      unitLevel: 'DISTRICT',
      unitId: dist._id,
      districtId: dist._id,
      provinceId: dist.provinceId,
      type: 'CMP',
      typeCode: 'CMP',
      body: 'COMMITTEE',
      title: `Zilla Committee Coordination Meeting - ${dist.name}`,
      description: `Meeting of District Cabinet, Area Secretaries, and Permanent Members of ${dist.name}.`,
      venue: `District Head Office, ${dist.name}`,
      gps: { lat: 30.5 + (i * 0.4), lng: 67.0 + (i * 0.5) },
      startAt: daysAgo(12 + i * 5),
      endAt: new Date(daysAgo(12 + i * 5).getTime() + 2 * 3600 * 1000),
      agenda: '1. Area reports\n2. Membership drive status\n3. Finance audit',
      decisions: 'Adopted work plan for local awareness rallies.',
      state: 'FINALIZED',
      chairpersonId: members[i % members.length]?._id,
      attendance: getAttendanceList(members, 8),
      createdBy: adminUser._id,
    });
  }

  let mCount = 0;
  for (const mData of newMeetings) {
    const exists = await Meeting.findOne({ title: mData.title });
    if (!exists) {
      await Meeting.create(mData);
      mCount++;
    }
  }
  console.log(`  ✓ Inserted ${mCount} new high-fidelity multi-stream meetings.`);

  // ── B. ACTIVITIES ────────────────────────────────────────────────
  console.log('\n  Creating activities for all 4 bodies...');

  const newActivities = [
    // 1. CONGRESS ACTIVITIES
    {
      unitLevel: 'CENTRAL',
      unitId: central._id,
      type: 'JALSA',
      typeCode: 'JALSA',
      body: 'CONGRESS',
      title: 'Nationwide Congress Mobilization & Delegate Convention',
      description: 'Grand delegate convention rallying workers, intellectuals, and party representatives across Pakistan to adopt the new charter of rights.',
      venue: COORDINATES.CONGRESS.venue,
      gps: { lat: COORDINATES.CONGRESS.lat, lng: COORDINATES.CONGRESS.lng },
      startAt: daysAgo(75),
      endAt: new Date(daysAgo(75).getTime() + 6 * 3600 * 1000),
      leadMemberId: members[0]?._id,
      externalAttendanceEstimate: 2800,
      outcomeNotes: 'Unprecedented turnout. Live broadcasted across social media with over 150,000 views.',
      state: 'COMPLETED',
      createdBy: adminUser._id,
    },
    {
      unitLevel: 'CENTRAL',
      unitId: central._id,
      type: 'SEMINAR',
      typeCode: 'SEMINAR',
      body: 'CONGRESS',
      title: 'National Congress Ideological Seminar - Federalism & Provincial Sovereignty',
      description: 'Symposium examining the 18th Constitutional Amendment, fiscal federalism, and fundamental rights.',
      venue: 'National Press Club / Federal Arts Hall, Islamabad',
      gps: { lat: 33.7125, lng: 73.0850 },
      startAt: daysAgo(40),
      endAt: new Date(daysAgo(40).getTime() + 4 * 3600 * 1000),
      leadMemberId: members[1]?._id,
      externalAttendanceEstimate: 450,
      outcomeNotes: 'Engaged prominent constitutional lawyers, journalists, and student leaders.',
      state: 'COMPLETED',
      createdBy: adminUser._id,
    },
    {
      unitLevel: 'CENTRAL',
      unitId: central._id,
      type: 'CAMPAIGN',
      typeCode: 'CAMPAIGN',
      body: 'CONGRESS',
      title: 'Upcoming Nationwide Congress Manifesto Awareness Campaign',
      description: 'Coordinated campaign distributing the party’s central socio-economic manifesto.',
      venue: 'Across major district headquarters and transit junctions',
      gps: { lat: 33.6844, lng: 73.0479 },
      startAt: daysAhead(15),
      endAt: new Date(daysAhead(15).getTime() + 8 * 3600 * 1000),
      leadMemberId: members[2]?._id,
      externalAttendanceEstimate: 1000,
      campaign: {
        householdsVisited: 1200,
        peopleContacted: 5000,
        pamphletsDistributed: 10000,
        expectedJoiners: 500,
        actualJoiners: 0,
        volunteerHours: 350,
      },
      state: 'PLANNED',
      createdBy: adminUser._id,
    },

    // 2. JIRGA ACTIVITIES
    {
      unitLevel: 'PROVINCE',
      unitId: jpkProvince._id,
      provinceId: jpkProvince._id,
      type: 'SEMINAR',
      typeCode: 'SEMINAR',
      body: 'JIRGA',
      title: 'Qomi Jirga Community Reconciliation Forum - Junubi Pakhtunkhwa',
      description: 'Traditional public assembly resolving local land disputes and fostering inter-tribal peace.',
      venue: COORDINATES.JPK_QUETTA.venue,
      gps: { lat: COORDINATES.JPK_QUETTA.lat, lng: COORDINATES.JPK_QUETTA.lng },
      startAt: daysAgo(50),
      endAt: new Date(daysAgo(50).getTime() + 4 * 3600 * 1000),
      leadMemberId: members[3]?._id,
      externalAttendanceEstimate: 600,
      outcomeNotes: 'Two prominent tribal factions publicly agreed on boundary pacts.',
      state: 'COMPLETED',
      createdBy: adminUser._id,
    },
    {
      unitLevel: 'PROVINCE',
      unitId: kpProvince._id,
      provinceId: kpProvince._id,
      type: 'COMMUNITY_SERVICE',
      typeCode: 'COMMUNITY_SERVICE',
      body: 'JIRGA',
      title: 'Grand Jirga Welfare Consultation on Border Trade & Livelihood',
      description: 'Public hearing and legal assistance clinic for border traders, transporter unions, and laborers.',
      venue: COORDINATES.KP_PESHAWAR.venue,
      gps: { lat: COORDINATES.KP_PESHAWAR.lat, lng: COORDINATES.KP_PESHAWAR.lng },
      startAt: daysAgo(28),
      endAt: new Date(daysAgo(28).getTime() + 5 * 3600 * 1000),
      leadMemberId: members[4]?._id,
      externalAttendanceEstimate: 850,
      outcomeNotes: 'Prepared comprehensive charter of demands presented to regional administration.',
      state: 'COMPLETED',
      createdBy: adminUser._id,
    },
    {
      unitLevel: 'PROVINCE',
      unitId: jpkProvince._id,
      provinceId: jpkProvince._id,
      type: 'JALSA',
      typeCode: 'JALSA',
      body: 'JIRGA',
      title: 'Upcoming Ulasi Jirga Gathering on Water Scarcity and Orchard Protection',
      description: 'Farmers and orchard owners consultation on tube-well electricity tariffs and dam construction.',
      venue: COORDINATES.JPK_PISHIN.venue,
      gps: { lat: COORDINATES.JPK_PISHIN.lat, lng: COORDINATES.JPK_PISHIN.lng },
      startAt: daysAhead(12),
      endAt: new Date(daysAhead(12).getTime() + 4 * 3600 * 1000),
      leadMemberId: members[5]?._id,
      externalAttendanceEstimate: 1200,
      state: 'PLANNED',
      createdBy: adminUser._id,
    },

    // 3. COMMITTEE ACTIVITIES
    {
      unitLevel: 'PROVINCE',
      unitId: jpkProvince._id,
      provinceId: jpkProvince._id,
      type: 'PROTEST',
      typeCode: 'PROTEST',
      body: 'COMMITTEE',
      title: 'Provincial Committee Anti-Inflation & Utility Bills Demonstration',
      description: 'Peaceful protest rally organized by the Provincial Committee against skyrocketing electricity tariffs and taxes.',
      venue: 'Provincial Assembly Chowk, Quetta',
      gps: { lat: 30.1850, lng: 66.9920 },
      startAt: daysAgo(18),
      endAt: new Date(daysAgo(18).getTime() + 3 * 3600 * 1000),
      leadMemberId: members[1]?._id,
      externalAttendanceEstimate: 1500,
      outcomeNotes: 'Huge public turnout, peaceful conclusion, wide news coverage on national channels.',
      state: 'COMPLETED',
      createdBy: adminUser._id,
    },
    {
      unitLevel: 'PROVINCE',
      unitId: kpProvince._id,
      provinceId: kpProvince._id,
      type: 'CAMPAIGN',
      typeCode: 'CAMPAIGN',
      body: 'COMMITTEE',
      title: 'Khyber Pakhtunkhwa Committee Membership Drive & Verification Camp',
      description: 'Three-day public enrollment booth setup in Peshawar and Mardan divisions.',
      venue: COORDINATES.KP_PESHAWAR.venue,
      gps: { lat: COORDINATES.KP_PESHAWAR.lat, lng: COORDINATES.KP_PESHAWAR.lng },
      startAt: daysAgo(12),
      endAt: new Date(daysAgo(12).getTime() + 7 * 3600 * 1000),
      leadMemberId: members[2]?._id,
      externalAttendanceEstimate: 700,
      campaign: {
        householdsVisited: 400,
        peopleContacted: 1800,
        pamphletsDistributed: 2500,
        expectedJoiners: 200,
        actualJoiners: 165,
        volunteerHours: 120,
      },
      outcomeNotes: 'Enrolled 165 verified members via the mobile portal.',
      state: 'COMPLETED',
      createdBy: adminUser._id,
    },
    {
      unitLevel: 'CENTRAL',
      unitId: central._id,
      type: 'STUDY_CIRCLE',
      typeCode: 'STUDY_CIRCLE',
      body: 'COMMITTEE',
      title: 'Central Committee Ideological Study Circle: Constitutionalism & History',
      description: 'Educational session for central office-holders and youth organizers.',
      venue: COORDINATES.CENTRAL.venue,
      gps: { lat: COORDINATES.CENTRAL.lat, lng: COORDINATES.CENTRAL.lng },
      startAt: daysAhead(6),
      endAt: new Date(daysAhead(6).getTime() + 3 * 3600 * 1000),
      leadMemberId: members[0]?._id,
      externalAttendanceEstimate: 60,
      state: 'PLANNED',
      createdBy: adminUser._id,
    },

    // 4. EXECUTIVE ACTIVITIES
    {
      unitLevel: 'PROVINCE',
      unitId: jpkProvince._id,
      provinceId: jpkProvince._id,
      type: 'JALSA',
      typeCode: 'JALSA',
      body: 'EXECUTIVE',
      title: 'Public Rally for Democratic Rights & Provincial Autonomy',
      description: 'Grand public rally addressed by the party provincial leadership in Quetta.',
      venue: 'Ayub National Stadium Grounds, Quetta',
      gps: { lat: 30.1920, lng: 66.9880 },
      startAt: daysAgo(22),
      endAt: new Date(daysAgo(22).getTime() + 4 * 3600 * 1000),
      leadMemberId: members[1]?._id,
      externalAttendanceEstimate: 3500,
      outcomeNotes: 'Massive delegate and citizen attendance. Resolutions passed unanimously.',
      state: 'COMPLETED',
      createdBy: adminUser._id,
    },
  ];

  let aCount = 0;
  for (const aData of newActivities) {
    const exists = await Activity.findOne({ title: aData.title });
    if (!exists) {
      await Activity.create(aData);
      aCount++;
    }
  }
  console.log(`  ✓ Inserted ${aCount} new high-fidelity multi-stream activities.`);

  // ── C. DONATIONS ─────────────────────────────────────────────────
  console.log('\n  Creating donations across all bodies...');

  const DONATION_SPECS = [
    // CONGRESS DONATIONS
    { body: 'CONGRESS', unitLevel: 'CENTRAL', unitId: central._id, amount: 250000, donorType: 'CORPORATE', donorName: 'Pakhtun Traders Association Islamabad', mode: 'BANK_TRANSFER', note: 'National Congress sponsorship & delegates meal fund' },
    { body: 'CONGRESS', unitLevel: 'CENTRAL', unitId: central._id, amount: 100000, donorType: 'MEMBER', donorName: members[0]?.fullName, cnic: members[0]?.cnic, mode: 'BANK_TRANSFER', note: 'Central leadership special congress donation' },
    { body: 'CONGRESS', unitLevel: 'CENTRAL', unitId: central._id, amount: 50000, donorType: 'NON_MEMBER', donorName: 'Haji Mohammad Yousaf Kakar', mode: 'CHEQUE', note: 'Voluntary contribution to National Congress proceedings' },
    { body: 'CONGRESS', unitLevel: 'CENTRAL', unitId: central._id, amount: 25000, donorType: 'MEMBER', donorName: members[1]?.fullName, cnic: members[1]?.cnic, mode: 'MOBILE_WALLET', note: 'Congress digital media fund contribution' },

    // JIRGA DONATIONS
    { body: 'JIRGA', unitLevel: 'CENTRAL', unitId: central._id, amount: 80000, donorType: 'NON_MEMBER', donorName: 'Malik Sardar Khan Tareen', mode: 'BANK_TRANSFER', note: 'Qomi Jirga traditional peace arbitration logistics' },
    { body: 'JIRGA', unitLevel: 'PROVINCE', unitId: jpkProvince._id, provinceId: jpkProvince._id, amount: 65000, donorType: 'MEMBER', donorName: members[2]?.fullName, cnic: members[2]?.cnic, mode: 'CASH', note: 'Sobayi Jirga Quetta hospitality & delegate support' },
    { body: 'JIRGA', unitLevel: 'PROVINCE', unitId: kpProvince._id, provinceId: kpProvince._id, amount: 50000, donorType: 'NON_MEMBER', donorName: 'Khan Bahadur Arbab Sher Dil', mode: 'CHEQUE', note: 'Tribal border jirga elder contribution' },
    { body: 'JIRGA', unitLevel: 'PROVINCE', unitId: jpkProvince._id, provinceId: jpkProvince._id, amount: 35000, donorType: 'MEMBER', donorName: members[3]?.fullName, cnic: members[3]?.cnic, mode: 'BANK_TRANSFER', note: 'Water rights Jirga consultation sponsorship' },

    // COMMITTEE DONATIONS
    { body: 'COMMITTEE', unitLevel: 'CENTRAL', unitId: central._id, amount: 75000, donorType: 'MEMBER', donorName: members[4]?.fullName, cnic: members[4]?.cnic, mode: 'BANK_TRANSFER', note: 'Central Working Committee quarterly subscription' },
    { body: 'COMMITTEE', unitLevel: 'PROVINCE', unitId: jpkProvince._id, provinceId: jpkProvince._id, amount: 45000, donorType: 'MEMBER', donorName: members[5]?.fullName, cnic: members[5]?.cnic, mode: 'CASH', note: 'Junubi Pakhtunkhwa Committee anti-inflation campaign fund' },
    { body: 'COMMITTEE', unitLevel: 'PROVINCE', unitId: kpProvince._id, provinceId: kpProvince._id, amount: 40000, donorType: 'MEMBER', donorName: members[6]?.fullName, cnic: members[6]?.cnic, mode: 'BANK_TRANSFER', note: 'Khyber Pakhtunkhwa Committee operational support' },
    { body: 'COMMITTEE', unitLevel: 'PROVINCE', unitId: kpProvince._id, provinceId: kpProvince._id, amount: 30000, donorType: 'NON_MEMBER', donorName: 'Regional Trade Union Solidarity', mode: 'BANK_TRANSFER', note: 'Regional organizing committee fund' },

    // EXECUTIVE DONATIONS
    { body: 'EXECUTIVE', unitLevel: 'CENTRAL', unitId: central._id, amount: 120000, donorType: 'CORPORATE', donorName: 'Khyber Overseas Relief Foundation', mode: 'BANK_TRANSFER', note: 'Party central operational donation' },
    { body: 'EXECUTIVE', unitLevel: 'PROVINCE', unitId: jpkProvince._id, provinceId: jpkProvince._id, amount: 60000, donorType: 'MEMBER', donorName: members[7]?.fullName, cnic: members[7]?.cnic, mode: 'BANK_TRANSFER', note: 'Junubi Pakhtunkhwa provincial executive monthly dues' },
    { body: 'EXECUTIVE', unitLevel: 'PROVINCE', unitId: kpProvince._id, provinceId: kpProvince._id, amount: 55000, donorType: 'MEMBER', donorName: members[8]?.fullName, cnic: members[8]?.cnic, mode: 'CASH', note: 'Peshawar secretariat executive operational fund' },
  ];

  let donCount = 0;
  let donIdx = 801;
  for (const ds of DONATION_SPECS) {
    const rNo = `REC-2026-${String(donIdx++).padStart(5, '0')}`;
    const exists = await Donation.findOne({ receiptNo: rNo });
    if (!exists) {
      await Donation.create({
        unitLevel: ds.unitLevel,
        unitId: ds.unitId,
        provinceId: ds.provinceId,
        body: ds.body,
        receiptNo: rNo,
        fiscalYear: 2026,
        amount: ds.amount,
        currency: 'PKR',
        donorType: ds.donorType,
        donorName: ds.donorName || 'Voluntary Party Contributor',
        donorCnic: ds.cnic || `42101-${randomInt(1000000, 9999999)}-1`,
        paymentMode: ds.mode,
        receivedAt: daysAgo(randomInt(3, 90)),
        note: ds.note,
        recordedBy: adminUser._id,
      });
      donCount++;
    }
  }
  console.log(`  ✓ Inserted ${donCount} new donations for Congress, Jirgas, Committees & Executive.`);

  // ── D. EXPENSES ──────────────────────────────────────────────────
  console.log('\n  Creating expenses (Approved, Rejected, Pending)...');

  const EXPENSE_SPECS = [
    // 1. CONGRESS EXPENSES
    { body: 'CONGRESS', unitLevel: 'CENTRAL', unitId: central._id, category: 'STAGE_EQUIPMENT', amount: 180000, desc: 'Convention Centre sound system, LED screens, and stage lighting', state: 'APPROVED', mode: 'BANK_TRANSFER' },
    { body: 'CONGRESS', unitLevel: 'CENTRAL', unitId: central._id, category: 'REFRESHMENTS', amount: 95000, desc: 'Lunch and tea arrangements for 500 delegates at National Congress', state: 'APPROVED', mode: 'CASH' },
    { body: 'CONGRESS', unitLevel: 'CENTRAL', unitId: central._id, category: 'PRINTING', amount: 45000, desc: 'Printing of National Congress Manifesto, agenda folders, and badges', state: 'APPROVED', mode: 'BANK_TRANSFER' },
    { body: 'CONGRESS', unitLevel: 'CENTRAL', unitId: central._id, category: 'MISC', amount: 120000, desc: 'Luxury VIP limousine transportation for external guests', state: 'REJECTED', note: 'Rejected: Incurred without prior approval from Central Finance Committee; violates party austerity policy.', mode: 'CASH' },
    { body: 'CONGRESS', unitLevel: 'CENTRAL', unitId: central._id, category: 'COMMUNICATION', amount: 25000, desc: 'SMS broadcast & bulk live-streaming internet bandwidth', state: 'APPROVED', mode: 'MOBILE_WALLET' },

    // 2. JIRGA EXPENSES
    { body: 'JIRGA', unitLevel: 'CENTRAL', unitId: central._id, category: 'OFFICE', amount: 65000, desc: 'Marquee, Persian carpets, and traditional floor seating setup for Qomi Jirga', state: 'APPROVED', mode: 'BANK_TRANSFER' },
    { body: 'JIRGA', unitLevel: 'PROVINCE', unitId: jpkProvince._id, provinceId: jpkProvince._id, category: 'REFRESHMENTS', amount: 42000, desc: 'Traditional green tea, dry fruits, and lunch for elder delegates in Quetta', state: 'APPROVED', mode: 'CASH' },
    { body: 'JIRGA', unitLevel: 'PROVINCE', unitId: kpProvince._id, provinceId: kpProvince._id, category: 'TRANSPORT', amount: 35000, desc: 'Transport reimbursement for tribal delegates from border areas to Peshawar', state: 'APPROVED', mode: 'CASH' },
    { body: 'JIRGA', unitLevel: 'PROVINCE', unitId: jpkProvince._id, provinceId: jpkProvince._id, category: 'PRINTING', amount: 50000, desc: 'Unapproved commemorative souvenirs and silver plaques', state: 'REJECTED', note: 'Rejected: Non-essential expense not authorized in Jirga preparation budget.', mode: 'CASH' },

    // 3. COMMITTEE EXPENSES
    { body: 'COMMITTEE', unitLevel: 'CENTRAL', unitId: central._id, category: 'PRINTING', amount: 38000, desc: 'Central Committee organizational handbook and membership registers', state: 'APPROVED', mode: 'BANK_TRANSFER' },
    { body: 'COMMITTEE', unitLevel: 'PROVINCE', unitId: jpkProvince._id, provinceId: jpkProvince._id, category: 'STAGE_EQUIPMENT', amount: 30000, desc: 'Loudspeaker and generator rental for Provincial Committee demonstration', state: 'APPROVED', mode: 'CASH' },
    { body: 'COMMITTEE', unitLevel: 'PROVINCE', unitId: kpProvince._id, provinceId: kpProvince._id, category: 'REFRESHMENTS', amount: 18000, desc: 'Tea & snacks for Provincial Committee quarterly session delegates', state: 'APPROVED', mode: 'CASH' },
    { body: 'COMMITTEE', unitLevel: 'PROVINCE', unitId: jpkProvince._id, provinceId: jpkProvince._id, category: 'TRANSPORT', amount: 45000, desc: 'Fuel and vehicle rental without logbook receipts', state: 'REJECTED', note: 'Rejected: Missing official fuel station receipts and logbook verification.', mode: 'CASH' },

    // 4. EXECUTIVE EXPENSES
    { body: 'EXECUTIVE', unitLevel: 'CENTRAL', unitId: central._id, category: 'OFFICE', amount: 70000, desc: 'Central Secretariat monthly office supplies and utility bill share', state: 'APPROVED', mode: 'BANK_TRANSFER' },
    { body: 'EXECUTIVE', unitLevel: 'PROVINCE', unitId: jpkProvince._id, provinceId: jpkProvince._id, category: 'COMMUNICATION', amount: 15000, desc: 'High-speed broadband connection and cloud storage for provincial secretariat', state: 'APPROVED', mode: 'BANK_TRANSFER' },
    { body: 'EXECUTIVE', unitLevel: 'PROVINCE', unitId: kpProvince._id, provinceId: kpProvince._id, category: 'TRANSPORT', amount: 28000, desc: 'Provincial cabinet inspection visit fuel charges', state: 'APPROVED', mode: 'CASH' },
    { body: 'EXECUTIVE', unitLevel: 'PROVINCE', unitId: kpProvince._id, provinceId: kpProvince._id, category: 'MISC', amount: 32000, desc: 'Office renovation claim without purchase vouchers', state: 'REJECTED', note: 'Rejected: No valid vendor invoices attached; pending revised audit submission.', mode: 'CASH' },
  ];

  let expCount = 0;
  for (const es of EXPENSE_SPECS) {
    const exists = await Expense.findOne({ description: es.desc });
    if (!exists) {
      const isAppr = es.state === 'APPROVED';
      const isRej = es.state === 'REJECTED';
      await Expense.create({
        unitLevel: es.unitLevel,
        unitId: es.unitId,
        provinceId: es.provinceId,
        body: es.body,
        category: es.category,
        description: es.desc,
        amount: es.amount,
        currency: 'PKR',
        incurredAt: daysAgo(randomInt(4, 75)),
        paymentMode: es.mode,
        evidenceUrl: 'uploads/demo-receipt.jpg',
        state: es.state,
        approvedBy: isAppr ? adminUser._id : undefined,
        approvedAt: isAppr ? daysAgo(2) : undefined,
        rejectedBy: isRej ? adminUser._id : undefined,
        rejectedAt: isRej ? daysAgo(2) : undefined,
        reversalNote: es.note,
        recordedBy: adminUser._id,
      });
      expCount++;
    }
  }
  console.log(`  ✓ Inserted ${expCount} new expenses (Approved & Rejected).`);

  // ── E. FUND TRANSFERS ────────────────────────────────────────────
  console.log('\n  Creating Fund Transfers (Approved, Rejected, Pending across bodies)...');

  const TRANSFER_SPECS = [
    // 1. JIRGA TRANSFERS
    {
      body: 'JIRGA',
      sourceLevel: 'CENTRAL',
      sourceUnitId: central._id,
      sourceName: central.name,
      destinationLevel: 'PROVINCE',
      destinationUnitId: jpkProvince._id,
      destinationName: jpkProvince.name,
      direction: 'DOWN',
      amount: 100000,
      mode: 'BANK_TRANSFER',
      reference: 'FT-JRG-2026-001',
      note: 'Markazi subvention for Sobayi Jirga Quetta logistics and shamiana hire',
      state: 'ACKNOWLEDGED',
      initiatedDaysAgo: 40,
      ackDaysAgo: 39,
      decNote: 'Received by Junubi Pakhtunkhwa Finance Secretary into provincial accounts.',
      chainDecision: 'APPROVED',
    },
    {
      body: 'JIRGA',
      sourceLevel: 'CENTRAL',
      sourceUnitId: central._id,
      sourceName: central.name,
      destinationLevel: 'PROVINCE',
      destinationUnitId: kpProvince._id,
      destinationName: kpProvince.name,
      direction: 'DOWN',
      amount: 85000,
      mode: 'BANK_TRANSFER',
      reference: 'FT-JRG-2026-002',
      note: 'Special grant for Khyber Pakhtunkhwa Tribal Jirga delegate hospitality',
      state: 'ACKNOWLEDGED',
      initiatedDaysAgo: 35,
      ackDaysAgo: 34,
      decNote: 'Acknowledged and added to KP Jirga operational ledger.',
      chainDecision: 'APPROVED',
    },
    {
      body: 'JIRGA',
      sourceLevel: 'PROVINCE',
      sourceUnitId: jpkProvince._id,
      sourceName: jpkProvince.name,
      destinationLevel: 'CENTRAL',
      destinationUnitId: central._id,
      destinationName: central.name,
      direction: 'UP',
      amount: 40000,
      mode: 'CASH',
      reference: 'FT-JRG-2026-003',
      note: 'Unaccounted cash deposit sent without mandatory counter-signature of Provincial GS',
      state: 'REJECTED',
      initiatedDaysAgo: 20,
      ackDaysAgo: 19,
      decNote: 'Rejected: Physical cash transfer above 25,000 PKR requires bank channel deposit slip per FIN-002 policy.',
      chainDecision: 'REJECTED',
    },

    // 3. COMMITTEE TRANSFERS
    {
      body: 'COMMITTEE',
      sourceLevel: 'PROVINCE',
      sourceUnitId: jpkProvince._id,
      sourceName: jpkProvince.name,
      destinationLevel: 'CENTRAL',
      destinationUnitId: central._id,
      destinationName: central.name,
      direction: 'UP',
      amount: 75000,
      mode: 'BANK_TRANSFER',
      reference: 'FT-CMP-2026-001',
      note: 'Junubi Pakhtunkhwa Provincial Committee monthly central share',
      state: 'ACKNOWLEDGED',
      initiatedDaysAgo: 28,
      ackDaysAgo: 26,
      decNote: 'Acknowledged and credited to Central Working Committee funds.',
      chainDecision: 'APPROVED',
    },
    {
      body: 'COMMITTEE',
      sourceLevel: 'PROVINCE',
      sourceUnitId: kpProvince._id,
      sourceName: kpProvince.name,
      destinationLevel: 'CENTRAL',
      destinationUnitId: central._id,
      destinationName: central.name,
      direction: 'UP',
      amount: 70000,
      mode: 'BANK_TRANSFER',
      reference: 'FT-CMP-2026-002',
      note: 'Khyber Pakhtunkhwa Provincial Committee monthly central quota',
      state: 'ACKNOWLEDGED',
      initiatedDaysAgo: 25,
      ackDaysAgo: 23,
      decNote: 'Acknowledged and reconciled with KP provincial book balance.',
      chainDecision: 'APPROVED',
    },
    {
      body: 'COMMITTEE',
      sourceLevel: 'PROVINCE',
      sourceUnitId: jpkProvince._id,
      sourceName: jpkProvince.name,
      destinationLevel: 'CENTRAL',
      destinationUnitId: central._id,
      destinationName: central.name,
      direction: 'UP',
      amount: 35000,
      mode: 'BANK_TRANSFER',
      reference: 'FT-CMP-2026-003',
      note: 'Transfer request with invalid destination account number',
      state: 'REJECTED',
      initiatedDaysAgo: 15,
      ackDaysAgo: 14,
      decNote: 'Rejected: Bank IBAN details provided did not match Central Secretariat verified account.',
      chainDecision: 'REJECTED',
    },
    {
      body: 'COMMITTEE',
      sourceLevel: 'CENTRAL',
      sourceUnitId: central._id,
      sourceName: central.name,
      destinationLevel: 'PROVINCE',
      destinationUnitId: kpProvince._id,
      destinationName: kpProvince.name,
      direction: 'DOWN',
      amount: 50000,
      mode: 'BANK_TRANSFER',
      reference: 'FT-CMP-2026-004',
      note: 'Central Committee publication subsidy for Khyber Pakhtunkhwa',
      state: 'PENDING_ACK',
      initiatedDaysAgo: 3,
      chainDecision: 'SKIPPED',
    },

    // 4. EXECUTIVE TRANSFERS (UP, DOWN, SAME_TIER)
    {
      body: 'EXECUTIVE',
      sourceLevel: 'CENTRAL',
      sourceUnitId: central._id,
      sourceName: central.name,
      destinationLevel: 'PROVINCE',
      destinationUnitId: jpkProvince._id,
      destinationName: jpkProvince.name,
      direction: 'DOWN',
      amount: 120000,
      mode: 'BANK_TRANSFER',
      reference: 'FT-EXC-2026-001',
      note: 'Monthly central administrative subvention for Junubi Pakhtunkhwa Secretariat',
      state: 'ACKNOWLEDGED',
      initiatedDaysAgo: 18,
      ackDaysAgo: 17,
      decNote: 'Verified and received by Provincial Finance Secretary.',
      chainDecision: 'APPROVED',
    },
    {
      body: 'EXECUTIVE',
      sourceLevel: 'PROVINCE',
      sourceUnitId: jpkProvince._id,
      sourceName: jpkProvince.name,
      destinationLevel: 'PROVINCE',
      destinationUnitId: kpProvince._id,
      destinationName: kpProvince.name,
      direction: 'SAME_TIER',
      amount: 30000,
      mode: 'BANK_TRANSFER',
      reference: 'FT-EXC-2026-002',
      note: 'Inter-provincial solidarity grant: Junubi Pakhtunkhwa to Khyber Pakhtunkhwa workers relief',
      state: 'ACKNOWLEDGED',
      initiatedDaysAgo: 14,
      ackDaysAgo: 12,
      decNote: 'Inter-provincial mutual transfer acknowledged with thanks.',
      chainDecision: 'APPROVED',
    },
    {
      body: 'EXECUTIVE',
      sourceLevel: 'PROVINCE',
      sourceUnitId: kpProvince._id,
      sourceName: kpProvince.name,
      destinationLevel: 'CENTRAL',
      destinationUnitId: central._id,
      destinationName: central.name,
      direction: 'UP',
      amount: 90000,
      mode: 'CHEQUE',
      reference: 'FT-EXC-2026-003',
      note: 'Stale cheque payment voucher',
      state: 'REJECTED',
      initiatedDaysAgo: 10,
      ackDaysAgo: 9,
      decNote: 'Rejected: Bank cheque past 90 days validity. Please reissue fresh banking instrument.',
      chainDecision: 'REJECTED',
    },
    {
      body: 'EXECUTIVE',
      sourceLevel: 'CENTRAL',
      sourceUnitId: central._id,
      sourceName: central.name,
      destinationLevel: 'PROVINCE',
      destinationUnitId: kpProvince._id,
      destinationName: kpProvince.name,
      direction: 'DOWN',
      amount: 95000,
      mode: 'BANK_TRANSFER',
      reference: 'FT-EXC-2026-004',
      note: 'Quarterly operational disbursement for Peshawar Secretariat',
      state: 'PENDING_ACK',
      initiatedDaysAgo: 2,
      chainDecision: 'SKIPPED',
    },
  ];

  let tfCount = 0;
  for (const ts of TRANSFER_SPECS) {
    const exists = await FundTransfer.findOne({ reference: ts.reference });
    if (!exists) {
      const isAck = ts.state === 'ACKNOWLEDGED';
      const isRej = ts.state === 'REJECTED';

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
        initiatedBy: adminUser._id,
        acknowledgedAt: (isAck || isRej) ? daysAgo(ts.ackDaysAgo) : undefined,
        acknowledgedBy: (isAck || isRej) ? adminUser._id : undefined,
        decisionNote: ts.decNote,
        approvalChain: [
          {
            stageCode: 'DEST_FS_ACK',
            stageName: 'Destination Finance Secretary Review',
            decision: ts.chainDecision,
            decidedBy: (isAck || isRej) ? adminUser._id : undefined,
            decidedAt: (isAck || isRej) ? daysAgo(ts.ackDaysAgo) : undefined,
            note: ts.decNote,
          }
        ],
      });
      tfCount++;
    }
  }
  console.log(`  ✓ Inserted ${tfCount} new Fund Transfers (Approved/Acknowledged, Rejected & Pending).`);

  console.log('\n===============================================================');
  console.log('✓ ALL TASKS COMPLETED SUCCESSFULLY!');
  console.log('  1. Renamed Balochistan -> Junubi Pakhtunkhwa.');
  console.log('  2. Renamed KPK -> Khyber Pakhtunkhwa.');
  console.log('  3. Populated meetings across Executive, Committees, Jirgas, Congress (all with valid Venue GPS).');
  console.log('  4. Populated activities with campaign metrics and GPS.');
  console.log('  5. Populated financial data: donations and approved/rejected expenses.');
  console.log('  6. Populated fund transfers with approved (acknowledged), rejected, and pending states.');
  console.log('===============================================================\n');

  await mongoose.disconnect();
}

// Allow standalone execution
if (require.main === module) {
  const uriArg = process.argv[2];
  run(uriArg).catch((err) => {
    console.error('Fatal error during population:', err);
    process.exit(1);
  });
}

module.exports = { run };
