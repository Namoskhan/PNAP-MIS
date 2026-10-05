const fs = require('fs');

function findPin(file) {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  console.log(`=== In ${file} ===`);
  lines.forEach((l, idx) => {
    if (l.toLowerCase().includes('pin') || l.includes('📌')) {
      console.log(`  Line ${idx + 1}: ${l.trim()}`);
    }
  });
}

findPin('./web/src/pages/AnnouncementsPage.jsx');
findPin('./mobile/app/(app)/announcements.jsx');
