const ResponsibilityTemplate = require('../models/ResponsibilityTemplate');
const Responsibility = require('../models/Responsibility');
const RoleAssignment = require('../models/RoleAssignment');
const User = require('../models/User');

// responsibilityHookService — auto-instantiates Responsibility
// documents on lifecycle events. Domain controllers fire-and-forget
// the matching `onX(record, user)` function after their save() call.
// The service:
//
//   1. Loads active templates whose trigger.event matches.
//   2. Filters them by trigger.conditions (tier / typeCode / body).
//   3. Resolves an assignee via assignment.target.
//   4. Inserts a Responsibility with the (templateId, sourceRef.id)
//      idempotency key — re-firing the same hook produces no
//      duplicates.
//
// All errors are swallowed (logged via console.warn) so a misfiring
// template can never break the source domain's save. Templates are
// admin-defined and entirely opt-in: zero seeded templates means
// zero new behavior.

// ─── Condition matching ───────────────────────────────────────────

function _matches(template, ctx) {
  const cond = template.trigger?.conditions || {};
  if (cond.tierCode && cond.tierCode !== ctx.tierCode) return false;
  if (cond.typeCode && cond.typeCode !== ctx.typeCode) return false;
  if (cond.body && cond.body !== ctx.body) return false;
  return true;
}

// ─── Assignee resolution ──────────────────────────────────────────

// Look up the linked memberId for a user. Returns null when the user
// is a tier admin / Super Admin without a member record.
async function _userMemberId(userId) {
  if (!userId) return null;
  const u = await User.findById(userId).select('memberId').lean();
  return u?.memberId || null;
}

// Find the current holder of a cabinet role at a unit. Returns the
// memberId or null when nobody holds the seat.
async function _cabinetRoleHolder(unitLevel, unitId, roleCode) {
  if (!roleCode) return null;
  const ra = await RoleAssignment.findOne({
    unitLevel,
    unitId,
    roleCode,
    state: 'APPROVED',
    endedAt: { $exists: false },
  }).select('memberId').lean();
  return ra?.memberId || null;
}

// Resolve assignee per the template's assignment.target. Each target
// may legitimately return null (no chairperson, no cabinet holder,
// creator without a linked member). Caller treats null as "skip
// silently" — never throws.
async function _resolveAssignee(template, source, ctx) {
  const target = template.assignment?.target;
  switch (target) {
    case 'CREATOR':
      return _userMemberId(source.createdBy);
    case 'CHAIRPERSON':
      // Meetings carry chairpersonId directly; activities don't.
      return source.chairpersonId || null;
    case 'LEAD':
      // Activities carry leadMemberId; meetings don't.
      return source.leadMemberId || null;
    case 'CABINET_ROLE':
      return _cabinetRoleHolder(ctx.tierCode, source.unitId, template.assignment.roleCode);
    default:
      return null;
  }
}

// ─── Single-row creator (idempotent) ──────────────────────────────

async function _createOne(template, source, ctx) {
  const assigneeMemberId = await _resolveAssignee(template, source, ctx);
  if (!assigneeMemberId) return { skipped: 'NO_ASSIGNEE' };

  const dueDate = template.dueDateOffsetDays > 0
    ? new Date(Date.now() + template.dueDateOffsetDays * 24 * 60 * 60 * 1000)
    : undefined;

  const title = template.titleTemplate || template.name;
  const description = template.descriptionTemplate || template.description || undefined;

  // Use the document chain on the source — it already carries the
  // full denormalized hierarchy (basicUnitId / areaId / districtId /
  // provinceId), so the new row inherits the same scope.
  const doc = {
    unitLevel: source.unitLevel,
    unitId: source.unitId,
    basicUnitId: source.basicUnitId,
    areaId: source.areaId,
    districtId: source.districtId,
    provinceId: source.provinceId,
    title,
    description,
    dueDate,
    assignedToMemberId: assigneeMemberId,
    assignedByUserId: ctx.actingUserId,
    relatedMeetingId: ctx.sourceKind === 'MEETING' ? source._id : undefined,
    relatedActivityId: ctx.sourceKind === 'ACTIVITY' ? source._id : undefined,
    state: 'PENDING',
    templateId: template._id,
    sourceRef: { kind: ctx.sourceKind, id: source._id },
  };

  // Idempotent insert — duplicate-key error means the responsibility
  // already exists for this (template, source) pair, which is fine.
  try {
    const created = await Responsibility.create(doc);
    return { created };
  } catch (err) {
    if (err && err.code === 11000) return { skipped: 'DUPLICATE' };
    throw err;
  }
}

// ─── Public hooks ─────────────────────────────────────────────────

// onMeetingFinalized — called by meetingController.finalize after
// save. Never blocks; never throws.
async function onMeetingFinalized(meeting, actingUser) {
  try {
    const templates = await ResponsibilityTemplate.find({
      'trigger.event': 'MEETING_FINALIZED',
      isActive: true,
    }).lean();
    if (templates.length === 0) return;

    const ctx = {
      tierCode: meeting.unitLevel,
      typeCode: meeting.typeCode || meeting.type,
      body: meeting.body,
      sourceKind: 'MEETING',
      actingUserId: actingUser?._id,
    };
    for (const t of templates) {
      if (!_matches(t, ctx)) continue;
      try {
        await _createOne(t, meeting, ctx);
      } catch (err) {
        console.warn(`[responsibilityHook] template ${t._id} failed for meeting ${meeting._id}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`[responsibilityHook] onMeetingFinalized failed: ${err.message}`);
  }
}

// onActivityCompleted — called by activityController.complete after
// save. Never blocks; never throws.
async function onActivityCompleted(activity, actingUser) {
  try {
    const templates = await ResponsibilityTemplate.find({
      'trigger.event': 'ACTIVITY_COMPLETED',
      isActive: true,
    }).lean();
    if (templates.length === 0) return;

    const ctx = {
      tierCode: activity.unitLevel,
      typeCode: activity.typeCode || activity.type,
      body: activity.body,
      sourceKind: 'ACTIVITY',
      actingUserId: actingUser?._id,
    };
    for (const t of templates) {
      if (!_matches(t, ctx)) continue;
      try {
        await _createOne(t, activity, ctx);
      } catch (err) {
        console.warn(`[responsibilityHook] template ${t._id} failed for activity ${activity._id}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`[responsibilityHook] onActivityCompleted failed: ${err.message}`);
  }
}

module.exports = {
  onMeetingFinalized,
  onActivityCompleted,
};
