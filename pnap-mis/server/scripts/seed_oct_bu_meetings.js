const mongoose = require('mongoose');
const path = require('path');

async function seedBuMeetings() {
  await mongoose.connect('mongodb://127.0.0.1:27017/pnap_mis');
  console.log('Connected to MongoDB');

  const Meeting = require(path.join(__dirname, '../src/models/Meeting'));
  const Area = require(path.join(__dirname, '../src/models/Area'));
  const BasicUnit = require(path.join(__dirname, '../src/models/BasicUnit'));
  const CabinetSlot = require(path.join(__dirname, '../src/models/CabinetSlot'));
  const Member = require(path.join(__dirname, '../src/models/Member'));
  const User = require(path.join(__dirname, '../src/models/User'));

  const yaru = await Area.findOne({ name: /Yaru/i }).lean();
  const bus = await BasicUnit.find({ areaId: yaru._id }).lean();
  const slots = await CabinetSlot.find({
    unitLevel: 'AREA',
    unitId: yaru._id,
  }).populate('filledMemberId').lean();

  const members = slots.map(s => s.filledMemberId).filter(Boolean);
  console.log(`Found ${members.length} Area Yaru cabinet members`);

  const attendanceList = members.map(m => ({
    memberId: m._id,
    name: m.fullName,
    status: 'PRESENT',
  }));

  const user = await User.findOne({ email: /seed\.test/i }).lean();
  const createdBy = user ? user._id : members[0]?._id;

  const bu1 = bus[0];
  const bu2 = bus[1] || bus[0];

  const meetingsToCreate = [
    {
      title: 'ابتدائي يونټ ۱ ايګزيکټيو مياشتنۍ غونډه (Yaru Unit 1 Exec)',
      type: 'EXC',
      unitLevel: 'BASIC_UNIT',
      unitId: bu1._id,
      basicUnitId: bu1._id,
      areaId: yaru._id,
      venue: 'Yaru Unit 1 Office',
      startAt: new Date(Date.UTC(2026, 9, 8, 10, 0, 0)),
      endAt: new Date(Date.UTC(2026, 9, 8, 12, 0, 0)),
      createdBy,
      attendance: attendanceList,
    },
    {
      title: 'ابتدائي يونټ ۱ جنرل باډي غونډه (Yaru Unit 1 General Body)',
      type: 'GBM',
      unitLevel: 'BASIC_UNIT',
      unitId: bu1._id,
      basicUnitId: bu1._id,
      areaId: yaru._id,
      venue: 'Yaru Central Hujra',
      startAt: new Date(Date.UTC(2026, 9, 12, 11, 0, 0)),
      endAt: new Date(Date.UTC(2026, 9, 12, 13, 0, 0)),
      createdBy,
      attendance: attendanceList,
    },
    {
      title: 'ابتدائي يونټ ۲ ايګزيکټيو غونډه (Yaru Unit 2 Exec)',
      type: 'EXC',
      unitLevel: 'BASIC_UNIT',
      unitId: bu2._id,
      basicUnitId: bu2._id,
      areaId: yaru._id,
      venue: 'Yaru Unit 2 Office',
      startAt: new Date(Date.UTC(2026, 9, 16, 14, 0, 0)),
      endAt: new Date(Date.UTC(2026, 9, 16, 16, 0, 0)),
      createdBy,
      attendance: attendanceList,
    },
    {
      title: 'ابتدائي يونټ ۲ جنرل باډي غونډه (Yaru Unit 2 General Body)',
      type: 'GBM',
      unitLevel: 'BASIC_UNIT',
      unitId: bu2._id,
      basicUnitId: bu2._id,
      areaId: yaru._id,
      venue: 'Yaru Unit 2 Hall',
      startAt: new Date(Date.UTC(2026, 9, 20, 15, 0, 0)),
      endAt: new Date(Date.UTC(2026, 9, 20, 17, 0, 0)),
      createdBy,
      attendance: attendanceList,
    },
  ];

  for (const mData of meetingsToCreate) {
    const existing = await Meeting.findOne({ title: mData.title, startAt: mData.startAt });
    if (!existing) {
      await Meeting.create(mData);
      console.log('Created meeting:', mData.title);
    } else {
      await Meeting.updateOne({ _id: existing._id }, { $set: { attendance: attendanceList } });
      console.log('Updated attendance for:', mData.title);
    }
  }

  console.log('Done seeding BU October meetings!');
  process.exit(0);
}

seedBuMeetings().catch(err => {
  console.error(err);
  process.exit(1);
});
