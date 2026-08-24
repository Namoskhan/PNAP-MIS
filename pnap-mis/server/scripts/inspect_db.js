require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function check() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap-mis');
  
  console.log('=== BREAKDOWN OF RECORDS BY UNIT LEVEL ===');
  for (const model of ['meetings', 'activities', 'donations', 'expenses', 'responsibilities']) {
    const agg = await mongoose.connection.db.collection(model).aggregate([
      { $group: { _id: '$unitLevel', count: { $sum: 1 } } }
    ]).toArray();
    console.log(model + ' by unitLevel:', agg);
  }

  console.log('\n=== TOTAL COUNTS ===');
  for (const col of ['provinces', 'districts', 'areas', 'basicunits', 'members', 'users', 'meetings', 'activities', 'donations', 'expenses']) {
    const count = await mongoose.connection.db.collection(col).countDocuments();
    console.log(`${col}: ${count}`);
  }

  console.log('\n=== SAMPLE AREAS AND SUBORDINATES ===');
  const areas = await mongoose.connection.db.collection('areas').find().toArray();
  for (const a of areas.slice(0, 5)) {
    const buCount = await mongoose.connection.db.collection('basicunits').countDocuments({ areaId: a._id });
    const mCount = await mongoose.connection.db.collection('members').countDocuments({ areaId: a._id });
    const mtCount = await mongoose.connection.db.collection('meetings').countDocuments({ areaId: a._id });
    const mtOwn = await mongoose.connection.db.collection('meetings').countDocuments({ unitLevel: 'AREA', unitId: a._id });
    const actCount = await mongoose.connection.db.collection('activities').countDocuments({ areaId: a._id });
    const donCount = await mongoose.connection.db.collection('donations').countDocuments({ areaId: a._id });
    const expCount = await mongoose.connection.db.collection('expenses').countDocuments({ areaId: a._id });
    console.log(`Area "${a.name}": BUs=${buCount}, Members=${mCount}, Meetings(Subtree)=${mtCount}, Meetings(Own)=${mtOwn}, Act(Subtree)=${actCount}, Don=${donCount}, Exp=${expCount}`);
  }

  console.log('\n=== SAMPLE DISTRICTS AND SUBORDINATES ===');
  const districts = await mongoose.connection.db.collection('districts').find().toArray();
  for (const d of districts.slice(0, 4)) {
    const aCount = await mongoose.connection.db.collection('areas').countDocuments({ districtId: d._id });
    const buCount = await mongoose.connection.db.collection('basicunits').countDocuments({ districtId: d._id });
    const mCount = await mongoose.connection.db.collection('members').countDocuments({ districtId: d._id });
    const mtCount = await mongoose.connection.db.collection('meetings').countDocuments({ districtId: d._id });
    const mtOwn = await mongoose.connection.db.collection('meetings').countDocuments({ unitLevel: 'DISTRICT', unitId: d._id });
    const actCount = await mongoose.connection.db.collection('activities').countDocuments({ districtId: d._id });
    console.log(`District "${d.name}": Areas=${aCount}, BUs=${buCount}, Members=${mCount}, Meetings(Subtree)=${mtCount}, Meetings(Own)=${mtOwn}, Act(Subtree)=${actCount}`);
  }

  console.log('\n=== PROVINCES AND SUBORDINATES ===');
  const provinces = await mongoose.connection.db.collection('provinces').find().toArray();
  for (const p of provinces) {
    const dCount = await mongoose.connection.db.collection('districts').countDocuments({ provinceId: p._id });
    const aCount = await mongoose.connection.db.collection('areas').countDocuments({ provinceId: p._id });
    const buCount = await mongoose.connection.db.collection('basicunits').countDocuments({ provinceId: p._id });
    const mCount = await mongoose.connection.db.collection('members').countDocuments({ provinceId: p._id });
    const mtCount = await mongoose.connection.db.collection('meetings').countDocuments({ provinceId: p._id });
    const mtOwn = await mongoose.connection.db.collection('meetings').countDocuments({ unitLevel: 'PROVINCE', unitId: p._id });
    const actCount = await mongoose.connection.db.collection('activities').countDocuments({ provinceId: p._id });
    console.log(`Province "${p.name}": Districts=${dCount}, Areas=${aCount}, BUs=${buCount}, Members=${mCount}, Meetings(Subtree)=${mtCount}, Meetings(Own)=${mtOwn}, Act(Subtree)=${actCount}`);
  }

  process.exit(0);
}
check().catch(console.error);
