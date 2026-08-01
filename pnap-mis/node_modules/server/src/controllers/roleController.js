const asyncHandler = require('express-async-handler');
const RoleAssignment = require('../models/RoleAssignment');
const Member = require('../models/Member');
const CabinetSlot = require('../models/CabinetSlot');
const { ok, created, ApiError } = require('../utils/response');
const {
  canDecideRole,
  canInitiateRole,
  canReadUnitRoles,
  unitWithinAreaAdminScope,
  resolveUnitChain,
} = require('../utils/unitScope');
const workflowEngine = require('../services/workflowEngine');

// SUPER_ADMIN can initiate or decide role assignments at any tier
// (NATIONAL_ADMIN was removed; Super took over its Central-tier
// duties). Below Super, role assignment is delegated to AREA_ADMIN /
// higher territorial admins + SECRETARY / SENIOR_MAWIN within their
// unit per SRS §5.2.
async function authorizeRoleAction(user, action, unitLevel, unitId) {
  const ok = action === 'propose'
    ? canInitiateRole(user)
    : canDecideRole(user);
  if (!ok) {
    throw new ApiError(403, 'FORBIDDEN',
      action === 'propose'
        ? 'Only Senior Mawin / Area-Admin / Secretary may propose role assignments'
        : 'Only Secretary / Area-Admin / higher admin may decide role assignments');
  }
  const inScope = await unitWithinAreaAdminScope(user, unitLevel, unitId);
  if (!inScope) {
    throw new ApiError(403, 'OUT_OF_SCOPE',
      'This unit is not within your area. Only its assigned Area Admin can act.');
  }
}

// SRS §5.3 — initiator (Senior Mawin / 1st Sec / GS) proposes,
// approver (Secretary / President / Chairman) decides. Single state
// machine: PROPOSED → APPROVED / REJECTED / REVISION_REQUESTED → ENDED.

exports.list = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, state, memberId } = req.query;
  const filter = {};
  if (unitLevel) filter.unitLevel = unitLevel;
  if (unitId) filter.unitId = unitId;
  if (state) filter.state = state;
  if (memberId) filter.memberId = memberId;

  // Read scope. This endpoint used to answer any query from any
  // authenticated caller, which made every unit's cabinet roster
  // world-readable. Three shapes are legitimate:
  //   • a member asking about their own assignments;
  //   • a unit-scoped query the caller is entitled to see;
  //   • the cross-unit queue, which only Super Admin may pull.
  const isSuper = !!req.user?.roles?.includes('SUPER_ADMIN');
  const isSelfQuery = memberId && req.user?.memberId
    && String(memberId) === String(req.user.memberId);
  if (!isSuper && !isSelfQuery) {
    if (!unitLevel || !unitId) {
      throw new ApiError(400, 'UNSCOPED_QUERY',
        'Role queries must name a unit (unitLevel + unitId) or your own memberId.');
    }
    if (!(await canReadUnitRoles(req.user, unitLevel, unitId))) {
      throw new ApiError(403, 'OUT_OF_SCOPE', 'This unit is outside your hierarchy.');
    }
  }

  const items = await RoleAssignment.find(filter)
    .sort({ createdAt: -1 })
    .populate('memberId', 'fullName cnic photoUrl memberId')
    .populate('initiatedBy', 'fullName email')
    .populate('decidedBy', 'fullName email');
  ok(res, items);
});

