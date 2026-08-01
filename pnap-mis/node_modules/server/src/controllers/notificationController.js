const asyncHandler = require('express-async-handler');
const Notification = require('../models/Notification');
const { ok, ApiError } = require('../utils/response');

// Notifications inherit their source announcement's expiry. We hide
// expired rows from list + unread-count so a notification fan-out
// from a "lasts until 5pm" announcement disappears at 5pm everywhere.
function notExpiredClause() {
  return { $or: [
    { expiresAt: null },
    { expiresAt: { $exists: false } },
    { expiresAt: { $gt: new Date() } },
  ] };
}

// List notifications for the calling user. Optional ?unreadOnly=true.
exports.list = asyncHandler(async (req, res) => {
  const { unreadOnly, limit } = req.query;
  const filter = { userId: req.user._id, ...notExpiredClause() };
  if (unreadOnly === 'true' || unreadOnly === '1') filter.read = false;
  const items = await Notification.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(parseInt(limit || '50', 10) || 50, 200))
    .lean();
  ok(res, items);
});

exports.unreadCount = asyncHandler(async (req, res) => {
  const count = await Notification.countDocuments({
    userId: req.user._id, read: false, ...notExpiredClause(),
  });
  ok(res, { count });
});

exports.markRead = asyncHandler(async (req, res) => {
  const n = await Notification.findOne({ _id: req.params.id, userId: req.user._id });
  if (!n) throw new ApiError(404, 'NOT_FOUND', 'Notification not found');
  if (!n.read) { n.read = true; await n.save(); }
  ok(res, n);
});

exports.markAllRead = asyncHandler(async (req, res) => {
  const r = await Notification.updateMany(
    { userId: req.user._id, read: false },
    { $set: { read: true } },
  );
  ok(res, { modified: r.modifiedCount || 0 });
});

exports.remove = asyncHandler(async (req, res) => {
  const r = await Notification.deleteOne({ _id: req.params.id, userId: req.user._id });
  if (!r.deletedCount) throw new ApiError(404, 'NOT_FOUND', 'Notification not found');
  ok(res, { deleted: true });
});
