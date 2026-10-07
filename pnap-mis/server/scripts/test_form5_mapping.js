const mongoose = require('mongoose');

async function test() {
  await mongoose.connect('mongodb://127.0.0.1:27017/pnap_mis');
  const Province = require('../src/models/Province');
  const CabinetSlot = require('../src/models/CabinetSlot');
  const Member = require('../src/models/Member');
  const Meeting = require('../src/models/Meeting');
  const Activity = require('../src/models/Activity');
  const Donation = require('../src/models/Donation');

  const province = await Province.findOne({ code: 'JPK' });
  const slots = await CabinetSlot.find({ unitLevel: 'PROVINCE', unitId: province._id })
    .populate('filledMemberId', 'fullName status bloodGroup basicUnitId').lean();

  const memberIds = slots.map(s => s.filledMemberId?._id).filter(Boolean);

  // Check year 2026 meetings
  const start = new Date(Date.UTC(2026, 0, 1));
  const end = new Date(Date.UTC(2026, 11, 31, 23, 59, 59));

  const allMeetings = await Meeting.find({
    $and: [
      { $or: [{ provinceId: province._id }, { 'attendance.memberId': { $in: memberIds } }] },
      { startAt: { $gte: start, $lte: end } },
    ]
  }).lean();

  const allActivities = await Activity.find({
    $and: [
      { $or: [{ provinceId: province._id }, { leadMemberId: { $in: memberIds } }, { participants: { $in: memberIds } }] },
      { startAt: { $gte: start, $lte: end } },
    ]
  }).lean();

  const allDonations = await Donation.find({
    donorMemberId: { $in: memberIds },
    receivedAt: { $gte: start, $lte: end },
  }).lean();

  console.log(`2026 Year - Meetings: ${allMeetings.length}, Activities: ${allActivities.length}, Donations: ${allDonations.length}`);

  // Test mapping for first 3 members
  for (const slot of slots.slice(0, 3)) {
    const mem = slot.filledMemberId;
    const mId = String(mem._id);
    const ownBuId = mem.basicUnitId ? String(mem.basicUnitId) : '';

    const attended = (m) => m.attendance?.some(a => String(a.memberId) === mId && a.status === 'PRESENT');
    const actAttended = (a) => String(a.leadMemberId) === mId || a.participants?.some(p => String(p) === mId);

    const centralComm = allMeetings.filter(m => m.unitLevel === 'CENTRAL' && attended(m)).length;
    const provincialJirga = allMeetings.filter(m => m.unitLevel === 'PROVINCE' && m.body === 'JIRGA' && attended(m)).length;
    const provincialExec = allMeetings.filter(m => m.unitLevel === 'PROVINCE' && m.body === 'EXECUTIVE' && attended(m)).length;
    const provincialComm = allMeetings.filter(m => m.unitLevel === 'PROVINCE' && m.body === 'COMMITTEE' && attended(m)).length;
    const districtExec = allMeetings.filter(m => m.unitLevel === 'DISTRICT' && m.body === 'EXECUTIVE' && attended(m)).length;
    const districtComm = allMeetings.filter(m => m.unitLevel === 'DISTRICT' && m.body === 'COMMITTEE' && attended(m)).length;
    const areaExec = allMeetings.filter(m => m.unitLevel === 'AREA' && m.body === 'EXECUTIVE' && attended(m)).length;
    const areaComm = allMeetings.filter(m => m.unitLevel === 'AREA' && m.body === 'COMMITTEE' && attended(m)).length;
    const basicUnitsExec = allMeetings.filter(m => m.unitLevel === 'BASIC_UNIT' && m.body === 'EXECUTIVE' && attended(m)).length;
    const ownBasicUnit = allMeetings.filter(m => ownBuId && String(m.unitId) === ownBuId && attended(m)).length;
    const psoMeetings = allMeetings.filter(m => /pso|student|پي ايس او/i.test(m.title || '') && attended(m)).length;

    const partyConferences = allActivities.filter(a => ['PARTY_CONFERENCE'].includes(a.type || a.typeCode) && actAttended(a)).length;
    const seminars = allActivities.filter(a => ['SEMINAR', 'SEM'].includes(a.type || a.typeCode) && actAttended(a)).length;
    const studyCircles = allActivities.filter(a => ['STUDY_CIRCLE', 'STC'].includes(a.type || a.typeCode) && actAttended(a)).length;
    const inductions = allActivities.filter(a => ['CAMPAIGN', 'INDUCTION'].includes(a.type || a.typeCode) && actAttended(a)).length;
    const ralliesAndProtests = allActivities.filter(a => ['JALSA', 'PROTEST'].includes(a.type || a.typeCode) && actAttended(a)).length;
    const jirgasAndCornerMeetings = allActivities.filter(a => (a.body === 'JIRGA' || /corner|جرګه/i.test(a.title || '')) && actAttended(a)).length;
    const pressConferences = allActivities.filter(a => /press|پريس/i.test(a.title || '') && actAttended(a)).length;
    const alliedMeetings = allActivities.filter(a => /allied|alliance|اتحادي/i.test(a.title || '') && actAttended(a)).length;

    const totalMeetings = centralComm + provincialJirga + provincialExec + provincialComm + districtExec + districtComm + areaExec + areaComm + basicUnitsExec + psoMeetings;
    const memberDues = allDonations.filter(d => String(d.donorMemberId) === mId).reduce((s, d) => s + (d.amount || 0), 0);
    const tours = allActivities.filter(a => (/tour|دوره/i.test(a.title || '') || a.type === 'TASK') && actAttended(a)).length;

    console.log(`Member: ${mem.fullName} (${slot.roleCode})`);
    console.log(`  ProvExec: ${provincialExec}, ProvComm: ${provincialComm}, DistExec: ${districtExec}, BasicUnitExec: ${basicUnitsExec}, PSO: ${psoMeetings}`);
    console.log(`  Conferences: ${partyConferences}, Seminars: ${seminars}, StudyCircles: ${studyCircles}, Inductions: ${inductions}, Rallies: ${ralliesAndProtests}`);
    console.log(`  TotalMeetings: ${totalMeetings}, Dues: ${memberDues}, Tours: ${tours}, Blood: ${mem.bloodGroup}`);
  }

  await mongoose.disconnect();
}

test().catch(console.error);