exports.cabinet = asyncHandler(async (req, res) => {
  const { unitLevel, unitId } = req.query;
  if (!unitLevel || !unitId) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel and unitId required');
  }
  if (!(await canReadUnitRoles(req.user, unitLevel, unitId))) {
    throw new ApiError(403, 'OUT_OF_SCOPE', 'This unit is outside your hierarchy.');
  }

  // Make sure the slot rows exist for this unit (idempotent — does
  // nothing on units that already have them seeded).
  await CabinetSlot.seedFor(unitLevel, unitId);

  const [slots, approved] = await Promise.all([
    CabinetSlot.find({ unitLevel, unitId })
      .sort({ sortOrder: 1, roleCode: 1 })
      .populate('filledMemberId', 'fullName cnic photoUrl memberId phone'),
    RoleAssignment.find({
      unitLevel, unitId, state: 'APPROVED', endedAt: { $exists: false },
    }).populate('memberId', 'fullName cnic photoUrl memberId phone'),
  ]);

  // Merge slot template with currently-approved assignments. A slot
  // is considered FILLED if there is an active APPROVED assignment
  // for that roleCode.
  const byCode = new Map(approved.map((a) => [a.roleCode, a]));
  const rows = slots.map((s) => {
    const a = byCode.get(s.roleCode);
    return {
      _id: s._id,
      roleCode: s.roleCode,
      isMandatory: s.isMandatory,
      sortOrder: s.sortOrder,
      state: a ? 'FILLED' : 'VACANT',
      assignment: a || null,
      member: a ? a.memberId : null,
    };
  });

  // Custom roles — every active non-system role in the Role
  // Management catalogue surfaces as a virtual cabinet row. If a
  // member already holds it for this unit, the row reads FILLED;
  // otherwise it reads VACANT with an Assign button (handled by the
  // standard cabinet UI). This means custom roles sit inline with
  // Secretary / Senior Mawin / etc. — no separate "custom" section.
  const templateCodes = new Set(slots.map((s) => s.roleCode));
  const Role = require('../models/Role');
  const customRoles = await Role.find({ isSystem: false, isActive: true })
    .sort({ sortOrder: 1, label: 1 })
    .lean();
  const seenCustomCodes = new Set();
  for (const cr of customRoles) {
    if (templateCodes.has(cr.code)) continue; // never collide with template
    seenCustomCodes.add(cr.code);
    const a = byCode.get(cr.code);
    rows.push({
      _id: cr._id,                       // virtual slot id (stable per role)
      roleCode: cr.code,
      customRoleName: cr.label,          // human label for display
      isMandatory: false,
      isCustom: true,                    // flag so the UI can mark it
      sortOrder: 800 + (cr.sortOrder || 0),
      state: a ? 'FILLED' : 'VACANT',
      assignment: a || null,
      member: a ? a.memberId : null,
    });
  }

  // Legacy free-text "OTHER" assignments — surface those too, ordered
  // last. These stay row-per-assignment since the same OTHER code can
  // be reused with different customRoleNames.
  for (const a of approved) {
    if (templateCodes.has(a.roleCode) || seenCustomCodes.has(a.roleCode)) continue;
    rows.push({
      _id: a._id,
      roleCode: a.roleCode,
      customRoleName: a.customRoleName,
      isMandatory: false,
      isCustom: true,
      sortOrder: 999,
      state: 'FILLED',
      assignment: a,
      member: a.memberId,
    });
  }

  rows.sort((x, y) => (x.sortOrder || 0) - (y.sortOrder || 0));
  ok(res, rows);
});

exports.propose = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, memberId, roleCode, customRoleName } = req.body;
  await authorizeRoleAction(req.user, 'propose', unitLevel, unitId);

  const chain = await resolveUnitChain(unitLevel, unitId);
  if (!chain) throw new ApiError(400, 'INVALID_UNIT', 'Unit not found');

  const member = await Member.findById(memberId);
  if (!member || member.status !== 'ACTIVE') {
    throw new ApiError(400, 'INVALID_MEMBER', 'Only ACTIVE members can hold a role');
  }

  // ROLE-004 + ROLE-006: only one active mandatory holder per unit;
  // a member cannot hold two mandatory roles in the same unit.
  const mandatory = RoleAssignment.MANDATORY_ROLES_PER_LEVEL[unitLevel] || [];
  if (mandatory.includes(roleCode)) {
    const existing = await RoleAssignment.findOne({
      unitLevel, unitId, roleCode, state: 'APPROVED', endedAt: { $exists: false },
    });
    if (existing) {
      throw new ApiError(409, 'ROLE_OCCUPIED', `Role ${roleCode} is already filled for this unit`);
    }
    const dup = await RoleAssignment.findOne({
      unitLevel, unitId, memberId, state: 'APPROVED', endedAt: { $exists: false },
      roleCode: { $in: mandatory },
    });
    if (dup) {
      throw new ApiError(409, 'MEMBER_ALREADY_HAS_MANDATORY', 'Member already holds a mandatory role in this unit');
    }
  }

  const ra = await RoleAssignment.create({
    unitLevel, unitId, memberId, roleCode, customRoleName,
    state: 'PROPOSED',
    initiatedBy: req.user._id,
  });
  created(res, ra);
});

