const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const Donation = require('../models/Donation');
const Expense = require('../models/Expense');
const FundTransfer = require('../models/FundTransfer');
const Counter = require('../models/Counter');
const { ok, created, ApiError } = require('../utils/response');
const { canManageFinance, canApprove, resolveUnitChain } = require('../utils/unitScope');
const policyEngine = require('../services/policyEngine');
const workflowEngine = require('../services/workflowEngine');
const activityService = require('../services/activityService');

// Mongoose's `find` auto-casts query strings to ObjectId; aggregate's
// $match does NOT. Cast every ObjectId-typed field explicitly when
// building filters that flow into aggregate, otherwise the pipeline
// silently matches nothing.
function toOid(id) {
  if (!id) return id;
  if (id instanceof mongoose.Types.ObjectId) return id;
  return new mongoose.Types.ObjectId(String(id));
}

const ANONYMOUS_CAP = 5000;
const NON_MEMBER_CNIC_THRESHOLD = 50000;
// PR U3: legacy fallback only. The active threshold is sourced
// from UnitPolicy.finance.expenseRequireSecondApproverAbove via
// policyEngine.expenseRequiresSecondApprover. This constant remains
// as a safety net if policy resolution returns nothing.
const EXPENSE_APPROVAL_THRESHOLD = 10000;

function fiscalYearOf(date) {
  // Pakistani fiscal year July–June. Year is the year of the July 1st start.
  const d = new Date(date);
  const month = d.getMonth();
  return month >= 6 ? d.getFullYear() : d.getFullYear() - 1;
}

async function nextReceiptNo(unitId, fy) {
  const key = `donation:${unitId}:${fy}`;
  const seq = await Counter.next(key);
  return `${fy}-${String(seq).padStart(5, '0')}`;
}

// SRS §3.1 body separation — mirrors activityController.list /
// meetingController.list exactly. Returns a filter fragment to merge,
// or null when the caller omitted `body` (pooled Executive+Committee
// view — today's behavior, and what whole-unit oversight roles like
// the Senior Mawin Secretary need).
//
// The EXECUTIVE branch matches `$exists: false` as well: records
// written before `body` was added to these models carry no field at
// all and must keep appearing under Executive so nothing that used to
// be visible disappears.
function bodyClause(body) {
  if (body === 'EXECUTIVE' || body === 'NON_COMMITTEE') return { $or: [{ body: 'EXECUTIVE' }, { body: { $exists: false } }, { body: null }] };
  if (body === 'COMMITTEE') return { body: 'COMMITTEE' };
  return null;
}

// Write-side coercion, same style as activityController's
// `requestedBody` — anything that isn't COMMITTEE is EXECUTIVE.
function requestedBody(raw) {
  return raw === 'COMMITTEE' ? 'COMMITTEE' : 'EXECUTIVE';
}

function applyScopeFilter(filter, unitLevel, unitId, scope, chain) {
  if (scope === 'subtree') {
    if (unitLevel === 'BASIC_UNIT') filter.basicUnitId = toOid(chain.basicUnitId);
    else if (unitLevel === 'AREA') filter.areaId = toOid(chain.areaId);
    else if (unitLevel === 'DISTRICT') filter.districtId = toOid(chain.districtId);
    else if (unitLevel === 'PROVINCE') filter.provinceId = toOid(chain.provinceId);
  } else {
    filter.unitLevel = unitLevel;
    filter.unitId = toOid(unitId);
  }
}

// ---------- Donations ----------
exports.listDonations = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, scope, from, to, body } = req.query;
  const filter = {};
  if (unitLevel && unitId) {
    const chain = await resolveUnitChain(unitLevel, unitId);
    if (!chain) throw new ApiError(400, 'INVALID_UNIT', 'Unit not found');
    applyScopeFilter(filter, unitLevel, unitId, scope, chain);
  }
  if (from || to) {
    filter.receivedAt = {};
    if (from) filter.receivedAt.$gte = new Date(from);
    if (to) filter.receivedAt.$lte = new Date(to);
  }
  const bc = bodyClause(body);
  if (bc) Object.assign(filter, bc);
  const items = await Donation.find(filter).sort({ receivedAt: -1 }).limit(500);
  ok(res, items);
});

