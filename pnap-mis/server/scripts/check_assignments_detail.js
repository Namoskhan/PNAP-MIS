const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function checkAllAssignments() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis');
  
  const assignments = await mongoose.connection.db.collection('roleassignments').find().toArray();
  console.log(`\n=== TOTAL ROLE ASSIGNMENTS: ${assignments.length} ===`);
  
  const byLevel = {};
  for (const a of assignments) {
    byLevel[a.unitLevel] = (byLevel[a.unitLevel] || 0) + 1;
  }
  console.log('By Unit Level:', byLevel);

  console.log('\n=== PROVINCE / DISTRICT / CENTRAL LEVEL ROLE ASSIGNMENTS ===');
  for (const a of assignments) {
    if (['PROVINCE', 'DISTRICT', 'CENTRAL'].includes(a.unitLevel)) {
      const member = await mongoose.connection.db.collection('members').findOne({ _id: a.memberId });
      const user = await mongoose.connection.db.collection('users').findOne({ memberId: a.memberId });
      console.log(`[${a.unitLevel}] Role: ${a.roleCode} | Member: ${member?.fullName} (CNIC: ${member?.cnic}, Email: ${member?.email}) | User: ${user?.username || user?.email} | User.roles: ${JSON.stringify(user?.roles)}`);
    }
  }

  process.exit(0);
}

checkAllAssignments().catch(console.error);
