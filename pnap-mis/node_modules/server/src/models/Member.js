const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const STATUSES = ['PENDING_APPROVAL', 'ACTIVE', 'REJECTED', 'INACTIVE', 'SUSPENDED', 'EXPELLED', 'DECEASED'];
const GENDERS = ['MALE', 'FEMALE', 'PREFER_NOT_TO_SAY'];

const memberSchema = new mongoose.Schema(
  {
    memberId: { type: String, unique: true, sparse: true, index: true },

    fullName: { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
    fatherOrHusbandName: { type: String, required: true, trim: true, minlength: 3, maxlength: 80 },
    cnic: {
      type: String,
      required: true,
      unique: true,
      match: /^\d{5}-\d{7}-\d$/,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      match: /^(\+92|0)?3\d{2}[- ]?\d{7}$/,
      trim: true,
    },
    email: { type: String, lowercase: true, trim: true, sparse: true },
    // Login handle derived from the first word of fullName at
    // registration time. Sparse-unique so legacy members without one
    // don't collide. Lowercased, alphanumeric only.
    username: { type: String, lowercase: true, trim: true, sparse: true, index: true, unique: true },
    dateOfBirth: { type: Date },
    gender: { type: String, enum: GENDERS },
    address: { type: String, trim: true, maxlength: 200 },

    basicUnitId: { type: mongoose.Schema.Types.ObjectId, ref: 'BasicUnit', required: true, index: true },
    areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Area', required: true, index: true },
    districtId: { type: mongoose.Schema.Types.ObjectId, ref: 'District', required: true, index: true },
    provinceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Province', required: true, index: true },

    photoUrl: { type: String },

    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', null], default: null },
    education: { type: String, trim: true },
    occupation: { type: String, trim: true },
    languagesSpoken: [{ type: String, trim: true }],
    dateJoined: { type: Date },
    emergencyContact: {
      name: String,
      phone: String,
    },
    skills: [{ type: String, trim: true }],

    status: { type: String, enum: STATUSES, default: 'PENDING_APPROVAL', index: true },
    statusReason: { type: String },

    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    submittedVia: { type: String, enum: ['PUBLIC', 'WEB', 'MOBILE', 'ADMIN'], default: 'WEB' },

    // Password the citizen set during public registration. Stored
    // hashed (bcrypt). The MIS login accepts CNIC + this password
    // once the member is APPROVED and assigned at least one role.
    passwordHash: { type: String, select: false },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },

    // ── PR F1 (workflow cutover) ──────────────────────────────────
    // Append-only chain populated by workflowEngine when the
    // configured MEMBER_APPROVAL workflow has multiple stages. With
    // the default single-stage workflow, this holds one entry on
    // the final transition; the legacy approvedBy/rejectedBy
    // fields stay populated for backwards compat.
    approvalChain: [{
      stageCode: String,
      stageName: String,
      decision: { type: String, enum: ['APPROVED', 'REJECTED', 'SKIPPED'] },
      decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      decidedAt: Date,
      note: String,
    }],
    workflowConfigId: { type: mongoose.Schema.Types.ObjectId, ref: 'WorkflowConfig' },
    workflowVersion: Number,
  },
  { timestamps: true }
);

memberSchema.methods.setPassword = async function (plain) {
  this.passwordHash = await bcrypt.hash(plain, 12);
};
memberSchema.methods.verifyPassword = function (plain) {
  if (!this.passwordHash) return Promise.resolve(false);
  return bcrypt.compare(plain, this.passwordHash);
};

memberSchema.virtual('age').get(function () {
  if (!this.dateOfBirth) return null;
  const diff = Date.now() - this.dateOfBirth.getTime();
  return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
});

memberSchema.set('toJSON', { virtuals: true });
memberSchema.set('toObject', { virtuals: true });

memberSchema.statics.STATUSES = STATUSES;
memberSchema.statics.GENDERS = GENDERS;

module.exports = mongoose.model('Member', memberSchema);
