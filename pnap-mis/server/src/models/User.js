const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = [
  // System / territorial admins. Super Admin handles every tier
  // above Province directly — Central Cabinet, Central Committee,
  // Qomi Jirga, AND Province creation. Province / District / Area
  // admins are explicitly created by the next-tier-up admin.
  'SUPER_ADMIN',
  'PROVINCE_ADMIN',
  'DISTRICT_ADMIN',
  'AREA_ADMIN',
  // Below-province cabinet roles (basic-unit / area / district)
  'SECRETARY',
  'SENIOR_MAWIN',
  'FINANCE_SECRETARY',
  'PRESS_SECRETARY',
  'CULTURE_SECRETARY',
  'SPORTS_SECRETARY',
  // Province cabinet (SRS §3.3)
  'PRESIDENT',
  'SR_VICE_PRESIDENT',
  'VICE_PRESIDENT',
  'GENERAL_SECRETARY',
  // Central cabinet (SRS §3.4)
  'CHAIRMAN',
  'CO_CHAIRMAN',
  'SR_VICE_CHAIRMAN',
  'VICE_CHAIRMAN',
  'FIRST_SECRETARY',
  // Custom-named roles + base member portal
  'OTHER',
  'MEMBER',
];

// A User is a login identity. Two flavours coexist:
//   1. Admin/officeholder accounts — created by Super Admin, login by email + password.
//   2. Member accounts — auto-provisioned when a citizen registers via the public
//      portal with a password, login by CNIC + password (password lives on the Member
//      record; this User row only carries the JWT subject + role/scope cache).
const userSchema = new mongoose.Schema(
  {
    email: { type: String, lowercase: true, trim: true },
    cnic: { type: String, trim: true },
    // Used by auto-provisioned Area Admins (and any other admin
    // who logs in with a memorable name instead of an email/CNIC).
    username: { type: String, lowercase: true, trim: true },
    passwordHash: { type: String },
    fullName: { type: String, required: true, trim: true },
    // Built-in SRS codes live in ROLES (still exported as a static for
    // legacy callers), but the field itself is no longer enum-locked.
    // Super Admin can mint custom roles via the Role catalogue, and
    // those codes flow into User.roles so the dynamic permission
    // resolver picks them up at request time.
    roles: [{ type: String, required: true, trim: true, uppercase: true }],
    scope: {
      provinceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Province' },
      districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District' },
      areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area' },
      basicUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'BasicUnit' },
    },
    memberId: { type: mongoose.Schema.Types.ObjectId, ref: 'Member' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

// Unique on each identifier ONLY for documents where the field is a
// real string. partialFilterExpression beats sparse:true because it
// excludes both "missing" AND null — without it, multiple users
// without an email would all share email=null and collide on the
// unique index.
userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
);
userSchema.index(
  { cnic: 1 },
  { unique: true, partialFilterExpression: { cnic: { $type: 'string' } } }
);
userSchema.index(
  { username: 1 },
  { unique: true, partialFilterExpression: { username: { $type: 'string' } } }
);

userSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
};
userSchema.methods.verifyPassword = function (plain) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plain, this.passwordHash);
};
userSchema.methods.toJSON = function () {
  const obj = this.toObject({ virtuals: true });
  delete obj.passwordHash;
  delete obj.__v;
  return obj;
};

userSchema.statics.ROLES = ROLES;

module.exports = mongoose.model('User', userSchema);
