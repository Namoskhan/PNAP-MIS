const asyncHandler = require('express-async-handler');
const ResponsibilityTemplate = require('../models/ResponsibilityTemplate');
const Responsibility = require('../models/Responsibility');
const Role = require('../models/Role');
const { ok, created, ApiError } = require('../utils/response');
const { audit } = require('../utils/audit');

// Validate that the assignment.roleCode (when target=CABINET_ROLE)
// references a real Role. Prevents orphaned templates.
async function assertRoleExistsIfNeeded(assignment) {
  if (assignment?.target !== 'CABINET_ROLE') return;
  const r = await Role.findOne({ code: assignment.roleCode }).lean();
  if (!r) {
    throw new ApiError(400, 'ROLE_NOT_FOUND',
      `Role "${assignment.roleCode}" not in the Role catalogue. Create the role first.`);
  }
}

// GET /admin/units/responsibility-templates?event=MEETING_FINALIZED
exports.list = asyncHandler(async (req, res) => {
  const { event, active } = req.query;
  const filter = {};
  if (event) filter['trigger.event'] = event;
  if (active === 'true') filter.isActive = true;
  if (active === 'false') filter.isActive = false;

  const items = await ResponsibilityTemplate.find(filter)
    .sort({ 'trigger.event': 1, name: 1 });
  ok(res, items);
});

// GET /admin/units/responsibility-templates/:id
exports.getOne = asyncHandler(async (req, res) => {
  const doc = await ResponsibilityTemplate.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Template not found');
  ok(res, doc);
});

// POST /admin/units/responsibility-templates
exports.create = asyncHandler(async (req, res) => {
  const d = req.body;
  await assertRoleExistsIfNeeded(d.assignment);

  const doc = await ResponsibilityTemplate.create({
    name: d.name,
    description: d.description,
    trigger: d.trigger,
    assignment: d.assignment,
    titleTemplate: d.titleTemplate,
    descriptionTemplate: d.descriptionTemplate,
    dueDateOffsetDays: typeof d.dueDateOffsetDays === 'number' ? d.dueDateOffsetDays : 0,
    isActive: d.isActive !== false,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  await audit({
    req,
    action: 'RESPONSIBILITY_TEMPLATE_CREATE',
    targetType: 'ResponsibilityTemplate',
    targetId: doc._id,
    targetLabel: `${doc.trigger.event}:${doc.name}`,
    after: doc.toObject(),
  });

  created(res, doc);
});

// PATCH /admin/units/responsibility-templates/:id
exports.update = asyncHandler(async (req, res) => {
  const doc = await ResponsibilityTemplate.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Template not found');

  const before = doc.toObject();
  const d = req.body;

  if (d.name !== undefined) doc.name = d.name;
  if (d.description !== undefined) doc.description = d.description || undefined;
  if (d.trigger !== undefined) doc.trigger = d.trigger;
  if (d.assignment !== undefined) {
    await assertRoleExistsIfNeeded(d.assignment);
    doc.assignment = d.assignment;
  }
  if (d.titleTemplate !== undefined) doc.titleTemplate = d.titleTemplate || undefined;
  if (d.descriptionTemplate !== undefined) doc.descriptionTemplate = d.descriptionTemplate || undefined;
  if (typeof d.dueDateOffsetDays === 'number') doc.dueDateOffsetDays = d.dueDateOffsetDays;
  if (d.isActive !== undefined) doc.isActive = !!d.isActive;

  doc.updatedBy = req.user._id;
  await doc.save();

  await audit({
    req,
    action: 'RESPONSIBILITY_TEMPLATE_UPDATE',
    targetType: 'ResponsibilityTemplate',
    targetId: doc._id,
    targetLabel: `${doc.trigger.event}:${doc.name}`,
    before,
    after: doc.toObject(),
  });

  ok(res, doc);
});

// DELETE /admin/units/responsibility-templates/:id
//
// Auto-created Responsibility documents are NOT cascaded — they
// remain as historical artifacts of work that was assigned. Only
// the template stops firing for FUTURE events. Surfaces the count
// of in-flight responsibilities so admin knows what's still active.
exports.remove = asyncHandler(async (req, res) => {
  const doc = await ResponsibilityTemplate.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Template not found');

  const inFlight = await Responsibility.countDocuments({
    templateId: doc._id,
    state: { $in: ['PENDING', 'IN_PROGRESS'] },
  });

  await doc.deleteOne();

  await audit({
    req,
    action: 'RESPONSIBILITY_TEMPLATE_DELETE',
    targetType: 'ResponsibilityTemplate',
    targetId: doc._id,
    targetLabel: `${doc.trigger.event}:${doc.name}`,
    before: doc.toObject(),
    note: inFlight ? `Left ${inFlight} in-flight responsibility/ies in place` : undefined,
  });

  ok(res, { deleted: true, inFlightResponsibilities: inFlight });
});
