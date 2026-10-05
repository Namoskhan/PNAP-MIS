const fs = require('fs');

const files = [
  'mobile/src/i18n/locales/en.json',
  'mobile/src/i18n/locales/ur.json',
  'mobile/src/i18n/locales/ps.json',
  'web/src/i18n/locales/en.json',
  'web/src/i18n/locales/ur.json',
  'web/src/i18n/locales/ps.json',
];

for (const f of files) {
  try {
    const raw = fs.readFileSync(f, 'utf8');
    const parsed = JSON.parse(raw);
    console.log(`[OK] ${f}: ${Object.keys(parsed).length} top-level sections`);
    if (parsed.dashboard) {
      console.log(`  dashboard keys in ${f}:`, Object.keys(parsed.dashboard));
    }
  } catch (err) {
    console.error(`[ERROR] in ${f}:`, err.message);
  }
}
