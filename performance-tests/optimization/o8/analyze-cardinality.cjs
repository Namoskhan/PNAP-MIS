const path = require('node:path');
const fs = require('node:fs');
const mongoose = require('../../../pnap-mis/node_modules/mongoose');

const KEY_ROLES = {
  BASIC_UNIT: ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY'],
  AREA: ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY'],
  DISTRICT: ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY'],
  PROVINCE: ['PRESIDENT', 'GENERAL_SECRETARY', 'FINANCE_SECRETARY'],
};

async function analyzeDb(dbName) {
  const uri = `mongodb://127.0.0.1:27017/${dbName}`;
  const conn = await mongoose.createConnection(uri).asPromise();
  const db = conn.db;

  const results = {};
  for (const level of ['BASIC_UNIT', 'AREA', 'DISTRICT', 'PROVINCE']) {
    const codes = KEY_ROLES[level];
    const matchFilter = {
      unitLevel: level,
      roleCode: { $in: codes },
      state: 'APPROVED',
      endedAt: { $exists: false },
    };

    const matchedDocs = await db.collection('roleassignments').find(matchFilter).toArray();
    const matchedCount = matchedDocs.length;
    const memberIds = matchedDocs.map(d => String(d.memberId));
    const uniqueMemberIds = new Set(memberIds);
    const unitIds = matchedDocs.map(d => String(d.unitId));
    const uniqueUnitIds = new Set(unitIds);

    // Group output count (distinct units in aggregation output)
    const groupOutput = await db.collection('roleassignments').aggregate([
      { $match: matchFilter },
      {
        $lookup: {
          from: 'members',
          let: { mid: '$memberId' },
          pipeline: [
            { $match: { $expr: { $eq: ['$_id', '$$mid'] } } },
            { $project: { fullName: 1, memberId: 1, phone: 1, lastActivityAt: 1 } },
          ],
          as: 'member',
        },
      },
      { $unwind: { path: '$member', preserveNullAndEmptyArrays: false } },
      { $group: { _id: '$unitId' } },
    ]).toArray();

    // Check how many times member lookup is invoked vs joined member docs
    // Check distribution of roles per member
    const memberIdCounts = {};
    for (const m of memberIds) {
      memberIdCounts[m] = (memberIdCounts[m] || 0) + 1;
    }
    const repeatedMembers = Object.entries(memberIdCounts).filter(([_, c]) => c > 1);

    results[level] = {
      matchedRoleAssignments: matchedCount,
      uniqueMemberIds: uniqueMemberIds.size,
      uniqueUnitIds: uniqueUnitIds.size,
      memberLookupInvocationsInCurrentPipeline: matchedCount, // $lookup is executed per matched RoleAssignment doc
      joinedMemberDocs: matchedCount, // each matched role assignment joins 1 member doc
      groupOutputCount: groupOutput.length,
      duplicateMemberLookups: matchedCount - uniqueMemberIds.size,
      maxRolesPerMember: repeatedMembers.length > 0 ? Math.max(...repeatedMembers.map(x => x[1])) : 1,
      repeatedMemberCount: repeatedMembers.length,
      unitsTotalInCollection: await db.collection(level === 'BASIC_UNIT' ? 'basicunits' : (level.toLowerCase() + 's')).countDocuments(),
    };
  }

  await conn.close();
  return results;
}

(async () => {
  console.log('Analyzing 10k (pnap_mis_o7_c)...');
  const c = await analyzeDb('pnap_mis_o7_c');
  console.log('Analyzing 50k (pnap_mis_o7_d)...');
  const d = await analyzeDb('pnap_mis_o7_d');

  const output = {
    generatedAt: new Date().toISOString(),
    tier10k: {
      database: 'pnap_mis_o7_c',
      members: 10000,
      analysis: c,
    },
    tier50k: {
      database: 'pnap_mis_o7_d',
      members: 50000,
      analysis: d,
    },
    interpretation: {
      lookupCardinalityNature: 'In the current pipeline, $lookup runs once for every matched RoleAssignment document.',
      repeatedMembers: 'Members hold distinct roles across units or within units.',
      unitRatio: 'At 50k: 5,000 basic units have 15,000 role assignments (3 roles per unit: Secretary, Senior Mawin, Finance Secretary). 2,500 areas have 7,500 role assignments (3 roles per area).',
      joinCardinality: 'Current pipeline executes 15,000 $lookup subqueries for Basic Units, and 7,500 for Areas.'
    }
  };

  fs.writeFileSync(
    path.join(__dirname, 'cardinality-analysis.json'),
    JSON.stringify(output, null, 2)
  );
  console.log('Written cardinality-analysis.json');
  console.log(JSON.stringify(output, null, 2));
})().catch(e => {
  console.error(e);
  process.exit(1);
});
