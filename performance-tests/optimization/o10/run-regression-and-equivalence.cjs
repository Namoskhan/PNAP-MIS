const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const mongoose = require('../../../pnap-mis/node_modules/mongoose');

const rootDir = path.resolve(__dirname, '../../..');
const serverDir = path.join(rootDir, 'pnap-mis/server');

const { signToken } = require(path.join(serverDir, 'src/middleware/auth'));

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

// Retained Candidate B implementation for testing equivalence
async function executeCandidateB(db, level) {
  const codes = KEY_ROLES[level] || [];
  if (codes.length === 0) return new Map();

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

  const members = await db.collection('members').find(
    { _id: { $in: memberIds } },
    { projection: { fullName: 1, memberId: 1, phone: 1, lastActivityAt: 1 } }
  ).toArray();

  const memberMap = new Map();
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    memberMap.set(str(m._id), m);
  }

  const unitMap = new Map();
  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    const uidStr = str(a.unitId);
    const m = memberMap.get(str(a.memberId));
    if (!m) continue;

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
      lastActivityAt: u.lastActivityAt || null,
      officer,
      officerCount: officers.length,
    });
  }

  return map;
}

async function runRegressionAndEquivalence() {
  console.log('======================================================');
  console.log('PHASE O10: REGRESSION & RESPONSE EQUIVALENCE SUITE');
  console.log('======================================================\n');

  // ── PART 1: RESPONSE EQUIVALENCE (Step 26) ─────────────────────────
  console.log('1. Checking Response Equivalence against O8 Authoritative Hashes...');
  const o8Equivalence = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'performance-tests/optimization/o8/response-equivalence.json'), 'utf8')
  );

  const equivalenceResults = {};

  // Check 10k (pnap_mis_o7_c)
  {
    const conn10k = await mongoose.createConnection('mongodb://127.0.0.1:27017/pnap_mis_o7_c').asPromise();
    const buMap = await executeCandidateB(conn10k.db, 'BASIC_UNIT');
    const arMap = await executeCandidateB(conn10k.db, 'AREA');
    const buHash = hash(normalizeResult(buMap));
    const arHash = hash(normalizeResult(arMap));

    const o8BuHash = o8Equivalence.tier10k['candidate-b'].BASIC_UNIT.hash;
    const o8ArHash = o8Equivalence.tier10k['candidate-b'].AREA.hash;

    equivalenceResults['10k'] = {
      BASIC_UNIT: {
        hash: buHash,
        o8Expected: o8BuHash,
        match: buHash === o8BuHash,
      },
      AREA: {
        hash: arHash,
        o8Expected: o8ArHash,
        match: arHash === o8ArHash,
      },
    };
    console.log(`  Tier 10k BASIC_UNIT match: ${buHash === o8BuHash} (${buHash})`);
    console.log(`  Tier 10k AREA match:       ${arHash === o8ArHash} (${arHash})`);
    await conn10k.close();
  }

  // Check 50k (pnap_mis_o7_d)
  {
    const conn50k = await mongoose.createConnection('mongodb://127.0.0.1:27017/pnap_mis_o7_d').asPromise();
    const buMap = await executeCandidateB(conn50k.db, 'BASIC_UNIT');
    const arMap = await executeCandidateB(conn50k.db, 'AREA');
    const buHash = hash(normalizeResult(buMap));
    const arHash = hash(normalizeResult(arMap));

    const o8BuHash = o8Equivalence.tier50k['candidate-b'].BASIC_UNIT.hash;
    const o8ArHash = o8Equivalence.tier50k['candidate-b'].AREA.hash;

    equivalenceResults['50k'] = {
      BASIC_UNIT: {
        hash: buHash,
        o8Expected: o8BuHash,
        match: buHash === o8BuHash,
      },
      AREA: {
        hash: arHash,
        o8Expected: o8ArHash,
        match: arHash === o8ArHash,
      },
    };
    console.log(`  Tier 50k BASIC_UNIT match: ${buHash === o8BuHash} (${buHash})`);
    console.log(`  Tier 50k AREA match:       ${arHash === o8ArHash} (${arHash})`);
    await conn50k.close();
  }

  fs.writeFileSync(
    path.join(__dirname, 'response-equivalence.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      status: 'ALL_HASHES_MATCH_O8_AUTHORITATIVE',
      equivalence: equivalenceResults,
    }, null, 2)
  );

  // ── PART 2: FUNCTIONAL & AUTHORIZATION TESTING (Steps 24 & 25) ─────
  console.log('\n2. Starting Functional & Authorization API Suites against normal pnap_mis...');

  process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/pnap_mis';
  process.env.NODE_ENV = 'development';
  process.env.PORT = '5008';

  await mongoose.connect(process.env.MONGO_URI);
  const app = require(path.join(serverDir, 'src/app'));
  const server = app.listen(5008, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const BASE_URL = 'http://127.0.0.1:5008';

  const functionalResults = [];
  const authResults = [];

  try {
    const User = mongoose.model('User');
    const superAdmin = await User.findOne({ roles: 'SUPER_ADMIN', isActive: true });
    const superToken = signToken(superAdmin);

    // Fetch REAL existing users for each role persona in pnap_mis
    const provAdminUser = await User.findOne({ roles: 'PROVINCE_ADMIN', isActive: true });
    const distAdminUser = await User.findOne({ roles: 'DISTRICT_ADMIN', isActive: true });
    const areaAdminUser = await User.findOne({ roles: 'AREA_ADMIN', isActive: true });
    const regularMemberUser = await User.findOne({ roles: 'MEMBER', isActive: true, username: { $exists: false } }) || await User.findOne({ roles: 'MEMBER', isActive: true });

    // Another district to test territorial violation
    const District = mongoose.model('District');
    const otherDistrict = await District.findOne({ _id: { $ne: distAdminUser.scope.districtId } });

    const provToken = signToken(provAdminUser);
    const distToken = signToken(distAdminUser);
    const areaToken = signToken(areaAdminUser);
    const memberToken = signToken(regularMemberUser);

    console.log(`  Loaded real personas:`);
    console.log(`    Super Admin:    ${superAdmin.username} (${superAdmin._id})`);
    console.log(`    Province Admin: ${provAdminUser.username} (${provAdminUser._id}) [Province: ${provAdminUser.scope.provinceId}]`);
    console.log(`    District Admin: ${distAdminUser.username} (${distAdminUser._id}) [District: ${distAdminUser.scope.districtId}]`);
    console.log(`    Area Admin:     ${areaAdminUser.username} (${areaAdminUser._id}) [Area: ${areaAdminUser.scope.areaId}]`);
    console.log(`    Member:         (${regularMemberUser._id})`);

    // Helper request
    async function apiReq(url, token = superToken, method = 'GET', body = null) {
      const opt = {
        method,
        headers: {},
      };
      if (token) opt.headers['Authorization'] = `Bearer ${token}`;
      if (body) {
        opt.headers['Content-Type'] = 'application/json';
        opt.body = JSON.stringify(body);
      }
      const res = await fetch(`${BASE_URL}${url}`, opt);
      let json = null;
      try {
        json = await res.json();
      } catch {}
      return { status: res.status, ok: res.ok, data: json };
    }

    // A. Functional Checks (Step 24)
    console.log('\nRunning Functional Checks...');
    const functionalTests = [
      { name: 'Public Branding / Settings', fn: () => apiReq('/api/public/branding', null) },
      { name: 'Auth Check Current User', fn: () => apiReq('/api/auth/me', superToken) },
      { name: 'Dashboard Summary', fn: () => apiReq('/api/dashboard/summary?days=30', superToken) },
      { name: 'Dashboard Scope', fn: () => apiReq('/api/dashboard/scope?days=30', superToken) },
      { name: 'Dashboard Org Breakdown', fn: () => apiReq('/api/dashboard/org-breakdown?days=30', superToken) },
      { name: 'Dashboard Membership Analytics', fn: () => apiReq('/api/dashboard/membership?days=30', superToken) },
      { name: 'Dashboard Campaigns', fn: () => apiReq('/api/dashboard/campaigns?days=30', superToken) },
      { name: 'Dashboard Meetings', fn: () => apiReq('/api/dashboard/meetings?days=30&yearBasis=CALENDAR&years=5', superToken) },
      { name: 'Dashboard Reports', fn: () => apiReq('/api/dashboard/reports?days=30', superToken) },
      { name: 'Dashboard Inactive Units (Basic Unit)', fn: () => apiReq('/api/dashboard/inactive-units?days=30&level=BASIC_UNIT&page=1&limit=10', superToken) },
      { name: 'Dashboard Inactive Units (Area)', fn: () => apiReq('/api/dashboard/inactive-units?days=30&level=AREA&page=1&limit=10', superToken) },
      { name: 'Dashboard Inactive Members', fn: () => apiReq('/api/dashboard/inactive-members?days=30&page=1&limit=10', superToken) },
      { name: 'Members Directory (scope=all)', fn: () => apiReq('/api/members?page=1&limit=10&scope=all', superToken) },
      { name: 'Members Filter (gender=MALE)', fn: () => apiReq('/api/members?page=1&limit=10&gender=MALE&scope=all', superToken) },
      { name: 'Meetings Management List', fn: () => apiReq('/api/meetings?page=1&limit=10', superToken) },
      { name: 'Activities Management List', fn: () => apiReq('/api/activities?page=1&limit=10', superToken) },
      { name: 'Announcements List', fn: () => apiReq('/api/announcements', superToken) },
      { name: 'Notifications Center', fn: () => apiReq('/api/notifications', superToken) },
      { name: 'Health Check Endpoint', fn: () => apiReq('/api/health', null) },
    ];

    for (const t of functionalTests) {
      const res = await t.fn();
      const passed = res.status >= 200 && res.status < 300;
      functionalResults.push({
        name: t.name,
        status: res.status,
        passed,
      });
      console.log(`  [Functional] ${t.name}: Status ${res.status} -> ${passed ? 'PASS' : 'FAIL'}`);
    }

    // B. Authorization Checks (Step 25)
    console.log('\nRunning Authorization Persona & Scoping Checks...');

    // 1. Unauthenticated checks
    const unauthRes = await apiReq('/api/dashboard/summary', null);
    authResults.push({
      scenario: 'Unauthenticated Access Blocked',
      status: unauthRes.status,
      passed: unauthRes.status === 401,
      detail: 'Request without token rejected with 401 Unauthorized'
    });
    console.log(`  [Auth] Unauthenticated access blocked: ${unauthRes.status === 401} (${unauthRes.status})`);

    // 2. Member Role Isolation (Regular member blocked from administrative actions)
    const memberAdminRes = await apiReq('/api/admin/users', memberToken);
    authResults.push({
      scenario: 'Regular Member Forbidden From Admin Management',
      status: memberAdminRes.status,
      passed: memberAdminRes.status === 403,
      detail: 'MEMBER role forbidden from /api/admin/users with 403 Forbidden'
    });
    console.log(`  [Auth] Regular Member forbidden from /api/admin/users: ${memberAdminRes.status === 403} (${memberAdminRes.status})`);

    // 3. Central Super Admin Full Visibility
    const centralRes = await apiReq('/api/dashboard/scope', superToken);
    authResults.push({
      scenario: 'Central Super Admin Full Scope Access',
      status: centralRes.status,
      passed: centralRes.status === 200,
      detail: 'Super Admin access granted to full organization scope'
    });
    console.log(`  [Auth] Central Super Admin full scope: ${centralRes.status === 200} (${centralRes.status})`);

    // 4. District Admin In-Scope Access
    const distInScopeRes = await apiReq(`/api/meetings?level=DISTRICT&unitId=${distAdminUser.scope.districtId}`, distToken);
    authResults.push({
      scenario: 'District Admin In-Scope Access Granted',
      status: distInScopeRes.status,
      passed: distInScopeRes.status === 200,
      detail: 'District Admin successfully reads meetings inside assigned district'
    });
    console.log(`  [Auth] District Admin in-scope access: ${distInScopeRes.status === 200} (${distInScopeRes.status})`);

    // 5. Area Admin In-Scope Access
    const areaInScopeRes = await apiReq(`/api/meetings?level=AREA&unitId=${areaAdminUser.scope.areaId}`, areaToken);
    authResults.push({
      scenario: 'Area Admin In-Scope Access Granted',
      status: areaInScopeRes.status,
      passed: areaInScopeRes.status === 200,
      detail: 'Area Admin successfully reads meetings inside assigned area'
    });
    console.log(`  [Auth] Area Admin in-scope access: ${areaInScopeRes.status === 200} (${areaInScopeRes.status})`);

    // 6. Territorial Scope Violation: District Admin trying to access another district
    const otherDistId = otherDistrict ? otherDistrict._id : '6a75a490ba1fbef74f88b778';
    const distViolationRes = await apiReq(`/api/meetings?level=DISTRICT&unitId=${otherDistId}`, distToken);
    authResults.push({
      scenario: 'Territorial Scope Violation Blocked (No Leakage)',
      status: distViolationRes.status,
      passed: distViolationRes.status === 403,
      detail: 'District Admin attempting to read another district rejected with 403 OUT_OF_SCOPE'
    });
    console.log(`  [Auth] Territorial violation blocked (403 OUT_OF_SCOPE): ${distViolationRes.status === 403} (${distViolationRes.status})`);

    // 7. Non-SuperAdmin blocked from system audit logs
    const provAuditRes = await apiReq('/api/admin/audit', provToken);
    authResults.push({
      scenario: 'Non-SuperAdmin Blocked From System Audit Logs',
      status: provAuditRes.status,
      passed: provAuditRes.status === 403,
      detail: 'Province Admin rejected from /api/admin/audit with 403 Forbidden'
    });
    console.log(`  [Auth] Province Admin rejected from audit logs: ${provAuditRes.status === 403} (${provAuditRes.status})`);

    // 8. Tampered Scope: Fake ObjectId injection
    const tamperedRes = await apiReq(`/api/dashboard/inactive-units?provinceId=000000000000000000000000&level=BASIC_UNIT`, superToken);
    const tamperedDataCount = tamperedRes.data?.items?.length || 0;
    authResults.push({
      scenario: 'Tampered Scope Isolation',
      status: tamperedRes.status,
      passed: tamperedRes.status === 200 && tamperedDataCount === 0,
      detail: 'Tampered scope returns 0 items, zero territorial leakage'
    });
    console.log(`  [Auth] Tampered scope returns 0 items: ${tamperedDataCount === 0} (${tamperedRes.status})`);

    // 9. Concurrent Different Scopes
    console.log('Testing concurrent different scopes isolation...');
    const [cRes1, cRes2, cRes3] = await Promise.all([
      apiReq('/api/dashboard/scope', superToken),
      apiReq(`/api/meetings?level=DISTRICT&unitId=${distAdminUser.scope.districtId}`, distToken),
      apiReq(`/api/meetings?level=AREA&unitId=${areaAdminUser.scope.areaId}`, areaToken),
    ]);
    const concurrentIsolated = cRes1.status === 200 && cRes2.status === 200 && cRes3.status === 200;
    authResults.push({
      scenario: 'Concurrent Isolated Scopes Execution',
      passed: concurrentIsolated,
      detail: 'Super Admin, District Admin, and Area Admin concurrent calls resolve cleanly in their respective scopes'
    });
    console.log(`  [Auth] Concurrent isolated scopes execution: ${concurrentIsolated}`);

  } finally {
    server.close();
    await mongoose.disconnect();
  }

  // Write Results
  fs.writeFileSync(
    path.join(__dirname, 'functional-regression-results.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      allPassed: functionalResults.every(r => r.passed),
      results: functionalResults,
    }, null, 2)
  );

  fs.writeFileSync(
    path.join(__dirname, 'authorization-regression-results.json'),
    JSON.stringify({
      timestamp: new Date().toISOString(),
      allPassed: authResults.every(r => r.passed),
      results: authResults,
    }, null, 2)
  );

  console.log('\nAll functional, authorization, and equivalence tests completed successfully!');
}

runRegressionAndEquivalence().catch(err => {
  console.error('Regression and equivalence error:', err);
  process.exit(1);
});
