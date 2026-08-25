#!/usr/bin/env node
/**
 * ═════════════════════════════════════════════════════════════════════════
 * PNAP-MIS Excel Member Credentials Importer
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Ingests the master register from `PNAP-MIS-member-credentials-2026-08-14.xlsx`:
 *   - Parses all 384 members from the "Members" sheet
 *   - Creates/links organizational units (Provinces, Districts, Areas, Basic Units)
 *   - Upserts Member records & linked User authentication accounts
 *   - Parses and assigns the 283 cabinet positions from "Role Holders"
 *   - Sets member passwords to "Member@123" (or as specified in the sheet)
 *   - Synchronizes Cabinet Slots and User Role permissions
 *
 * Usage:
 *   node server/scripts/import-excel-credentials.js
 *   node server/scripts/import-excel-credentials.js "C:/path/to/custom-sheet.xlsx"
 * ═════════════════════════════════════════════════════════════════════════
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');

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
const Role = require('../src/models/Role');

// Utilities
const { ensureCentralSingleton } = require('../src/utils/centralUnit');
const { ensureSuperAdmin } = require('../src/utils/superAdmin');
const { seedRoles } = require('../src/utils/seedRoles');
const { seedCabinetTemplates } = require('../src/utils/seedCabinetTemplates');
const { syncMemberUserRoles } = require('../src/utils/syncMemberRoles');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis';

// Role Label to System Code mapping
const ROLE_CODE_MAP = {
  'FINANCE SECRETARY': 'FINANCE_SECRETARY',
  'SENIOR MAWIN SECRETARY': 'SENIOR_MAWIN',
  'SENIOR MAWIN': 'SENIOR_MAWIN',
  'SECRETARY': 'SECRETARY',
  'PRESS SECRETARY': 'PRESS_SECRETARY',
  'CULTURE SECRETARY': 'CULTURE_SECRETARY',
  'SPORTS SECRETARY': 'SPORTS_SECRETARY',
  'GENERAL SECRETARY': 'GENERAL_SECRETARY',
  'PRESIDENT / SADDAR': 'PRESIDENT',
  'PRESIDENT': 'PRESIDENT',
  'SR. VICE PRESIDENT': 'SR_VICE_PRESIDENT',
  'SENIOR VICE PRESIDENT': 'SR_VICE_PRESIDENT',
  'VICE PRESIDENT': 'VICE_PRESIDENT',
  'CHAIRMAN': 'CHAIRMAN',
  'CO-CHAIRMAN': 'CO_CHAIRMAN',
  'SENIOR VICE CHAIRMAN': 'SR_VICE_CHAIRMAN',
  'SR. VICE CHAIRMAN': 'SR_VICE_CHAIRMAN',
  'VICE CHAIRMAN': 'VICE_CHAIRMAN',
  'FIRST SECRETARY': 'FIRST_SECRETARY',
};

function normalizeRoleCode(raw) {
  if (!raw) return null;
  const clean = String(raw).trim().toUpperCase();
  if (clean.includes('NO ROLE') || clean === '—') return null;
  return ROLE_CODE_MAP[clean] || clean.replace(/[^A-Z0-9]/g, '_');
}

function resolveFilePath() {
  const customPath = process.argv[2];
  if (customPath && fs.existsSync(customPath)) return path.resolve(customPath);

  const candidates = [
    path.resolve('D:/PNAP-MIS/PNAP-MIS-member-credentials-2026-08-14.xlsx'),
    path.resolve(__dirname, '../../PNAP-MIS-member-credentials-2026-08-14.xlsx'),
    path.resolve(__dirname, '../../../PNAP-MIS-member-credentials-2026-08-14.xlsx'),
    path.resolve(__dirname, '../exports/demo-dataset.xlsx'),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(`Could not find member credentials Excel file at candidates: ${candidates.join(', ')}`);
}

async function run() {
  const filePath = resolveFilePath();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  PNAP-MIS: Member Credentials & Roles Excel Importer');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Loading Excel workbook: ${filePath}`);
  console.log(`Connecting to database: ${MONGO_URI}...`);

  await mongoose.connect(MONGO_URI, { autoIndex: false });
  console.log('✓ Database connected.\n');

  // Baseline setup
  await seedRoles();
  await seedCabinetTemplates();
  const centralDoc = await ensureCentralSingleton();
  const centralUnitId = centralDoc._id;
  const adminRes = await ensureSuperAdmin();
  const superAdminUser = adminRes.user || adminRes;
  const superAdminId = superAdminUser._id;

  // Load Excel
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const membersWs = workbook.getWorksheet('Members');
  const rolesWs = workbook.getWorksheet('Role Holders');

  if (!membersWs) {
    throw new Error('Workbook missing required "Members" worksheet');
  }

  // Pre-compute standard password hash
  const DEFAULT_PW = 'Member@123';
  const DEFAULT_PW_HASH = await bcrypt.hash(DEFAULT_PW, 10);

  // ── Step 1: Ensure Hierarchy (Provinces, Districts, Areas, Basic Units) ──
  console.log('[1/4] Ensuring Geographic Hierarchy from Excel...');
  const provinceMap = new Map(); // Name -> Doc
  const districtMap = new Map(); // "Prov:DistName" -> Doc
  const areaMap = new Map();     // "DistId:AreaName" -> Doc
  const unitMap = new Map();     // "AreaId:UnitName" -> Doc

  // Cache existing hierarchy to minimize cloud roundtrips
  const [existingProvinces, existingDistricts, existingAreas, existingUnits] = await Promise.all([
    Province.find(),
    District.find(),
    Area.find(),
    BasicUnit.find(),
  ]);

  for (const p of existingProvinces) {
    provinceMap.set(p.name.toLowerCase(), p);
    if (p.name.toLowerCase().includes('khyber') || p.name.toLowerCase().includes('kpk')) {
      provinceMap.set('kpk', p);
      provinceMap.set('khyber pakhtunkhwa', p);
    }
  }

  for (const d of existingDistricts) {
    districtMap.set(`${d.provinceId}:${d.name.trim().toLowerCase()}`, d);
  }

  for (const a of existingAreas) {
    areaMap.set(`${a.districtId}:${a.name.trim().toLowerCase()}`, a);
  }

  for (const u of existingUnits) {
    unitMap.set(`${u.areaId}:${u.name.trim().toLowerCase()}`, u);
  }

  // Helper to ensure province
  async function getOrCreateProvince(provName) {
    if (!provName || provName === '—') return null;
    const key = provName.trim().toLowerCase();
    if (provinceMap.has(key)) return provinceMap.get(key);

    let code = 'PROV';
    if (key.includes('baloch')) code = 'BL';
    else if (key.includes('kpk') || key.includes('khyber')) code = 'KP';
    else if (key.includes('punjab')) code = 'PB';
    else if (key.includes('sindh')) code = 'SD';
    else if (key.includes('islam')) code = 'ICT';
    else code = provName.slice(0, 3).toUpperCase();

    let pDoc = await Province.findOne({ $or: [{ name: provName.trim() }, { code }] });
    if (!pDoc) {
      pDoc = await Province.create({ name: provName.trim(), code });
    }
    provinceMap.set(key, pDoc);
    return pDoc;
  }

  function districtCodeFromName(name) {
    const clean = String(name || '').trim();
    if (clean.toLowerCase().includes('quetta east')) return 'QTE';
    if (clean.toLowerCase().includes('quetta west')) return 'QTW';
    if (clean.toLowerCase().includes('qilla abdullah')) return 'QIL';
    if (clean.toLowerCase().includes('karachi east')) return 'KHE';
    if (clean.toLowerCase().includes('karachi central')) return 'KHC';
    const letters = clean.replace(/[^a-zA-Z]/g, '').toUpperCase();
    return letters.slice(0, 3) || 'DST';
  }

  // Helper to ensure district
  async function getOrCreateDistrict(provDoc, distName) {
    if (!provDoc || !distName || distName === '—') return null;
    const key = `${provDoc._id}:${distName.trim().toLowerCase()}`;
    if (districtMap.has(key)) return districtMap.get(key);

    let dDoc = await District.findOne({ provinceId: provDoc._id, name: distName.trim() });
    if (!dDoc) {
      const baseCode = districtCodeFromName(distName);
      let code = baseCode;
      let counter = 1;
      while (await District.findOne({ provinceId: provDoc._id, code })) {
        code = `${baseCode.slice(0, 2)}${counter++}`;
      }
      dDoc = await District.create({
        name: distName.trim(),
        provinceId: provDoc._id,
        code,
      });
    }
    districtMap.set(key, dDoc);
    return dDoc;
  }

  // Helper to ensure area
  async function getOrCreateArea(distDoc, areaName) {
    if (!distDoc || !areaName || areaName === '—') return null;
    const key = `${distDoc._id}:${areaName.trim().toLowerCase()}`;
    if (areaMap.has(key)) return areaMap.get(key);

    let aDoc = await Area.findOne({ districtId: distDoc._id, name: areaName.trim() });
    if (!aDoc) {
      aDoc = await Area.create({
        name: areaName.trim(),
        districtId: distDoc._id,
        provinceId: distDoc.provinceId,
      });
    }
    areaMap.set(key, aDoc);
    return aDoc;
  }

  // Helper to ensure basic unit
  async function getOrCreateBasicUnit(areaDoc, unitName) {
    if (!areaDoc || !unitName || unitName === '—') return null;
    const key = `${areaDoc._id}:${unitName.trim().toLowerCase()}`;
    if (unitMap.has(key)) return unitMap.get(key);

    let uDoc = await BasicUnit.findOne({ areaId: areaDoc._id, name: unitName.trim() });
    if (!uDoc) {
      uDoc = await BasicUnit.create({
        name: unitName.trim(),
        areaId: areaDoc._id,
        districtId: areaDoc.districtId,
        provinceId: areaDoc.provinceId,
      });
    }
    unitMap.set(key, uDoc);
    return uDoc;
  }

  // ── Step 2: Import Members & Accounts ─────────────────────────────
  console.log('[2/4] Upserting 380+ Member profiles and User accounts...');
  const memberRows = [];
  membersWs.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const v = row.values;
      if (v[10] && v[10] !== '—') {
        memberRows.push({
          memberId: v[2],
          fullName: v[3],
          provinceName: v[4],
          districtName: v[5],
          areaName: v[6],
          basicUnitName: v[7],
          assignedRole: v[8],
          roleHeldAt: v[9],
          cnic: v[10],
          phone: v[11],
          email: v[12],
          username: v[13],
          password: v[14] || DEFAULT_PW,
          status: v[15] || 'ACTIVE',
        });
      }
    }
  });

  const memberByCnic = new Map();
  let createdCount = 0;
  let updatedCount = 0;

  for (const m of memberRows) {
    const provDoc = await getOrCreateProvince(m.provinceName);
    const distDoc = await getOrCreateDistrict(provDoc, m.districtName);
    const areaDoc = await getOrCreateArea(distDoc, m.areaName);
    const unitDoc = await getOrCreateBasicUnit(areaDoc, m.basicUnitName);

    const pwHash = m.password === DEFAULT_PW ? DEFAULT_PW_HASH : await bcrypt.hash(m.password, 10);

    let member = await Member.findOne({ cnic: m.cnic });
    if (!member) {
      member = new Member({
        memberId: m.memberId,
        fullName: m.fullName,
        fatherOrHusbandName: `${m.fullName.split(' ')[0]} Senior`,
        cnic: m.cnic,
        phone: m.phone,
        email: m.email,
        username: m.username,
        gender: 'MALE',
        provinceId: provDoc ? provDoc._id : undefined,
        districtId: distDoc ? distDoc._id : undefined,
        areaId: areaDoc ? areaDoc._id : undefined,
        basicUnitId: unitDoc ? unitDoc._id : undefined,
        status: 'ACTIVE',
        statusReason: 'Imported from official register',
        submittedVia: 'ADMIN',
        dateJoined: new Date('2026-01-15'),
        approvedAt: new Date('2026-01-15'),
        lastActivityAt: new Date(),
        passwordHash: pwHash,
      });
      await member.save();
      createdCount++;
    } else {
      member.fullName = m.fullName;
      member.phone = m.phone;
      member.email = m.email;
      member.username = m.username;
      member.passwordHash = pwHash;
      if (provDoc) member.provinceId = provDoc._id;
      if (distDoc) member.districtId = distDoc._id;
      if (areaDoc) member.areaId = areaDoc._id;
      if (unitDoc) member.basicUnitId = unitDoc._id;
      await member.save();
      updatedCount++;
    }

    memberByCnic.set(m.cnic, member);

    // Upsert linked User account
    let user = await User.findOne({ $or: [{ cnic: m.cnic }, { username: m.username }, { email: m.email }] });
    if (!user) {
      user = new User({
        fullName: m.fullName,
        email: m.email,
        cnic: m.cnic,
        username: m.username,
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
        passwordHash: pwHash,
      });
      await user.save();
    } else {
      user.fullName = m.fullName;
      user.memberId = member._id;
      user.passwordHash = pwHash;
      user.isActive = true;
      await user.save();
    }
  }

  console.log(`✓ Members processed: ${createdCount} created, ${updatedCount} updated.`);

  // ── Step 3: Parse and Assign Role Holders ─────────────────────────
  console.log('[3/4] Parsing and populating 280+ Cabinet Role Assignments...');
  const roleRows = [];
  if (rolesWs) {
    rolesWs.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const v = row.values;
        if (v[10] && v[10] !== '—' && !String(v[2]).includes('orphaned')) {
          roleRows.push({
            memberId: v[2],
            fullName: v[3],
            provinceName: v[4],
            districtName: v[5],
            areaName: v[6],
            basicUnitName: v[7],
            assignedRole: v[8],
            roleHeldAt: v[9],
            cnic: v[10],
          });
        }
      }
    });
  }

  // Pre-seed cabinet slots for all discovered units
  await CabinetSlot.seedFor('CENTRAL', centralUnitId);
  for (const p of provinceMap.values()) await CabinetSlot.seedFor('PROVINCE', p._id);
  for (const d of districtMap.values()) await CabinetSlot.seedFor('DISTRICT', d._id);
  for (const a of areaMap.values()) await CabinetSlot.seedFor('AREA', a._id);
  for (const u of unitMap.values()) await CabinetSlot.seedFor('BASIC_UNIT', u._id);

  let rolesAssignedCount = 0;

  for (const item of roleRows) {
    const member = memberByCnic.get(item.cnic) || await Member.findOne({ cnic: item.cnic });
    if (!member) continue;

    // Handle compound entries like "Finance Secretary, Secretary" and "BASIC UNIT · Gulberg 2, AREA · Gulberg"
    const rawRoles = String(item.assignedRole).split(',').map((s) => s.trim());
    const rawLocations = String(item.roleHeldAt).split(',').map((s) => s.trim());

    for (let i = 0; i < rawRoles.length; i++) {
      const roleText = rawRoles[i];
      const locText = rawLocations[i] || rawLocations[0];
      const roleCode = normalizeRoleCode(roleText);
      if (!roleCode) continue;

      // Parse Location (e.g. "AREA · Dobandi", "DISTRICT · Qilla Abdullah", "CENTRAL · Central")
      const parts = locText.split('·').map((s) => s.trim());
      const levelStr = (parts[0] || '').toUpperCase();
      const unitName = parts[1] || '';

      let unitLevel = null;
      let targetUnitId = null;

      if (levelStr.includes('CENTRAL')) {
        unitLevel = 'CENTRAL';
        targetUnitId = centralUnitId;
      } else if (levelStr.includes('PROVINCE')) {
        unitLevel = 'PROVINCE';
        const pDoc = await getOrCreateProvince(unitName);
        if (pDoc) targetUnitId = pDoc._id;
      } else if (levelStr.includes('DISTRICT')) {
        unitLevel = 'DISTRICT';
        let dDoc = await District.findOne({ name: unitName });
        if (!dDoc && member.districtId) dDoc = await District.findById(member.districtId);
        if (dDoc) targetUnitId = dDoc._id;
      } else if (levelStr.includes('AREA')) {
        unitLevel = 'AREA';
        let aDoc = await Area.findOne({ name: unitName });
        if (!aDoc && member.areaId) aDoc = await Area.findById(member.areaId);
        if (aDoc) targetUnitId = aDoc._id;
      } else if (levelStr.includes('BASIC UNIT')) {
        unitLevel = 'BASIC_UNIT';
        let uDoc = await BasicUnit.findOne({ name: unitName });
        if (!uDoc && member.basicUnitId) uDoc = await BasicUnit.findById(member.basicUnitId);
        if (uDoc) targetUnitId = uDoc._id;
      }

      if (!unitLevel || !targetUnitId) continue;

      // Ensure Cabinet Slot exists
      await CabinetSlot.updateOne(
        { unitLevel, unitId: targetUnitId, roleCode },
        { $setOnInsert: { unitLevel, unitId: targetUnitId, roleCode, isMandatory: true, sortOrder: 10 } },
        { upsert: true }
      );

      // Create / Update RoleAssignment
      let ra = await RoleAssignment.findOne({
        unitLevel,
        unitId: targetUnitId,
        roleCode,
        memberId: member._id,
      });

      if (!ra) {
        ra = await RoleAssignment.create({
          unitLevel,
          unitId: targetUnitId,
          memberId: member._id,
          roleCode,
          state: 'APPROVED',
          startedAt: new Date('2026-01-15'),
          initiatedBy: superAdminId,
          decidedBy: superAdminId,
          decidedAt: new Date('2026-01-15'),
        });
      }

      // Link slot
      await CabinetSlot.updateOne(
        { unitLevel, unitId: targetUnitId, roleCode },
        { $set: { filledByAssignmentId: ra._id, filledMemberId: member._id } }
      );

      // Sync member's User row
      await syncMemberUserRoles(member._id);
      rolesAssignedCount++;
    }
  }

  console.log(`✓ Role assignments configured: ${rolesAssignedCount} active cabinet roles linked.`);

  // ── Step 4: Re-export updated dataset to Excel ─────────────────────
  console.log('\n[4/4] Updating export workbook at server/exports/demo-dataset.xlsx...');
  try {
    const { generateExcel } = require('./generate-demo-excel');
    await generateExcel();
  } catch (err) {
    console.warn('[import] Export update notice:', err.message);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  EXCEL CREDENTIALS IMPORT COMPLETED SUCCESSFULLY!');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  • Total Members in Register: ${memberRows.length}`);
  console.log(`  • Total Role Holders Linked: ${rolesAssignedCount}`);
  console.log(`  • Default Password:          "${DEFAULT_PW}"`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[import-excel-credentials] Failed:', err);
  process.exit(1);
});
