const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function check() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis');
  const db = mongoose.connection.db;

  console.log('--- RESPONSIBILITIES BY UNIT LEVEL ---');
  console.log(await db.collection('responsibilities').aggregate([
    { $group: { _id: '$unitLevel', count: { $sum: 1 } } }
  ]).toArray());

  console.log('\n--- DONATIONS BY UNIT LEVEL ---');
  console.log(await db.collection('donations').aggregate([
    { $group: { _id: '$unitLevel', count: { $sum: 1 } } }
  ]).toArray());

  console.log('\n--- EXPENSES BY UNIT LEVEL ---');
  console.log(await db.collection('expenses').aggregate([
    { $group: { _id: '$unitLevel', count: { $sum: 1 } } }
  ]).toArray());

  console.log('\n--- CENTRAL ---');
  const central = await db.collection('centrals').findOne();
  if (central) {
    const r = await db.collection('responsibilities').countDocuments({ unitId: central._id });
    const don = await db.collection('donations').countDocuments({ unitId: central._id });
    const exp = await db.collection('expenses').countDocuments({ unitId: central._id });
    console.log(`Central (${central.name}): Resp=${r}, Don=${don}, Exp=${exp}`);
  }

  console.log('\n--- PROVINCES ---');
  const provinces = await db.collection('provinces').find().toArray();
  for (const p of provinces) {
    const r = await db.collection('responsibilities').countDocuments({ unitId: p._id });
    const don = await db.collection('donations').countDocuments({ unitId: p._id });
    const exp = await db.collection('expenses').countDocuments({ unitId: p._id });
    console.log(`${p.name.padEnd(30)}: Resp=${r}, Don=${don}, Exp=${exp}`);
  }

  const districts = await db.collection('districts').find().toArray();
  console.log('\n--- DISTRICT BREAKDOWN (Responsibilities, Donations, Expenses) ---');
  for (const d of districts) {
    const r = await db.collection('responsibilities').countDocuments({ unitId: d._id });
    const don = await db.collection('donations').countDocuments({ unitId: d._id });
    const exp = await db.collection('expenses').countDocuments({ unitId: d._id });
    console.log(`${d.name.padEnd(12)}: Resp=${r}, Don=${don}, Exp=${exp}`);
  }

  const areas = await db.collection('areas').find().toArray();
  console.log('\n--- AREA BREAKDOWN (Responsibilities, Donations, Expenses) ---');
  for (const a of areas) {
    const r = await db.collection('responsibilities').countDocuments({ unitId: a._id });
    const don = await db.collection('donations').countDocuments({ unitId: a._id });
    const exp = await db.collection('expenses').countDocuments({ unitId: a._id });
    console.log(`${a.name.padEnd(18)}: Resp=${r}, Don=${don}, Exp=${exp}`);
  }

  process.exit(0);
}
check().catch(console.error);
