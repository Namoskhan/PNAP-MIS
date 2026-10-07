const mongoose = require('mongoose');

async function seedForm2UnitData() {
  await mongoose.connect('mongodb://127.0.0.1:27017/pnap_mis');
  console.log('Connected to MongoDB');

  const Meeting = require('../src/models/Meeting');
  const Activity = require('../src/models/Activity');
  const Donation = require('../src/models/Donation');
  const Expense = require('../src/models/Expense');

  const adminId = new mongoose.Types.ObjectId('6a99d5c282e599c9ec0596db');
  const areaId = new mongoose.Types.ObjectId('6a99d5c382e599c9ec05988a'); // Yaru
  const districtId = new mongoose.Types.ObjectId('6a99d5c382e599c9ec059862');
  const provinceId = new mongoose.Types.ObjectId('6a99d5c382e599c9ec059810');
  const bu1Id = new mongoose.Types.ObjectId('6a99d5c382e599c9ec059895'); // Unit 1
  const bu2Id = new mongoose.Types.ObjectId('6a99d5c382e599c9ec05989e'); // Unit 2

  const Member = require('../src/models/Member');

  const units = [
    { id: bu1Id, name: 'Yaru Unit 1' },
    { id: bu2Id, name: 'Yaru Unit 2' },
  ];

  await Activity.deleteMany({
    unitLevel: 'BASIC_UNIT',
    unitId: { $in: [bu1Id, bu2Id] },
    startAt: { $gte: new Date(Date.UTC(2026, 9, 1)), $lte: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)) },
  });

  await Meeting.deleteMany({
    unitLevel: 'BASIC_UNIT',
    unitId: { $in: [bu1Id, bu2Id] },
    title: { $regex: /پي ايس او/ },
    startAt: { $gte: new Date(Date.UTC(2026, 9, 1)), $lte: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)) },
  });

  for (const u of units) {
    const unitMembers = await Member.find({ basicUnitId: u.id }).lean();
    const leadId = unitMembers[0]?._id;
    const partIds = unitMembers.slice(0, 6).map(m => m._id);

    // 1. PSO Meeting for this unit
    await Meeting.create({
      unitLevel: 'BASIC_UNIT',
      unitId: u.id,
      basicUnitId: u.id,
      areaId,
      districtId,
      provinceId,
      type: 'GBM',
      body: 'GENERAL_BODY',
      title: `د ${u.name} پي ايس او غونډه (PSO Meeting)`,
      venue: `${u.name} Office`,
      startAt: new Date(Date.UTC(2026, 9, 21, 11, 0, 0)),
      endAt: new Date(Date.UTC(2026, 9, 21, 12, 30, 0)),
      state: 'FINALIZED',
      createdBy: adminId,
      attendance: [
        { memberId: new mongoose.Types.ObjectId('6a99d5c482e599c9ec059d9c'), status: 'PRESENT' },
        { memberId: new mongoose.Types.ObjectId('6a99d5c482e599c9ec059da1'), status: 'PRESENT' },
        ...partIds.map(mId => ({ memberId: mId, status: 'PRESENT' })),
      ],
    });

    // 2. Seminar Activity for this unit
    await Activity.create({
      unitLevel: 'BASIC_UNIT',
      unitId: u.id,
      basicUnitId: u.id,
      areaId,
      districtId,
      provinceId,
      type: 'SEMINAR',
      title: `د ${u.name} سيمينار (Unit Seminar)`,
      venue: `${u.name} Hall`,
      startAt: new Date(Date.UTC(2026, 9, 15, 10, 0, 0)),
      state: 'COMPLETED',
      leadMemberId: leadId,
      participants: partIds,
      externalAttendanceEstimate: 20,
      createdBy: adminId,
    });

    // 3. Study Circle Activity for this unit
    await Activity.create({
      unitLevel: 'BASIC_UNIT',
      unitId: u.id,
      basicUnitId: u.id,
      areaId,
      districtId,
      provinceId,
      type: 'STUDY_CIRCLE',
      title: `د ${u.name} سټډي سرکل (Study Circle)`,
      venue: `${u.name} Study Room`,
      startAt: new Date(Date.UTC(2026, 9, 17, 16, 0, 0)),
      state: 'COMPLETED',
      leadMemberId: leadId,
      participants: partIds,
      externalAttendanceEstimate: 12,
      createdBy: adminId,
    });

    // 4. Public Event Activity for this unit
    await Activity.create({
      unitLevel: 'BASIC_UNIT',
      unitId: u.id,
      basicUnitId: u.id,
      areaId,
      districtId,
      provinceId,
      type: 'JALSA',
      title: `د ${u.name} اولسي جلسه (Unit Public Gathering)`,
      venue: `${u.name} Chowk`,
      startAt: new Date(Date.UTC(2026, 9, 23, 16, 0, 0)),
      state: 'COMPLETED',
      leadMemberId: leadId,
      participants: partIds,
      externalAttendanceEstimate: 45,
      createdBy: adminId,
    });

    // 5. Induction Program Activity for this unit
    await Activity.create({
      unitLevel: 'BASIC_UNIT',
      unitId: u.id,
      basicUnitId: u.id,
      areaId,
      districtId,
      provinceId,
      type: 'CAMPAIGN',
      title: `د ${u.name} شموليت پروګرام (Induction Campaign)`,
      venue: `${u.name} Center`,
      startAt: new Date(Date.UTC(2026, 9, 25, 15, 0, 0)),
      state: 'COMPLETED',
      leadMemberId: leadId,
      participants: partIds,
      externalAttendanceEstimate: 25,
      createdBy: adminId,
    });

    // 6. Emergency Donation for this unit
    await Donation.create({
      unitLevel: 'BASIC_UNIT',
      unitId: u.id,
      basicUnitId: u.id,
      areaId,
      districtId,
      provinceId,
      receiptNo: `REC-BU-EMG-${u.name === 'Yaru Unit 1' ? '101' : '102'}-${Date.now()}`,
      fiscalYear: 2026,
      donorType: 'NON_MEMBER',
      paymentMode: 'CASH',
      amount: 2000,
      currency: 'PKR',
      receivedAt: new Date(Date.UTC(2026, 9, 12, 12, 0, 0)),
      state: 'APPROVED',
      note: 'هنګامي چنده (Emergency fund)',
      recordedBy: adminId,
    });

    // 7. Unit Expense
    await Expense.create({
      unitLevel: 'BASIC_UNIT',
      unitId: u.id,
      basicUnitId: u.id,
      areaId,
      districtId,
      provinceId,
      voucherNo: `VOU-BU-${u.name === 'Yaru Unit 1' ? '201' : '202'}-${Date.now()}`,
      fiscalYear: 2026,
      category: 'REFRESHMENTS',
      paymentMode: 'CASH',
      description: 'د يونټ غونډې لګښت (Meeting refreshments)',
      evidenceUrl: 'uploads/receipt.jpg',
      amount: 750,
      currency: 'PKR',
      incurredAt: new Date(Date.UTC(2026, 9, 18, 14, 0, 0)),
      state: 'APPROVED',
      note: 'د يونټ غونډې لګښت (Meeting refreshments)',
      recordedBy: adminId,
    });
  }

  // Also regular unit donation for Unit 2 so both have unit donations
  await Donation.create({
    unitLevel: 'BASIC_UNIT',
    unitId: bu2Id,
    basicUnitId: bu2Id,
    areaId,
    districtId,
    provinceId,
    receiptNo: `REC-BU-REG-202-${Date.now()}`,
    fiscalYear: 2026,
    donorType: 'MEMBER',
    paymentMode: 'CASH',
    amount: 4000,
    currency: 'PKR',
    receivedAt: new Date(Date.UTC(2026, 9, 10, 12, 0, 0)),
    state: 'APPROVED',
    note: 'د دوهم يونټ مياشتنۍ چنده',
    recordedBy: adminId,
  });

  console.log('Seeded Unit 1 and Unit 2 activities, PSO, emergency donations, and expenses successfully!');
  process.exit(0);
}

seedForm2UnitData().catch(err => {
  console.error(err);
  process.exit(1);
});
