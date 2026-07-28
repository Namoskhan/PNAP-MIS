const asyncHandler = require('express-async-handler');
const Member = require('../models/Member');
const BasicUnit = require('../models/BasicUnit');
const Province = require('../models/Province');
const District = require('../models/District');
const Area = require('../models/Area');
const CabinetSlot = require('../models/CabinetSlot');
const { ok, created, ApiError } = require('../utils/response');
const { deriveBase, pickUnique } = require('../utils/memberUsername');

// Case-insensitive collation — used by the legacy free-text suggest
// endpoints further down. The new register flow uses ObjectIds.
const CI = { locale: 'en', strength: 2 };

// MEM-001 / MEM-003: anonymous self-registration.
// Under the SRS-aligned flow every Basic Unit is pre-created by an
// Area Admin (which is created by a District Admin, which is created
// by a Province Admin, which is created by Super Admin). The applicant
// picks an EXISTING basicUnitId from cascading dropdowns; we walk the
// chain server-side rather than create units on demand.
exports.register = asyncHandler(async (req, res) => {
  const data = req.body;

  const exists = await Member.findOne({ cnic: data.cnic });
  if (exists) {
    throw new ApiError(409, 'DUPLICATE_CNIC', 'A member with this CNIC is already registered');
  }

  // MEM-002 — one membership per mobile number. Normalized check so
  // "+92 300-1234567" and "03001234567" count as the same number.
  const { findMemberByPhone } = require('../utils/phoneDup');
  const dupPhone = await findMemberByPhone(data.phone);
  if (dupPhone) {
    throw new ApiError(409, 'DUPLICATE_PHONE', 'A member with this mobile number is already registered');
  }

  const unit = await BasicUnit.findById(data.basicUnitId);
  if (!unit || unit.isActive === false) {
    throw new ApiError(400, 'INVALID_BASIC_UNIT', 'Selected basic unit is not available');
  }

  // Idempotently ensure cabinet slots exist for this unit (covers
  // legacy units that pre-date the auto-seed at creation).
  await CabinetSlot.seedFor('BASIC_UNIT', unit._id);

  const photoUrl = req.file ? `/uploads/${req.file.filename}` : undefined;

  // Strip fields we derive server-side or set via setPassword().
  const { basicUnitId, password, ...rest } = data;

  const member = new Member({
    ...rest,
    photoUrl,
    basicUnitId: unit._id,
    areaId: unit.areaId,
    districtId: unit.districtId,
    provinceId: unit.provinceId,
    submittedBy: null,
    submittedVia: 'PUBLIC',
    status: 'PENDING_APPROVAL',
  });
  if (password) await member.setPassword(password);
  // Username = first token of fullName, deduped against existing
  // members. Set BEFORE save so the unique index sees it on insert.
  const base = deriveBase(member.fullName);
  if (base) member.username = await pickUnique(base);
  await member.save();

  // Notify the territorial admins responsible for approving this member.
  const { notifyMany, admindIdsForChain } = require('../utils/notify');
  admindIdsForChain({
    provinceId: unit.provinceId,
    districtId: unit.districtId,
    areaId: unit.areaId,
  })
    .then((ids) => notifyMany(ids, {
      type: 'MEMBER_REGISTERED',
      severity: 'INFO',
      title: 'New member application',
      body: `${member.fullName} (${member.cnic}) applied via public registration in ${unit.name}.`,
      link: '/members/pending',
    }))
    .catch(() => {});

  created(res, {
    _id: member._id,
    fullName: member.fullName,
    status: member.status,
    submittedAt: member.createdAt,
  });
});

exports.lookupStatus = asyncHandler(async (req, res) => {
  const { cnic } = req.query;
  if (!cnic) throw new ApiError(400, 'VALIDATION_ERROR', 'CNIC is required');

  const member = await Member.findOne({ cnic })
    .select('memberId fullName status statusReason createdAt')
    .lean();
  if (!member) throw new ApiError(404, 'NOT_FOUND', 'No application found for this CNIC');
  ok(res, member);
});

// ---------- Province dropdown (admin-curated) ----------
exports.listProvinces = asyncHandler(async (req, res) => {
  const provinces = await Province.find({ isActive: true })
    .select('name code')
    .sort({ name: 1 })
    .lean();
  ok(res, provinces);
});

// ---------- Suggestion endpoints ----------
// Each one returns up to 10 distinct names that match the user's
// typed query, scoped to the appropriate parent. They surface what
// previous registrants have entered, so the field becomes a learning
// suggestion box rather than a static dropdown.

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

exports.suggestDistricts = asyncHandler(async (req, res) => {
  const { provinceId, q } = req.query;
  if (!provinceId) throw new ApiError(400, 'VALIDATION_ERROR', 'provinceId required');
  const filter = { provinceId, isActive: true };
  if (q) filter.name = { $regex: escapeRegex(q.trim()), $options: 'i' };
  const r = await District.find(filter).select('name').sort({ name: 1 }).limit(10).lean();
  ok(res, r.map((d) => d.name));
});

exports.suggestAreas = asyncHandler(async (req, res) => {
  const { provinceId, districtName, q } = req.query;
  if (!provinceId || !districtName) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'provinceId and districtName required');
  }
  const district = await District.findOne({ provinceId, name: districtName }).collation(CI);
  if (!district) return ok(res, []);

  const filter = { districtId: district._id, isActive: true };
  if (q) filter.name = { $regex: escapeRegex(q.trim()), $options: 'i' };
  const r = await Area.find(filter).select('name').sort({ name: 1 }).limit(10).lean();
  ok(res, r.map((a) => a.name));
});

exports.suggestBasicUnits = asyncHandler(async (req, res) => {
  const { provinceId, districtName, areaName, q } = req.query;
  if (!provinceId || !districtName || !areaName) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'provinceId, districtName, areaName required');
  }
  const district = await District.findOne({ provinceId, name: districtName }).collation(CI);
  if (!district) return ok(res, []);
  const area = await Area.findOne({ districtId: district._id, name: areaName }).collation(CI);
  if (!area) return ok(res, []);

  const filter = { areaId: area._id, isActive: true };
  if (q) filter.name = { $regex: escapeRegex(q.trim()), $options: 'i' };
  const r = await BasicUnit.find(filter).select('name').sort({ name: 1 }).limit(10).lean();
  ok(res, r.map((u) => u.name));
});

// ---------- Legacy ID-based listings (kept for compatibility) ----------
exports.listDistricts = asyncHandler(async (req, res) => {
  if (!req.query.provinceId) throw new ApiError(400, 'VALIDATION_ERROR', 'provinceId required');
  const districts = await District.find({ provinceId: req.query.provinceId, isActive: true })
    .select('name code').sort({ name: 1 }).lean();
  ok(res, districts);
});

exports.listAreas = asyncHandler(async (req, res) => {
  if (!req.query.districtId) throw new ApiError(400, 'VALIDATION_ERROR', 'districtId required');
  const areas = await Area.find({ districtId: req.query.districtId, isActive: true })
    .select('name').sort({ name: 1 }).lean();
  ok(res, areas);
});

exports.listBasicUnits = asyncHandler(async (req, res) => {
  if (!req.query.areaId) throw new ApiError(400, 'VALIDATION_ERROR', 'areaId required');
  const units = await BasicUnit.find({ areaId: req.query.areaId, isActive: true })
    .select('name').sort({ name: 1 }).lean();
  ok(res, units);
});
