const AuditLog = require('../models/AuditLog');

// Fire-and-forget audit logger. Never blocks the request — failures
// are logged to console but don't propagate, so a momentarily
// unavailable AuditLog collection can't break the underlying action.
async function audit({ req, action, targetType, targetId, targetLabel, before, after, note }) {
  try {
    await AuditLog.create({
      actorUserId: req.user?._id,
      actorRole: req.user?.roles?.[0],
      actorIdentifier: req.user?.username || req.user?.email || req.user?.cnic || '',
      action,
      targetType,
      targetId,
      targetLabel,
      note,
      before,
      after,
      ip: req.ip || req.headers?.['x-forwarded-for'] || '',
      userAgent: (req.headers?.['user-agent'] || '').slice(0, 200),
    });
  } catch (err) {
    console.warn(`[audit] failed to log ${action}: ${err.message}`);
  }
}

module.exports = { audit };
