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
//   TRANSFER_APPROVAL   — transferController.acknowledge → custom (we
//                         use APPROVE_EXPENSE as a proxy; the
//                         existing authorizeAck does extra checks the
//                         engine doesn't know about — staged for a
//                         follow-up PR)
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
      requirePermission: 'APPROVE_EXPENSE',
    }],
    note: 'Default single-stage. Cutover into transferController is a follow-up PR — the existing authorizeAck has unit-scope checks the engine doesn\'t yet model.',
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

  return { inserted, reconciled, total: DEFAULTS.length };
}

module.exports = { seedWorkflowConfigs, DEFAULTS };
