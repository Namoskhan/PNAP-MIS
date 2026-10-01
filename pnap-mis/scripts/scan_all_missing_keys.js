const fs = require('fs');
const path = require('path');

const en = require('../mobile/src/i18n/locales/en.json');
const ur = require('../mobile/src/i18n/locales/ur.json');
const ps = require('../mobile/src/i18n/locales/ps.json');

const getVal = (obj, p) => p.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);

function scanDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.expo') {
        scanDir(fullPath);
      }
    } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
      checkFile(fullPath);
    }
  }
}

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const regex = /t\(\s*['"]([a-zA-Z0-9_.-]+)['"]/g;
  let m;
  const missing = [];
  while ((m = regex.exec(content)) !== null) {
    const key = m[1];
    // skip urls or paths or single chars
    if (key.startsWith('/') || key.length <= 1) continue;
    
    const vEn = getVal(en, key);
    const vUr = getVal(ur, key);
    const vPs = getVal(ps, key);
    if (vEn === undefined || vUr === undefined || vPs === undefined) {
      missing.push({ key, en: vEn !== undefined, ur: vUr !== undefined, ps: vPs !== undefined });
    }
  }
  if (missing.length > 0) {
    console.log(`\nMissing in ${filePath}:`);
    missing.forEach(item => {
      console.log(`  ${item.key} [en:${item.en} ur:${item.ur} ps:${item.ps}]`);
    });
  }
}

console.log('Scanning mobile directory for missing i18n keys...');
scanDir('./mobile/app');
scanDir('./mobile/src');
