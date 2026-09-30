const path = require('node:path');
const crypto = require('node:crypto');
const mongoose = require('../../../pnap-mis/node_modules/mongoose');

const KEY_ROLES = {
  BASIC_UNIT: ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY'],
  AREA: ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY'],
  DISTRICT: ['SECRETARY', 'SENIOR_MAWIN', 'FINANCE_SECRETARY'],
  PROVINCE: ['PRESIDENT', 'GENERAL_SECRETARY', 'FINANCE_SECRETARY'],
};

const OFFICER_PRIORITY = [
  'PRESIDENT', 'CHAIRMAN', 'GENERAL_SECRETARY', 'SECRETARY',
  'SENIOR_MAWIN', 'FINANCE_SECRETARY',
];

const PRIORITY_MAP = Object.fromEntries(OFFICER_PRIORITY.map((code, idx) => [code, idx + 1]));

const str = (v) => (v == null ? '' : String(v));
const hash = (v) => crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');

function normalizeResult(map) {
  const sorted = {};
  const keys = [...map.keys()].sort();
  for (const k of keys) {
    const v = map.get(k);
    sorted[k] = {
      lastActivityAt: v.lastActivityAt ? new Date(v.lastActivityAt).toISOString() : null,
      officerCount: v.officerCount,
      officer: v.officer ? {
        roleCode: v.officer.roleCode,
        memberId: str(v.officer.memberId),
        memberCode: v.officer.memberCode,
        fullName: v.officer.fullName,
        phone: v.officer.phone,
        lastActivityAt: v.officer.lastActivityAt ? new Date(v.officer.lastActivityAt).toISOString() : null,
      } : null,
    };
  }
  return sorted;
}

// ── CONTROL (Existing Implementation) ─────────────────────────────
async function controlImpl(db, level) {
  const codes = KEY_ROLES[level] || [];
  if (codes.length === 0) return new Map();

  const rows = await db.collection('roleassignments').aggregate([
    {
      $match: {
        unitLevel: level,
        roleCode: { $in: codes },
        state: 'APPROVED',
        endedAt: { $exists: false },
      },
    },
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
    {
      $group: {
        _id: '$unitId',
        lastActivityAt: { $max: '$member.lastActivityAt' },
        officers: {
          $push: {
            roleCode: '$roleCode',
            memberId: '$member._id',
            memberCode: '$member.memberId',
            fullName: '$member.fullName',
            phone: '$member.phone',
            lastActivityAt: '$member.lastActivityAt',
          },
        },
      },
    },
  ]).toArray();

  const map = new Map();
  for (const r of rows) {
    const officers = r.officers || [];
    const officer = OFFICER_PRIORITY
      .map((code) => officers.find((o) => o.roleCode === code))
      .find(Boolean) || officers[0] || null;
    map.set(str(r._id), {
      lastActivityAt: r.lastActivityAt || null,
      officer,
      officerCount: officers.length,
    });
  }
  return map;
}

// ── CANDIDATE A: Pre-group before member lookup ────────────────────
async function candidateA(db, level) {
  const codes = KEY_ROLES[level] || [];
  if (codes.length === 0) return new Map();

  const rows = await db.collection('roleassignments').aggregate([
    {
      $match: {
        unitLevel: level,
        roleCode: { $in: codes },
        state: 'APPROVED',
        endedAt: { $exists: false },
      },
    },
    {
      $group: {
        _id: '$unitId',
        roles: {
          $push: {
            roleCode: '$roleCode',
            memberId: '$memberId',
          },
        },
      },
    },
    {
      $lookup: {
        from: 'members',
        let: { mids: '$roles.memberId' },
        pipeline: [
          { $match: { $expr: { $in: ['$_id', '$$mids'] } } },
          { $project: { fullName: 1, memberId: 1, phone: 1, lastActivityAt: 1 } },
        ],
        as: 'members',
      },
    },
  ]).toArray();

  const map = new Map();
  for (const r of rows) {
    const memberMap = new Map();
    for (const m of (r.members || [])) {
      memberMap.set(str(m._id), m);
    }
    const officers = [];
    let maxActivity = null;
    for (const role of (r.roles || [])) {
      const m = memberMap.get(str(role.memberId));
      if (!m) continue; // preserve inner join semantics
      const act = m.lastActivityAt || null;
      if (act && (!maxActivity || act > maxActivity)) {
        maxActivity = act;
      }
      officers.push({
        roleCode: role.roleCode,
        memberId: m._id,
        memberCode: m.memberId,
        fullName: m.fullName,
        phone: m.phone,
        lastActivityAt: m.lastActivityAt,
      });
    }

    const officer = OFFICER_PRIORITY
      .map((code) => officers.find((o) => o.roleCode === code))
      .find(Boolean) || officers[0] || null;

    map.set(str(r._id), {
      lastActivityAt: maxActivity,
      officer,
      officerCount: officers.length,
    });
  }
  return map;
}

