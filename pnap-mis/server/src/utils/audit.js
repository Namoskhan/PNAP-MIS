const mongoose = require('mongoose');
const AuditLog = require('../models/AuditLog');

// Fire-and-forget audit logger. Never blocks the request — failures
// are logged to console but don't propagate, so a momentarily
// unavailable AuditLog collection can't break the underlying action.
async function audit({ req, action, targetType, targetId, targetLabel, before, after, note }) {
  const validTargetId = mongoose.Types.ObjectId.isValid(targetId) ? targetId : undefined;
  const label = targetLabel || (targetId && !validTargetId ? String(targetId) : undefined);

  try {
    await AuditLog.create({
      actorUserId: req.user?._id,
      actorRole: req.user?.roles?.[0],
      actorIdentifier: req.user?.username || req.user?.email || req.user?.cnic || '',
      action,
      targetType,
      targetId: validTargetId,
      targetLabel: label,
      note,
      before,
      after,
      ip: req.ip || req.headers?.['x-forwarded-for'] || '',
      userAgent: (req.headers?.['user-agent'] || '').slice(0, 200),
    });
  } catch (err) {
    console.warn(`[audit] failed to log ${action}: ${err.message}`);
  }

  // Mirror into the organizational activity stream. Every audited
  // action IS meaningful administrative work, so hooking it here
  // covers the whole "any administrative action already implemented"
  // requirement at a single call site — the alternative was adding an
  // activity call beside each of the ~40 existing audit() calls, which
  // is exactly the duplication this service exists to prevent.
  //
  // The chain comes from the actor's own scope, since config actions
  // aren't tied to a unit the way a meeting is. Kept out of the try
  // above so an ActivityLog problem can't be misreported as an audit
  // failure; record() swallows its own errors.
  try {
    const activityService = require('../services/activityService');
    const { resolveUserChain } = require('./unitScope');
    const chain = req.user ? await resolveUserChain(req.user) : {};
    await activityService.record({
      action: 'ADMIN_ACTION',
      req,
      chain,
      targetType,
      targetId: validTargetId,
      targetLabel: label || action,
    });
  } catch (err) {
    console.warn(`[audit] activity mirror failed for ${action}: ${err.message}`);
  }
}

module.exports = { audit };
