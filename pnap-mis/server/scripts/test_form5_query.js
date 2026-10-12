const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/pnap_mis');
  require('../src/models/Member');
  const CabinetSlot = require('../src/models/CabinetSlot');
  const Meeting = require('../src/models/Meeting');
  const Activity = require('../src/models/Activity');
  const Donation = require('../src/models/Donation');

  const slots = await CabinetSlot.find({
    unitLevel: 'PROVINCE',
    unitId: '6a99d5c382e599c9ec059810',
    filledMemberId: { $ne: null }
  }).populate('filledMemberId', 'fullName email basicUnitId').lean();

  console.log('Slots count:', slots.length);
  const memIds = slots.map(s => s.filledMemberId._id);
  console.log('Member IDs:', memIds);

  const octMeetings = await Meeting.find({
    startAt: { $gte: new Date('2026-10-01'), $lte: new Date('2026-10-31T23:59:59') },
    provinceId: '6a99d5c382e599c9ec059810'
  }).lean();
  console.log('Provincial meetings in Oct 2026:', octMeetings.length);
  for (const m of octMeetings) {
    console.log(' - Meeting:', m.title, '| body:', m.body, '| type:', m.type, '| unitLevel:', m.unitLevel, '| attendance count:', m.attendance?.length);
  }

  const octActs = await Activity.find({
    startAt: { $gte: new Date('2026-10-01'), $lte: new Date('2026-10-31T23:59:59') },
    provinceId: '6a99d5c382e599c9ec059810'
  }).lean();
  console.log('Provincial activities in Oct 2026:', octActs.length);
  for (const a of octActs) {
    console.log(' - Act:', a.title, '| type:', a.type, '| lead:', a.leadMemberId, '| participants:', a.participants?.length);
  }

  const donations = await Donation.find({
    donorMemberId: { $in: memIds },
    receivedAt: { $gte: new Date('2026-10-01'), $lte: new Date('2026-10-31T23:59:59') }
  }).lean();
  console.log('Provincial cabinet donations in Oct 2026:', donations.length);

  const { fetchForm5Data } = require('../src/services/proforma/form5');
  const res = await fetchForm5Data({
    provinceId: '6a99d5c382e599c9ec059810',
    month: 10,
    year: 2026
  });
  console.log('fetchForm5Data result:');
  console.log('Province:', res.provinceName, '| year:', res.year, '| from:', res.fromDate, '| to:', res.toDate);
  console.log('Rows count:', res.rows.length);
  for (const r of res.rows) {
    console.log(r.srNo, r.name, {
      provExec: r.provincialExec,
      provJirga: r.provincialJirga,
      conf: r.partyConferences,
      sem: r.seminars,
      study: r.studyCircles,
      press: r.pressConferences,
      dues: r.dues,
      tot: r.totalMeetings
    });
  }

  await mongoose.disconnect();
}

run().catch(console.error);
