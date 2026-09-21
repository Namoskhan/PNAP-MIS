const path = require('node:path');
const appRoot = path.resolve(__dirname, '../../../pnap-mis');
const appRequire = require('node:module').createRequire(path.join(appRoot, 'server/package.json'));
const mongoose = appRequire('mongoose');

(async () => {
  const uri = 'mongodb://127.0.0.1:27017/pnap_mis';
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    const db = mongoose.connection.db;
    const names = ['provinces', 'districts', 'areas', 'basicunits', 'members', 'roleassignments'];
    const counts = {};
    for (const name of names) counts[name] = await db.collection(name).countDocuments();
    const membersPerBasicUnit = await db.collection('members').aggregate([
      { $group: { _id: '$basicUnitId', count: { $sum: 1 } } },
      { $group: { _id: null, units: { $sum: 1 }, min: { $min: '$count' }, max: { $max: '$count' }, mean: { $avg: '$count' } } },
    ]).toArray();
    const rolesByLevel = await db.collection('roleassignments').aggregate([
      { $group: { _id: '$unitLevel', count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).toArray();
    const rolesPerUnit = await db.collection('roleassignments').aggregate([
      { $group: { _id: { level: '$unitLevel', unitId: '$unitId' }, count: { $sum: 1 } } },
      { $group: { _id: '$_id.level', units: { $sum: 1 }, min: { $min: '$count' }, max: { $max: '$count' }, mean: { $avg: '$count' } } },
      { $sort: { _id: 1 } },
    ]).toArray();
    console.log(JSON.stringify({ host: '127.0.0.1', database: 'pnap_mis', mode: 'read-only', counts, membersPerBasicUnit, rolesByLevel, rolesPerUnit }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
})().catch((error) => {
  console.error(error.stack);
  process.exit(1);
});
