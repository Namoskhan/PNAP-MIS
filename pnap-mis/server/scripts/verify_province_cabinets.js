const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function verifyProvinceCabinets() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis');
  
  const provinces = await mongoose.connection.db.collection('provinces').find().toArray();
  for (const p of provinces) {
    console.log(`\n=== PROVINCE: ${p.name} (ID: ${p._id}) ===`);
    const assignments = await mongoose.connection.db.collection('roleassignments').find({
      unitLevel: 'PROVINCE',
      unitId: p._id
    }).toArray();
    
    console.log(`Province Cabinet Members (${assignments.length}):`);
    for (const a of assignments) {
      const m = await mongoose.connection.db.collection('members').findOne({ _id: a.memberId });
      const u = await mongoose.connection.db.collection('users').findOne({ memberId: a.memberId });
      console.log(`  - ${a.roleCode}: ${m?.fullName} | CNIC: ${m?.cnic} | Email: ${m?.email} | Username: ${u?.username}`);
    }
  }
  process.exit(0);
}

verifyProvinceCabinets().catch(console.error);
