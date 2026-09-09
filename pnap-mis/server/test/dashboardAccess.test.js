const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let assignments;
let chain;
let resolvedUnit;
const rolePath = require.resolve('../src/models/RoleAssignment');
const scopePath = require.resolve('../src/utils/unitScope');
require.cache[rolePath] = { id: rolePath, filename: rolePath, loaded: true, exports: {
  find(query) {
    assert.equal(query.state, 'APPROVED');
    assert.deepEqual(query.endedAt, { $exists: false });
    return { select: () => ({ lean: async () => assignments.filter((a) =>
      a.memberId === query.memberId && a.state === 'APPROVED' && !Object.hasOwn(a, 'endedAt')) }) };
  },
} };
require.cache[scopePath] = { id: scopePath, filename: scopePath, loaded: true, exports: {
  resolveUnitChain: async (level, unitId) => { resolvedUnit = { level, unitId }; return chain; },
} };
const { dashboardAccess, dashboardAccessByRole, requireExecutiveDashboardAccess } = require('../src/utils/centralCabinetDashboard');

const user = (roles) => ({ memberId: 'member-1', roles: ['MEMBER', ...roles] });
const assign = (roleCode, unitLevel, unitId = 'unit-1', extra = {}) => ({
  memberId: 'member-1', roleCode, unitLevel, unitId, state: 'APPROVED', ...extra,
});
const guard = (account, role, query = {}) => new Promise((resolve) => {
  const req = { user: account, query, get: () => role };
  requireExecutiveDashboardAccess(req, {}, (error) => resolve({ error, query: req.query }));
});

beforeEach(() => {
  assignments = [];
  chain = { provinceId: 'province-1', districtId: 'district-1', areaId: null, basicUnitId: null };
  resolvedUnit = null;
});

test('all five requested provincial officers receive their assigned dashboard', async () => {
  for (const role of ['PRESIDENT', 'SR_VICE_PRESIDENT', 'VICE_PRESIDENT', 'GENERAL_SECRETARY', 'FINANCE_SECRETARY']) {
    assignments = [assign(role, 'PROVINCE')];
    assert.deepEqual(await dashboardAccess(user([role]), role), { level: 'PROVINCE', unitId: 'unit-1' });
  }
});

test('finance secretaries receive the dashboard at each assigned local level', async () => {
  for (const level of ['PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT']) {
    assignments = [assign('FINANCE_SECRETARY', level)];
    assert.deepEqual(await dashboardAccess(user(['FINANCE_SECRETARY'])), { level, unitId: 'unit-1' });
  }
});

test('pending, ended and another member’s assignments do not grant access', async () => {
  assignments = [
    assign('PRESIDENT', 'PROVINCE', 'unit-1', { state: 'PENDING' }),
    assign('PRESIDENT', 'PROVINCE', 'unit-1', { endedAt: new Date() }),
    assign('PRESIDENT', 'PROVINCE', 'unit-2', { memberId: 'someone-else' }),
  ];
  assert.equal(await dashboardAccess(user(['PRESIDENT'])), null);
});

test('role switching selects that role’s own scope, including a central/local combination', async () => {
  assignments = [assign('GENERAL_SECRETARY', 'CENTRAL'), assign('FINANCE_SECRETARY', 'DISTRICT', 'district-1')];
  const account = user(['GENERAL_SECRETARY', 'FINANCE_SECRETARY']);
  const access = await dashboardAccessByRole(account);
  assert.deepEqual(access.GENERAL_SECRETARY, { level: 'CENTRAL', unitId: null });
  assert.deepEqual(access.FINANCE_SECRETARY, { level: 'DISTRICT', unitId: 'district-1' });
  assert.equal(access.MEMBER, null);
  assert.deepEqual(await dashboardAccess(account, 'FINANCE_SECRETARY'), access.FINANCE_SECRETARY);
  assert.equal(await dashboardAccess(account, 'SUPER_ADMIN'), null);
  assert.equal(await dashboardAccess(account, '__proto__'), null);
});

test('query tampering is replaced with the assigned unit and trusted ancestors', async () => {
  assignments = [assign('FINANCE_SECRETARY', 'DISTRICT', 'district-1')];
  const result = await guard(user(['FINANCE_SECRETARY']), 'FINANCE_SECRETARY', {
    provinceId: 'other-province', districtId: 'other-district', areaId: 'other-area', basicUnitId: 'other-unit', days: '90',
  });
  assert.equal(result.error, undefined);
  assert.deepEqual(resolvedUnit, { level: 'DISTRICT', unitId: 'district-1' });
  assert.deepEqual(result.query, { provinceId: 'province-1', districtId: 'district-1', areaId: '', basicUnitId: '', days: '90' });
});

test('missing unit fails closed instead of returning national data', async () => {
  assignments = [assign('PRESIDENT', 'PROVINCE')];
  chain = null;
  const result = await guard(user(['PRESIDENT']), 'PRESIDENT');
  assert.equal(result.error.code, 'OUT_OF_SCOPE');
});

test('national admins retain national access and their selected filters', async () => {
  for (const role of ['SUPER_ADMIN', 'CENTRAL_ADMIN']) {
    const result = await guard({ roles: [role] }, role, { provinceId: 'selected-province' });
    assert.equal(result.error, undefined);
    assert.deepEqual(result.query, { provinceId: 'selected-province' });
  }
});

test('an incomplete hierarchy cannot expose other provinces in summary counts', async () => {
  assignments = [assign('FINANCE_SECRETARY', 'DISTRICT', 'district-1')];
  chain.provinceId = null;
  const result = await guard(user(['FINANCE_SECRETARY']), 'FINANCE_SECRETARY');
  assert.equal(result.error.code, 'OUT_OF_SCOPE');
});

test('ordinary members cannot use dashboard endpoints', async () => {
  const result = await guard(user([]), 'MEMBER');
  assert.equal(result.error.code, 'FORBIDDEN');
});
