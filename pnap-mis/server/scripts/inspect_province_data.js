const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function check() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to:', process.env.MONGO_URI);

  const db = mongoose.connection.db;
  const cols = await db.listCollections().toArray();

  for (const col of cols) {
    const name = col.name;
    const docs = await db.collection(name).find({}).toArray();
    let matchCount = 0;
    for (const doc of docs) {
      const str = JSON.stringify(doc);
      if (/balochistan|kpk/i.test(str)) {
        matchCount++;
      }
    }
    if (matchCount > 0) {
      console.log(`Collection [${name}]: ${matchCount} docs contain Balochistan/KPK`);
    }
  }

  // Check province collection specifically
  const provinces = await db.collection('provinces').find({}).toArray();
  console.log('\nCurrent Provinces:');
  console.dir(provinces.map(p => ({ _id: p._id, name: p.name, code: p.code })));

  // Check users specifically
  const users = await db.collection('users').find({
    $or: [
      { username: /balochistan|kpk/i },
      { email: /balochistan|kpk/i },
      { fullName: /balochistan|kpk/i }
    ]
  }).toArray();
  console.log('\nMatching Users:');
  console.dir(users.map(u => ({ username: u.username, email: u.email, fullName: u.fullName })));

  await mongoose.disconnect();
}

check().catch(console.error);