// ── CANDIDATE B: Two-step query (Node join) ───────────────────────
async function candidateB(db, level) {
  const codes = KEY_ROLES[level] || [];
  if (codes.length === 0) return new Map();

  // Step 1: Fetch role assignments
  const assignments = await db.collection('roleassignments').find(
    {
      unitLevel: level,
      roleCode: { $in: codes },
      state: 'APPROVED',
      endedAt: { $exists: false },
    },
    { projection: { unitId: 1, memberId: 1, roleCode: 1 } }
  ).toArray();

  if (assignments.length === 0) return new Map();

  // Step 2: Unique member IDs
  const memberIds = [];
  const seenMembers = new Set();
  for (let i = 0; i < assignments.length; i++) {
    const mid = assignments[i].memberId;
    const midStr = str(mid);
    if (!seenMembers.has(midStr)) {
      seenMembers.add(midStr);
      memberIds.push(mid);
    }
  }

  // Step 3: Batch fetch members
  const members = await db.collection('members').find(
    { _id: { $in: memberIds } },
    { projection: { fullName: 1, memberId: 1, phone: 1, lastActivityAt: 1 } }
  ).toArray();

  const memberMap = new Map();
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    memberMap.set(str(m._id), m);
  }

  // Step 4: Group in Node
  const unitMap = new Map();
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    const uidStr = str(a.unitId);
    const m = memberMap.get(str(a.memberId));
    if (!m) continue; // inner join

    let u = unitMap.get(uidStr);
    if (!u) {
      u = { lastActivityAt: null, officers: [] };
      unitMap.set(uidStr, u);
    }
    const act = m.lastActivityAt || null;
    if (act && (!u.lastActivityAt || act > u.lastActivityAt)) {
      u.lastActivityAt = act;
    }
    u.officers.push({
      roleCode: a.roleCode,
      memberId: m._id,
      memberCode: m.memberId,
      fullName: m.fullName,
      phone: m.phone,
      lastActivityAt: m.lastActivityAt,
    });
  }

  const map = new Map();
  for (const [uidStr, u] of unitMap.entries()) {
    const officers = u.officers;
    const officer = OFFICER_PRIORITY
      .map((code) => officers.find((o) => o.roleCode === code))
      .find(Boolean) || officers[0] || null;
    map.set(uidStr, {
      lastActivityAt: u.lastActivityAt,
      officer,
      officerCount: officers.length,
    });
  }
  return map;
}

// ── CANDIDATE C: Lookup after reducing cardinality ────────────────
// Notice: To preserve lastActivityAt across all officers, we can first group
// all role assignments per unit, determine the candidate officer (by priority)
// and then only lookup the members for that unit in a single $in lookup.
// This is semantically equivalent to Candidate A but with early priority tag.
async function candidateC(db, level) {
  const codes = KEY_ROLES[level] || [];
  if (codes.length === 0) return new Map();

  // Add priority score: 1 for SECRETARY, 2 for SENIOR_MAWIN, 3 for FINANCE_SECRETARY
  const branches = codes.map(code => ({
    case: { $eq: ['$roleCode', code] },
    then: PRIORITY_MAP[code] || 99,
  }));

  const rows = await db.collection('roleassignments').aggregate([
    {
      $match: {
        unitLevel: level,
        roleCode: { $in: codes },
        state: 'APPROVED',
        endedAt: { $exists: false },
      },
    },
    {
      $addFields: {
        priority: { $switch: { branches, default: 99 } },
      },
    },
    {
      $sort: { unitId: 1, priority: 1 },
    },
    {
      $group: {
        _id: '$unitId',
        // Pick primary candidate officer roleAssignment
        primaryRole: { $first: '$$ROOT' },
        allMemberIds: { $push: '$memberId' },
        officerCount: { $sum: 1 },
      },
    },
    // We need lastActivityAt across all members of unit, plus details for primaryRole
    {
      $lookup: {
        from: 'members',
        let: { mids: '$allMemberIds' },
        pipeline: [
          { $match: { $expr: { $in: ['$_id', '$$mids'] } } },
          { $project: { fullName: 1, memberId: 1, phone: 1, lastActivityAt: 1 } },
        ],
        as: 'members',
      },
    },
  ]).toArray();

  const map = new Map();
  for (const r of rows) {
    const pMid = str(r.primaryRole?.memberId);
    let primaryMember = null;
    let maxActivity = null;
    for (const m of (r.members || [])) {
      if (str(m._id) === pMid) primaryMember = m;
      const act = m.lastActivityAt || null;
      if (act && (!maxActivity || act > maxActivity)) {
        maxActivity = act;
      }
    }
    const officer = primaryMember ? {
      roleCode: r.primaryRole.roleCode,
      memberId: primaryMember._id,
      memberCode: primaryMember.memberId,
      fullName: primaryMember.fullName,
      phone: primaryMember.phone,
      lastActivityAt: primaryMember.lastActivityAt,
    } : null;

    map.set(str(r._id), {
      lastActivityAt: maxActivity,
      officer,
      officerCount: r.officerCount,
    });
  }
  return map;
}

