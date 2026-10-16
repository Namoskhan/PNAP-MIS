require('dotenv').config();
const mongoose = require('mongoose');
const { validateProformaAccess, isTierGreaterOrEqual } = require('../proformaScope');

async function expectError(fn, expectedCode) {
  try {
    await fn();
    throw new Error('Expected function to throw ApiError, but it succeeded');
  } catch (err) {
    if (err.code !== expectedCode) {
      throw new Error(`Expected error code ${expectedCode}, but got ${err.code}: ${err.message}`);
    }
  }
}

async function runTests() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/pnap_mis');
  console.log('Connected to MongoDB for testing.');

  console.log('--- Testing isTierGreaterOrEqual ---');
  console.assert(isTierGreaterOrEqual('CENTRAL', 'PROVINCE') === true, 'CENTRAL >= PROVINCE');
  console.assert(isTierGreaterOrEqual('DISTRICT', 'DISTRICT') === true, 'DISTRICT >= DISTRICT');
  console.assert(isTierGreaterOrEqual('DISTRICT', 'AREA') === true, 'DISTRICT >= AREA');
  console.assert(isTierGreaterOrEqual('DISTRICT', 'BASIC_UNIT') === true, 'DISTRICT >= BASIC_UNIT');
  console.assert(isTierGreaterOrEqual('DISTRICT', 'PROVINCE') === false, 'DISTRICT >= PROVINCE should be false');
  console.assert(isTierGreaterOrEqual('AREA', 'DISTRICT') === false, 'AREA >= DISTRICT should be false');
  console.assert(isTierGreaterOrEqual('AREA', 'PROVINCE') === false, 'AREA >= PROVINCE should be false');
  console.assert(isTierGreaterOrEqual('AREA', 'AREA') === true, 'AREA >= AREA');
  console.assert(isTierGreaterOrEqual('BASIC_UNIT', 'AREA') === false, 'BASIC_UNIT >= AREA should be false');
  console.assert(isTierGreaterOrEqual('BASIC_UNIT', 'BASIC_UNIT') === true, 'BASIC_UNIT >= BASIC_UNIT');

  console.log('Tier inequality assertions passed!');

  const areaId1 = new mongoose.Types.ObjectId().toString();
  const distId1 = new mongoose.Types.ObjectId().toString();
  const provId1 = new mongoose.Types.ObjectId().toString();

  // Test Area user trying to access Form 5 (Province) -> should throw FORBIDDEN
  const areaUser = {
    _id: new mongoose.Types.ObjectId(),
    roles: ['AREA_ADMIN'],
    scope: { areaId: areaId1, districtId: distId1, provinceId: provId1 }
  };

  await expectError(() => validateProformaAccess(areaUser, 'form5', provId1, 'PROVINCE'), 'FORBIDDEN');
  console.log('Check 1 passed: Area user blocked from Form 5 (FORBIDDEN)');

  // Test Area user trying to access Form 6 (District) -> should throw FORBIDDEN
  await expectError(() => validateProformaAccess(areaUser, 'form6', distId1, 'DISTRICT'), 'FORBIDDEN');
  console.log('Check 2 passed: Area user blocked from Form 6 (FORBIDDEN)');

  // Test District user trying to access Form 5 (Province) -> should throw FORBIDDEN
  const districtUser = {
    _id: new mongoose.Types.ObjectId(),
    roles: ['DISTRICT_ADMIN'],
    scope: { districtId: distId1, provinceId: provId1 }
  };

  await expectError(() => validateProformaAccess(districtUser, 'form5', provId1, 'PROVINCE'), 'FORBIDDEN');
  console.log('Check 3 passed: District user blocked from Form 5 (FORBIDDEN)');

  // Test User without authorized role -> should throw FORBIDDEN
  const unauth = {
    _id: new mongoose.Types.ObjectId(),
    roles: ['GUEST'],
    scope: {}
  };
  await expectError(() => validateProformaAccess(unauth, 'form1', areaId1, 'AREA'), 'FORBIDDEN');
  console.log('Check 4 passed: Unauthenticated/unauthorized role blocked (FORBIDDEN)');

  // Test District user accessing Form 6 for their own district -> should succeed
  const v5 = await validateProformaAccess(districtUser, 'form6', distId1, 'DISTRICT');
  console.assert(v5.allowed === true, 'District user can access own district Form 6');
  console.log('Check 5 passed: District user allowed own district Form 6');

  // Test District user accessing Form 6 for ANOTHER district -> should throw OUT_OF_SCOPE
  const otherDistId = new mongoose.Types.ObjectId().toString();
  await expectError(() => validateProformaAccess(districtUser, 'form6', otherDistId, 'DISTRICT'), 'OUT_OF_SCOPE');
  console.log('Check 6 passed: District user blocked from other district Form 6 (OUT_OF_SCOPE)');

  console.log('\n=============================================');
  console.log(' ALL 6 PROFORMA PERMISSION TESTS PASSED! ');
  console.log('=============================================\n');

  await mongoose.disconnect();
}

runTests().catch(err => {
  console.error('Test error:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
