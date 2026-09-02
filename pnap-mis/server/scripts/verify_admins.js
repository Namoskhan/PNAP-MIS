const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const User = require('../src/models/User');

async function test() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis');
  
  console.log('=== VERIFYING ADMIN CREDENTIALS ===');
  const admins = await User.find({
    $or: [
      { roles: { $in: ['SUPER_ADMIN', 'CENTRAL_ADMIN', 'PROVINCE_ADMIN'] } },
      { username: 'super' }
    ]
  });

  for (const user of admins) {
    const pwCheck = await user.verifyPassword('123456');
    console.log(`- Full Name: ${user.fullName}`);
    console.log(`  Email:     ${user.email || 'N/A'}`);
    console.log(`  Username:  ${user.username || 'N/A'}`);
    console.log(`  Roles:     ${JSON.stringify(user.roles)}`);
    console.log(`  Scope:     ${JSON.stringify(user.scope)}`);
    console.log(`  PW 123456: ${pwCheck}`);
    console.log('');
  }
  process.exit(0);
}
test().catch(console.error);