exports.decide = asyncHandler(async (req, res) => {
  const ra = await RoleAssignment.findById(req.params.id);
  if (!ra) throw new ApiError(404, 'NOT_FOUND', 'Role assignment not found');
  await authorizeRoleAction(req.user, 'decide', ra.unitLevel, ra.unitId);
  if (ra.state !== 'PROPOSED' && ra.state !== 'REVISION_REQUESTED') {
    throw new ApiError(400, 'INVALID_STATE', `Cannot decide in state ${ra.state}`);
  }

  const { decision, decisionNote } = req.body;

  // PR F1 — workflow gate. Bespoke authorizeRoleAction already
  // confirmed unit scope; workflowEngine layers permission/role +
  // multi-stage chain on top. Default single-stage ROLE_APPROVAL
  // workflow resolves to one entry with the legacy DECIDE_ROLE
  // permission gate, so behavior is unchanged.
  const { stages: rStages, config: rCfg } = await workflowEngine.resolveStages(
    'ROLE_APPROVAL', ra.unitLevel, {},
  );
  if (rCfg && rStages.length > 0) {
    const stage = workflowEngine.nextPendingStage(ra, rStages);
    if (!stage) throw new ApiError(400, 'NO_PENDING_STAGE', 'No pending workflow stage to decide');
    if (decision === 'APPROVED' || decision === 'REJECTED') {
      workflowEngine.canDecideAt(stage, req.user);
      ra.approvalChain = workflowEngine.recordDecision(
        ra, rStages, stage, req.user, decision, decisionNote,
      );
      ra.workflowConfigId = rCfg._id;
      ra.workflowVersion = rCfg.configVersion;
    }
    // For REVISION_REQUESTED, skip the chain — that's not a final
    // decision; the proposal goes back for edits.
  }

  // Final state — derived from the chain when a workflow exists, or
  // the raw decision otherwise. Multi-stage in flight stays PROPOSED.
  let finalState = decision;
  if (rCfg && (decision === 'APPROVED' || decision === 'REJECTED')) {
    const computed = workflowEngine.computeFinalState(rStages, ra.approvalChain || []);
    finalState = computed === 'PENDING' ? 'PROPOSED' : computed;
  }

  ra.state = finalState;
  ra.decidedBy = req.user._id;
  ra.decidedAt = new Date();
  ra.decisionNote = decisionNote;
  if (finalState === 'APPROVED') ra.startedAt = new Date();
  await ra.save();

  // Below this point the cascade logic only fires on the final
  // APPROVED transition — which is what the rest of the handler
  // assumes via the `decision === 'APPROVED'` check (still correct
  // because finalState assigned to ra.state above feeds the same
  // check via the next line).
  // Note: cabinet-slot mirror + committee auto-form continue to
  // read `decision === 'APPROVED'`, which is fine because they only
  // mean to fire when the FINAL state is APPROVED; rebind here so
  // the existing block doesn't need restructuring.
  // eslint-disable-next-line no-param-reassign
  if (finalState !== 'APPROVED') return ok(res, ra);

  // Live role sync — the holder's User.roles picks up the new role
  // immediately instead of waiting for their next login. Best-effort:
  // login re-derives anyway.
  try {
    const { syncMemberUserRoles } = require('../utils/syncMemberRoles');
    await syncMemberUserRoles(ra.memberId);
  } catch { /* non-fatal */ }

  // Mirror the decision onto the matching CabinetSlot (template-defined
  // roles) so the cabinet view immediately reflects "filled" state.
  // Custom catalogue codes (CUSTOM_*) and OTHER aren't in any template
  // — the cabinet view synthesizes a virtual row for them at list-time
  // instead, so we skip the mirror update.
  if (decision === 'APPROVED') {
    const isTemplateCode = !ra.roleCode.startsWith('CUSTOM_') && ra.roleCode !== 'OTHER';
    if (isTemplateCode) {
      await CabinetSlot.updateOne(
        { unitLevel: ra.unitLevel, unitId: ra.unitId, roleCode: ra.roleCode },
        { $set: { filledByAssignmentId: ra._id, filledMemberId: ra.memberId } }
      );
    }

    // SRS §3.1 — first APPROVED Area-level cabinet role auto-forms
    // the Elaqayi Committee. Composition (cabinet + BU office-holders
    // + permanent members) is derived live; this just records the
    // formation event so the UX has a concrete "created on …" moment.
    if (ra.unitLevel === 'AREA') {
      const Area = require('../models/Area');
      const area = await Area.findById(ra.unitId);
      if (area && !area.committee?.formedAt) {
        await CabinetSlot.seedFor('AREA', area._id);
        area.committee = {
          formedAt: new Date(),
          formedBy: req.user._id,
          name: `${area.name} Elaqayi Committee`,
        };
        await area.save();
        console.log(`[committee] auto-formed Elaqayi Committee for area "${area.name}" on first cabinet role approval`);
      }
    }
    // SRS §3.2 — same trigger at the District level: first DISTRICT
    // cabinet role auto-forms the Zilla Committee.
    if (ra.unitLevel === 'DISTRICT') {
      const District = require('../models/District');
      const district = await District.findById(ra.unitId);
      if (district && !district.committee?.formedAt) {
        await CabinetSlot.seedFor('DISTRICT', district._id);
        district.committee = {
          formedAt: new Date(),
          formedBy: req.user._id,
          name: `${district.name} Zilla Committee`,
        };
        await district.save();
        console.log(`[committee] auto-formed Zilla Committee for district "${district.name}" on first cabinet role approval`);
      }
    }
    // SRS §3.3 — same trigger at the Province level: first PROVINCE
    // cabinet role auto-forms the Sobayi Committee.
    if (ra.unitLevel === 'PROVINCE') {
      const Province = require('../models/Province');
      const province = await Province.findById(ra.unitId);
      if (province && !province.committee?.formedAt) {
        await CabinetSlot.seedFor('PROVINCE', province._id);
        province.committee = {
          formedAt: new Date(),
          formedBy: req.user._id,
          name: `${province.name} Sobayi Committee`,
        };
        await province.save();
        console.log(`[committee] auto-formed Sobayi Committee for province "${province.name}" on first cabinet role approval`);
      }
    }
    // SRS §3.4 — same trigger at Central: first CENTRAL cabinet role
    // auto-forms the Central Committee (and unlocks the Qomi Jirga
    // tab — both bodies share composition; Permanent Member rosters
    // are kept separate per body).
    if (ra.unitLevel === 'CENTRAL') {
      const Central = require('../models/Central');
      const central = await Central.findById(ra.unitId);
      if (central && !central.committee?.formedAt) {
        await CabinetSlot.seedFor('CENTRAL', central._id);
        central.committee = {
          formedAt: new Date(),
          formedBy: req.user._id,
          name: 'Central Committee',
        };
        await central.save();
        console.log(`[committee] auto-formed Central Committee + Qomi Jirga on first cabinet role approval`);
      }
    }
  }
  ok(res, ra);
});

