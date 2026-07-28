const mongoose = require('mongoose');

// Per-user, system-emitted notification — surfaced via the topbar bell
// and a dedicated page. Created by the notify() helper from inside
// other controllers (member approval, expense decision, etc.).
const NOTIF_TYPES = [
  'MEMBER_REGISTERED',
  'MEMBER_APPROVED',
  'MEMBER_REJECTED',
  'EXPENSE_DECIDED',
  'ROLE_DECIDED',
  'ANNOUNCEMENT',
  'GENERIC',
];
const SEVERITIES = ['INFO', 'SUCCESS', 'WARNING', 'DANGER'];

const notificationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIF_TYPES, default: 'GENERIC' },
    severity: { type: String, enum: SEVERITIES, default: 'INFO' },
    title: { type: String, required: true, trim: true },
    body: { type: String, trim: true },
    link: { type: String, trim: true },
    read: { type: Boolean, default: false, index: true },

    // For announcement fan-out notifications — links the row to the
    // source Announcement and denormalizes its expiry so the list +
    // unread-count queries can drop expired ones in a single round
    // trip without a join.
    announcementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Announcement', index: true },
    expiresAt: { type: Date, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });
notificationSchema.statics.TYPES = NOTIF_TYPES;
notificationSchema.statics.SEVERITIES = SEVERITIES;

module.exports = mongoose.model('Notification', notificationSchema);
