const mongoose = require('mongoose');

// Append-only event stream of privileged write actions. Captured by
// the audit() helper from every Super Admin admin endpoint and the
// existing approval / decision endpoints, so the org has a paper
// trail of "who changed what and when". No API to delete entries.
const auditLogSchema = new mongoose.Schema(
  {
    actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorRole: String,
    actorIdentifier: String,
    action: { type: String, required: true, index: true },
    targetType: { type: String, index: true },
    targetId: { type: mongoose.Schema.Types.ObjectId, index: true },
    targetLabel: String,
    note: String,
    ip: String,
    userAgent: String,
    // Diff snapshot. For non-sensitive changes only — passwords are
    // never written here; we store action='RESET_PASSWORD' instead.
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
