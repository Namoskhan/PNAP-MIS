const mongoose = require('mongoose');

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/pnap_mis');
  const db = mongoose.connection.db;
  const now = new Date();
  const logoData = {
    sidebar: { url: '/uploads/logo.png', uploadedAt: now, sizeBytes: 232181, contentType: 'image/png' },
    sidebarDark: { url: '/uploads/logo.png', uploadedAt: now, sizeBytes: 232181, contentType: 'image/png' },
    login: { url: '/uploads/logo.png', uploadedAt: now, sizeBytes: 232181, contentType: 'image/png' },
    favicon: { url: '/uploads/favicon.png', uploadedAt: now, sizeBytes: 2750, contentType: 'image/png' },
    print: { url: '/uploads/logo.png', uploadedAt: now, sizeBytes: 232181, contentType: 'image/png' },
  };

  await db.collection('systemsettings').updateOne(
    { _id: 'singleton' },
    { $set: { logos: logoData } },
    { upsert: true }
  );

  const updated = await db.collection('systemsettings').findOne({ _id: 'singleton' });
  console.log('Updated logos successfully:', JSON.stringify(updated.logos, null, 2));
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
