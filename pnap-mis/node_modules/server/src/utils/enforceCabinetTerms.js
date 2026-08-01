const RoleAssignment = require('../models/RoleAssignment');
const CabinetTemplate = require('../models/CabinetTemplate');
const CabinetSlot = require('../models/CabinetSlot');

// PR F1 — cabinet term enforcement. CabinetTemplate.termDays
// declares how long a role holder may serve before their assignment
// auto-ends. This sweep runs on every boot (idempotent) and ends
// any APPROVED RoleAssignment whose startedAt + termDays is in the
// past.
//
// Why boot-only (not cron): production deploys typically restart
// nightly or on every release, which gives a regular pulse without
// pulling in a job scheduler dependency. For installations that
// need finer-grained enforcement, an external cron can hit a
// dedicated /admin/cabinet/sweep endpoint (not exposed in this PR
// since admin demand isn't there).
//
// Idempotent: rows already in state=ENDED are filtered out.

async function enforceCabinetTerms() {
  // Pre-build a lookup of {tier:roleCode} → termDays so we don't
  // re-query the template collection per assignment.
  const templates = await CabinetTemplate.find({ termDays: { $gt: 0 } })
    .select('tierCode roleCode termDays')
    .lean();
  if (templates.length === 0) return { swept: 0 };

  const termsByKey = new Map();
  for (const t of templates) {
    termsByKey.set(`${t.tierCode}:${t.roleCode}`, t.termDays);
  }

  const candidates = await RoleAssignment.find({
    state: 'APPROVED',
    endedAt: { $exists: false },
    startedAt: { $exists: true, $ne: null },
  }).select('_id unitLevel unitId roleCode startedAt').lean();

  const now = Date.now();
  let swept = 0;
  for (const ra of candidates) {
    const termDays = termsByKey.get(`${ra.unitLevel}:${ra.roleCode}`);
    if (!termDays) continue;
    const expiresAt = new Date(ra.startedAt).getTime() + termDays * 24 * 60 * 60 * 1000;
    if (expiresAt > now) continue;

    // Term expired — end the assignment AND clear the matching
    // CabinetSlot so the cabinet view immediately reflects the
    // vacancy. Custom (CUSTOM_*) and OTHER codes don't have slots.
    await RoleAssignment.updateOne(
      { _id: ra._id },
      { $set: {
          state: 'ENDED',
          endedAt: new Date(expiresAt),
          endReason: 'TERM_ENDED',
          decisionNote: `Auto-ended on term expiry (${termDays} days from startedAt)`,
        } }
    );
    const isTemplateCode = !ra.roleCode.startsWith('CUSTOM_') && ra.roleCode !== 'OTHER';
    if (isTemplateCode) {
      await CabinetSlot.updateOne(
        { unitLevel: ra.unitLevel, unitId: ra.unitId, roleCode: ra.roleCode, filledByAssignmentId: ra._id },
        { $unset: { filledByAssignmentId: '', filledMemberId: '' } }
      );
    }
    swept++;
  }
  return { swept };
}

module.exports = { enforceCabinetTerms };
