const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const User = require('../src/models/User');
const Province = require('../src/models/Province');
const District = require('../src/models/District');
const Area = require('../src/models/Area');

async function seedAllAdmins() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis');
  console.log('Connected to MongoDB');

  const provinces = await Province.find().lean();
  const districts = await District.find().lean();
  const areas = await Area.find().lean();

  const quetta = districts.find(d => d.name.toLowerCase().includes('quetta'));
  const peshawar = districts.find(d => d.name.toLowerCase().includes('peshawar'));
  const satelliteTown = areas.find(a => a.name.toLowerCase().includes('satellite'));
  const hayatabad = areas.find(a => a.name.toLowerCase().includes('hayatabad'));

  const accounts = [
    {
      fullName: 'PNAP Super Admin',
      username: 'super',
      email: 'super@admin.com',
      password: '123456',
      roles: ['SUPER_ADMIN'],
      scope: {},
    },
    {
      fullName: 'Central Admin',
      username: 'central',
      email: 'central@admin.com',
      password: '123456',
      roles: ['CENTRAL_ADMIN'],
      scope: {},
    },
    {
      fullName: 'Junubi Pakhtunkhwa (Balochistan) Provincial Admin',
      username: 'balochistan',
      email: 'jpk@admin.com',
      password: '123456',
      roles: ['PROVINCE_ADMIN'],
      scope: { provinceId: provinces.find(p => p.code === 'JPK' || /Junubi/i.test(p.name))?._id },
    },
    {
      fullName: 'Khyber Pakhtunkhwa Provincial Admin',
      username: 'kpk',
      email: 'kp@admin.com',
      password: '123456',
      roles: ['PROVINCE_ADMIN'],
      scope: { provinceId: provinces.find(p => p.code === 'KP' || /Khyber/i.test(p.name))?._id },
    },
    {
      fullName: 'Quetta District Admin',
      username: 'district_quetta',
      email: 'district.quetta@admin.com',
      password: '123456',
      roles: ['DISTRICT_ADMIN'],
      scope: { provinceId: quetta?.provinceId, districtId: quetta?._id },
    },
    {
      fullName: 'Peshawar District Admin',
      username: 'district_peshawar',
      email: 'district.peshawar@admin.com',
      password: '123456',
      roles: ['DISTRICT_ADMIN'],
      scope: { provinceId: peshawar?.provinceId, districtId: peshawar?._id },
    },
    {
      fullName: 'Satellite Town Area Admin',
      username: 'area_satellite-town',
      email: 'area.satellite-town@admin.com',
      password: '123456',
      roles: ['AREA_ADMIN'],
      scope: { provinceId: satelliteTown?.provinceId, districtId: satelliteTown?.districtId, areaId: satelliteTown?._id },
    },
    {
      fullName: 'Hayatabad Area Admin',
      username: 'area_hayatabad',
      email: 'area.hayatabad@admin.com',
      password: '123456',
      roles: ['AREA_ADMIN'],
      scope: { provinceId: hayatabad?.provinceId, districtId: hayatabad?.districtId, areaId: hayatabad?._id },
    },
  ];

  const results = [];

  for (const acc of accounts) {
    let user = await User.findOne({
      $or: [
        { email: acc.email },
        { username: acc.username }
      ]
    });

    if (user) {
      user.email = acc.email;
      user.username = acc.username;
      user.fullName = acc.fullName;
      user.roles = acc.roles;
      user.scope = acc.scope;
      user.isActive = true;
      await user.setPassword(acc.password);
      await user.save();
      results.push({ ...acc, status: 'updated', id: user._id });
    } else {
      user = new User({
        email: acc.email,
        username: acc.username,
        fullName: acc.fullName,
        roles: acc.roles,
        scope: acc.scope,
        isActive: true,
      });
      await user.setPassword(acc.password);
      await user.save();
      results.push({ ...acc, status: 'created', id: user._id });
    }
  }

  console.log('\n=== SEEDED ALL ADMIN TIERS ===');
  console.log(JSON.stringify(results.map(r => ({
    role: r.roles[0],
    name: r.fullName,
    username: r.username,
    email: r.email,
    password: 'password',
    scope: r.scope
  })), null, 2));

  process.exit(0);
}

seedAllAdmins().catch(err => {
  console.error(err);
  process.exit(1);
});
