const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const User = require('../src/models/User');
const Province = require('../src/models/Province');

async function seedProvinceAdmins() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis');
  console.log('Connected to MongoDB');

  const provinces = await Province.find().lean();
  console.log(`Found ${provinces.length} provinces:`, provinces.map(p => `${p.name} (${p.code})`));

  const accounts = [
    {
      provinceName: 'Junubi Pakhtunkhwa',
      legacyNames: ['Junubi Pakhtunkhwa', 'Balochistan'],
      email: 'balochistan@admin.com',
      username: 'balochistan',
      fullName: 'Junubi Pakhtunkhwa Provincial Admin',
      password: '123456',
    },
    {
      provinceName: 'Khyber Pakhtunkhwa',
      legacyNames: ['Khyber Pakhtunkhwa', 'KPK'],
      email: 'kpk@admin.com',
      username: 'kpk',
      fullName: 'Khyber Pakhtunkhwa Provincial Admin',
      password: '123456',
    }
  ];

  const results = [];

  for (const acc of accounts) {
    const province = provinces.find(p => (acc.legacyNames || [acc.provinceName]).some(n => n.toLowerCase() === p.name.toLowerCase()));
    if (!province) {
      console.warn(`Province ${acc.provinceName} not found!`);
      continue;
    }

    let user = await User.findOne({
      $or: [
        { email: acc.email },
        { username: acc.username },
        { 'scope.provinceId': province._id, roles: 'PROVINCE_ADMIN' }
      ]
    });

    if (user) {
      console.log(`Found existing user for ${acc.provinceName}: ${user.email || user.username} (ID: ${user._id})`);
      user.email = acc.email;
      user.username = acc.username;
      user.fullName = acc.fullName;
      user.roles = ['PROVINCE_ADMIN'];
      user.scope = { provinceId: province._id };
      user.isActive = true;
      await user.setPassword(acc.password);
      await user.save();
      console.log(`Updated user ${acc.email} for ${acc.provinceName}`);
      results.push({ ...acc, id: user._id, status: 'updated' });
    } else {
      user = new User({
        email: acc.email,
        username: acc.username,
        fullName: acc.fullName,
        roles: ['PROVINCE_ADMIN'],
        scope: { provinceId: province._id },
        isActive: true,
      });
      await user.setPassword(acc.password);
      await user.save();
      console.log(`Created new user ${acc.email} for ${acc.provinceName}`);
      results.push({ ...acc, id: user._id, status: 'created' });
    }
  }

  console.log('\n=== SUMMARY OF PROVINCE ADMINS ===');
  console.log(JSON.stringify(results, null, 2));

  process.exit(0);
}

seedProvinceAdmins().catch(err => {
  console.error(err);
  process.exit(1);
});
