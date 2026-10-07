const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb://127.0.0.1:27017/pnap_mis');
  const Meeting = require('../src/models/Meeting');
  const Activity = require('../src/models/Activity');
  const Province = require('../src/models/Province');
  const CabinetSlot = require('../src/models/CabinetSlot');
  const Member = require('../src/models/Member');

  const province = await Province.findOne({ code: 'JPK' });
  const start = new Date(Date.UTC(2026, 9, 1));
  const end = new Date(Date.UTC(2026, 9, 31, 23, 59, 59));

  const slots = await CabinetSlot.find({ unitLevel: 'PROVINCE', unitId: province._id })
    .populate('filledMemberId', 'fullName status bloodGroup basicUnitId').lean();

  const memberIds = slots.map(s => s.filledMemberId?._id).filter(Boolean);

  const meetings = await Meeting.find({ provinceId: province._id, startAt: { $gte: start, $lte: end } }).lean();
  console.log('JPK October 2026 meetings:', meetings.length);
  meetings.forEach(m => console.log('M:', m.title, m.unitLevel, m.body, m.type, 'att count:', m.attendance?.length));

  const activities = await Activity.find({ provinceId: province._id, startAt: { $gte: start, $lte: end } }).lean();
  console.log('JPK October 2026 activities:', activities.length);
  activities.forEach(a => console.log('A:', a.title, a.unitLevel, a.type, 'lead:', a.leadMemberId, 'participants:', a.participants?.length));

  await mongoose.disconnect();
}

test().catch(console.error);
