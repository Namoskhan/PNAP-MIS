const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const RoleAssignment = require('../src/models/RoleAssignment');
const Member = require('../src/models/Member');
const User = require('../src/models/User');
const Central = require('../src/models/Central');
const Province = require('../src/models/Province');
const District = require('../src/models/District');
const Area = require('../src/models/Area');
const Role = require('../src/models/Role');

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis');

  const assignments = await RoleAssignment.find({ state: 'APPROVED', endedAt: null })
    .populate('memberId', 'fullName email username cnic phone')
    .lean();

  const centrals = await Central.find().lean();
  const provinces = await Province.find().lean();
  const districts = await District.find().lean();
  const areas = await Area.find().lean();
  const roles = await Role.find().lean();

  const cMap = new Map(centrals.map(c => [String(c._id), c.name]));
  const pMap = new Map(provinces.map(p => [String(p._id), p.name]));
  const dMap = new Map(districts.map(d => [String(d._id), d.name]));
  const aMap = new Map(areas.map(a => [String(a._id), a.name]));
  const roleLabels = new Map(roles.map(r => [r.code, r.label]));

  const getUnitName = (lvl, id) => {
    const s = String(id);
    if (lvl === 'CENTRAL') return cMap.get(s) || 'PKNAP Central';
    if (lvl === 'PROVINCE') return pMap.get(s) || 'Province';
    if (lvl === 'DISTRICT') return dMap.get(s) || 'District';
    if (lvl === 'AREA') return aMap.get(s) || 'Area';
    return s;
  };

  const byLevel = {
    CENTRAL: [],
    PROVINCE: [],
    DISTRICT: [],
    AREA: []
  };

  for (const a of assignments) {
    if (!byLevel[a.unitLevel]) continue;
    const mem = a.memberId;
    if (!mem) continue;
    const uName = getUnitName(a.unitLevel, a.unitId);
    byLevel[a.unitLevel].push({
      unitName: uName,
      unitId: a.unitId,
      roleCode: a.roleCode,
      roleLabel: roleLabels.get(a.roleCode) || a.roleCode.replace(/_/g, ' '),
      memberName: mem.fullName,
      email: mem.email || `mem.${mem.username}@pnap.org`,
      username: mem.username,
      cnic: mem.cnic,
      phone: mem.phone,
    });
  }

  // Sort logically
  const order = {
    CHAIRMAN: 1, CO_CHAIRMAN: 2, PRESIDENT: 3, SECRETARY: 4, GENERAL_SECRETARY: 5,
    SENIOR_MAWIN: 6, FINANCE_SECRETARY: 7, PRESS_SECRETARY: 8, CULTURE_SECRETARY: 9, SPORTS_SECRETARY: 10
  };

  for (const lvl of Object.keys(byLevel)) {
    byLevel[lvl].sort((a, b) => {
      if (a.unitName !== b.unitName) return a.unitName.localeCompare(b.unitName);
      return (order[a.roleCode] || 99) - (order[b.roleCode] || 99);
    });
  }

  fs.writeFileSync(path.join(__dirname, 'cabinet_data.json'), JSON.stringify(byLevel, null, 2));
  console.log('Successfully wrote cabinet_data.json');
  process.exit(0);
}

run().catch(console.error);
