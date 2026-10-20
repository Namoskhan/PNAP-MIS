const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/pnap_mis');
  const Meeting = require('../src/models/Meeting');
  const Activity = require('../src/models/Activity');
  const Donation = require('../src/models/Donation');
  const Province = require('../src/models/Province');
  const CabinetSlot = require('../src/models/CabinetSlot');
  const Member = require('../src/models/Member');

  const p = await Province.findOne({ code: 'JPK' });
  const start = new Date(Date.UTC(2026, 0, 1));
  const end = new Date(Date.UTC(2026, 11, 31, 23, 59, 59));

  const slots = await CabinetSlot.find({ unitLevel: 'PROVINCE', unitId: p._id }).populate('filledMemberId').lean();
  console.log('Cabinet members count:', slots.length);

  const targetM = await Meeting.findOne({ title: 'Provincial Cabinet Executive Sitting - Junubi Pakhtunkhwa (Balochistan)' }).populate('attendance.memberId', 'fullName').lean();
  if (targetM) {
    console.log('Attendees of Provincial Cabinet Executive Sitting:');
    targetM.attendance.forEach(a => console.log(' -', a.memberId?.fullName, a.status));
  }

  const acts = await Activity.find({ provinceId: p._id, unitLevel: 'PROVINCE', startAt: { $gte: start, $lte: end } }).lean();
  console.log('Provincial level activities in 2026:', acts.length);
  acts.forEach(a => console.log(a.title, a.type, a.startAt.toISOString().slice(0, 10), 'parts:', a.participants?.length));

  await mongoose.disconnect();
}

run().catch(console.error);