// ── CANDIDATE D: Smaller group payload ─────────────────────────────
// Push only roleCode, memberId, and activity into group, omit redundant strings
async function candidateD(db, level) {
  const codes = KEY_ROLES[level] || [];
  if (codes.length === 0) return new Map();

  const rows = await db.collection('roleassignments').aggregate([
    {
      $match: {
        unitLevel: level,
        roleCode: { $in: codes },
        state: 'APPROVED',
        endedAt: { $exists: false },
      },
    },
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
    {
      $group: {
        _id: '$unitId',
        lastActivityAt: { $max: '$member.lastActivityAt' },
        // Smaller payload: minimal fields
        officers: {
          $push: {
            r: '$roleCode',
            i: '$member._id',
            c: '$member.memberId',
            n: '$member.fullName',
            p: '$member.phone',
            a: '$member.lastActivityAt',
          },
        },
      },
    },
  ]).toArray();

  const map = new Map();
  for (const r of rows) {
    const officers = (r.officers || []).map(o => ({
      roleCode: o.r,
      memberId: o.i,
      memberCode: o.c,
      fullName: o.n,
      phone: o.p,
      lastActivityAt: o.a,
    }));
    const officer = OFFICER_PRIORITY
      .map((code) => officers.find((o) => o.roleCode === code))
      .find(Boolean) || officers[0] || null;
    map.set(str(r._id), {
      lastActivityAt: r.lastActivityAt || null,
      officer,
      officerCount: officers.length,
    });
  }
  return map;
}

// ── CANDIDATE E: Window / Top-N style alternative ─────────────────
async function candidateE(db, level) {
  const codes = KEY_ROLES[level] || [];
  if (codes.length === 0) return new Map();

  const branches = codes.map(code => ({
    case: { $eq: ['$roleCode', code] },
    then: PRIORITY_MAP[code] || 99,
  }));

  const rows = await db.collection('roleassignments').aggregate([
    {
      $match: {
        unitLevel: level,
        roleCode: { $in: codes },
        state: 'APPROVED',
        endedAt: { $exists: false },
      },
    },
    {
      $addFields: {
        priority: { $switch: { branches, default: 99 } },
      },
    },
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
    {
      $group: {
        _id: '$unitId',
        lastActivityAt: { $max: '$member.lastActivityAt' },
        officerCount: { $sum: 1 },
        officer: {
          $top: {
            sortBy: { priority: 1 },
            output: {
              roleCode: '$roleCode',
              memberId: '$member._id',
              memberCode: '$member.memberId',
              fullName: '$member.fullName',
              phone: '$member.phone',
              lastActivityAt: '$member.lastActivityAt',
            },
          },
        },
      },
    },
  ]).toArray();

  const map = new Map();
  for (const r of rows) {
    map.set(str(r._id), {
      lastActivityAt: r.lastActivityAt || null,
      officer: r.officer || null,
      officerCount: r.officerCount,
    });
  }
  return map;
}

// ── VERIFY EQUIVALENCE ────────────────────────────────────────────
async function testEquivalence() {
  console.log('Connecting to pnap_mis_o7_c to test response equivalence...');
  const conn = await mongoose.createConnection('mongodb://127.0.0.1:27017/pnap_mis_o7_c').asPromise();
  const db = conn.db;

  const results = {};

  for (const level of ['BASIC_UNIT', 'AREA']) {
    console.log(`Testing ${level}...`);
    const ctrl = await controlImpl(db, level);
    const normCtrl = normalizeResult(ctrl);
    const ctrlHash = hash(normCtrl);

    const cands = {
      'Candidate A (Pre-group)': candidateA,
      'Candidate B (Two-step)': candidateB,
      'Candidate C (Reduce then lookup)': candidateC,
      'Candidate D (Smaller payload)': candidateD,
      'Candidate E (Top-N)': candidateE,
    };

    results[level] = {
      unitCount: ctrl.size,
      controlHash: ctrlHash,
      candidates: {},
    };

    for (const [name, fn] of Object.entries(cands)) {
      const res = await fn(db, level);
      const normRes = normalizeResult(res);
      const resHash = hash(normRes);
      const match = resHash === ctrlHash;
      results[level].candidates[name] = {
        unitCount: res.size,
        hash: resHash,
        matchesControl: match,
      };
      console.log(`  ${name}: count=${res.size}, match=${match}`);
      if (!match) {
        // Find first mismatch
        for (const k of ctrl.keys()) {
          const cVal = normCtrl[k];
          const rVal = normRes[k];
          if (JSON.stringify(cVal) !== JSON.stringify(rVal)) {
            console.error(`Mismatch for unit ${k}:`, { control: cVal, candidate: rVal });
            break;
          }
        }
      }
    }
  }

  await conn.close();
  return results;
}

if (require.main === module) {
  testEquivalence().then(r => {
    console.log('Done equivalence verification:');
    console.log(JSON.stringify(r, null, 2));
  }).catch(e => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = {
  controlImpl,
  candidateA,
  candidateB,
  candidateC,
  candidateD,
  candidateE,
  normalizeResult,
  hash,
};
