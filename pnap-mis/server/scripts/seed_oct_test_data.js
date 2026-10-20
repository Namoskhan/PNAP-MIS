const mongoose = require('mongoose');

async function seedOctData() {
  await mongoose.connect('mongodb://127.0.0.1:27017/pnap_mis');
  console.log('Connected to MongoDB');

  const Meeting = require('../src/models/Meeting');
  const Activity = require('../src/models/Activity');
  const Donation = require('../src/models/Donation');

  const adminId = new mongoose.Types.ObjectId('6a99d5c282e599c9ec0596db');
  const areaId = new mongoose.Types.ObjectId('6a99d5c382e599c9ec05988a'); // Yaru
  const districtId = new mongoose.Types.ObjectId('6a99d5c382e599c9ec059862');
  const provinceId = new mongoose.Types.ObjectId('6a99d5c382e599c9ec059810');
  const bu1Id = new mongoose.Types.ObjectId('6a99d5c382e599c9ec059895'); // Unit 1
  const bu2Id = new mongoose.Types.ObjectId('6a99d5c382e599c9ec05989e'); // Unit 2

  const cabinetMemberIds = [
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059d9c'), // Zarghoon (Sec)
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059da1'), // Sher Dil (Senior Mawin)
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059dab'), // Khushal (Press)
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059da6'), // Malak (Finance)
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059dd3'), // Sardar (Sports)
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059dce'), // Kareem (Culture)
  ];

  const additionalMemberIds = [
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059d7e'),
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059d83'),
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059d88'),
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059d8d'),
  ];

  // 1. Area Executive Meeting
  const execAttendance = cabinetMemberIds.map((mId, idx) => ({
    memberId: mId,
    status: idx === 5 ? 'LATE' : 'PRESENT',
  }));

  await Meeting.create({
    unitLevel: 'AREA',
    unitId: areaId,
    areaId,
    districtId,
    provinceId,
    type: 'EXECUTIVE',
    body: 'EXECUTIVE',
    title: 'علاقائي ايګزيکټيو مياشتنۍ غونډه',
    venue: 'Yaru Markaz Office',
    startAt: new Date(Date.UTC(2026, 9, 12, 10, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 12, 12, 0, 0)),
    state: 'FINALIZED',
    createdBy: adminId,
    attendance: execAttendance,
  });

  // 2. Area Committee Meeting
  const commAttendance = [
    ...cabinetMemberIds.map(mId => ({ memberId: mId, status: 'PRESENT' })),
    ...additionalMemberIds.slice(0, 3).map(mId => ({ memberId: mId, status: 'PRESENT' })),
    { memberId: additionalMemberIds[3], status: 'ABSENT' },
  ];

  await Meeting.create({
    unitLevel: 'AREA',
    unitId: areaId,
    areaId,
    districtId,
    provinceId,
    type: 'COMMITTEE',
    body: 'COMMITTEE',
    title: 'علاقائي کميټي مياشتنۍ غونډه',
    venue: 'Yaru Community Hall',
    startAt: new Date(Date.UTC(2026, 9, 18, 14, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 18, 16, 0, 0)),
    state: 'FINALIZED',
    createdBy: adminId,
    attendance: commAttendance,
  });

  const bu1CabinetIds = [
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059d7e'), // Khatol
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059d83'), // Nadia
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059d8d'), // Bacha
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059d88'), // Maryam
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059d92'), // Mirwais
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059d97'), // Asfandiyar
  ];

  const bu2CabinetIds = [
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059db0'), // Ahmad Shah
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059db5'), // Abdul Samad
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059dba'), // Attaullah
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059dbf'), // Mehmood
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059dce'), // Kareem
    new mongoose.Types.ObjectId('6a99d5c482e599c9ec059dd3'), // Sardar
  ];

  // 3. Basic Unit 1 Executive Meeting
  await Meeting.create({
    unitLevel: 'BASIC_UNIT',
    unitId: bu1Id,
    basicUnitId: bu1Id,
    areaId,
    districtId,
    provinceId,
    type: 'EXECUTIVE',
    body: 'EXECUTIVE',
    title: 'يونټ ۱ ايګزيکټيو غونډه',
    venue: 'Unit 1 Office',
    startAt: new Date(Date.UTC(2026, 9, 8, 10, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 8, 11, 30, 0)),
    state: 'FINALIZED',
    createdBy: adminId,
    attendance: [
      ...cabinetMemberIds.slice(0, 3).map(mId => ({ memberId: mId, status: 'PRESENT' })),
      ...bu1CabinetIds.map((mId, idx) => ({ memberId: mId, status: idx === 5 ? 'LATE' : 'PRESENT' })),
    ],
  });

  // 4. Basic Unit 2 Executive Meeting
  await Meeting.create({
    unitLevel: 'BASIC_UNIT',
    unitId: bu2Id,
    basicUnitId: bu2Id,
    areaId,
    districtId,
    provinceId,
    type: 'EXECUTIVE',
    body: 'EXECUTIVE',
    title: 'يونټ ۲ ايګزيکټيو غونډه',
    venue: 'Unit 2 Office',
    startAt: new Date(Date.UTC(2026, 9, 9, 10, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 9, 11, 30, 0)),
    state: 'FINALIZED',
    createdBy: adminId,
    attendance: [
      ...cabinetMemberIds.slice(3, 6).map(mId => ({ memberId: mId, status: 'PRESENT' })),
      ...bu2CabinetIds.map((mId, idx) => ({ memberId: mId, status: idx === 5 ? 'LATE' : 'PRESENT' })),
    ],
  });

  // 5. Basic Unit 1 General Body Meeting
  await Meeting.create({
    unitLevel: 'BASIC_UNIT',
    unitId: bu1Id,
    basicUnitId: bu1Id,
    areaId,
    districtId,
    provinceId,
    type: 'GENERAL_BODY',
    body: 'GENERAL_BODY',
    title: 'يونټ ۱ جنرل باډي غونډه',
    venue: 'Unit 1 Hujra',
    startAt: new Date(Date.UTC(2026, 9, 14, 15, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 14, 17, 0, 0)),
    state: 'FINALIZED',
    createdBy: adminId,
    attendance: [
      ...cabinetMemberIds.slice(0, 3).map(mId => ({ memberId: mId, status: 'PRESENT' })),
      ...bu1CabinetIds.map(mId => ({ memberId: mId, status: 'PRESENT' })),
    ],
  });

  // 6. Basic Unit 2 General Body Meeting
  await Meeting.create({
    unitLevel: 'BASIC_UNIT',
    unitId: bu2Id,
    basicUnitId: bu2Id,
    areaId,
    districtId,
    provinceId,
    type: 'GENERAL_BODY',
    body: 'GENERAL_BODY',
    title: 'يونټ ۲ جنرل باډي غونډه',
    venue: 'Unit 2 Hujra',
    startAt: new Date(Date.UTC(2026, 9, 16, 15, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 16, 17, 0, 0)),
    state: 'FINALIZED',
    createdBy: adminId,
    attendance: [
      ...cabinetMemberIds.slice(3, 6).map(mId => ({ memberId: mId, status: 'PRESENT' })),
      ...bu2CabinetIds.map(mId => ({ memberId: mId, status: 'PRESENT' })),
    ],
  });

  // 7. PSO Meeting
  await Meeting.create({
    unitLevel: 'AREA',
    unitId: areaId,
    areaId,
    districtId,
    provinceId,
    type: 'EXECUTIVE',
    body: 'EXECUTIVE',
    title: 'د پي ايس او رابطه غونډه (PSO Coordination)',
    venue: 'College Hall',
    startAt: new Date(Date.UTC(2026, 9, 24, 11, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 24, 13, 0, 0)),
    state: 'FINALIZED',
    createdBy: adminId,
    attendance: cabinetMemberIds.map(mId => ({ memberId: mId, status: 'PRESENT' })),
  });

  // 8. Study Circle Activity
  await Activity.create({
    unitLevel: 'AREA',
    unitId: areaId,
    areaId,
    districtId,
    provinceId,
    type: 'STUDY_CIRCLE',
    title: 'علاقائي سياسي او نظرياتي لوستنه (Study Circle)',
    venue: 'Yaru Markaz',
    startAt: new Date(Date.UTC(2026, 9, 5, 14, 0, 0)),
    state: 'COMPLETED',
    leadMemberId: cabinetMemberIds[0],
    participants: cabinetMemberIds,
    createdBy: adminId,
  });

  // 9. Party Conference Activity
  await Activity.create({
    unitLevel: 'AREA',
    unitId: areaId,
    areaId,
    districtId,
    provinceId,
    type: 'PARTY_CONFERENCE',
    title: 'د خان شهيد نظرياتي کانفرنس (Party Conference)',
    venue: 'Yaru Hall',
    startAt: new Date(Date.UTC(2026, 9, 20, 10, 0, 0)),
    state: 'COMPLETED',
    leadMemberId: cabinetMemberIds[1],
    participants: cabinetMemberIds,
    createdBy: adminId,
  });

  // 10. Induction Campaign Activity
  await Activity.create({
    unitLevel: 'AREA',
    unitId: areaId,
    areaId,
    districtId,
    provinceId,
    type: 'CAMPAIGN',
    title: 'د نوو ملګرو شموليت مهم (Induction Campaign)',
    venue: 'Yaru Bazaar',
    startAt: new Date(Date.UTC(2026, 9, 26, 15, 0, 0)),
    state: 'COMPLETED',
    leadMemberId: cabinetMemberIds[2],
    participants: cabinetMemberIds,
    createdBy: adminId,
  });

  // 11. Public Rally / Jalsa Activity
  await Activity.create({
    unitLevel: 'AREA',
    unitId: areaId,
    areaId,
    districtId,
    provinceId,
    type: 'JALSA',
    title: 'اولسي جلسه او مظاهره (Public Gathering)',
    venue: 'Yaru Chowk',
    startAt: new Date(Date.UTC(2026, 9, 28, 16, 0, 0)),
    state: 'COMPLETED',
    leadMemberId: cabinetMemberIds[0],
    participants: cabinetMemberIds,
    externalAttendanceEstimate: 200,
    createdBy: adminId,
  });

  // 12. Organizational Tour Activity
  await Activity.create({
    unitLevel: 'AREA',
    unitId: areaId,
    areaId,
    districtId,
    provinceId,
    type: 'TASK',
    title: 'د غير منظمو سيمو تنظيمي دوره (Organizational Tour)',
    venue: 'Northern Villages',
    startAt: new Date(Date.UTC(2026, 9, 30, 9, 0, 0)),
    state: 'COMPLETED',
    leadMemberId: cabinetMemberIds[0],
    participants: cabinetMemberIds,
    externalAttendanceEstimate: 45,
    createdBy: adminId,
  });

  // 13. Area Seminar Activity (Education)
  await Activity.create({
    unitLevel: 'AREA',
    unitId: areaId,
    areaId,
    districtId,
    provinceId,
    type: 'SEMINAR',
    title: 'علاقائي تعليمي او فکري سيمينار (Area Educational Seminar)',
    venue: 'Yaru College Auditorium',
    startAt: new Date(Date.UTC(2026, 9, 22, 10, 0, 0)),
    state: 'COMPLETED',
    leadMemberId: cabinetMemberIds[1],
    participants: cabinetMemberIds,
    externalAttendanceEstimate: 80,
    createdBy: adminId,
  });

  // 14. Outreach to Inactive Members
  await Activity.create({
    unitLevel: 'AREA',
    unitId: areaId,
    areaId,
    districtId,
    provinceId,
    type: 'TASK',
    title: 'د غير فعاله ملګرو سره رابطه او ليدنې (Outreach to Inactive Members)',
    venue: 'Area Villages',
    startAt: new Date(Date.UTC(2026, 9, 15, 14, 0, 0)),
    state: 'COMPLETED',
    leadMemberId: cabinetMemberIds[0],
    participants: cabinetMemberIds,
    externalAttendanceEstimate: 25,
    createdBy: adminId,
  });

  // 15. Inactive Unit 3
  const BasicUnit = require('../src/models/BasicUnit');
  await BasicUnit.deleteOne({ areaId, name: 'Yaru Unit 3' });
  await BasicUnit.create({
    name: 'Yaru Unit 3',
    areaId,
    districtId,
    provinceId,
    isActive: false,
    customData: {
      inactiveReason: 'د مسؤل ملګري نشتون او د غونډو ځنډېدل',
      suggestion: 'د نوي مسؤل ټاکنه او د کابينې بيا رغونه',
    },
  });

  // 16. Donations per Area Cabinet Member
  for (let i = 0; i < cabinetMemberIds.length; i++) {
    const mId = cabinetMemberIds[i];
    await Donation.create({
      unitLevel: 'AREA',
      unitId: areaId,
      areaId,
      districtId,
      provinceId,
      receiptNo: `REC-YR-OCT26-${100 + i}`,
      fiscalYear: 2026,
      donorType: 'MEMBER',
      donorMemberId: mId,
      paymentMode: 'CASH',
      amount: 1000,
      currency: 'PKR',
      receivedAt: new Date(Date.UTC(2026, 9, 10, 12, 0, 0)),
      state: 'APPROVED',
      note: 'مياشتنۍ چنده اکتوبر ۲۰۲۶',
      recordedBy: adminId,
    });
  }

  // 17. Donations for Unit 1 Cabinet Members
  for (let i = 0; i < bu1CabinetIds.length; i++) {
    const mId = bu1CabinetIds[i];
    await Donation.create({
      unitLevel: 'BASIC_UNIT',
      unitId: bu1Id,
      basicUnitId: bu1Id,
      areaId,
      districtId,
      provinceId,
      receiptNo: `REC-BU1-OCT26-${300 + i}`,
      fiscalYear: 2026,
      donorType: 'MEMBER',
      donorMemberId: mId,
      paymentMode: 'CASH',
      amount: 500,
      currency: 'PKR',
      receivedAt: new Date(Date.UTC(2026, 9, 10, 12, 0, 0)),
      state: 'APPROVED',
      note: 'مياشتنۍ چنده',
      recordedBy: adminId,
    });
  }

  console.log('Seeded complete October 2026 test activities and meetings successfully!');
  process.exit(0);
}

seedOctData().catch(err => {
  console.error(err);
  process.exit(1);
});
