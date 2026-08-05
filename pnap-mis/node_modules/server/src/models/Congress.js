const mongoose = require('mongoose');

// SRS §3.2.5 — the National Congress is the party's supreme body. It
// convenes periodically, and the span between two consecutive
// Congresses is the organization's natural reporting period: leadership
// reports "what we did since the last Congress" rather than "what we
// did in 2025".
//
// Only the EVENT is stored here — a label and the date it was held.
// Periods are derived: Congress N → Congress N+1, with the newest
// Congress opening a still-running period up to today. Storing spans
// instead would let two rows disagree about where one ends and the next
// begins.
//
// Deliberately minimal. This is not a meeting record: an actual
// Congress sitting is a Meeting at CENTRAL level like any other. This
// row exists so the dashboard can name and bound a reporting period.
const congressSchema = new mongoose.Schema(
  {
    // Human name for the sitting — "14th National Congress", "Congress
    // 2026". Used verbatim in period labels.
    label: { type: String, required: true, trim: true, maxlength: 120 },

    // The date the Congress convened. This is the period boundary.
    heldOn: { type: Date, required: true },

    venue: { type: String, trim: true, maxlength: 200 },
    notes: { type: String, trim: true, maxlength: 1000 },

    // Soft-delete. A Congress that turns out to be mis-entered can be
    // deactivated without rewriting the history of every report that
    // referenced its period.
    isActive: { type: Boolean, default: true, index: true },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// Periods are always built by walking Congresses in date order.
congressSchema.index({ heldOn: 1 });

// Two Congresses cannot share a date — the boundary between periods
// would be ambiguous. Partial filter so deactivated rows don't block a
// corrected re-entry on the same date.
congressSchema.index(
  { heldOn: 1, isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model('Congress', congressSchema);
