const UnitPolicy = require('../models/UnitPolicy');

// seedUnitPolicies — idempotent seeder for the GLOBAL policy row.
//
// The values here PRESERVE the system's pre-PR-U3 hardcoded behavior:
//   • Expense second-approver threshold: 10000 (matches
//     financeController's EXPENSE_APPROVAL_THRESHOLD)
//   • Transfers: all three directions (matches transferController —
//     the sender names any active unit in the organization, so DOWN
//     and SAME_TIER are ordinary cases, not exceptions)
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
    return {
      inserted: 0,
      reconciled: dirty ? 1 : 0,
      widenedDirections: await _widenTransferDirections(),
    };
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
      // All three directions. Destinations are chosen from the whole
      // organization tree, so a District paying one of its Areas
      // (DOWN) and KPK paying Punjab (SAME_TIER) are both legitimate.
      // Admin can narrow this list to re-restrict the flow.
      allowedDirections: ['UP', 'DOWN', 'SAME_TIER'],
    },
  });

  return { inserted: 1, reconciled: 0, widenedDirections: false };
}

// One-time widening of the transfer-direction rule on databases seeded
// before the destination policy changed. Without this, every existing
// deployment keeps allowedDirections: ['UP'] and policyEngine rejects
// the downward and same-tier transfers the new rule is meant to allow.
//
// Guarded like the seeder itself: it only rewrites the pristine
// shipped row — system-owned, never edited by an admin
// (policyVersion 1), and still carrying exactly the old ['UP'] value.
// An admin who has deliberately set a direction list keeps it.
//
// Idempotent twice over: the version bump takes the row past the
// policyVersion === 1 guard, and the value it looks for is gone once
// rewritten.
async function _widenTransferDirections() {
  const doc = await UnitPolicy.findOne({ scope: 'GLOBAL' });
  if (!doc || !doc.isSystem) return false;
  if ((doc.policyVersion || 1) !== 1) return false;

  const current = doc.transfer?.allowedDirections || [];
  if (current.length !== 1 || current[0] !== 'UP') return false;

  doc.transfer.allowedDirections = ['UP', 'DOWN', 'SAME_TIER'];
  doc.markModified('transfer');
  doc.policyVersion = 2;
  await doc.save();

  // Drop the resolved-policy cache so a long-lived process picks it up.
  require('../services/policyEngine').invalidate('GLOBAL');
  return true;
}

module.exports = { seedUnitPolicies };
