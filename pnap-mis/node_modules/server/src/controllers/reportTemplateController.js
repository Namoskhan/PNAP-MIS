const asyncHandler = require('express-async-handler');
const ReportTemplate = require('../models/ReportTemplate');
const { ok, created, ApiError } = require('../utils/response');
const { audit } = require('../utils/audit');
const reportTemplateService = require('../services/reportTemplateService');
const sectionRegistry = require('../services/reportSections/registry');

// Validate that every section.kind in a template references a real
// renderer. Without this guard admin could save a template that
// silently skips sections at render time.
function assertKindsRegistered(sections) {
  for (const s of sections || []) {
    const code = String(s.kind || '').toUpperCase();
    if (!sectionRegistry.getSection(code)) {
      throw new ApiError(400, 'UNKNOWN_SECTION_KIND',
        `Section kind "${code}" is not registered. Pick from /admin/units/report-templates/sections.`);
    }
  }
}

// ─── Admin endpoints ──────────────────────────────────────────────

// GET /admin/units/report-templates/sections — exposes the renderer
// registry so the admin UI's section picker has labels + defaults
// without duplicating a code-side enum.
exports.listSections = asyncHandler(async (req, res) => {
  ok(res, sectionRegistry.list());
});

// GET /admin/units/report-templates?entity=UNIT&active=true
exports.list = asyncHandler(async (req, res) => {
  const { entity, active } = req.query;
  const filter = {};
  if (entity) filter.entity = entity;
  if (active === 'true') filter.isActive = true;
  if (active === 'false') filter.isActive = false;
  const items = await ReportTemplate.find(filter).sort({ entity: 1, name: 1 });
  ok(res, items);
});

// GET /admin/units/report-templates/:id
exports.getOne = asyncHandler(async (req, res) => {
  const doc = await ReportTemplate.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Template not found');
  ok(res, doc);
});

// POST /admin/units/report-templates
exports.create = asyncHandler(async (req, res) => {
  const d = req.body;
  assertKindsRegistered(d.sections);

  const doc = await ReportTemplate.create({
    name: d.name,
    description: d.description,
    entity: d.entity || 'UNIT',
    tierScope: d.tierScope || [],
    format: d.format || 'PDF',
    sections: (d.sections || []).map((s, i) => ({
      kind: String(s.kind).toUpperCase(),
      sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : (i + 1) * 10,
      title: s.title,
      config: s.config || {},
    })),
    isActive: d.isActive !== false,
    isSystem: false,
    templateVersion: 1,
    createdBy: req.user._id,
    updatedBy: req.user._id,
  });

  await audit({
    req,
    action: 'REPORT_TEMPLATE_CREATE',
    targetType: 'ReportTemplate',
    targetId: doc._id,
    targetLabel: doc.name,
    after: doc.toObject(),
  });

  created(res, doc);
});

// PATCH /admin/units/report-templates/:id
exports.update = asyncHandler(async (req, res) => {
  const doc = await ReportTemplate.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Template not found');

  const before = doc.toObject();
  const d = req.body;

  if (d.name !== undefined) doc.name = d.name;
  if (d.description !== undefined) doc.description = d.description || undefined;
  if (Array.isArray(d.tierScope)) doc.tierScope = d.tierScope;
  if (d.format !== undefined) doc.format = d.format;
  if (Array.isArray(d.sections)) {
    assertKindsRegistered(d.sections);
    doc.sections = d.sections.map((s, i) => ({
      kind: String(s.kind).toUpperCase(),
      sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : (i + 1) * 10,
      title: s.title,
      config: s.config || {},
    }));
  }
  if (d.isActive !== undefined) doc.isActive = !!d.isActive;

  doc.templateVersion = (doc.templateVersion || 1) + 1;
  doc.updatedBy = req.user._id;
  await doc.save();

  await audit({
    req,
    action: 'REPORT_TEMPLATE_UPDATE',
    targetType: 'ReportTemplate',
    targetId: doc._id,
    targetLabel: doc.name,
    before,
    after: doc.toObject(),
  });

  ok(res, doc);
});

// DELETE /admin/units/report-templates/:id
exports.remove = asyncHandler(async (req, res) => {
  const doc = await ReportTemplate.findById(req.params.id);
  if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Template not found');
  if (doc.isSystem) {
    throw new ApiError(400, 'INVALID_OPERATION',
      'Built-in templates cannot be deleted; deactivate instead.');
  }
  await doc.deleteOne();

  await audit({
    req,
    action: 'REPORT_TEMPLATE_DELETE',
    targetType: 'ReportTemplate',
    targetId: doc._id,
    targetLabel: doc.name,
    before: doc.toObject(),
  });

  ok(res, { deleted: true });
});

// ─── Public render endpoint ───────────────────────────────────────

// GET /reports/templates/:id/render?unitLevel=AREA&unitId=...&from=...&to=...&format=PDF
//
// Streams the rendered file to the client. Authenticated only —
// scope authorization piggy-backs on the underlying gatherUnitData
// (which fails on bad unitLevel/unitId pairs). Future hardening
// could narrow further by user's tier scope.
exports.render = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, from, to, format } = req.query;
  if (!unitLevel || !unitId) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel and unitId are required');
  }

  const result = await reportTemplateService.render(
    req.params.id,
    { unitLevel, unitId, from, to, user: req.user },
    format,
  );

  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
  res.send(result.buffer);
});
