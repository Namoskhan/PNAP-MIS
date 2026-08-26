const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis');
  
  const provinces = await mongoose.connection.db.collection('provinces').find().toArray();
  for (const p of provinces) {
    console.log(`\n================== PROVINCE: ${p.name} (${p.code}) [ID: ${p._id}] ==================`);
    const pAdmins = await mongoose.connection.db.collection('users').find({
      'scope.provinceId': p._id,
      roles: { $in: ['PROVINCE_ADMIN'] }
    }).toArray();
    console.log(`Province Admins: ${pAdmins.length ? pAdmins.map(u => `${u.fullName} (email: ${u.email}, username: ${u.username})`).join(', ') : 'None'}`);

    const districts = await mongoose.connection.db.collection('districts').find({ provinceId: p._id }).toArray();
    console.log(`Districts (${districts.length}):`);
    for (const d of districts) {
      const dAdmins = await mongoose.connection.db.collection('users').find({
        'scope.districtId': d._id,
        roles: { $in: ['DISTRICT_ADMIN'] }
      }).toArray();
      console.log(`  - District: ${d.name} (${d.code}) [ID: ${d._id}] -> Admins: ${dAdmins.length ? dAdmins.map(u => `${u.fullName} (${u.email || u.username})`).join(', ') : 'None'}`);
      
      const areas = await mongoose.connection.db.collection('areas').find({ districtId: d._id }).toArray();
      for (const a of areas) {
        const aAdmins = await mongoose.connection.db.collection('users').find({
          'scope.areaId': a._id,
          roles: { $in: ['AREA_ADMIN'] }
        }).toArray();
        const bus = await mongoose.connection.db.collection('basicunits').find({ areaId: a._id }).toArray();
        console.log(`      * Area: ${a.name} [ID: ${a._id}] -> Admins: ${aAdmins.length ? aAdmins.map(u => `${u.fullName} (${u.email || u.username})`).join(', ') : 'None'} | Basic Units: ${bus.length}`);
      }
    }
  }

  process.exit(0);
}
run().catch(console.error);
