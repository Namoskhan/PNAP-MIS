const mongoose = require('mongoose');

async function cleanOctData() {
  await mongoose.connect('mongodb://127.0.0.1:27017/pnap_mis');
  console.log('Connected to MongoDB');

  const Meeting = require('../src/models/Meeting');
  const Activity = require('../src/models/Activity');
  const Donation = require('../src/models/Donation');

  const areaId = new mongoose.Types.ObjectId('6a99d5c382e599c9ec05988a'); // Yaru
  const startDate = new Date(Date.UTC(2026, 9, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(2026, 9, 31, 23, 59, 59, 999));

  const Expense = require('../src/models/Expense');

  const resM = await Meeting.deleteMany({
    areaId,
    startAt: { $gte: startDate, $lte: endDate },
    title: { $regex: /غونډه|Meeting|PSO/i },
  });
  console.log(`Deleted ${resM.deletedCount} October meetings.`);

  const resA = await Activity.deleteMany({
    areaId,
    startAt: { $gte: startDate, $lte: endDate },
  });
  console.log(`Deleted ${resA.deletedCount} October activities.`);

  const provinceId = new mongoose.Types.ObjectId('6a99d5c382e599c9ec059810');
  const resProvM = await Meeting.deleteMany({
    $or: [{ provinceId }, { unitLevel: 'CENTRAL' }],
    startAt: { $gte: startDate, $lte: endDate },
    title: { $regex: /صوبائي کميټي مياشتنۍ غونډه|مرکزي کميټي درې مياشتنۍ غونډه|ضلع ايګزيکټيو کوټه غونډه|ضلعي کميټي غونډه/i }
  });
  console.log(`Deleted ${resProvM.deletedCount} October provincial test meetings.`);

  const resProvA = await Activity.deleteMany({
    provinceId,
    startAt: { $gte: startDate, $lte: endDate },
    title: { $regex: /صوبائي کانفرنس|صوبائي فکري|صوبائي حقوقو|سيمه‌ييزو مشرانو|پريس کانفرنس: د صوبې|اتحاديانو سياسي|تنظيمي او اولسي دوره/i }
  });
  console.log(`Deleted ${resProvA.deletedCount} October provincial test activities.`);

  const resProvD = await Donation.deleteMany({
    receiptNo: { $regex: /^REC-PROV-OCT26-/ }
  });
  console.log(`Deleted ${resProvD.deletedCount} October provincial test donations.`);

  const resD = await Donation.deleteMany({
    areaId,
    receiptNo: { $regex: /^REC-(YR-OCT26|BU|BU1)-/ },
  });
  console.log(`Deleted ${resD.deletedCount} October donations.`);

  const resE = await Expense.deleteMany({
    areaId,
    voucherNo: { $regex: /^VOU-BU-/ },
  });
  console.log(`Deleted ${resE.deletedCount} October expenses.`);

  const BasicUnit = require('../src/models/BasicUnit');
  const resU = await BasicUnit.deleteMany({ areaId, name: 'Yaru Unit 3' });
  console.log(`Deleted ${resU.deletedCount} test inactive units.`);

  console.log('Cleaned October 2026 test data successfully.');
  process.exit(0);
}

cleanOctData().catch(err => {
  console.error(err);
  process.exit(1);
});
