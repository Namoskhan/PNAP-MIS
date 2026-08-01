const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const ReportTemplate = require('../models/ReportTemplate');
const { gatherUnitData } = require('../controllers/exportController');
const { getSection } = require('./reportSections/registry');
const { ApiError } = require('../utils/response');

// reportTemplateService — orchestrate report generation:
//
//   1. Load the ReportTemplate.
//   2. Gather data via gatherUnitData() (the same data layer the
//      legacy export endpoints use; PR U7 reuses it instead of
//      duplicating).
//   3. Iterate the template's sections in sortOrder.
//   4. For each section, look up the renderer in registry.js and
//      call renderPdf() or renderXlsx() depending on requested
//      format.
//   5. Return a Buffer ready to stream to the client.
//
// Error handling: a single misbehaving section renderer must not
// kill the whole report. We try/catch each section's render and
// embed an error notice into the document, then continue with
// remaining sections.

async function _gatherCtx({ template, unitLevel, unitId, from, to }) {
  // Currently only entity=UNIT is supported. Future entities
  // (MEMBER, MEETING) would dispatch on `template.entity` to
  // different gather functions.
  if (template.entity !== 'UNIT') {
    throw new ApiError(400, 'UNSUPPORTED_ENTITY',
      `entity ${template.entity} is not yet supported by the renderer`);
  }
  const data = await gatherUnitData({ unitLevel, unitId, from, to });
  return { ...data, template, from, to, unitLevel, unitId };
}

function _orderedSections(template) {
  return (template.sections || [])
    .slice()
    .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

// ─── PDF rendering ────────────────────────────────────────────────

async function renderPdfBuffer(template, ctx) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: false });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const sections = _orderedSections(template);
    if (sections.length === 0) {
      doc.addPage();
      doc.font('Helvetica').fontSize(12).fillColor('#9aa3af')
        .text('Template has no sections.', { align: 'center' });
      doc.end();
      return;
    }

    for (const s of sections) {
      const renderer = getSection(s.kind);
      if (!renderer || typeof renderer.renderPdf !== 'function') continue;
      try {
        renderer.renderPdf(doc, s, ctx);
      } catch (err) {
        // Embed an error marker; keep going with subsequent sections.
        doc.addPage();
        doc.font('Helvetica-Bold').fontSize(14).fillColor('#1e40af')
          .text(`Section "${s.kind}" failed to render`);
        doc.font('Helvetica').fontSize(10).fillColor('#52606d')
          .text(err.message);
      }
    }

    doc.end();
  });
}

// ─── XLSX rendering ───────────────────────────────────────────────

async function renderXlsxBuffer(template, ctx) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PNAP-MIS';
  wb.created = new Date();

  const sections = _orderedSections(template);
  for (const s of sections) {
    const renderer = getSection(s.kind);
    if (!renderer || typeof renderer.renderXlsx !== 'function') continue;
    try {
      renderer.renderXlsx(wb, s, ctx);
    } catch (err) {
      // Embed a warning sheet rather than failing the whole workbook.
      const ws = wb.addWorksheet(`ERR ${s.kind}`.slice(0, 30));
      ws.addRow([`Section "${s.kind}" failed to render`]);
      ws.addRow([err.message]);
    }
  }

  if (wb.worksheets.length === 0) {
    const ws = wb.addWorksheet('Empty');
    ws.addRow(['Template has no sections that produce XLSX output.']);
  }

  return wb.xlsx.writeBuffer();
}

// ─── Public render entrypoint ─────────────────────────────────────

// render(templateId, scopeContext, format)
//   scopeContext = { unitLevel, unitId, from?, to?, user? }
//   format       = 'PDF' | 'XLSX'
// Returns { buffer, contentType, filename }.
async function render(templateId, scopeContext, format) {
  const template = await ReportTemplate.findById(templateId);
  if (!template) throw new ApiError(404, 'NOT_FOUND', 'Report template not found');
  if (!template.isActive) throw new ApiError(400, 'TEMPLATE_INACTIVE', 'Template is deactivated');

  const desiredFormat = String(format || template.format).toUpperCase();
  if (!['PDF', 'XLSX'].includes(desiredFormat)) {
    throw new ApiError(400, 'INVALID_FORMAT', 'format must be PDF or XLSX');
  }
  if (template.format !== 'BOTH' && template.format !== desiredFormat) {
    throw new ApiError(400, 'FORMAT_MISMATCH',
      `Template only supports ${template.format}; ${desiredFormat} requested`);
  }

  const ctx = await _gatherCtx({
    template,
    unitLevel: scopeContext.unitLevel,
    unitId: scopeContext.unitId,
    from: scopeContext.from,
    to: scopeContext.to,
  });

  const safeName = (template.name || 'report').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  if (desiredFormat === 'PDF') {
    const buffer = await renderPdfBuffer(template, ctx);
    return {
      buffer,
      contentType: 'application/pdf',
      filename: `${safeName}.pdf`,
    };
  }
  const buffer = await renderXlsxBuffer(template, ctx);
  return {
    buffer,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `${safeName}.xlsx`,
  };
}

module.exports = {
  render,
  renderPdfBuffer,
  renderXlsxBuffer,
};
