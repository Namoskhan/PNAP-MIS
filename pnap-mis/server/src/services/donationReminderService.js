const Member = require('../models/Member');
const Donation = require('../models/Donation');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { notify, userIdForMember } = require('../utils/notify');
const { resolveUnitChain } = require('../utils/unitScope');
const activityService = require('./activityService');

const MONTHLY_CONTRIBUTION_FEE = 100;
const MAJOR_DONATION_THRESHOLD = 5000;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function getMonthDateRange(month, year) {
  const now = new Date();
  const y = Number(year) || now.getFullYear();
  const m = Number(month) >= 1 && Number(month) <= 12 ? Number(month) - 1 : now.getMonth();
  const start = new Date(Date.UTC(y, m, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
  return { start, end, monthIndex: m, year: y, monthName: MONTH_NAMES[m] };
}

function buildMemberUnitFilter(unitLevel, unitId, chain) {
  if (!unitLevel || !unitId) return {};
  if (unitLevel === 'BASIC_UNIT') return { basicUnitId: unitId };
  if (unitLevel === 'AREA') return { areaId: unitId };
  if (unitLevel === 'DISTRICT') return { districtId: unitId };
  if (unitLevel === 'PROVINCE') return { provinceId: unitId };
  return {}; // CENTRAL — whole organization
}

/**
 * Returns monthly donation status for active members in a unit
 */
async function getMonthlyDonationStatus({ unitLevel, unitId, month, year }) {
  const chain = unitLevel === 'CENTRAL' ? {} : await resolveUnitChain(unitLevel, unitId);
  const { start, end, monthIndex, year: targetYear, monthName } = getMonthDateRange(month, year);

  const memberFilter = {
    status: 'ACTIVE',
    ...buildMemberUnitFilter(unitLevel, unitId, chain),
  };

  const activeMembers = await Member.find(memberFilter)
    .select('fullName memberId cnic phone email basicUnitId areaId districtId provinceId')
    .sort({ fullName: 1 })
    .lean();

  if (activeMembers.length === 0) {
    return {
      month: monthIndex + 1,
      year: targetYear,
      monthName,
      feeAmount: MONTHLY_CONTRIBUTION_FEE,
      totalMembers: 0,
      paidCount: 0,
      unpaidCount: 0,
      totalCollected: 0,
      paidMembers: [],
      unpaidMembers: [],
    };
  }

  const memberIds = activeMembers.map((m) => m._id);

  // Find all approved donations by these members in the specified month
  const donMatch = {
    donorMemberId: { $in: memberIds },
    receivedAt: { $gte: start, $lte: end },
    $or: [{ state: 'APPROVED' }, { state: { $exists: false } }, { state: null }],
  };

  const agg = await Donation.aggregate([
    { $match: donMatch },
    { $group: { _id: '$donorMemberId', total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);

  const donationsByMember = new Map();
  let totalCollected = 0;
  agg.forEach((r) => {
    const amt = r.total || 0;
    donationsByMember.set(String(r._id), amt);
    totalCollected += amt;
  });

  // Find recent notifications for these members in this month
  const usersForMembers = await User.find({ memberId: { $in: memberIds } }).select('_id memberId').lean();
  const memberToUser = new Map(usersForMembers.map((u) => [String(u.memberId), String(u._id)]));
  const userIds = Array.from(memberToUser.values());

  const recentReminders = await Notification.aggregate([
    {
      $match: {
        userId: { $in: userIds },
        type: 'DONATION_REMINDER',
        createdAt: { $gte: start },
      },
    },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$userId', lastSentAt: { $first: '$createdAt' } } },
  ]);

  const lastNotifiedMap = new Map(recentReminders.map((r) => [String(r._id), r.lastSentAt]));

  const paidMembers = [];
  const unpaidMembers = [];

  activeMembers.forEach((m) => {
    const mIdStr = String(m._id);
    const donated = donationsByMember.get(mIdStr) || 0;
    const uId = memberToUser.get(mIdStr);
    const lastNotifiedAt = uId ? lastNotifiedMap.get(uId) || null : null;

    const row = {
      _id: m._id,
      memberId: m.memberId,
      fullName: m.fullName,
      cnic: m.cnic,
      phone: m.phone,
      email: m.email,
      totalDonated: donated,
      dueRemaining: Math.max(0, MONTHLY_CONTRIBUTION_FEE - donated),
      lastNotifiedAt,
    };

    if (donated >= MONTHLY_CONTRIBUTION_FEE) {
      paidMembers.push(row);
    } else {
      unpaidMembers.push(row);
    }
  });

  return {
    month: monthIndex + 1,
    year: targetYear,
    monthName,
    feeAmount: MONTHLY_CONTRIBUTION_FEE,
    totalMembers: activeMembers.length,
    paidCount: paidMembers.length,
    unpaidCount: unpaidMembers.length,
    totalCollected,
    paidMembers,
    unpaidMembers,
  };
}

/**
 * Dispatch in-app reminders to unpaid active members
 */
async function sendMonthlyReminders({ unitLevel, unitId, month, year, memberIds: selectedIds, req }) {
  const status = await getMonthlyDonationStatus({ unitLevel, unitId, month, year });
  let targets = status.unpaidMembers;

  if (Array.isArray(selectedIds) && selectedIds.length > 0) {
    const selectedSet = new Set(selectedIds.map(String));
    targets = targets.filter((m) => selectedSet.has(String(m._id)));
  }

  let notifiedCount = 0;
  for (const m of targets) {
    try {
      const uId = await userIdForMember(m._id);
      if (uId) {
        await notify(uId, {
          type: 'DONATION_REMINDER',
          severity: 'WARNING',
          title: `Monthly Contribution Reminder · ${status.monthName} ${status.year}`,
          body: `Dear ${m.fullName}, your monthly membership contribution of PKR ${MONTHLY_CONTRIBUTION_FEE} for ${status.monthName} ${status.year} is pending. Please submit your contribution to support party activities.`,
          link: m._id ? `/members/${m._id}` : undefined,
        });
        notifiedCount++;
      }
    } catch (err) {
      console.error(`[reminder] failed to notify member ${m._id}:`, err.message);
    }
  }

  if (req && notifiedCount > 0) {
    activityService.record({
      action: 'NOTIFICATION_SENT',
      req,
      unitLevel,
      unitId,
      targetType: 'DonationReminder',
      targetLabel: `${status.monthName} ${status.year} (${notifiedCount} members)`,
    }).catch(() => {});
  }

  return {
    success: true,
    month: status.month,
    year: status.year,
    monthName: status.monthName,
    totalUnpaid: status.unpaidCount,
    notifiedCount,
  };
}

/**
 * Triggered on donation approval: sends special thank-you if donation >= 5000,
 * creates in-app notification for member, and sends SMS + WhatsApp messages.
 */
async function handleDonationApprovalNotification(donation) {
  if (!donation) return;
  const amt = donation.amount || 0;
  const donorName = donation.donorName || 'Respected Supporter';
  const isMajor = amt >= MAJOR_DONATION_THRESHOLD;

  // 1. In-app notification for members (preserves current on-account bell / notification)
  if (donation.donorMemberId) {
    const donorUserId = await userIdForMember(donation.donorMemberId);
    if (donorUserId) {
      const memberLink = donation.donorMemberId ? `/members/${donation.donorMemberId}` : undefined;
      if (isMajor) {
        await notify(donorUserId, {
          type: 'DONATION_THANK_YOU',
          severity: 'SUCCESS',
          title: `Special Appreciation · PKR ${amt.toLocaleString()}`,
          body: `JazakAllah Khair, ${donorName}! We gratefully acknowledge your generous contribution of PKR ${amt.toLocaleString()} (Receipt #${donation.receiptNo}). Your exceptional support empowers our party's mission and organizational activities.`,
          link: memberLink,
        });
      } else {
        await notify(donorUserId, {
          type: 'DONATION_DECIDED',
          severity: 'SUCCESS',
          title: 'Donation Received & Confirmed',
          body: `Receipt #${donation.receiptNo} · PKR ${amt.toLocaleString()} has been approved and added to unit funds. Thank you for your contribution!`,
          link: memberLink,
        });
      }
    }
  }

  // 2. Resolve donor phone for SMS and WhatsApp thank-you delivery
  let phone = donation.donorPhone;
  if (!phone && donation.donorMemberId) {
    const mem = await Member.findById(donation.donorMemberId).select('phone fullName').lean();
    if (mem && mem.phone) phone = mem.phone;
  }

  // 3. Dispatch automatic SMS (SIM message) & WhatsApp thank-you (for donations >= 5000)
  if (phone && isMajor) {
    const thankYouText = `Assalam-o-Alaikum ${donorName}! On behalf of PKNAP, we express our heartfelt gratitude for your generous contribution of PKR ${amt.toLocaleString()} (Receipt #${donation.receiptNo}). Your exceptional support empowers our party's mission and organizational activities. JazakAllah Khair!`;

    const { sendDonationThankYouMessages } = require('./messagingService');
    await sendDonationThankYouMessages({
      phone,
      donorName,
      amount: amt,
      receiptNo: donation.receiptNo,
      message: thankYouText,
    }).catch((err) => {
      console.error('[donationReminderService] Failed to send outbound SMS/WhatsApp:', err.message);
    });
  }
}

/**
 * Automated background sweep: runs periodically to notify unpaid members
 */
async function runAutomatedMonthlyCheck() {
  try {
    const now = new Date();
    const dayOfMonth = now.getDate();
    // Run reminder sweeps starting from the 10th of each month
    if (dayOfMonth < 10) return { skipped: true, reason: 'Too early in month' };

    const { start, monthName, year } = getMonthDateRange();
    const activeMembers = await Member.find({ status: 'ACTIVE' }).select('_id fullName').lean();
    if (activeMembers.length === 0) return { notified: 0 };

    const memberIds = activeMembers.map((m) => m._id);

    const paidAgg = await Donation.aggregate([
      {
        $match: {
          donorMemberId: { $in: memberIds },
          receivedAt: { $gte: start },
          $or: [{ state: 'APPROVED' }, { state: { $exists: false } }, { state: null }],
        },
      },
      { $group: { _id: '$donorMemberId', total: { $sum: '$amount' } } },
      { $match: { total: { $gte: MONTHLY_CONTRIBUTION_FEE } } },
    ]);

    const paidSet = new Set(paidAgg.map((r) => String(r._id)));
    const unpaidMembers = activeMembers.filter((m) => !paidSet.has(String(m._id)));

    // Throttle: don't notify same member more than once every 14 days
    const throttleCutoff = new Date(Date.now() - 14 * 24 * 3600 * 1000);

    let notified = 0;
    for (const m of unpaidMembers) {
      const uId = await userIdForMember(m._id);
      if (!uId) continue;

      const recent = await Notification.findOne({
        userId: uId,
        type: 'DONATION_REMINDER',
        createdAt: { $gte: throttleCutoff },
      }).lean();

      if (!recent) {
        await notify(uId, {
          type: 'DONATION_REMINDER',
          severity: 'WARNING',
          title: `Monthly Contribution Reminder · ${monthName} ${year}`,
          body: `Dear ${m.fullName}, your monthly membership contribution of PKR ${MONTHLY_CONTRIBUTION_FEE} for ${monthName} ${year} is pending. Please submit your contribution to support party activities.`,
          link: m._id ? `/members/${m._id}` : undefined,
        });
        notified++;
      }
    }

    if (notified > 0) {
      console.log(`[reminderScheduler] automated monthly sweep sent ${notified} reminders`);
    }
    return { notified };
  } catch (err) {
    console.error('[reminderScheduler] error in automated check:', err.message);
    return { error: err.message };
  }
}

module.exports = {
  MONTHLY_CONTRIBUTION_FEE,
  MAJOR_DONATION_THRESHOLD,
  getMonthlyDonationStatus,
  sendMonthlyReminders,
  handleDonationApprovalNotification,
  runAutomatedMonthlyCheck,
};
