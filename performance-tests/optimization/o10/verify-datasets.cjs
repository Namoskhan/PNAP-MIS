const mongoose = require('../../../pnap-mis/node_modules/mongoose');
const fs = require('fs');
const path = require('path');

const dbs = ['pnap_mis_o7_a', 'pnap_mis_o7_b', 'pnap_mis_o7_c', 'pnap_mis_o7_d'];
const expectedMembers = {
  pnap_mis_o7_a: 500,
  pnap_mis_o7_b: 5000,
  pnap_mis_o7_c: 10000,
  pnap_mis_o7_d: 50000
};

async function verify() {
  const results = {};
  let allValid = true;

  for (const dbName of dbs) {
    const conn = await mongoose.createConnection(`mongodb://127.0.0.1:27017/${dbName}`).asPromise();
    const members = await conn.collection('members').countDocuments();
    const roleAssignments = await conn.collection('roleassignments').countDocuments();
    const provinces = await conn.collection('provinces').countDocuments();
    const districts = await conn.collection('districts').countDocuments();
    const areas = await conn.collection('areas').countDocuments();
    const basicUnits = await conn.collection('basicunits').countDocuments();

    await conn.close();

    const expected = expectedMembers[dbName];
    const match = members === expected;
    if (!match) allValid = false;

    results[dbName] = {
      members,
      expectedMembers: expected,
      memberCountMatch: match,
      roleAssignments,
      provinces,
      districts,
      areas,
      basicUnits
    };
  }

  const output = {
    timestamp: new Date().toISOString(),
    status: allValid ? 'DATASETS_VERIFIED_VALID' : 'DATASET_COUNT_MISMATCH',
    allValid,
    datasets: results
  };

  fs.writeFileSync(path.join(__dirname, 'verified-datasets.json'), JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));

  if (!allValid) {
    console.error('CRITICAL: Dataset count mismatch detected! Stopping volume comparison.');
    process.exit(1);
  }
}

verify().catch(err => {
  console.error(err);
  process.exit(1);
});
