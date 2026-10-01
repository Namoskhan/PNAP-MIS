const fs = require('fs');

function checkFile(filePath, en, ur, ps) {
  if (!fs.existsSync(filePath)) return;
  const code = fs.readFileSync(filePath, 'utf8');
  const getVal = (obj, p) => p.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
  
  const regex = /t\(\s*['"]([^'"]+)['"]/g;
  let m;
  const keys = new Set();
  while ((m = regex.exec(code)) !== null) {
    keys.add(m[1]);
  }
  
  const missing = [];
  for (const k of keys) {
    const vEn = getVal(en, k);
    const vUr = getVal(ur, k);
    const vPs = getVal(ps, k);
    if (!vEn || !vUr || !vPs) {
      missing.push({ key: k, en: !!vEn, ur: !!vUr, ps: !!vPs });
    }
  }
  if (missing.length > 0) {
    console.log(`\n=== Missing in ${filePath} ===`);
    missing.forEach(item => console.log(`  ${item.key} -> en:${item.en} ur:${item.ur} ps:${item.ps}`));
  } else {
    console.log(`\n=== All ${keys.size} keys found for ${filePath} ===`);
  }
}

const mobileEn = require('../mobile/src/i18n/locales/en.json');
const mobileUr = require('../mobile/src/i18n/locales/ur.json');
const mobilePs = require('../mobile/src/i18n/locales/ps.json');

console.log('--- MOBILE CHECKS ---');
checkFile('./mobile/src/components/CommandCenter.jsx', mobileEn, mobileUr, mobilePs);
checkFile('./mobile/src/components/dashboard/UnitDashboard.jsx', mobileEn, mobileUr, mobilePs);
checkFile('./mobile/app/(app)/index.jsx', mobileEn, mobileUr, mobilePs);
checkFile('./mobile/app/(app)/admin/reports.jsx', mobileEn, mobileUr, mobilePs);
checkFile('./mobile/app/(app)/admin/performance.jsx', mobileEn, mobileUr, mobilePs);
checkFile('./mobile/app/(app)/announcements/index.jsx', mobileEn, mobileUr, mobilePs);
checkFile('./mobile/app/(app)/committee/composition.jsx', mobileEn, mobileUr, mobilePs);
checkFile('./mobile/app/(app)/responsibilities/index.jsx', mobileEn, mobileUr, mobilePs);
