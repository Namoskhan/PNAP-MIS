const mongoose = require('mongoose');

// Admin-authored broadcast scoped to a unit (and optionally its
// subtree). Visibility resolved server-side at list time by
// comparing the announcement's chain to the viewer's chain.
const UNIT_LEVELS = ['CENTRAL', 'PROVINCE', 'DISTRICT', 'AREA', 'BASIC_UNIT'];
const SCOPES = ['OWN', 'SUBTREE', 'GLOBAL'];

const announcementSchema = new mongoose.Schema(
  {
    authorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, trim: true },

    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },

    unitLevel: { type: String, enum: UNIT_LEVELS, required: true, index: true },
    unitId: { type: mongoose.Schema.Types.ObjectId, index: true },
    // Denormalized chain — copied from the unit at create time so the
    // visibility query stays a single round-trip.
    provinceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Province', index: true },
    districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', index: true },
    areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', index: true },
    basicUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'BasicUnit', index: true },

    scope: { type: String, enum: SCOPES, default: 'OWN' },
    pinned: { type: Boolean, default: false },
    expiresAt: { type: Date },

    // Direct-message mode — when set, this announcement bypasses
    // unit/scope visibility and is shown only to the target member
    // (and the author). targetUserId is best-effort: resolved at
    // create time if the member already has a User account, otherwise
    // left null and matched purely on member id at list time.
    targetMemberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member', index: true },
    targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  },
  { timestamps: true }
);

announcementSchema.statics.UNIT_LEVELS = UNIT_LEVELS;
announcementSchema.statics.SCOPES = SCOPES;

module.exports = mongoose.model('Announcement', announcementSchema);
