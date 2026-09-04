const mongoose = require('mongoose');
const env = require('../config/env');
const User = require('../models/User');
const Province = require('../models/Province');
const District = require('../models/District');
const Area = require('../models/Area');
const BasicUnit = require('../models/BasicUnit');
const CabinetSlot = require('../models/CabinetSlot');
const { ensureAreaAdmin } = require('./areaAdmin');
const { ensureDistrictAdmin } = require('./districtAdmin');
const { ensureProvinceAdmin } = require('./provinceAdmin');
const { ensureCentralAdmin } = require('./centralAdmin');

/**
 * Idempotent minimal seed for the 2-Province structure:
 *  - Khyber Pakhtunkhwa (KP)
 *  - Junubi Pakhtunkhwa (Balochistan) (JPK)
 *
 * Can be run safely via: npm run seed
 */
async function run() {
  await mongoose.connect(env.MONGO_URI);
  console.log('[seed] Connected to MongoDB');

  // Clean up any empty legacy provinces with 0 members (e.g. Sindh, Punjab)
  const Member = require('../models/Member');
  const legacyProvinces = await Province.find({ code: { $nin: ['KP', 'JPK'] } });
  for (const lp of legacyProvinces) {
    const memberCount = await Member.countDocuments({ provinceId: lp._id });
    if (memberCount === 0) {
      console.log(`[seed] Removing unused legacy province ${lp.name} (${lp.code})`);
      await District.deleteMany({ provinceId: lp._id });
      await Area.deleteMany({ provinceId: lp._id });
      await BasicUnit.deleteMany({ provinceId: lp._id });
      await Province.deleteOne({ _id: lp._id });
    }
  }

  const provinces = [
    { name: 'Khyber Pakhtunkhwa', code: 'KP' },
    { name: 'Junubi Pakhtunkhwa (Balochistan)', code: 'JPK' },
  ];

  for (const p of provinces) {
    await Province.updateOne(
      { code: p.code },
      { $set: { name: p.name, code: p.code, isActive: true } },
      { upsert: true }
    );
  }

  // Seed sample districts
  const districtsByProvince = {
    KP: [
      { name: 'Peshawar', code: 'PSH' },
      { name: 'Mardan', code: 'MRD' },
      { name: 'Swat', code: 'SWT' },
      { name: 'Bannu', code: 'BNU' },
    ],
    JPK: [
      { name: 'Quetta', code: 'QTA' },
      { name: 'Pishin', code: 'PSN' },
      { name: 'Chaman', code: 'CHM' },
      { name: 'Zhob', code: 'ZHB' },
    ],
  };

  for (const [provinceCode, list] of Object.entries(districtsByProvince)) {
    const province = await Province.findOne({ code: provinceCode });
    if (!province) continue;
    for (const d of list) {
      await District.updateOne(
        { provinceId: province._id, code: d.code },
        { $setOnInsert: { name: d.name, code: d.code, provinceId: province._id, isActive: true } },
        { upsert: true }
      );
    }
  }

  // Seed sample areas
  const areasByDistrict = {
    PSH: ['Hayatabad', 'University Town'],
    MRD: ['Mardan City', 'Rustam'],
    SWT: ['Mingora', 'Barikot'],
    BNU: ['Bannu City', 'Township'],
    QTA: ['Satellite Town', 'Cantt'],
    PSN: ['Pishin Bazar', 'Yaru'],
    CHM: ['Chaman City', 'Boghra'],
    ZHB: ['Zhob City', 'Appozai'],
  };

  for (const [districtCode, areas] of Object.entries(areasByDistrict)) {
    const district = await District.findOne({ code: districtCode });
    if (!district) continue;
    for (const name of areas) {
      await Area.updateOne(
        { districtId: district._id, name },
        { $setOnInsert: { name, districtId: district._id, provinceId: district.provinceId, isActive: true } },
        { upsert: true }
      );
    }
  }

  // Basic units per area (only if none exist yet)
  const allAreas = await Area.find().lean();
  for (const area of allAreas) {
    const existingCount = await BasicUnit.countDocuments({ areaId: area._id });
    if (existingCount === 0) {
      for (const name of ['Unit 1', 'Unit 2']) {
        await BasicUnit.create({
          name,
          areaId: area._id,
          districtId: area.districtId,
          provinceId: area.provinceId,
          isActive: true,
        });
      }
    }
  }

  // Ensure bootstrap super admin
  const adminEmail = 'super@admin.com';
  let admin = await User.findOne({ $or: [{ username: 'super' }, { email: adminEmail }] });
  if (!admin) {
    admin = new User({
      username: 'super',
      email: adminEmail,
      fullName: 'PNAP Super Admin',
      roles: ['SUPER_ADMIN'],
      isActive: true,
      isBootstrap: true,
    });
    await admin.setPassword('123456');
    await admin.save();
    console.log(`[seed] Created super admin ${adminEmail} / 123456`);
  } else {
    admin.roles = ['SUPER_ADMIN'];
    admin.isBootstrap = true;
    await admin.setPassword('123456');
    await admin.save();
    console.log(`[seed] Super admin synchronized: username="${admin.username}"`);
  }

  // Ensure Central Admin
  let central = await ensureCentralAdmin();
  console.log(`[seed] Central admin: ${central?.created ? 'created' : 'already exists'} (username "${central?.username}")`);

  // Ensure province admins
  const allProvinces = await Province.find({ code: { $in: ['KP', 'JPK'] } }).lean();
  for (const p of allProvinces) {
    await ensureProvinceAdmin(p);
  }

  // Ensure district admins
  const allDistricts = await District.find().lean();
  for (const d of allDistricts) {
    await ensureDistrictAdmin(d);
  }

  // Ensure area admins
  for (const a of allAreas) {
    await ensureAreaAdmin(a);
  }

  // Seed cabinet slots
  const allBasicUnits = await BasicUnit.find().lean();
  for (const u of allBasicUnits) {
    await CabinetSlot.seedFor('BASIC_UNIT', u._id);
  }
  for (const a of allAreas) {
    await CabinetSlot.seedFor('AREA', a._id);
  }
  for (const d of allDistricts) {
    await CabinetSlot.seedFor('DISTRICT', d._id);
  }
  for (const p of allProvinces) {
    await CabinetSlot.seedFor('PROVINCE', p._id);
  }

  console.log('[seed] Done. 2-Province structure verified.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