exports.recordDonation = asyncHandler(async (req, res) => {
  if (!canManageFinance(req.user)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only Finance Secretary / Admin may record donations');
  }
  const d = req.body;

  // FIN-003 / FIN-004 — anonymous cap and large non-member CNIC requirement.
  if (d.donorType === 'ANONYMOUS' && d.amount > ANONYMOUS_CAP) {
    throw new ApiError(400, 'ANONYMOUS_CAP', `Anonymous donations cannot exceed PKR ${ANONYMOUS_CAP}`);
  }
  if (d.donorType === 'NON_MEMBER' && d.amount > NON_MEMBER_CNIC_THRESHOLD && !d.donorCnic) {
    throw new ApiError(400, 'CNIC_REQUIRED', `Donor CNIC is required for non-member donations above PKR ${NON_MEMBER_CNIC_THRESHOLD}`);
  }

  const chain = await resolveUnitChain(d.unitLevel, d.unitId);
  if (!chain) throw new ApiError(400, 'INVALID_UNIT', 'Unit not found');

  const fy = fiscalYearOf(d.receivedAt);
  const receiptNo = await nextReceiptNo(d.unitId, fy);

  const doc = await Donation.create({
    ...d,
    ...chain,
    // Tag AFTER the spread so an unrecognised client value normalises
    // to EXECUTIVE rather than reaching the model.
    body: requestedBody(d.body),
    receiptNo,
    fiscalYear: fy,
    receiptImageUrl: req.file ? `/uploads/${req.file.filename}` : undefined,
    recordedBy: req.user._id,
  });
  created(res, doc);
});

// ---------- Expenses ----------
exports.listExpenses = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, scope, state, from, to, body } = req.query;
  const filter = {};
  if (unitLevel && unitId) {
    const chain = await resolveUnitChain(unitLevel, unitId);
    if (!chain) throw new ApiError(400, 'INVALID_UNIT', 'Unit not found');
    applyScopeFilter(filter, unitLevel, unitId, scope, chain);
  }
  if (state) filter.state = state;
  if (from || to) {
    filter.incurredAt = {};
    if (from) filter.incurredAt.$gte = new Date(from);
    if (to) filter.incurredAt.$lte = new Date(to);
  }
  const bc = bodyClause(body);
  if (bc) Object.assign(filter, bc);
  const items = await Expense.find(filter).sort({ incurredAt: -1 }).limit(500);
  ok(res, items);
});

exports.recordExpense = asyncHandler(async (req, res) => {
  if (!canManageFinance(req.user)) {
    throw new ApiError(403, 'FORBIDDEN', 'Only Finance Secretary / Admin may record expenses');
  }
  if (!req.file) throw new ApiError(400, 'EVIDENCE_REQUIRED', 'A bill / voucher is required for every expense');
  const d = req.body;
  const chain = await resolveUnitChain(d.unitLevel, d.unitId);
  if (!chain) throw new ApiError(400, 'INVALID_UNIT', 'Unit not found');

  // PR U3 — second-approver threshold sourced from UnitPolicy. The
  // engine returns { requiresApproval, threshold, reason }; we use
  // the boolean for the initial state. Falls back to the legacy
  // hardcoded 10000 when policy doesn't specify a threshold.
  const policy = await policyEngine.resolveFor(d.unitLevel, d.unitId);
  const policyDecision = policyEngine.expenseRequiresSecondApprover(d.amount, policy);
  const requiresApproval = policyDecision.threshold !== null
    ? policyDecision.requiresApproval
    : d.amount > EXPENSE_APPROVAL_THRESHOLD;
  const doc = await Expense.create({
    ...d,
    ...chain,
    // Tag AFTER the spread so an unrecognised client value normalises
    // to EXECUTIVE rather than reaching the model.
    body: requestedBody(d.body),
    evidenceUrl: `/uploads/${req.file.filename}`,
    state: requiresApproval ? 'PENDING' : 'APPROVED',
    approvedBy: requiresApproval ? undefined : req.user._id,
    approvedAt: requiresApproval ? undefined : new Date(),
    recordedBy: req.user._id,
  });

  // Report Submission — filing a voucher-backed expense return is the
  // unit's financial reporting duty.
  activityService.record({
    action: 'REPORT_SUBMITTED',
    req,
    chain,
    unitLevel: d.unitLevel,
    unitId: d.unitId,
    targetType: 'Expense',
    targetId: doc._id,
    targetLabel: doc.category,
  }).catch(() => {});

  created(res, doc);
});