exports.end = asyncHandler(async (req, res) => {
  const ra = await RoleAssignment.findById(req.params.id);
  if (!ra) throw new ApiError(404, 'NOT_FOUND', 'Role assignment not found');
  await authorizeRoleAction(req.user, 'decide', ra.unitLevel, ra.unitId);
  if (ra.state !== 'APPROVED' || ra.endedAt) {
    throw new ApiError(400, 'INVALID_STATE', 'Only active approved roles can be ended');
  }
  ra.state = 'ENDED';
  ra.endedAt = new Date();
  ra.endReason = req.body.endReason;
  ra.decisionNote = req.body.decisionNote;
  await ra.save();

  // Free up the slot
  await CabinetSlot.updateOne(
    { unitLevel: ra.unitLevel, unitId: ra.unitId, roleCode: ra.roleCode, filledByAssignmentId: ra._id },
    { $unset: { filledByAssignmentId: '', filledMemberId: '' } }
  );

  // Live role sync — the holder loses the role's capabilities NOW,
  // not on their next login.
  try {
    const { syncMemberUserRoles } = require('../utils/syncMemberRoles');
    await syncMemberUserRoles(ra.memberId);
  } catch { /* non-fatal */ }

  ok(res, ra);
});

// Super Admin god-mode: forcibly end any active role assignment
// without going through the normal scope check. Audited.
exports.adminEnd = asyncHandler(async (req, res) => {
  if (!req.user?.roles?.includes('SUPER_ADMIN')) {
    throw new ApiError(403, 'FORBIDDEN', 'Only Super Admin may force-end roles');
  }
  const ra = await RoleAssignment.findById(req.params.id);
  if (!ra) throw new ApiError(404, 'NOT_FOUND', 'Role assignment not found');
  if (ra.endedAt) throw new ApiError(400, 'INVALID_STATE', 'Already ended');

  ra.state = 'ENDED';
  ra.endedAt = new Date();
  ra.endReason = req.body.endReason || 'EXPELLED';
  ra.decisionNote = req.body.decisionNote || 'Force-ended by Super Admin';
  await ra.save();

  await CabinetSlot.updateOne(
    { unitLevel: ra.unitLevel, unitId: ra.unitId, roleCode: ra.roleCode, filledByAssignmentId: ra._id },
    { $unset: { filledByAssignmentId: '', filledMemberId: '' } }
  );

  // Live role sync — force-ended holders lose capabilities NOW.
  try {
    const { syncMemberUserRoles } = require('../utils/syncMemberRoles');
    await syncMemberUserRoles(ra.memberId);
  } catch { /* non-fatal */ }

  const { audit } = require('../utils/audit');
  await audit({
    req, action: 'ROLE_FORCE_END',
    targetType: 'RoleAssignment', targetId: ra._id,
    targetLabel: `${ra.roleCode} @ ${ra.unitLevel}`,
    note: ra.decisionNote,
    after: { state: 'ENDED', endReason: ra.endReason },
  });

  ok(res, ra);
});
