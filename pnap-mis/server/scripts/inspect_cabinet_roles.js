const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const RoleAssignment = require('../src/models/RoleAssignment');
const Member = require('../src/models/Member');
const User = require('../src/models/User');
const Central = require('../src/models/Central');
const Province = require('../src/models/Province');
const District = require('../src/models/District');
const Area = require('../src/models/Area');
const BasicUnit = require('../src/models/BasicUnit');

async function check() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis');

  const assignments = await RoleAssignment.find({ state: 'APPROVED', endedAt: null })
    .populate('memberId', 'fullName email username cnic phone')
    .lean();

  const centrals = await Central.find().lean();
  const provinces = await Province.find().lean();
  const districts = await District.find().lean();
  const areas = await Area.find().lean();
  const basicUnits = await BasicUnit.find().lean();

  const cMap = new Map(centrals.map(c => [String(c._id), c.name]));
  const pMap = new Map(provinces.map(p => [String(p._id), p.name]));
  const dMap = new Map(districts.map(d => [String(d._id), d.name]));
  const aMap = new Map(areas.map(a => [String(a._id), a.name]));
  const bMap = new Map(basicUnits.map(b => [String(b._id), b.name]));

  const getUnitName = (lvl, id) => {
    const s = String(id);
    if (lvl === 'CENTRAL') return cMap.get(s) || 'Central';
    if (lvl === 'PROVINCE') return pMap.get(s) || 'Province';
    if (lvl === 'DISTRICT') return dMap.get(s) || 'District';
    if (lvl === 'AREA') return aMap.get(s) || 'Area';
    if (lvl === 'BASIC_UNIT') return bMap.get(s) || 'Basic Unit';
    return s;
  };

  console.log(`Total Approved Role Assignments: ${assignments.length}`);

  const byLevel = {
    CENTRAL: [],
    PROVINCE: [],
    DISTRICT: [],
    AREA: [],
    BASIC_UNIT: []
  };

  for (const a of assignments) {
    const mem = a.memberId;
    if (!mem) continue;
    const uName = getUnitName(a.unitLevel, a.unitId);
    byLevel[a.unitLevel]?.push({
      unitName: uName,
      unitId: a.unitId,
      roleCode: a.roleCode,
      memberName: mem.fullName,
      email: mem.email,
      username: mem.username,
      cnic: mem.cnic,
    });
  }

  for (const lvl of ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA']) {
    console.log(`\n=================== ${lvl} (${byLevel[lvl].length} roles) ===================`);
    for (const r of byLevel[lvl]) {
      console.log(`[${r.unitName}] ${r.roleCode.padEnd(20)} | Name: ${r.memberName.padEnd(25)} | Email: ${(r.email || 'NO_EMAIL').padEnd(25)} | User: ${r.username} | CNIC: ${r.cnic}`);
    }
  }

  process.exit(0);
}

check().catch(console.error);
