const fs = require('fs');

['en', 'ur', 'ps'].forEach(lang => {
  const content = fs.readFileSync(`./mobile/src/i18n/locales/${lang}.json`, 'utf8');
  const lines = content.split('\n');
  lines.forEach((l, idx) => {
    if (l.includes('"dashboard"')) {
      console.log(`${lang} line ${idx + 1}: ${l.trim()}`);
    }
  });
});
