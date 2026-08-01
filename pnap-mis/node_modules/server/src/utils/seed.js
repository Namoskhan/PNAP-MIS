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

async function run() {
  await mongoose.connect(env.MONGO_URI);
  console.log('[seed] connected');

  const provinces = [
    { name: 'Sindh', code: 'SD' },
    { name: 'Punjab', code: 'PB' },
    { name: 'Khyber Pakhtunkhwa', code: 'KP' },
    { name: 'Balochistan', code: 'BL' },
  ];

  for (const p of provinces) {
    await Province.updateOne({ code: p.code }, { $setOnInsert: p }, { upsert: true });
  }

  // Seed at least one district + area + basic unit per province so
  // the public registration form has working cascading dropdowns
  // regardless of which province a tester picks.
  const districtsByProvince = {
    SD: [
      { name: 'Karachi East', code: 'KHE' },
      { name: 'Karachi West', code: 'KHW' },
      { name: 'Hyderabad', code: 'HYD' },
    ],
    PB: [
      { name: 'Lahore', code: 'LHR' },
      { name: 'Rawalpindi', code: 'RWP' },
      { name: 'Multan', code: 'MUL' },
    ],
    KP: [
      { name: 'Peshawar', code: 'PSH' },
      { name: 'Mardan', code: 'MRD' },
    ],
    BL: [
      { name: 'Quetta', code: 'QTA' },
      { name: 'Gwadar', code: 'GWD' },
    ],
  };

  for (const [provinceCode, list] of Object.entries(districtsByProvince)) {
    const province = await Province.findOne({ code: provinceCode });
    for (const d of list) {
      await District.updateOne(
        { provinceId: province._id, code: d.code },
        { $setOnInsert: { ...d, provinceId: province._id } },
        { upsert: true }
      );
    }
  }

  // Seed sample areas + basic units for every district above.
  const areasByDistrict = {
    KHE: ['Gulshan', 'North Nazimabad', 'Saddar'],
    KHW: ['Orangi', 'SITE'],
    HYD: ['Latifabad', 'Qasimabad'],
    LHR: ['Model Town', 'Gulberg', 'Township'],
    RWP: ['Saddar', 'Cantt'],
    MUL: ['Shah Rukn-e-Alam', 'Bosan Town'],
    PSH: ['University Town', 'Hayatabad'],
    MRD: ['Mardan City'],
    QTA: ['Cantt', 'Satellite Town'],
    GWD: ['Gwadar City'],
  };

  for (const [districtCode, areas] of Object.entries(areasByDistrict)) {
    const district = await District.findOne({ code: districtCode });
    if (!district) continue;
    for (const name of areas) {
      await Area.updateOne(
        { districtId: district._id, name },
        { $setOnInsert: { name, districtId: district._id, provinceId: district.provinceId } },
        { upsert: true }
      );
    }
  }

  // Two basic units per area so every cascade in the public form
  // ends with selectable options.
  const allAreas = await Area.find().lean();
  for (const area of allAreas) {
    for (const name of ['Block 1', 'Block 2']) {
      await BasicUnit.updateOne(
        { areaId: area._id, name },
        {
          $setOnInsert: {
            name,
            areaId: area._id,
            districtId: area.districtId,
            provinceId: area.provinceId,
          },
        },
        { upsert: true }
      );
    }
  }

  const adminEmail = 'admin@pnap.local';
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = new User({
      email: adminEmail,
      fullName: 'System Administrator',
      roles: ['SUPER_ADMIN'],
      isActive: true,
    });
    await admin.setPassword('Admin@12345');
    await admin.save();
    console.log(`[seed] created super admin ${adminEmail} / Admin@12345`);
  } else {
    console.log(`[seed] admin already exists: ${adminEmail}`);
  }

  // Ensure every area has its auto-provisioned Area Admin user.
  // Idempotent — only creates an admin where none exists.
  // (Reuse the `allAreas` declared above for the basic-unit seed.)
  let createdAreaAdmins = 0;
  for (const a of allAreas) {
    const r = await ensureAreaAdmin(a);
    if (r?.created) createdAreaAdmins++;
  }
  console.log(`[seed] area admins: ${createdAreaAdmins} new, ${allAreas.length - createdAreaAdmins} already existed`);

  // Likewise for District Admins — every district gets one auto-
  // provisioned admin (username = slug(district.name), pw = 123456).
  const allDistricts = await District.find({}).lean();
  let createdDistrictAdmins = 0;
  for (const d of allDistricts) {
    const r = await ensureDistrictAdmin(d);
    if (r?.created) createdDistrictAdmins++;
  }
  console.log(`[seed] district admins: ${createdDistrictAdmins} new, ${allDistricts.length - createdDistrictAdmins} already existed`);

  // And Province Admins — username = slug(province.name).
  const allProvinces = await Province.find({}).lean();
  let createdProvinceAdmins = 0;
  for (const p of allProvinces) {
    const r = await ensureProvinceAdmin(p);
    if (r?.created) createdProvinceAdmins++;
  }
  console.log(`[seed] province admins: ${createdProvinceAdmins} new, ${allProvinces.length - createdProvinceAdmins} already existed`);

  // Top-level Central Admin (pnap/123456) — global scope.
  const central = await ensureCentralAdmin();
  console.log(`[seed] central admin: ${central?.created ? 'created' : 'already exists'} (username "${central?.username}")`);

  // Back-fill cabinet slot rows for every Basic Unit (and Area)
  // already in the database. CabinetSlot.seedFor() is idempotent
  // ($setOnInsert), so existing slots are not touched. After this,
  // every BU has the 6-slot template — Secretary, Senior Mawin,
  // Finance Sec. (mandatory) + Press, Culture, Sports (optional) —
  // ready for the Area Admin to assign.
  const allBasicUnits = await BasicUnit.find().lean();
  for (const u of allBasicUnits) {
    await CabinetSlot.seedFor('BASIC_UNIT', u._id);
  }
  for (const a of allAreas) {
    await CabinetSlot.seedFor('AREA', a._id);
  }
  console.log(`[seed] cabinet slots seeded for ${allBasicUnits.length} basic unit(s), ${allAreas.length} area(s)`);

  console.log('[seed] done');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
