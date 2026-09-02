const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function checkMemberRoles() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis');
  
  console.log('=== ROLE ASSIGNMENTS IN DB ===');
  const roleAssignments = await mongoose.connection.db.collection('roleassignments').find().toArray();
  console.log(`Total Role Assignments: ${roleAssignments.length}`);
  for (const ra of roleAssignments) {
    const member = await mongoose.connection.db.collection('members').findOne({ _id: ra.memberId });
    console.log(`- Role: ${ra.roleCode} | UnitLevel: ${ra.unitLevel} | UnitId: ${ra.unitId} | State: ${ra.state} | Member: ${member?.fullName} (${member?.cnic || member?.email})`);
  }

  console.log('\n=== MEMBERS WITH ROLES / CABINET SLOTS ===');
  const members = await mongoose.connection.db.collection('members').find().toArray();
  console.log(`Total Members: ${members.length}`);
  
  // Find members who have roles or cabinet positions or province level links
  const provMembers = await mongoose.connection.db.collection('members').find({
    $or: [
      { provinceId: { $exists: true, $ne: null } },
      { 'cabinet.roleCode': { $exists: true } },
      { roles: { $exists: true, $ne: [] } }
    ]
  }).toArray();

  console.log('\n=== SAMPLE MEMBERS IN PROVINCES ===');
  for (const m of members.slice(0, 15)) {
    const user = await mongoose.connection.db.collection('users').findOne({ memberId: m._id });
    console.log(`Member: ${m.fullName} | CNIC: ${m.cnic} | Email: ${m.email} | Scope: P:${m.provinceId} D:${m.districtId} A:${m.areaId} BU:${m.basicUnitId} | User Account: ${user ? `${user.username || user.email} (Roles: ${JSON.stringify(user.roles)})` : 'None'}`);
  }

  console.log('\n=== USERS LINKED TO MEMBERS (memberId != null) ===');
  const linkedUsers = await mongoose.connection.db.collection('users').find({ memberId: { $ne: null } }).toArray();
  console.log(`Total users linked to members: ${linkedUsers.length}`);
  for (const u of linkedUsers.slice(0, 10)) {
    console.log(`User: ${u.fullName} (${u.email || u.username}) | Roles: ${JSON.stringify(u.roles)} | memberId: ${u.memberId}`);
  }

  process.exit(0);
}

checkMemberRoles().catch(console.error);