// PR U4: decideExpense now consults workflowEngine. With the
// default seeded GLOBAL workflow (single FINANCE_APPROVAL stage)
// behavior is identical to the legacy gate — one call decides.
// When admin adds extra stages, callers iterate: the first call
// records the FINANCE stage; the second call records the next
// stage; the chain only reaches APPROVED final state when every
// APPLIES stage has decided APPROVED.
//
// Legacy fields (state / approvedBy / approvedAt / rejectedBy /
// rejectedAt) stay populated on the FINAL transition so downstream
// readers (notifications, exports, dashboards) keep working without
// modification.
exports.decideExpense = asyncHandler(async (req, res) => {
  const e = await Expense.findById(req.params.id);
  if (!e) throw new ApiError(404, 'NOT_FOUND', 'Expense not found');
  if (e.state !== 'PENDING') {
    throw new ApiError(400, 'INVALID_STATE', `Cannot decide expense in state ${e.state}`);
  }
  if (!['APPROVED', 'REJECTED'].includes(req.body.decision)) {
    throw new ApiError(400, 'INVALID_DECISION', 'decision must be APPROVED or REJECTED');
  }

  // Resolve stages for this expense's tier, with the amount in
  // payload so threshold-based stages skip correctly when below.
  const { config, stages } = await workflowEngine.resolveStages(
    'EXPENSE_APPROVAL',
    e.unitLevel,
    { amount: e.amount },
  );
  if (!config || stages.length === 0) {
    // No workflow configured — fall through to the legacy single
    // gate so the system keeps working even if a misconfiguration
    // wipes the GLOBAL row. Caller still needs APPROVE_EXPENSE.
    if (!canApprove(req.user)) {
      throw new ApiError(403, 'FORBIDDEN', 'Only Secretary / Admin may decide on expenses');
    }
  } else {
    // Engine-driven path. Find the first APPLIES stage without a
    // chain entry; gate on it; record the decision.
    const stage = workflowEngine.nextPendingStage(e, stages);
    if (!stage) {
      throw new ApiError(400, 'NO_PENDING_STAGE', 'No pending workflow stage to decide');
    }
    workflowEngine.canDecideAt(stage, req.user); // throws on permission/role miss

    const newChain = workflowEngine.recordDecision(
      e, stages, stage, req.user, req.body.decision, req.body.note,
    );
    e.approvalChain = newChain;
    e.workflowConfigId = config._id;
    e.workflowVersion = config.configVersion;
  }

  // Compute final state. With the engine path we read the chain;
  // with the legacy fallback we apply the decision directly.
  let finalState;
  if (config) {
    finalState = workflowEngine.computeFinalState(stages, e.approvalChain);
  } else {
    finalState = req.body.decision;
  }

  if (finalState === 'APPROVED') {
    e.state = 'APPROVED';
    e.approvedBy = req.user._id;
    e.approvedAt = new Date();
  } else if (finalState === 'REJECTED') {
    e.state = 'REJECTED';
    e.rejectedBy = req.user._id;
    e.rejectedAt = new Date();
  }
  // PENDING (multi-stage in flight) → state stays PENDING; only
  // the chain has grown. UI surfaces "Awaiting next approver."

  await e.save();

  // Notify whoever recorded the expense — but only when the
  // workflow has fully resolved (not on intermediate stages).
  if (finalState === 'APPROVED' || finalState === 'REJECTED') {
    const { notify } = require('../utils/notify');
    notify(e.recordedBy, {
      type: 'EXPENSE_DECIDED',
      severity: finalState === 'APPROVED' ? 'SUCCESS' : 'WARNING',
      title: finalState === 'APPROVED' ? 'Expense approved' : 'Expense rejected',
      body: `${e.category} · PKR ${(e.amount || 0).toLocaleString()} — ${e.description || ''}`.trim(),
      link: '/unit/finance',
    }).catch(() => {});
  }

  // Report Approval. Fires on every decision, including intermediate
  // multi-stage ones — each approver did the work of reviewing it.
  activityService.record({
    action: 'REPORT_APPROVED',
    req,
    chain: {
      basicUnitId: e.basicUnitId,
      areaId: e.areaId,
      districtId: e.districtId,
      provinceId: e.provinceId,
    },
    unitLevel: e.unitLevel,
    unitId: e.unitId,
    targetType: 'Expense',
    targetId: e._id,
    targetLabel: e.category,
  }).catch(() => {});

  ok(res, e);
});

