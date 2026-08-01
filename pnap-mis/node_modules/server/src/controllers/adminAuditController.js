const asyncHandler = require('express-async-handler');
const AuditLog = require('../models/AuditLog');
const { ok } = require('../utils/response');

exports.list = asyncHandler(async (req, res) => {
  const { action, targetType, actorUserId, page = 1, limit = 100 } = req.query;
  const filter = {};
  if (action) filter.action = action;
  if (targetType) filter.targetType = targetType;
  if (actorUserId) filter.actorUserId = actorUserId;
  const lim = Math.min(500, parseInt(limit, 10));
  const skip = (Math.max(1, parseInt(page, 10)) - 1) * lim;
  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip).limit(lim)
      .populate('actorUserId', 'username email cnic fullName')
      .lean(),
    AuditLog.countDocuments(filter),
  ]);
  ok(res, { items, total, page: Number(page), limit: lim });
});
