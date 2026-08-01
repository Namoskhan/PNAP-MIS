const mongoose = require('mongoose');

// Role catalogue — one document per role code (built-in or custom).
// Built-in codes are the SRS-defined 22 roles seeded by db.js on
// startup; their `code`, `category`, and `isSystem=true` cannot be
// changed. Super Admin can edit `label`, `description`, `sortOrder`,
// and `isActive` for any role; they can also create custom roles
// (isSystem=false) which appear in role pickers but inherit
// MEMBER-level permissions (no power granting at the code level —
// that's a deliberate guard so the SRS permission model stays sound).
const CATEGORIES = ['ADMIN', 'BU_AREA_DISTRICT', 'PROVINCE', 'CENTRAL', 'CUSTOM', 'SYSTEM'];

const roleSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true, index: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    category: { type: String, enum: CATEGORIES, default: 'CUSTOM', index: true },
    isSystem: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 100 },
    // Permission codes this role grants. The catalogue is fixed in
    // server/src/utils/permissions.js; Super Admin can toggle which
    // codes a role carries from the Role Management page.
    permissions: { type: [String], default: [] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

roleSchema.statics.CATEGORIES = CATEGORIES;

module.exports = mongoose.model('Role', roleSchema);