// ---------- Summary ----------
exports.summary = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, scope, body } = req.query;
  if (!unitLevel || !unitId) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel and unitId required');
  const chain = await resolveUnitChain(unitLevel, unitId);
  if (!chain) throw new ApiError(400, 'INVALID_UNIT', 'Unit not found');

  const dFilter = {};
  const eFilter = {};
  applyScopeFilter(dFilter, unitLevel, unitId, scope, chain);
  applyScopeFilter(eFilter, unitLevel, unitId, scope, chain);
  eFilter.state = 'APPROVED';

  // Acknowledged outgoing transfers leave the books; acknowledged
  // incoming transfers arrive on the books. Cast unitId — aggregate
  // $match doesn't auto-cast strings to ObjectId.
  const outFilter = {
    sourceLevel: unitLevel,
    sourceUnitId: toOid(unitId),
    state: 'ACKNOWLEDGED',
  };
  const inFilter = {
    destinationLevel: unitLevel,
    destinationUnitId: toOid(unitId),
    state: 'ACKNOWLEDGED',
  };

  // Optional body split — every one of the four ledgers narrows
  // together so the KPI tiles and the Net Balance stay internally
  // consistent. Omitted `body` leaves all four untouched (pooled).
  const bc = bodyClause(body);
  if (bc) {
    Object.assign(dFilter, bc);
    Object.assign(eFilter, bc);
    Object.assign(outFilter, bc);
    Object.assign(inFilter, bc);
  }

  const [donAgg, expAgg, outAgg, inAgg] = await Promise.all([
    Donation.aggregate([{ $match: dFilter }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Expense.aggregate([{ $match: eFilter }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    FundTransfer.aggregate([{ $match: outFilter }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    FundTransfer.aggregate([{ $match: inFilter }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
  ]);

  const donations = donAgg[0] || { total: 0, count: 0 };
  const expenses = expAgg[0] || { total: 0, count: 0 };
  const transfersOut = outAgg[0] || { total: 0, count: 0 };
  const transfersIn = inAgg[0] || { total: 0, count: 0 };
  ok(res, {
    donations,
    expenses,
    transfersOut,
    transfersIn,
    balance: donations.total + transfersIn.total - expenses.total - transfersOut.total,
  });
});

// ---------- Monthly Statements (SRS §9.4) ----------
// Buckets donations / approved-expenses / acknowledged transfers by
// calendar month for the requested period. Used by the Finance
// Secretary's Monthly Statements view + monthly statement export.
exports.monthlyStatements = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, scope, from, to, body } = req.query;
  if (!unitLevel || !unitId) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel and unitId required');
  const chain = await resolveUnitChain(unitLevel, unitId);
  if (!chain) throw new ApiError(400, 'INVALID_UNIT', 'Unit not found');

  const dFilter = {};
  const eFilter = {};
  applyScopeFilter(dFilter, unitLevel, unitId, scope, chain);
  applyScopeFilter(eFilter, unitLevel, unitId, scope, chain);
  eFilter.state = 'APPROVED';
  const outFilter = { sourceLevel: unitLevel, sourceUnitId: toOid(unitId), state: 'ACKNOWLEDGED' };
  const inFilter = { destinationLevel: unitLevel, destinationUnitId: toOid(unitId), state: 'ACKNOWLEDGED' };

  // Same optional body split as summary() — all four ledgers narrow
  // together so a month's Net Balance can't mix the two bodies.
  const bc = bodyClause(body);
  if (bc) {
    Object.assign(dFilter, bc);
    Object.assign(eFilter, bc);
    Object.assign(outFilter, bc);
    Object.assign(inFilter, bc);
  }

  const dateRange = {};
  if (from) dateRange.$gte = new Date(from);
  if (to) dateRange.$lte = new Date(to);
  const hasRange = Object.keys(dateRange).length > 0;
  if (hasRange) {
    dFilter.receivedAt = dateRange;
    eFilter.incurredAt = dateRange;
    outFilter.transferredAt = dateRange;
    inFilter.transferredAt = dateRange;
  }

  const monthGroup = (field) => ([
    { $project: { ym: { $dateToString: { format: '%Y-%m', date: `$${field}` } }, amount: 1 } },
    { $group: { _id: '$ym', total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);

  const [donByMonth, expByMonth, outByMonth, inByMonth] = await Promise.all([
    Donation.aggregate([{ $match: dFilter }, ...monthGroup('receivedAt')]),
    Expense.aggregate([{ $match: eFilter }, ...monthGroup('incurredAt')]),
    FundTransfer.aggregate([{ $match: outFilter }, ...monthGroup('transferredAt')]),
    FundTransfer.aggregate([{ $match: inFilter }, ...monthGroup('transferredAt')]),
  ]);

  const months = new Map();
  const seed = (k) => {
    if (!months.has(k)) months.set(k, { month: k, donations: 0, expenses: 0, transfersIn: 0, transfersOut: 0, donationCount: 0, expenseCount: 0 });
    return months.get(k);
  };
  donByMonth.forEach((r) => { const b = seed(r._id); b.donations = r.total; b.donationCount = r.count; });
  expByMonth.forEach((r) => { const b = seed(r._id); b.expenses = r.total; b.expenseCount = r.count; });
  outByMonth.forEach((r) => { const b = seed(r._id); b.transfersOut = r.total; });
  inByMonth.forEach((r) => { const b = seed(r._id); b.transfersIn = r.total; });

  const rows = Array.from(months.values()).map((b) => ({
    ...b,
    netBalance: b.donations + b.transfersIn - b.expenses - b.transfersOut,
  })).sort((a, b) => b.month.localeCompare(a.month));

  ok(res, rows);
});

// ─── System-wide Finance Overview (Super Admin) ─────────────────────
const Province = require('../models/Province');
exports.globalOverview = asyncHandler(async (req, res) => {
  const provinces = await Province.find({ isActive: true }).select('name code').lean();
  const [donAgg, expAgg, transAgg, perProvince] = await Promise.all([
    Donation.aggregate([{ $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Expense.aggregate([{ $match: { state: 'APPROVED' } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    FundTransfer.aggregate([{ $match: { state: 'ACKNOWLEDGED' } }, { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }]),
    Donation.aggregate([
      { $group: { _id: '$provinceId', donations: { $sum: '$amount' }, donCount: { $sum: 1 } } },
    ]),
  ]);
  const expByProv = await Expense.aggregate([
    { $match: { state: 'APPROVED' } },
    { $group: { _id: '$provinceId', expenses: { $sum: '$amount' }, expCount: { $sum: 1 } } },
  ]);
  const expMap = new Map(expByProv.map((r) => [String(r._id), r]));
  const donMap = new Map(perProvince.map((r) => [String(r._id), r]));
  const provinceRows = provinces.map((p) => {
    const d = donMap.get(String(p._id)) || { donations: 0, donCount: 0 };
    const e = expMap.get(String(p._id)) || { expenses: 0, expCount: 0 };
    return {
      _id: p._id, name: p.name, code: p.code,
      donations: d.donations, donationCount: d.donCount,
      expenses: e.expenses, expenseCount: e.expCount,
      netBalance: d.donations - e.expenses,
    };
  });

  ok(res, {
    totals: {
      donations: donAgg[0]?.total || 0,
      donationCount: donAgg[0]?.count || 0,
      expenses: expAgg[0]?.total || 0,
      expenseCount: expAgg[0]?.count || 0,
      transfers: transAgg[0]?.total || 0,
      transferCount: transAgg[0]?.count || 0,
      netBalance: (donAgg[0]?.total || 0) - (expAgg[0]?.total || 0),
    },
    perProvince: provinceRows,
  });
});
