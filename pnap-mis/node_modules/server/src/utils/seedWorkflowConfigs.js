const WorkflowConfig = require('../models/WorkflowConfig');

// seedWorkflowConfigs — idempotent seeder for default GLOBAL
// workflows, one per domain. Each is a SINGLE-STAGE chain that
// mirrors the existing controller's gate, so deploying PR U4 leaves
// behavior unchanged. Admin can later add / re-order stages, attach
// thresholds, or create TIER overrides without touching code.
//
// Domain → existing gate it mirrors:
//   EXPENSE_APPROVAL    — financeController.decideExpense → canApprove
//                         (APPROVE_EXPENSE permission)
//   MEMBER_APPROVAL     — memberController approve/reject → APPROVE_MEMBER
//   ROLE_APPROVAL       — roleController.decide → DECIDE_ROLE
//   TRANSFER_APPROVAL   — transferController.acknowledge → the
//                         destination unit's Finance Secretary
//                         (MANAGE_FINANCE). authorizeAck does the
//                         unit-scope half the engine can't model:
//                         the decider must hold the seat AT the
//                         destination unit. The two gates are ANDed.
//                         Resolved per destination tier, so whichever
//                         unit the sender addressed supplies the sole
//                         approver — above it, below it or alongside.
//   CABINET_APPOINTMENT — DECIDE_ROLE (cabinet appointments today
//                         flow through roleController.decide)
//
// Idempotent: only inserts missing GLOBAL rows. Once admin edits a
// row (adds stages, changes thresholds), the seeder NEVER overwrites.

const DEFAULTS = [
  {
    domain: 'EXPENSE_APPROVAL',
    stages: [{
      code: 'FINANCE_APPROVAL',
      name: 'Finance approval',
      sortOrder: 10,
      requirePermission: 'APPROVE_EXPENSE',
    }],
    note: 'Default single-stage approval mirroring the legacy gate. Add stages or thresholds to chain in second approvers.',
  },
  {
    domain: 'MEMBER_APPROVAL',
    stages: [{
      code: 'AREA_REVIEW',
      name: 'Area review',
      sortOrder: 10,
      requirePermission: 'APPROVE_MEMBER',
    }],
    note: 'Default single-stage approval. Cutover into memberController is a follow-up PR.',
  },
  {
    domain: 'ROLE_APPROVAL',
    stages: [{
      code: 'CABINET_DECISION',
      name: 'Cabinet decision',
      sortOrder: 10,
      requirePermission: 'DECIDE_ROLE',
    }],
    note: 'Default single-stage approval. Cutover into roleController is a follow-up PR.',
  },
  {
    domain: 'TRANSFER_APPROVAL',
    stages: [{
      code: 'DESTINATION_ACK',
      name: 'Destination Finance Sec acknowledgment',
      sortOrder: 10,
      // MANAGE_FINANCE — the permission that actually identifies a
      // Finance Secretary. This stage originally shipped with
      // APPROVE_EXPENSE as an admitted placeholder, which no Finance
      // Secretary holds (APPROVE_EXPENSE belongs to the Secretary, who
      // approves expenses the FS records — a deliberate segregation of
      // duties). That blocked the very person the stage is named after
      // from acknowledging an incoming transfer.
      requirePermission: 'MANAGE_FINANCE',
    }],
    note: 'Default single-stage. The destination unit\'s Finance Secretary acknowledges; transferController.authorizeAck additionally requires the decider to hold that seat at the destination unit itself.',
  },
  {
    domain: 'CABINET_APPOINTMENT',
    stages: [{
      code: 'TIER_DECISION',
      name: 'Higher-tier decision',
      sortOrder: 10,
      requirePermission: 'DECIDE_ROLE',
    }],
    note: 'Default single-stage. Cabinet appointments currently go through roleController.decide — this row is reserved for future split.',
  },
];

// One-time repair of the TRANSFER_APPROVAL placeholder on databases
// seeded before the fix. Rewrites the stage's requirePermission from
// APPROVE_EXPENSE to MANAGE_FINANCE — but ONLY while the row is still
// the pristine shipped default: system-owned, never edited by an
// admin (configVersion 1), and carrying exactly the one original
// stage. Any admin customisation is left untouched, per the seeder's
// never-overwrite contract.
//
// Idempotent twice over: the version bump takes the row past the
// configVersion === 1 guard, and the permission it looks for is gone
// once rewritten.
async function _repairTransferStagePermission() {
  const doc = await WorkflowConfig.findOne({ domain: 'TRANSFER_APPROVAL', scope: 'GLOBAL' });
  if (!doc || !doc.isSystem) return false;
  if ((doc.configVersion || 1) !== 1) return false;
  if (!Array.isArray(doc.stages) || doc.stages.length !== 1) return false;

  const stage = doc.stages[0];
  if (stage.code !== 'DESTINATION_ACK' || stage.requirePermission !== 'APPROVE_EXPENSE') return false;

  stage.requirePermission = 'MANAGE_FINANCE';
  doc.markModified('stages');
  doc.configVersion = 2;
  doc.note = DEFAULTS.find((d) => d.domain === 'TRANSFER_APPROVAL').note;
  await doc.save();

  // Drop any cached resolution so a long-lived process picks it up.
  require('../services/workflowEngine').invalidate('TRANSFER_APPROVAL');
  return true;
}

async function seedWorkflowConfigs() {
  let inserted = 0;
  let reconciled = 0;

  for (const d of DEFAULTS) {
    const existing = await WorkflowConfig.findOne({ domain: d.domain, scope: 'GLOBAL' });
    if (!existing) {
      await WorkflowConfig.create({
        domain: d.domain,
        scope: 'GLOBAL',
        stages: d.stages,
        isSystem: true,
        isActive: true,
        configVersion: 1,
        note: d.note,
      });
      inserted++;
      continue;
    }
    // Re-pin authoritative flags. isSystem must stay true; isActive
    // can't be flipped off (the controller refuses, but a direct DB
    // edit could).
    let dirty = false;
    if (!existing.isSystem) { existing.isSystem = true; dirty = true; }
    if (existing.isActive !== true) { existing.isActive = true; dirty = true; }
    if (existing.scope !== 'GLOBAL') { existing.scope = 'GLOBAL'; dirty = true; }
    if (dirty) {
      await existing.save();
      reconciled++;
    }
  }

  const repairedTransferStage = await _repairTransferStagePermission();

  return { inserted, reconciled, repairedTransferStage, total: DEFAULTS.length };
}

module.exports = { seedWorkflowConfigs, DEFAULTS };
