const UnitPolicy = require('../models/UnitPolicy');

// seedUnitPolicies — idempotent seeder for the GLOBAL policy row.
//
// The values here PRESERVE the system's pre-PR-U3 hardcoded behavior:
//   • Expense second-approver threshold: 10000 (matches
//     financeController's EXPENSE_APPROVAL_THRESHOLD)
//   • Transfers: UP-only (matches transferController's PARENT_LEVEL
//     enforcement)
//   • Meeting quorum: not enforced (no constraint existed)
//   • Donation CNIC: not enforced via this policy (the existing
//     SRS §9.1 rule lives in the donation controller)
//
// So deploying this seeder changes nothing for end users — admin
// must explicitly tighten thresholds via the API for behavior to
// shift.
//
// Idempotent: only inserts the GLOBAL row when missing. Once
// admin edits the row (changes thresholds, adds a slice, etc.) those
// changes are preserved on every boot — the seeder NEVER overwrites.

async function seedUnitPolicies() {
  const existing = await UnitPolicy.findOne({ scope: 'GLOBAL' });
  if (existing) {
    // Re-pin authoritative flags. isSystem must stay true; isActive
    // can't be flipped off (the controller refuses, but a direct DB
    // edit could).
    let dirty = false;
    if (!existing.isSystem) { existing.isSystem = true; dirty = true; }
    if (existing.isActive !== true) { existing.isActive = true; dirty = true; }
    if (dirty) await existing.save();
    return { inserted: 0, reconciled: dirty ? 1 : 0 };
  }

  await UnitPolicy.create({
    scope: 'GLOBAL',
    isSystem: true,
    isActive: true,
    policyVersion: 1,
    note: 'Seeded default — preserves pre-PR-U3 hardcoded behavior. Edit to tighten enforcement.',
    member: {
      // No registration policy enforced today — leave empty.
    },
    meeting: {
      // Meeting quorum was never enforced; leaving these zero/false
      // keeps that. Admin can set quorumMin > 0 to start enforcing.
      quorumMin: 0,
      quorumWarn: 0,
      minAttendancePercent: 0,
      requirePreviousReport: false,
    },
    finance: {
      // 10000 matches financeController's hardcoded
      // EXPENSE_APPROVAL_THRESHOLD. The legacy constant remains as a
      // fallback inside the controller for safety.
      expenseRequireSecondApproverAbove: 10000,
    },
    transfer: {
      // Upward-only — matches transferController's PARENT_LEVEL
      // hardcoded routing. Admin can extend to ['UP', 'DOWN', 'SAME_TIER']
      // once the controller learns to handle the other directions.
      allowedDirections: ['UP'],
    },
  });

  return { inserted: 1, reconciled: 0 };
}

module.exports = { seedUnitPolicies };
