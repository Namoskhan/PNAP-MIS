const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const mBodies = await db.collection('meetings').aggregate([
    { $group: { _id: '$body', count: { $sum: 1 } } }
  ]).toArray();
  console.log('Meetings by body:', mBodies);

  const mLevels = await db.collection('meetings').aggregate([
    { $group: { _id: '$unitLevel', count: { $sum: 1 } } }
  ]).toArray();
  console.log('Meetings by unitLevel:', mLevels);

  const aBodies = await db.collection('activities').aggregate([
    { $group: { _id: '$body', count: { $sum: 1 } } }
  ]).toArray();
  console.log('Activities by body:', aBodies);

  const fStatuses = await db.collection('fundtransfers').aggregate([
    { $group: { _id: '$state', count: { $sum: 1 } } }
  ]).toArray();
  console.log('FundTransfers by state:', fStatuses);

  const fBodies = await db.collection('fundtransfers').aggregate([
    { $group: { _id: '$body', count: { $sum: 1 } } }
  ]).toArray();
  console.log('FundTransfers by body:', fBodies);

  const eStates = await db.collection('expenses').aggregate([
    { $group: { _id: '$state', count: { $sum: 1 } } }
  ]).toArray();
  console.log('Expenses by state:', eStates);

  const dCount = await db.collection('donations').countDocuments();
  console.log('Donations total:', dCount);

  const centrals = await db.collection('centrals').find({}).toArray();
  console.log('Centrals:', centrals.map(c => ({ id: c._id, name: c.name })));

  await mongoose.disconnect();
}

run().catch(console.error);
