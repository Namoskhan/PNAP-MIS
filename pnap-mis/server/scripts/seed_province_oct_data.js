const mongoose = require('mongoose');

async function seedProvinceOctData() {
  await mongoose.connect('mongodb://127.0.0.1:27017/pnap_mis');
  console.log('Connected to MongoDB');

  const Meeting = require('../src/models/Meeting');
  const Activity = require('../src/models/Activity');
  const Donation = require('../src/models/Donation');
  const Province = require('../src/models/Province');
  const CabinetSlot = require('../src/models/CabinetSlot');
  const Member = require('../src/models/Member');

  const province = await Province.findOne({ code: 'JPK' });
  const provinceId = province._id;
  const centralUnitId = new mongoose.Types.ObjectId('6a99d5c382e599c9ec059800');
  const adminId = new mongoose.Types.ObjectId('6a99d5c282e599c9ec0596db');

  const slots = await CabinetSlot.find({ unitLevel: 'PROVINCE', unitId: provinceId })
    .populate('filledMemberId').lean();

  console.log(`Found ${slots.length} cabinet slots for province JPK.`);
  const cabinetMembers = slots.map(s => s.filledMemberId).filter(Boolean);
  const memberMap = {};
  slots.forEach(s => {
    if (s.filledMemberId) {
      memberMap[s.roleCode] = s.filledMemberId._id;
    }
  });

  const mPresident = memberMap['PRESIDENT'];
  const mPress = memberMap['PRESS_SECRETARY'];
  const mVP = memberMap['VICE_PRESIDENT'];
  const mFinance = memberMap['FINANCE_SECRETARY'];
  const mCulture = memberMap['CULTURE_SECRETARY'];
  const mSports = memberMap['SPORTS_SECRETARY'];
  const mSrVP = memberMap['SR_VICE_PRESIDENT'];
  const mGenSec = memberMap['GENERAL_SECRETARY'];

  // Clean previous seeded records for idempotency
  await Meeting.deleteMany({
    $or: [{ provinceId }, { unitLevel: 'CENTRAL' }],
    startAt: { $gte: new Date(Date.UTC(2026, 9, 1)), $lte: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)) },
    title: { $regex: /صوبائي کميټي مياشتنۍ غونډه|مرکزي کميټي درې مياشتنۍ غونډه|ضلع ايګزيکټيو کوټه غونډه|ضلعي کميټي غونډه/i }
  });
  await Activity.deleteMany({
    provinceId,
    startAt: { $gte: new Date(Date.UTC(2026, 9, 1)), $lte: new Date(Date.UTC(2026, 9, 31, 23, 59, 59)) },
    title: { $regex: /صوبائي کانفرنس|صوبائي فکري|صوبائي حقوقو|سيمه‌ييزو مشرانو|پريس کانفرنس: د صوبې|اتحاديانو سياسي|تنظيمي او اولسي دوره/i }
  });
  await Donation.deleteMany({
    receiptNo: { $regex: /^REC-PROV-OCT26-/ }
  });

  // 1. Update the 2 existing October 2026 provincial meetings with attendance
  const octJirga = await Meeting.findOne({
    provinceId,
    unitLevel: 'PROVINCE',
    body: 'JIRGA',
    startAt: { $gte: new Date(Date.UTC(2026, 9, 1)), $lte: new Date(Date.UTC(2026, 9, 10)) }
  });

  if (octJirga) {
    octJirga.state = 'FINALIZED';
    octJirga.attendance = cabinetMembers.map((m, idx) => ({
      memberId: m._id,
      status: idx === 1 ? 'ABSENT' : (idx === 3 ? 'LATE' : 'PRESENT'),
    }));
    await octJirga.save();
    console.log('Updated October Provincial Jirga attendance:', octJirga.title);
  }

  const octExec = await Meeting.findOne({
    provinceId,
    unitLevel: 'PROVINCE',
    body: 'EXECUTIVE',
    startAt: { $gte: new Date(Date.UTC(2026, 9, 15)), $lte: new Date(Date.UTC(2026, 9, 25)) }
  });

  if (octExec) {
    octExec.state = 'FINALIZED';
    octExec.attendance = cabinetMembers.map((m, idx) => ({
      memberId: m._id,
      status: idx === 2 ? 'LATE' : 'PRESENT',
    }));
    await octExec.save();
    console.log('Updated October Provincial Executive attendance:', octExec.title);
  }

  // 2. Create Provincial Committee Meeting in October 2026
  await Meeting.create({
    unitLevel: 'PROVINCE',
    unitId: provinceId,
    provinceId,
    type: 'CMP',
    body: 'COMMITTEE',
    title: 'صوبائي کميټي مياشتنۍ غونډه (Provincial Committee Meeting)',
    description: 'صوبائي کميټۍ د فعاليتونو، مالي چارو او تنظيمي جوړښتونو جاج اخيستنه',
    venue: 'Provincial Secretariat, Quetta',
    startAt: new Date(Date.UTC(2026, 9, 14, 11, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 14, 14, 0, 0)),
    state: 'FINALIZED',
    createdBy: adminId,
    attendance: cabinetMembers.map(m => ({ memberId: m._id, status: 'PRESENT' })),
  });

  // 3. Central Committee Meeting in October 2026
  await Meeting.create({
    unitLevel: 'CENTRAL',
    unitId: centralUnitId,
    type: 'CMP',
    body: 'COMMITTEE',
    title: 'مرکزي کميټي درې مياشتنۍ غونډه (Central Committee Quarterly Meeting)',
    description: 'مرکزي کميټي غونډه د هېواد په کچه د پارټي فعاليتونو او تګلارې جاج',
    venue: 'Central Office, Islamabad',
    startAt: new Date(Date.UTC(2026, 9, 4, 10, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 4, 16, 0, 0)),
    state: 'FINALIZED',
    createdBy: adminId,
    attendance: [
      { memberId: mPresident, status: 'PRESENT' },
      { memberId: mGenSec, status: 'PRESENT' },
      { memberId: mSrVP, status: 'PRESENT' },
    ],
  });

  // 4. District Executive Meeting attended by some provincial leaders
  const districtId = new mongoose.Types.ObjectId('6a99d5c382e599c9ec059862'); // Quetta District
  await Meeting.create({
    unitLevel: 'DISTRICT',
    unitId: districtId,
    districtId,
    provinceId,
    type: 'EXC',
    body: 'EXECUTIVE',
    title: 'ضلع ايګزيکټيو کوټه غونډه (District Executive Meeting)',
    description: 'ضلع کوټه ايګزيکټيو غونډه د صوبائي مشرانو په ګډون',
    venue: 'District Office, Quetta',
    startAt: new Date(Date.UTC(2026, 9, 18, 15, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 18, 17, 30, 0)),
    state: 'FINALIZED',
    createdBy: adminId,
    attendance: [
      { memberId: mPresident, status: 'PRESENT' },
      { memberId: mGenSec, status: 'PRESENT' },
      { memberId: mFinance, status: 'PRESENT' },
    ],
  });

  // 5. District Committee Meeting
  await Meeting.create({
    unitLevel: 'DISTRICT',
    unitId: districtId,
    districtId,
    provinceId,
    type: 'CMP',
    body: 'COMMITTEE',
    title: 'ضلعي کميټي غونډه (District Committee Meeting)',
    description: 'ضلعي کميټي غونډه',
    venue: 'District Office, Quetta',
    startAt: new Date(Date.UTC(2026, 9, 24, 15, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 24, 18, 0, 0)),
    state: 'FINALIZED',
    createdBy: adminId,
    attendance: [
      { memberId: mPresident, status: 'PRESENT' },
      { memberId: mSrVP, status: 'PRESENT' },
      { memberId: mVP, status: 'PRESENT' },
    ],
  });

  // 6. Provincial Activities in October 2026
  // A. Party Conference
  await Activity.create({
    unitLevel: 'PROVINCE',
    unitId: provinceId,
    provinceId,
    type: 'PARTY_CONFERENCE',
    title: 'د خان شهيد او قامي حقوقو صوبائي کانفرنس (Provincial Party Conference)',
    description: 'صوبائي کچه کلنۍ نظرياتي کانفرنس',
    venue: 'Quetta Press Club Auditorium',
    startAt: new Date(Date.UTC(2026, 9, 8, 10, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 8, 17, 0, 0)),
    leadMemberId: mPresident,
    participants: cabinetMembers.map(m => m._id),
    status: 'COMPLETED',
    state: 'COMPLETED',
    createdBy: adminId,
  });

  // B. Educational Seminar
  await Activity.create({
    unitLevel: 'PROVINCE',
    unitId: provinceId,
    provinceId,
    type: 'SEMINAR',
    title: 'صوبائي فکري او سياسي سيمينار (Provincial Political Seminar)',
    description: 'د پارټي د منشور او د خپلواکۍ د اصولو روڼا کې سيمينار',
    venue: 'Serena Hall, Quetta',
    startAt: new Date(Date.UTC(2026, 9, 16, 14, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 16, 18, 0, 0)),
    leadMemberId: mVP,
    participants: [mPresident, mVP, mGenSec, mCulture, mPress],
    status: 'COMPLETED',
    state: 'COMPLETED',
    createdBy: adminId,
  });

  // C. Study Circle
  await Activity.create({
    unitLevel: 'PROVINCE',
    unitId: provinceId,
    provinceId,
    type: 'STUDY_CIRCLE',
    title: 'صوبائي فکري سټډي سرکل (Provincial Study Circle)',
    description: 'د ملي تاريخ او ګوندي ادبياتو مطالعه',
    venue: 'Provincial Library, Quetta',
    startAt: new Date(Date.UTC(2026, 9, 22, 16, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 22, 19, 0, 0)),
    leadMemberId: mCulture,
    participants: [mPresident, mCulture, mGenSec, mSports, mPress],
    status: 'COMPLETED',
    state: 'COMPLETED',
    createdBy: adminId,
  });

  // D. Induction Campaign
  await Activity.create({
    unitLevel: 'PROVINCE',
    unitId: provinceId,
    provinceId,
    type: 'CAMPAIGN',
    title: 'د نويو ملګرو قامي شموليت مهم (New Member Induction Program)',
    description: 'په صوبه کچه د ځوانانو او نويو مبارزينو شموليت غونډه',
    venue: 'Provincial Secretariat, Quetta',
    startAt: new Date(Date.UTC(2026, 9, 19, 15, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 19, 18, 0, 0)),
    leadMemberId: mSrVP,
    participants: [mPresident, mSrVP, mGenSec, mVP, mFinance],
    status: 'COMPLETED',
    state: 'COMPLETED',
    createdBy: adminId,
  });

  // E. Public Rally & Protest
  await Activity.create({
    unitLevel: 'PROVINCE',
    unitId: provinceId,
    provinceId,
    type: 'JALSA',
    title: 'د قامي وسيلو د واک او اختيار په حق کې اولسي جلسه (Grand Public Gathering)',
    description: 'لوی اولسي لاريون او جلسه',
    venue: 'Manan Chowk, Quetta',
    startAt: new Date(Date.UTC(2026, 9, 26, 14, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 26, 19, 0, 0)),
    leadMemberId: mPresident,
    participants: cabinetMembers.map(m => m._id),
    status: 'COMPLETED',
    state: 'COMPLETED',
    createdBy: adminId,
  });

  // F. Jirga / Corner Meeting
  await Activity.create({
    unitLevel: 'PROVINCE',
    unitId: provinceId,
    provinceId,
    type: 'WORKSHOP',
    body: 'JIRGA',
    title: 'د سيمه‌ييزو مشرانو او کارنر ميټنګ (Jirga & Corner Consultation)',
    description: 'قومي مشران او د سيمې خلکو سره مشورتي جرګه',
    venue: 'Hujra Malak Sahib, Pishin',
    startAt: new Date(Date.UTC(2026, 9, 23, 11, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 23, 14, 0, 0)),
    leadMemberId: mGenSec,
    participants: [mPresident, mGenSec, mFinance, mCulture],
    status: 'COMPLETED',
    state: 'COMPLETED',
    createdBy: adminId,
  });

  // G. Press Conference
  await Activity.create({
    unitLevel: 'PROVINCE',
    unitId: provinceId,
    provinceId,
    type: 'PRESS_CONFERENCE',
    title: 'پريس کانفرنس: د صوبې سياسي او اقتصادي صورتحال (Provincial Press Conference)',
    description: 'د پارټي وياند لخوا خبري غونډه',
    venue: 'Quetta Press Club',
    startAt: new Date(Date.UTC(2026, 9, 11, 15, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 11, 16, 30, 0)),
    leadMemberId: mPress,
    participants: [mPresident, mPress, mGenSec],
    status: 'COMPLETED',
    state: 'COMPLETED',
    createdBy: adminId,
  });

  // H. Allied Parties Meeting
  await Activity.create({
    unitLevel: 'PROVINCE',
    unitId: provinceId,
    provinceId,
    type: 'WORKSHOP',
    title: 'د اتحاديانو سياسي ګوندونو ګډه غونډه (Allied Parties Joint Session)',
    description: 'د سياسي ايتلاف د ملګرو سره مشورتي ناسته او خبرې اترې',
    venue: 'Provincial Secretariat, Quetta',
    startAt: new Date(Date.UTC(2026, 9, 28, 16, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 28, 19, 0, 0)),
    leadMemberId: mPresident,
    participants: [mPresident, mGenSec, mSrVP, mVP],
    status: 'COMPLETED',
    state: 'COMPLETED',
    createdBy: adminId,
  });

  // I. Tours (تنظيمي دوره)
  await Activity.create({
    unitLevel: 'PROVINCE',
    unitId: provinceId,
    provinceId,
    type: 'TASK',
    title: 'د جنوبي ضلعو تنظيمي او اولسي دوره (Southern Districts Organizational Tour)',
    description: 'د تنظيم د پياوړتيا په موخه درې ورځنۍ تنظيمي دوره',
    venue: 'Pishin, Chaman & Killa Abdullah',
    startAt: new Date(Date.UTC(2026, 9, 29, 9, 0, 0)),
    endAt: new Date(Date.UTC(2026, 9, 31, 18, 0, 0)),
    leadMemberId: mSports,
    participants: [mPresident, mSports, mFinance, mCulture],
    status: 'COMPLETED',
    state: 'COMPLETED',
    createdBy: adminId,
  });

  // 7. Monthly Party Dues (چنده) Donations for October 2026
  const donationAmounts = {
    PRESIDENT: 5000,
    SR_VICE_PRESIDENT: 3000,
    VICE_PRESIDENT: 3000,
    GENERAL_SECRETARY: 3000,
    FINANCE_SECRETARY: 2500,
    PRESS_SECRETARY: 2000,
    CULTURE_SECRETARY: 2000,
    SPORTS_SECRETARY: 2000,
  };

  for (const slot of slots) {
    const mem = slot.filledMemberId;
    if (!mem) continue;
    const amount = donationAmounts[slot.roleCode] || 1500;
    await Donation.create({
      unitLevel: 'PROVINCE',
      unitId: provinceId,
      provinceId,
      donorType: 'MEMBER',
      donorMemberId: mem._id,
      donorName: mem.fullName,
      fiscalYear: 2026,
      amount,
      paymentMode: 'CASH',
      state: 'APPROVED',
      receivedAt: new Date(Date.UTC(2026, 9, 10, 12, 0, 0)),
      receiptNo: `REC-PROV-OCT26-${slot.roleCode}`,
      note: `October 2026 Monthly Cabinet Membership Dues (${mem.fullName})`,
      recordedBy: adminId,
    });
  }

  console.log('Seeded October 2026 provincial test data successfully.');
  await mongoose.disconnect();
}

seedProvinceOctData().catch(err => {
  console.error(err);
  process.exit(1);
});
