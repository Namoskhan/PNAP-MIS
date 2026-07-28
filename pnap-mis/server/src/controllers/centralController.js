const asyncHandler = require('express-async-handler');
const Member = require('../models/Member');
const RoleAssignment = require('../models/RoleAssignment');
const Province = require('../models/Province');
const District = require('../models/District');
const Area = require('../models/Area');
const BasicUnit = require('../models/BasicUnit');
const Meeting = require('../models/Meeting');
const Expense = require('../models/Expense');
const Donation = require('../models/Donation');
const FundTransfer = require('../models/FundTransfer');
const { ok, ApiError } = require('../utils/response');
const { isAdmin } = require('../utils/unitScope');

// SRS §3.2.5 — National Congress is the supreme body, comprising
// the complete National Jirga + complete Provincial Jirgas + all
// District & Area Committees + all registered party workers.
// We don't materialize a single roster; we expose a summary plus
// drill-down counts so the UI can compose the body on demand.
exports.congressSummary = asyncHandler(async (req, res) => {
  const [
    centralCabinet,
    provincialOfficeholders,
    districtOfficeholders,
    areaOfficeholders,
    activeMembers,
    provinces, districts, areas, basicUnits,
  ] = await Promise.all([
    RoleAssignment.find({
      unitLevel: 'CENTRAL', state: 'APPROVED', endedAt: { $exists: false },
    }).populate('memberId', 'fullName memberId phone'),
    RoleAssignment.countDocuments({
      unitLevel: 'PROVINCE',
      roleCode: { $in: ['PRESIDENT', 'GENERAL_SECRETARY'] },
      state: 'APPROVED', endedAt: { $exists: false },
    }),
    RoleAssignment.countDocuments({
      unitLevel: 'DISTRICT',
      roleCode: { $in: ['SECRETARY', 'SENIOR_MAWIN'] },
      state: 'APPROVED', endedAt: { $exists: false },
    }),
    RoleAssignment.countDocuments({
      unitLevel: 'AREA',
      roleCode: { $in: ['SECRETARY', 'SENIOR_MAWIN'] },
      state: 'APPROVED', endedAt: { $exists: false },
    }),
    Member.countDocuments({ status: 'ACTIVE' }),
    Province.countDocuments({ isActive: true }),
    District.countDocuments({ isActive: true }),
    Area.countDocuments({ isActive: true }),
    BasicUnit.countDocuments({ isActive: true }),
  ]);

  ok(res, {
    centralCabinet,
    composition: {
      centralCabinetSize: centralCabinet.length,
      provincialOfficeholders,
      districtOfficeholders,
      areaOfficeholders,
      activeMembers,
    },
    structure: { provinces, districts, areas, basicUnits },
  });
});

exports.alertsFeed = asyncHandler(async (req, res) => {
  if (!isAdmin(req.user)) {
    throw new ApiError(403, 'FORBIDDEN', 'Admin role required');
  }
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  const alerts = [];

  // 1. Pending member approvals older than 7 days
  const pendingMembers = await Member.find({
    status: 'PENDING_APPROVAL',
    createdAt: { $lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
  }).countDocuments();
  if (pendingMembers > 0) {
    alerts.push({
      severity: 'WARN',
      kind: 'OVERDUE_MEMBER_APPROVAL',
      message: `${pendingMembers} member application(s) awaiting approval for more than 7 days`,
    });
  }

  // 2. Meetings that ended >48h ago and are still PENDING_REPORT/SCHEDULED
  const overdueReports = await Meeting.countDocuments({
    state: { $in: ['SCHEDULED', 'IN_PROGRESS', 'PENDING_REPORT'] },
    endAt: { $lt: new Date(Date.now() - 48 * 3600 * 1000) },
  });
  if (overdueReports > 0) {
    alerts.push({
      severity: 'WARN',
      kind: 'OVERDUE_MEETING_REPORT',
      message: `${overdueReports} meeting report(s) overdue (> 48h since end time)`,
    });
  }

  // 3. Pending high-value expenses
  const pendingExpenses = await Expense.countDocuments({ state: 'PENDING' });
  if (pendingExpenses > 0) {
    alerts.push({
      severity: 'INFO',
      kind: 'PENDING_EXPENSES',
      message: `${pendingExpenses} expense(s) awaiting Secretary approval`,
    });
  }

  // 4. Fund transfers awaiting acknowledgment
  const pendingTransfers = await FundTransfer.countDocuments({ state: 'PENDING_ACK' });
  if (pendingTransfers > 0) {
    alerts.push({
      severity: 'INFO',
      kind: 'PENDING_TRANSFERS',
      message: `${pendingTransfers} fund transfer(s) awaiting acknowledgment by receiving unit`,
    });
  }

  // 5. Net deficit at central scope (donations + transfersIn vs expenses + transfersOut) over last 30d
  const [donAgg, expAgg] = await Promise.all([
    Donation.aggregate([{ $match: { receivedAt: { $gte: since } } }, { $group: { _id: null, t: { $sum: '$amount' } } }]),
    Expense.aggregate([{ $match: { state: 'APPROVED', incurredAt: { $gte: since } } }, { $group: { _id: null, t: { $sum: '$amount' } } }]),
  ]);
  const inflow = donAgg[0]?.t || 0;
  const outflow = expAgg[0]?.t || 0;
  if (outflow > inflow * 1.2 && inflow > 0) {
    alerts.push({
      severity: 'WARN',
      kind: 'EXPENSE_OVERRUN',
      message: `Last 30 days: expenses (${outflow}) exceeded donations (${inflow}) by more than 20%`,
    });
  }

  ok(res, alerts);
});
