const asyncHandler = require('express-async-handler');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const Member = require('../models/Member');
const Meeting = require('../models/Meeting');
const Activity = require('../models/Activity');
const Donation = require('../models/Donation');
const Expense = require('../models/Expense');
const FundTransfer = require('../models/FundTransfer');
const BasicUnit = require('../models/BasicUnit');
const Area = require('../models/Area');
const District = require('../models/District');
const Province = require('../models/Province');
const Responsibility = require('../models/Responsibility');
const { ApiError } = require('../utils/response');
const { resolveUnitChain } = require('../utils/unitScope');
const env = require('../config/env');
const settingsService = require('../services/settingsService');
const eventExportService = require('../services/eventExportService');
const { formatUnitArrangedBy, getCommitteeTierLabel, getRegularTierLabel } = require('../utils/unitFormat');

// Render a dynamicData value into a cell-friendly form. Numerics
// stay numeric so XLSX can format them; everything else stringifies
// safely. Mirrors eventExportService._renderValue but kept local so
// the export controller doesn't import private helpers.
function _formatDynamicValue(col, raw) {
  if (raw === null || raw === undefined) return '';
  switch (col.type) {
    case 'DATE': {
      const d = raw instanceof Date ? raw : new Date(raw);
      return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
    }
    case 'BOOL': return raw ? 'Yes' : 'No';
    case 'MULTISELECT': return Array.isArray(raw) ? raw.join(', ') : String(raw);
    case 'INT':
    case 'NUMBER':
    case 'CURRENCY': return Number(raw);
    default: return String(raw);
  }
}

// Resolve a `/uploads/<filename>` URL to a real disk path so PDFKit
// can embed the bytes. Returns null if the file is missing or the
// URL is anything other than a local upload path.
function uploadDiskPath(url) {
  if (!url || typeof url !== 'string') return null;
  if (!url.startsWith('/uploads/')) return null;
  const filename = url.replace(/^\/uploads\//, '');
  const safe = path.basename(filename);
  const full = path.resolve(process.cwd(), env.UPLOAD_DIR, safe);
  return fs.existsSync(full) ? full : null;
}

// PR B5 — branded report header. Pulls from SystemSettings on every
// render so admin edits to identity / theme / logos / report
// branding propagate to the next exported PDF without a server
// restart.
//
//   • Logo (if logos.print.url is set + file exists) at top-left
//   • Org name + report title centered/right
//   • Period subtitle in muted text
//   • Thin colored bar separator using the brand primary
//
// Safe defaults preserve the legacy header look (PKNAP red bar) when
// no custom branding has been configured. Helper returns the bottom
// y-coordinate so the caller knows where to start content.
function applyBrandedHeader(doc, branding, reportTitle, subtitle) {
  const id = branding?.identity || {};
  const logos = branding?.logos || {};
  const theme = branding?.theme?.light || {};
  const report = branding?.reportBranding || {};

  const orgName = id.organizationName || id.systemName || 'PKNAP';
  const headerColor = report.pdfHeaderColor || theme.primary || '#0a3a6e';
  const showLogo = report.showLogoOnPdf !== false;
  const logoPath = showLogo ? uploadDiskPath(logos.print?.url) : null;

  const startY = doc.y;
  let textX = 40;
  let textWidth = 515;

  // Logo at top-left when configured. PDFKit's image() preserves
  // aspect ratio when only one of width/height is given.
  if (logoPath) {
    try {
      doc.image(logoPath, 40, startY, { fit: [80, 60] });
      textX = 130;
      textWidth = 425;
    } catch {
      // Bad image — skip silently rather than failing the export.
    }
  }

  // Title block, centered within the available width.
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#1a1a1a')
    .text(`${orgName} ${reportTitle}`, textX, startY + 4, { width: textWidth, align: 'center' });
  if (subtitle) {
    doc.font('Helvetica').fontSize(12).fillColor('#374151')
      .text(subtitle, textX, doc.y + 2, { width: textWidth, align: 'center' });
  }

  // Push y past whichever (logo or title) is taller, plus margin.
  const titleEnd = doc.y;
  const logoEnd = logoPath ? startY + 60 : startY;
  doc.y = Math.max(titleEnd, logoEnd) + 8;

  // Brand-colored separator bar.
  doc.strokeColor(headerColor).lineWidth(2)
    .moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown(0.6);
  doc.fillColor('#1a1a1a').strokeColor('#000000');
}

// Branded footer — single-line footer text from settings, drawn at
// the bottom of the CURRENT page. Caller invokes this once per page
// (typically right before doc.end() or before doc.addPage()).
function applyBrandedFooter(doc, branding, pageNo, pageCount) {
  const id = branding?.identity || {};
  const report = branding?.reportBranding || {};
  const text = report.pdfFooterText
    || id.copyrightText
    || id.footerText
    || `Generated ${new Date().toLocaleString()}`;

  // Writing below the bottom margin makes PDFKit spill onto a fresh
  // page. Drop the margin for the duration of the footer write and
  // restore it, so paginating a finished document doesn't grow it.
  const savedBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  const L = _left(doc);
  const W = _contentWidth(doc);

  doc.font('Helvetica-Oblique').fontSize(8).fillColor('#9aa3af')
    .text(text, L, doc.page.height - 28, { width: W, align: 'center' });
  if (pageNo) {
    doc.font('Helvetica').fontSize(8).fillColor('#9aa3af')
      .text(pageCount ? `Page ${pageNo} of ${pageCount}` : `Page ${pageNo}`,
        L, doc.page.height - 28, { width: W, align: 'right' });
  }

  doc.page.margins.bottom = savedBottom;
  doc.fillColor('#1a1a1a');
}

// ─── PDF layout helpers ────────────────────────────────────────────
// Geometry derives from the page's own margins rather than the
// hardcoded 40 / 555 pair the older exports used, so a caller that
// changes `margin` or `size` still gets aligned rules and tables.
function _left(doc) { return doc.page.margins.left; }
function _right(doc) { return doc.page.width - doc.page.margins.right; }
function _contentWidth(doc) { return _right(doc) - _left(doc); }
function _bottom(doc) { return doc.page.height - doc.page.margins.bottom; }

// Reset the graphics state between blocks. PDFKit is stateful — a
// section that ends mid-italic-grey leaks into whatever renders
// next, which is how the old Activities heading picked up the
// meeting loop's styling.
function _resetText(doc) {
  doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a')
    .strokeColor('#000000').lineWidth(1);
  // Tables and headers position text with an explicit x; without this
  // the next flowing paragraph starts at the last column's x instead
  // of the margin.
  doc.x = _left(doc);
}

// Helvetica's WinAnsi encoding has no U+2192, so a literal '→' comes
// out as mojibake in the PDF. Use an en dash for PDF period ranges.
function _periodLabel(from, to) {
  return `${from || 'all'} – ${to || 'all'}`;
}

// Full-width section banner: brand-tinted bar with the title, always
// starting on a fresh page so major sections are findable.
function _sectionHeading(doc, title, color, { newPage = true, keepWith = 90 } = {}) {
  // A banner stranded at the foot of a page reads as a mistake, so an
  // inline heading still breaks when its section can't start here.
  if (newPage || doc.y + 26 + keepWith > _bottom(doc)) doc.addPage();
  const L = _left(doc);
  const W = _contentWidth(doc);
  const y = doc.y;
  doc.save().rect(L, y, W, 26).fill(_tint(color, 0.10)).restore();
  doc.save().rect(L, y, 4, 26).fill(color).restore();
  doc.font('Helvetica-Bold').fontSize(14).fillColor(color)
    .text(title, L + 12, y + 7, { width: W - 24 });
  doc.y = y + 26;
  doc.moveDown(0.8);
  _resetText(doc);
}

// Sub-heading inside a record block — small caps-ish label above a
// paragraph. Kept visually lighter than _sectionHeading.
function _blockLabel(doc, label, color) {
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(color)
    .text(String(label).toUpperCase(), { characterSpacing: 0.4 });
  doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
}

// A labelled paragraph (Description / Agenda / Outcome Notes …).
// No-ops on empty values so blocks don't sprout empty headings.
function _paragraph(doc, label, value, color) {
  if (value === null || value === undefined || String(value).trim() === '') return;
  doc.moveDown(0.25);
  _blockLabel(doc, label, color);
  doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a')
    .text(String(value), { align: 'justify' });
}

// Two-column key/value table with zebra rows — used for the summary
// KPI block and the campaign-metrics block.
function _kvTable(doc, rows, color, { keyWidth = 220, headers = ['Metric', 'Value'] } = {}) {
  const L = _left(doc);
  const W = _contentWidth(doc);
  const rowH = 20;
  const valX = L + keyWidth;
  const valW = W - keyWidth;

  // Header band. Re-drawn after a page break so a long table stays
  // readable rather than orphaning its rows.
  const drawHeader = () => {
    const y = doc.y;
    doc.save().rect(L, y, W, rowH).fill(color).restore();
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#ffffff')
      .text(headers[0], L + 8, y + 6, { width: keyWidth - 16, ellipsis: true })
      .text(headers[1], valX + 8, y + 6, { width: valW - 16, ellipsis: true });
    doc.y = y + rowH;
  };

  drawHeader();
  rows.forEach(([k, v], i) => {
    if (doc.y + rowH > _bottom(doc)) { doc.addPage(); drawHeader(); }
    const y = doc.y;
    if (i % 2 === 1) doc.save().rect(L, y, W, rowH).fill('#f5f7fa').restore();
    doc.save().rect(L, y, W, rowH).strokeColor('#d5dae1').lineWidth(0.5).stroke().restore();
    doc.font('Helvetica').fontSize(9.5).fillColor('#374151')
      .text(String(k), L + 8, y + 6, { width: keyWidth - 16, ellipsis: true });
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1a1a1a')
      .text(String(v), valX + 8, y + 6, { width: valW - 16, ellipsis: true });
    doc.y = y + rowH;
  });

  doc.moveDown(0.8);
  _resetText(doc);
}

// Record card header — numbered title, then a muted meta strip.
function _recordHeader(doc, index, title, metaParts, color) {
  const L = _left(doc);
  const W = _contentWidth(doc);
  const y = doc.y;
  doc.save().rect(L, y, W, 0.8).fill(color).restore();
  doc.y = y + 6;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(color)
    .text(`${index}. ${title}`, L, doc.y, { width: W });
  const meta = metaParts.filter(Boolean).join('  ·  ');
  if (meta) {
    doc.font('Helvetica').fontSize(8.5).fillColor('#6b7280')
      .text(meta, { width: W });
  }
  doc.moveDown(0.35);
  _resetText(doc);
}

// Inline meta rows rendered as `Label: value` pairs, two per line
// where they fit. Skips empty values.
function _metaLines(doc, pairs) {
  const shown = pairs.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
  if (shown.length === 0) return;
  doc.font('Helvetica').fontSize(9.5).fillColor('#1a1a1a');
  shown.forEach(([k, v]) => {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#374151').text(`${k}: `, { continued: true });
    doc.font('Helvetica').fillColor('#1a1a1a').text(String(v));
  });
  _resetText(doc);
}

// Embedded photographs with captions. Shared by meetings and
// activities so both streams look identical in the output.
function _photoBlock(doc, photos, color, label = 'Photographs') {
  const usable = (photos || []).filter((p) => uploadDiskPath(p.url));
  if (usable.length === 0) return;
  const W = _contentWidth(doc);
  doc.moveDown(0.4);
  _blockLabel(doc, `${label} (${usable.length})`, color);
  doc.moveDown(0.2);
  usable.forEach((p, i) => {
    const diskPath = uploadDiskPath(p.url);
    // Image (200pt) + caption + spacing needs roughly 240pt of room.
    if (doc.y > _bottom(doc) - 240) doc.addPage();
    try {
      doc.image(diskPath, { fit: [W - 55, 200], align: 'center', valign: 'top' });
    } catch (err) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#dc2626')
        .text(`[Photo ${i + 1}: failed to embed — ${err.message}]`);
    }
    doc.moveDown(0.25);
    const cap = `Photo ${i + 1}/${usable.length}`
      + ` · ${p.capturedAt ? new Date(p.capturedAt).toLocaleString() : 'no timestamp'}`
      + (p.gps?.lat != null && p.gps?.lng != null
        ? ` · GPS ${Number(p.gps.lat).toFixed(5)}, ${Number(p.gps.lng).toFixed(5)}` : '');
    doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(cap, { align: 'center' });
    doc.moveDown(0.4);
  });
  _resetText(doc);
}

// Visible-only dynamic fields for one record, rendered from that
// record's OWN snapshot column list (§10 pinning).
function _dynamicFields(doc, cols, dynamicData, color) {
  if (!cols || cols.length === 0) return;
  const dyn = dynamicData || {};
  const visible = cols.filter((c) => {
    const v = dyn[c.key];
    return v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0);
  });
  if (visible.length === 0) return;
  doc.moveDown(0.25);
  _blockLabel(doc, 'Custom Fields', color);
  _metaLines(doc, visible.map((c) => [c.label, _formatDynamicValue(c, dyn[c.key])]));
}

// Truncate to fit a pixel width, measuring in the CURRENT font/size.
// PDFKit's `lineBreak: false` + `ellipsis` still wraps in fixed-height
// cells, which is how a long label ends up sitting on top of its own
// value; measuring ourselves is the only reliable fit.
function _clip(doc, text, width) {
  const s = String(text);
  if (doc.widthOfString(s) <= width) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (doc.widthOfString(`${s.slice(0, mid)}…`) <= width) lo = mid; else hi = mid - 1;
  }
  return `${s.slice(0, lo).trimEnd()}…`;
}

// Bordered identity panel — a grid of small label / bold value pairs.
// Used for the "who is this report about" block, where a reader scans
// for one field rather than reading top to bottom.
function _infoCard(doc, pairs, { columns = 3, cellH = 27 } = {}) {
  const shown = pairs.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '');
  if (shown.length === 0) return;
  const L = _left(doc);
  const W = _contentWidth(doc);
  const rows = Math.ceil(shown.length / columns);
  const colW = W / columns;
  const top = doc.y;
  const h = rows * cellH + 14;

  doc.save().rect(L, top, W, h).fillAndStroke('#f8fafc', '#d5dae1').restore();
  shown.forEach(([k, v], i) => {
    const x = L + (i % columns) * colW;
    const y = top + 8 + Math.floor(i / columns) * cellH;
    doc.font('Helvetica').fontSize(7).fillColor('#6b7280')
      .text(_clip(doc, String(k).toUpperCase(), colW - 20), x + 10, y, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1a1a1a')
      .text(_clip(doc, v, colW - 20), x + 10, y + 10, { lineBreak: false });
  });

  doc.y = top + h + 12;
  _resetText(doc);
}

// Horizontal stacked bar with a legend — turns a set of counts into
// something a reader takes in at a glance instead of comparing digits.
// Zero-valued segments are dropped so the legend stays honest.
function _statBar(doc, segments, { height = 16 } = {}) {
  const shown = segments.filter((s) => Number(s.value) > 0);
  const total = shown.reduce((a, s) => a + Number(s.value), 0);
  if (total <= 0) return;
  const L = _left(doc);
  const W = _contentWidth(doc);
  const y = doc.y;

  let x = L;
  shown.forEach((s, i) => {
    // Give the last segment the remaining pixels so rounding never
    // leaves a sliver of background showing at the right edge.
    const w = (i === shown.length - 1) ? (L + W - x) : (W * Number(s.value)) / total;
    doc.save().rect(x, y, w, height).fill(s.color).restore();
    x += w;
  });
  doc.save().rect(L, y, W, height).strokeColor('#d5dae1').lineWidth(0.5).stroke().restore();
  doc.y = y + height + 7;

  // Legend — a swatch, the label, the count and its share.
  let lx = L;
  const ly = doc.y;
  shown.forEach((s) => {
    const pct = Math.round((Number(s.value) / total) * 100);
    const text = `${s.label} ${s.value} (${pct}%)`;
    doc.font('Helvetica').fontSize(8.5);
    const tw = doc.widthOfString(text);
    if (lx + 10 + tw > L + W) return;
    doc.save().rect(lx, ly + 1.5, 7, 7).fill(s.color).restore();
    doc.fillColor('#374151').text(text, lx + 11, ly, { lineBreak: false });
    lx += 11 + tw + 14;
  });
  doc.y = ly + 14;
  _resetText(doc);
}

// Hairline separator closing a record card.
function _recordSeparator(doc) {
  doc.moveDown(0.4);
  doc.strokeColor('#d5dae1').lineWidth(0.5)
    .moveTo(_left(doc), doc.y).lineTo(_right(doc), doc.y).stroke();
  doc.moveDown(0.7);
  _resetText(doc);
}

// Mix a hex colour toward white — used for section-banner fills so
// the banner reads as the brand colour without fighting body text.
function _tint(hex, alpha) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return '#eef2f7';
  const n = parseInt(m[1], 16);
  const mix = (c) => Math.round(c * alpha + 255 * (1 - alpha));
  return `#${[mix((n >> 16) & 255), mix((n >> 8) & 255), mix(n & 255)]
    .map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

// Stamp the branded footer + "Page n of m" on every buffered page.
// Requires the document to have been created with bufferPages: true.
function _paginateFooters(doc, branding) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    applyBrandedFooter(doc, branding, i + 1, range.count);
  }
}

// ─── XLSX styling helpers ──────────────────────────────────────────
// ExcelJS wants ARGB without the '#'. Falls back to the brand navy
// when a settings colour is missing or malformed.
function _argb(hex, fallback = 'FF0A3A6E') {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
  return m ? `FF${m[1].toUpperCase()}` : fallback;
}

// Brand the header row, freeze it, and switch on autofilter so a
// reader can sort/filter without touching the layout.
function _styleSheet(ws, headerArgb, { freezeColumns = 0 } = {}) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerArgb } };
  header.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  header.height = 22;
  header.commit?.();

  ws.views = [{ state: 'frozen', xSplit: freezeColumns, ySplit: 1 }];
  if (ws.columnCount > 0 && ws.rowCount > 1) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columnCount } };
  }

  // Zebra striping + wrapped body cells. Row 1 is the header.
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    row.alignment = { vertical: 'top', wrapText: true };
    if (r % 2 === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
    }
  }
}

// Helper — load settings safely. If the service fails (DB hiccup),
// return null and let the caller fall through to the legacy header
// rather than break the export.
async function _loadBrandingSafe() {
  try {
    return await settingsService.getAll();
  } catch {
    return null;
  }
}

// Member roster filter — uses the chain id (areaId / districtId /
// etc.) because members are rostered at BU only; "members in this
// area" is the union of its BU rosters.
function memberFilter(unitLevel, chain) {
  if (unitLevel === 'BASIC_UNIT') return { basicUnitId: chain.basicUnitId };
  if (unitLevel === 'AREA') return { areaId: chain.areaId };
  if (unitLevel === 'DISTRICT') return { districtId: chain.districtId };
  if (unitLevel === 'PROVINCE') return { provinceId: chain.provinceId };
  return {};
}

// Operational-record filter — meetings / activities / donations /
// expenses / responsibilities carry unitLevel + unitId for the level
// they were authored at. Filter by THAT pair so an Area report
// shows only what was recorded at the Area level, not aggregated
// from BUs below.
function ownFilter(unitLevel, unitId) {
  if (unitLevel === 'CENTRAL') return { unitLevel: 'CENTRAL' };
  return { unitLevel, unitId };
}

// Records carry BOTH their owning unit (unitLevel + unitId) and the
// denormalized chain they sit under (areaId / districtId / provinceId).
// `own` matches only what was recorded AT this unit; `subtree` matches
// everything beneath it by chain key — which is how a District report
// picks up the donations its Areas and Basic Units recorded.
//
// Deliberately mirrors financeController.applyScopeFilter so the report
// and the on-screen figures can never disagree about what a scope means.
function scopeFilter(unitLevel, unitId, scope, chain) {
  if (scope !== 'subtree') return ownFilter(unitLevel, unitId);
  if (unitLevel === 'BASIC_UNIT') return { basicUnitId: chain.basicUnitId };
  if (unitLevel === 'AREA') return { areaId: chain.areaId };
  if (unitLevel === 'DISTRICT') return { districtId: chain.districtId };
  if (unitLevel === 'PROVINCE') return { provinceId: chain.provinceId };
  // CENTRAL heads the organization, so its subtree is everything.
  return {};
}

async function unitName(unitLevel, unitId) {
  const M = { BASIC_UNIT: BasicUnit, AREA: Area, DISTRICT: District, PROVINCE: Province }[unitLevel];
  if (!M) return 'CENTRAL';
  const doc = await M.findById(unitId).select('name').lean();
  return doc?.name || unitLevel;
}

// SRS §3.1 body separation — same fragment as
// financeController.bodyClause / transferController.bodyClause. The
// EXECUTIVE branch matches `$exists: false` so records predating the
// field still report under Executive. Returns null when `body` is
// omitted, which is what every existing caller does — their results
// stay pooled and byte-identical to before.
function meetingBodyClause(body) {
  if (body === 'COMMITTEE') return { body: 'COMMITTEE' };
  if (body === 'JIRGA') return { body: 'JIRGA' };
  if (body === 'CONGRESS') return { body: 'CONGRESS' };
  if (body === 'GENERAL_BODY') return { body: 'GENERAL_BODY' };
  if (body === 'EXECUTIVE') return { $or: [{ body: 'EXECUTIVE' }, { body: { $exists: false } }, { body: null }] };
  return { $or: [{ body: { $in: ['EXECUTIVE', 'GENERAL_BODY'] } }, { body: { $exists: false } }, { body: null }] };
}

function activityBodyClause(body) {
  if (body === 'COMMITTEE') return { body: 'COMMITTEE' };
  if (body === 'JIRGA') return { body: 'JIRGA' };
  if (body === 'CONGRESS') return { body: 'CONGRESS' };
  return { $or: [{ body: 'EXECUTIVE' }, { body: { $exists: false } }, { body: null }] };
}

function financeBodyClause(body) {
  if (body === 'COMMITTEE') return { body: 'COMMITTEE' };
  if (body === 'JIRGA') return { body: 'JIRGA' };
  if (body === 'CONGRESS') return { body: 'CONGRESS' };
  return { $or: [{ body: 'EXECUTIVE' }, { body: { $exists: false } }, { body: null }] };
}

function bodyClause(body) {
  if (body === 'EXECUTIVE') return { $or: [{ body: 'EXECUTIVE' }, { body: { $exists: false } }, { body: null }] };
  if (body === 'COMMITTEE') return { body: 'COMMITTEE' };
  if (body === 'JIRGA') return { body: 'JIRGA' };
  if (body === 'CONGRESS') return { body: 'CONGRESS' };
  if (body === 'GENERAL_BODY') return { body: 'GENERAL_BODY' };
  if (body === 'NON_COMMITTEE') return { $or: [{ body: { $nin: ['COMMITTEE', 'JIRGA', 'CONGRESS'] } }, { body: { $exists: false } }, { body: null }] };
  return null;
}

// Human label for a body filter, used in report titles and filenames
// so a printed Committee/Jirga report says on its face which body it
// covers. Returns '' when `body` is absent, and every call site is
// written so that '' reproduces the original wording exactly — a
// combined report is byte-identical to what it was before the split.
function bodyLabel(body) {
  if (body === 'COMMITTEE') return 'Committee';
  if (body === 'JIRGA') return 'Jirga';
  if (body === 'CONGRESS') return 'Congress';
  if (body === 'EXECUTIVE') return 'Executive';
  if (body === 'GENERAL_BODY') return 'General Body';
  return '';
}

function bodyTierLabel(body, unitLevel) {
  if (body === 'COMMITTEE') {
    const tier = getCommitteeTierLabel(unitLevel);
    return tier ? `${tier} Committee` : 'Committee';
  }
  if (body === 'JIRGA') {
    return unitLevel === 'CENTRAL' ? 'Qomi Jirga' : 'Sobayi Jirga';
  }
  if (body === 'CONGRESS') {
    return 'National Congress';
  }
  if (body === 'EXECUTIVE') return 'Executive';
  if (body === 'GENERAL_BODY') return 'General Body';
  return '';
}

// Filename fragment: '-committee' / '-jirga' / '-executive' / '' so the
// downloads don't overwrite each other in the browser's Downloads
// folder.
function bodySuffix(body) {
  const l = bodyLabel(body);
  return l ? `-${l.toLowerCase()}` : '';
}

async function gatherUnitData({ unitLevel, unitId, from, to, scope, body }) {
  const chain = unitLevel === 'CENTRAL' ? {} : await resolveUnitChain(unitLevel, unitId);
  if (unitLevel !== 'CENTRAL' && !chain) throw new ApiError(400, 'INVALID_UNIT', 'Unit not found');
  const memberQ = memberFilter(unitLevel, chain);
  // `ownQ` is the scoped record filter — named for history, but it now
  // widens to the whole subtree when the caller asks for it.
  const ownQ = scopeFilter(unitLevel, unitId, scope, chain);
  const dateFilter = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to) dateFilter.$lte = new Date(to);
  const startClause = (Object.keys(dateFilter).length) ? { startAt: dateFilter } : {};
  const recvClause = (Object.keys(dateFilter).length) ? { receivedAt: dateFilter } : {};
  const incurClause = (Object.keys(dateFilter).length) ? { incurredAt: dateFilter } : {};
  const xferClause = (Object.keys(dateFilter).length) ? { transferredAt: dateFilter } : {};

  // Stream-specific body queries:
  // - Committee Reports: strictly body === 'COMMITTEE'
  // - Executive/General Reports: Meetings include Executive + General Body; Activities include Executive; Finance includes Executive.
  const meetingBodyQ = meetingBodyClause(body);
  const activityBodyQ = activityBodyClause(body);
  const financeBodyQ = financeBodyClause(body);

  const oid = (v) => {
    try { return new mongoose.Types.ObjectId(String(v)); } catch { return null; }
  };
  const unitOid = oid(unitId);
  const outFilter = { sourceLevel: unitLevel, sourceUnitId: unitOid, state: 'ACKNOWLEDGED', ...xferClause, ...financeBodyQ };
  const inFilter = { destinationLevel: unitLevel, destinationUnitId: unitOid, state: 'ACKNOWLEDGED', ...xferClause, ...financeBodyQ };

  const isCongress = body === 'CONGRESS';
  const isComm = body === 'COMMITTEE';
  const isJrg = body === 'JIRGA';

  const [members, meetings, activities, donations, expenses, responsibilities,
    transfersOut, transfersIn] = await Promise.all([
    Member.find({ ...memberQ, status: 'ACTIVE' }).select('fullName memberId cnic phone').lean(),
    Meeting.find({ ...ownQ, ...startClause, ...meetingBodyQ })
      .populate('chairpersonId', 'fullName memberId')
      .populate('attendance.memberId', 'fullName memberId')
      .populate('basicUnitId', 'name')
      .populate('areaId', 'name')
      .populate('districtId', 'name code')
      .populate('provinceId', 'name code')
      .lean(),
    // Lead + participants are populated so activity blocks can name
    // people the same way meeting blocks name the chair and roster.
    Activity.find({ ...ownQ, ...startClause, ...activityBodyQ })
      .populate('leadMemberId', 'fullName memberId')
      .populate('participants', 'fullName memberId')
      .populate('basicUnitId', 'name')
      .populate('areaId', 'name')
      .populate('districtId', 'name code')
      .populate('provinceId', 'name code')
      .lean(),
    Donation.find({ ...ownQ, ...recvClause, ...financeBodyQ })
      .populate('donorMemberId', 'fullName memberId cnic')
      .populate('basicUnitId', 'name')
      .populate('areaId', 'name')
      .populate('districtId', 'name code')
      .populate('provinceId', 'name code')
      .lean(),
    Expense.find({ ...ownQ, ...incurClause, ...financeBodyQ })
      .populate('basicUnitId', 'name')
      .populate('areaId', 'name')
      .populate('districtId', 'name code')
      .populate('provinceId', 'name code')
      .lean(),
    Responsibility.find(ownQ)
      .populate('assignedToMemberId', 'fullName memberId')
      .populate('basicUnitId', 'name')
      .populate('areaId', 'name')
      .populate('districtId', 'name code')
      .populate('provinceId', 'name code')
      .lean(),
    unitOid && !isCongress ? FundTransfer.find(outFilter).lean() : [],
    unitOid && !isCongress ? FundTransfer.find(inFilter).lean() : [],
  ]);

  // Attach formatted arrangedBy to every record
  const attachArrangedBy = (arr) => {
    arr.forEach((item) => {
      item.arrangedBy = formatUnitArrangedBy(item, { isCommitteeView: isComm, isJirgaView: isJrg, isCongressView: isCongress });
    });
  };
  attachArrangedBy(meetings);
  attachArrangedBy(activities);
  attachArrangedBy(donations);
  attachArrangedBy(expenses);
  attachArrangedBy(responsibilities);

  const name = await unitName(unitLevel, unitId);
  return {
    name, unitLevel, members, meetings, activities, donations, expenses,
    responsibilities, transfersOut, transfersIn,
  };
}

// ─── FINANCE-only Excel — Summary + Donations + Expenses ───────────
exports.unitFinanceXlsx = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, from, to, scope, body } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');
  const isCongress = body === 'CONGRESS';
  const effectiveScope = isCongress ? 'own' : scope;
  const data = await gatherUnitData({ unitLevel, unitId, from, to, scope: effectiveScope, body });

  const donTotal = data.donations.reduce((a, d) => a + (d.amount || 0), 0);
  const expApproved = data.expenses.filter((e) => e.state === 'APPROVED').reduce((a, e) => a + (e.amount || 0), 0);
  const expPending = data.expenses.filter((e) => e.state === 'PENDING').reduce((a, e) => a + (e.amount || 0), 0);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PKNAP';
  wb.created = new Date();

  // Acknowledged transfers are real movements of money and belong in
  // the bottom line — the previous Net Balance ignored them and so
  // disagreed with the Finance page. (Congress has no transfers)
  const xferOutTotal = data.transfersOut.reduce((a, t) => a + (t.amount || 0), 0);
  const xferInTotal = data.transfersIn.reduce((a, t) => a + (t.amount || 0), 0);

  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ header: 'Metric', key: 'k', width: 34 }, { header: 'Value', key: 'v', width: 26 }];
  sum.addRow({ k: 'Unit', v: `${data.unitLevel} · ${data.name}` });
  if (!isCongress) sum.addRow({ k: 'Scope', v: scope === 'subtree' ? 'Including all subordinate units' : 'This unit only' });
  // Only emitted when the caller asked for one body, so a combined
  // export keeps exactly the rows it had before.
  if (bodyLabel(body)) sum.addRow({ k: 'Body', v: `${bodyLabel(body)} only` });
  sum.addRow({ k: 'Period', v: `${from || 'all'} → ${to || 'all'}` });
  sum.addRow({ k: 'Donations Count', v: data.donations.length });
  sum.addRow({ k: 'Donations Total (PKR)', v: donTotal });
  if (!isCongress) sum.addRow({ k: 'Transfers In (PKR)', v: xferInTotal });
  sum.addRow({ k: 'Expenses Approved (PKR)', v: expApproved });
  sum.addRow({ k: 'Expenses Pending (PKR)', v: expPending });
  if (!isCongress) sum.addRow({ k: 'Transfers Out (PKR)', v: xferOutTotal });
  sum.addRow({ k: 'Net Balance (PKR)', v: isCongress ? (donTotal - expApproved) : (donTotal + xferInTotal - expApproved - xferOutTotal) });
  sum.getRow(1).font = { bold: true };

  const don = wb.addWorksheet('Donations');
  don.columns = [
    { header: 'Receipt #', key: 'r', width: 14 },
    { header: 'Date', key: 'd', width: 14 },
    { header: 'Unit / Arranged By', key: 'u', width: 26 },
    { header: 'Donor Type', key: 'dt', width: 14 },
    { header: 'Donor', key: 'dn', width: 28 },
    { header: 'CNIC', key: 'c', width: 18 },
    { header: 'Mode', key: 'm', width: 16 },
    { header: 'Amount (PKR)', key: 'a', width: 16 },
  ];
  data.donations
    .slice()
    .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
    .forEach((d) => don.addRow({
      r: d.receiptNo || '',
      d: new Date(d.receivedAt).toLocaleDateString(),
      u: d.arrangedBy || formatUnitArrangedBy(d, { isCommitteeView: body === 'COMMITTEE', isCongressView: isCongress }),
      dt: d.donorType,
      dn: d.donorType === 'ANONYMOUS' ? 'Anonymous' : (d.donorName || d.donorMemberId?.fullName || (d.donorType === 'MEMBER' ? 'Member' : '—')),
      c: d.donorCnic || '',
      m: d.paymentMode,
      a: d.amount,
    }));
  don.getRow(1).font = { bold: true };

  const exp = wb.addWorksheet('Expenses');
  exp.columns = [
    { header: 'Date', key: 'd', width: 14 },
    { header: 'Unit / Incurred By', key: 'u', width: 26 },
    { header: 'Category', key: 'c', width: 18 },
    { header: 'Description', key: 'desc', width: 36 },
    { header: 'Vendor', key: 'v', width: 24 },
    { header: 'Mode', key: 'm', width: 16 },
    { header: 'State', key: 's', width: 12 },
    { header: 'Amount (PKR)', key: 'a', width: 16 },
  ];
  data.expenses
    .slice()
    .sort((a, b) => new Date(b.incurredAt) - new Date(a.incurredAt))
    .forEach((e) => exp.addRow({
      d: new Date(e.incurredAt).toLocaleDateString(),
      u: e.arrangedBy || formatUnitArrangedBy(e, { isCommitteeView: body === 'COMMITTEE', isCongressView: isCongress }),
      c: e.category,
      desc: e.description || '',
      v: e.vendor || '',
      m: e.paymentMode,
      s: e.state,
      a: e.amount,
    }));
  exp.getRow(1).font = { bold: true };

  // Transfers get their own sheet for non-Congress bodies
  if (!isCongress) {
    const xf = wb.addWorksheet('Fund Transfers');
    xf.columns = [
      { header: 'Date', key: 'd', width: 14 },
      { header: 'Direction', key: 'dir', width: 12 },
      { header: 'Counterparty', key: 'p', width: 32 },
      { header: 'Mode', key: 'm', width: 18 },
      { header: 'State', key: 's', width: 16 },
      { header: 'Amount (PKR)', key: 'a', width: 16 },
    ];
    [
      ...data.transfersIn.map((t) => ({ t, dir: 'Incoming', party: t.sourceName || t.sourceLevel })),
      ...data.transfersOut.map((t) => ({ t, dir: 'Outgoing', party: t.destinationName || t.destinationLevel })),
    ]
      .sort((a, b) => new Date(b.t.transferredAt || b.t.createdAt) - new Date(a.t.transferredAt || a.t.createdAt))
      .forEach(({ t, dir, party }) => xf.addRow({
        d: new Date(t.transferredAt || t.createdAt).toLocaleDateString(),
        dir,
        p: party || '',
        m: t.mode || '',
        s: t.state || '',
        a: t.amount || 0,
      }));
    xf.getRow(1).font = { bold: true };
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${data.unitLevel}-${data.name}${bodySuffix(body)}-finance.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ─── PDF table renderer ───────────────────────────────────────────
//
// Replaces the previous approach of padEnd()-ing strings into fixed
// widths: that only lines up in a monospaced font, and these reports
// are set in Helvetica, so every column drifted out of alignment as
// soon as a value contained wide or narrow glyphs. Here each cell is
// drawn at an explicit x with its own width, so columns are straight
// regardless of content, numbers right-align under each other, and
// overlong values ellipsize instead of being sliced mid-word.
//
// Also repeats the header band after a page break — previously a
// table continuing onto page 2 lost its headings entirely.
const PAGE_L = 40;
const PAGE_R = 555;
const ROW_H = 15;

// Free text in a table cell (an expense description, a donor name) has
// no length limit, and a single 15pt row can't hold it. Columns marked
// `wrap: true` flow onto extra lines and the row grows to fit; every
// other column is measured and truncated so it can never bleed into
// its neighbour. A wrapped cell is capped at WRAP_MAX_LINES so one
// essay-length description can't push a table onto its own page.
const WRAP_MAX_LINES = 6;
const LINE_H = 10.2;

function drawTableHeader(doc, cols, sectionColor) {
  const y = doc.y;
  doc.rect(PAGE_L, y - 2, PAGE_R - PAGE_L, ROW_H + 2).fill(sectionColor);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');
  cols.forEach((c) => {
    doc.text(_clip(doc, c.label, c.w - 8), c.x + 4, y + 2, {
      width: c.w - 8, align: c.align || 'left', lineBreak: false,
    });
  });
  doc.y = y + ROW_H + 4;
  doc.fillColor('#1a1a1a').font('Helvetica');
}

// Height this row needs, driven by its tallest wrapping cell.
function _rowHeight(doc, cols, cells) {
  doc.font('Helvetica').fontSize(8.5);
  let h = ROW_H;
  cols.forEach((c, ci) => {
    if (!c.wrap) return;
    const text = String(cells[ci] ?? '');
    if (!text) return;
    const needed = doc.heightOfString(text, { width: c.w - 8, lineGap: 0 }) + 4;
    h = Math.max(h, Math.min(needed, WRAP_MAX_LINES * LINE_H + 4));
  });
  return h;
}

function drawTable(doc, { cols, rows, sectionColor, emptyText }) {
  if (!rows.length) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor('#6b7280').text(emptyText);
    doc.fillColor('#1a1a1a').font('Helvetica');
    return;
  }
  drawTableHeader(doc, cols, sectionColor);
  rows.forEach((cells, i) => {
    const h = _rowHeight(doc, cols, cells);
    // Leave room for the footer; start a fresh page with the header
    // repeated so a continued table is still readable.
    if (doc.y + h > doc.page.height - 70) {
      doc.addPage();
      drawTableHeader(doc, cols, sectionColor);
    }
    const y = doc.y;
    if (i % 2 === 1) {
      doc.rect(PAGE_L, y - 2, PAGE_R - PAGE_L, h).fill('#f4f6f8');
      doc.fillColor('#1a1a1a');
    }
    doc.font('Helvetica').fontSize(8.5).fillColor('#1a1a1a');
    cols.forEach((c, ci) => {
      const text = String(cells[ci] ?? '');
      const opts = { width: c.w - 8, align: c.align || 'left' };
      if (c.wrap) {
        // height + ellipsis clips the overflow of a very long value
        // instead of letting it run over the row below.
        doc.text(text, c.x + 4, y + 1, {
          ...opts, height: h - 2, ellipsis: true,
        });
      } else {
        doc.text(_clip(doc, text, c.w - 8), c.x + 4, y + 1, { ...opts, lineBreak: false });
      }
    });
    doc.y = y + h;
  });
  doc.strokeColor('#d5dbe0').lineWidth(0.5)
    .moveTo(PAGE_L, doc.y + 1).lineTo(PAGE_R, doc.y + 1).stroke();
  doc.y += 5;
}

// Summary figures as a row of labelled boxes rather than a plain list
// of "key: value" lines — the headline numbers are what a reader looks
// for first, so they get the visual weight.
function drawKpiBand(doc, tiles, sectionColor) {
  const y = doc.y;
  const gap = 8;
  const w = (PAGE_R - PAGE_L - gap * (tiles.length - 1)) / tiles.length;
  tiles.forEach((t, i) => {
    const x = PAGE_L + i * (w + gap);
    doc.rect(x, y, w, 42).fillAndStroke('#f4f6f8', '#d5dbe0');
    doc.font('Helvetica').fontSize(7.5).fillColor('#5c6b76')
      .text(_clip(doc, t.label.toUpperCase(), w - 12), x + 6, y + 6, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(12).fillColor(t.color || sectionColor)
      .text(_clip(doc, t.value, w - 12), x + 6, y + 19, { lineBreak: false });
  });
  doc.y = y + 42 + 12;
  doc.fillColor('#1a1a1a').font('Helvetica').strokeColor('#000000');
}

exports.unitFinancePdf = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, from, to, scope, body } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');
  const isCongress = body === 'CONGRESS';
  const effectiveScope = isCongress ? 'own' : scope;
  const data = await gatherUnitData({ unitLevel, unitId, from, to, scope: effectiveScope, body });
  const branding = await _loadBrandingSafe();
  const sectionColor = branding?.reportBranding?.pdfHeaderColor
    || branding?.theme?.light?.primary
    || '#0a3a6e';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${data.unitLevel}-${data.name}${bodySuffix(body)}-finance.pdf"`);
  // Wrapped description cells make these tables span pages far more
  // often, so the footer is stamped on every page rather than the last.
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  doc.pipe(res);

  const donTotal = data.donations.reduce((a, d) => a + (d.amount || 0), 0);
  const expApproved = data.expenses.filter((e) => e.state === 'APPROVED').reduce((a, e) => a + (e.amount || 0), 0);
  const expPending = data.expenses.filter((e) => e.state === 'PENDING').reduce((a, e) => a + (e.amount || 0), 0);

  // Branded header replaces the hardcoded "PKNAP Finance Report" title.
  // The scope is stated explicitly — a District report that aggregates
  // its Areas looks identical to one that does not unless it says so.
  const scopeLabel = isCongress ? 'direct assembly records' : (scope === 'subtree' ? 'including all subordinate units' : 'this unit only');
  applyBrandedHeader(doc, branding, `${bodyTierLabel(body, data.unitLevel) ? `${bodyTierLabel(body, data.unitLevel)} ` : ''}Finance Report`,
    `${data.unitLevel.replace('_', ' ')} · ${data.name}   |   ${scopeLabel}   |   Period: ${_periodLabel(from, to)}`);

  // Acknowledged transfers move real money, so the report's bottom line
  // has to account for them (non-Congress bodies).
  const xferOutTotal = data.transfersOut.reduce((a, t) => a + (t.amount || 0), 0);
  const xferInTotal = data.transfersIn.reduce((a, t) => a + (t.amount || 0), 0);
  const net = isCongress ? (donTotal - expApproved) : (donTotal + xferInTotal - expApproved - xferOutTotal);

  if (isCongress) {
    drawKpiBand(doc, [
      { label: 'Donations', value: `PKR ${donTotal.toLocaleString()}` },
      { label: 'Approved Expenses', value: `PKR ${expApproved.toLocaleString()}` },
      { label: 'Net Balance', value: `PKR ${net.toLocaleString()}`, color: net < 0 ? '#cf2e2e' : '#00a266' },
    ], sectionColor);
  } else {
    drawKpiBand(doc, [
      { label: 'Donations', value: `PKR ${donTotal.toLocaleString()}` },
      { label: 'Transfers In', value: `PKR ${xferInTotal.toLocaleString()}`, color: '#00a266' },
      { label: 'Approved Expenses', value: `PKR ${expApproved.toLocaleString()}` },
      { label: 'Transfers Out', value: `PKR ${xferOutTotal.toLocaleString()}`, color: '#e65f00' },
      { label: 'Net Balance', value: `PKR ${net.toLocaleString()}`, color: net < 0 ? '#cf2e2e' : '#00a266' },
    ], sectionColor);
  }
  if (expPending) {
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#5c6b76')
      .text(`Pending expenses awaiting approval: PKR ${expPending.toLocaleString()} (not included in Net Balance)`,
        PAGE_L, doc.y, { width: PAGE_R - PAGE_L });
    doc.moveDown(0.6);
    doc.font('Helvetica').fillColor('#1a1a1a');
  }

  function sectionTitle(text) {
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#1a1a1a').text(text, PAGE_L, doc.y);
    doc.moveDown(0.35);
    doc.font('Helvetica').fillColor('#1a1a1a');
  }

  sectionTitle(`Donations (${data.donations.length})`);
  drawTable(doc, {
    sectionColor,
    emptyText: 'No donations recorded in this period.',
    cols: [
      { label: 'Receipt #', x: 40, w: 55 },
      { label: 'Date', x: 95, w: 55 },
      { label: 'Unit', x: 150, w: 105, wrap: true },
      { label: 'Donor', x: 255, w: 120, wrap: true },
      { label: 'Mode', x: 375, w: 75 },
      { label: 'Amount (PKR)', x: 450, w: 105, align: 'right' },
    ],
    rows: data.donations
      .slice()
      .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
      .map((d) => [
        d.receiptNo || '—',
        new Date(d.receivedAt).toLocaleDateString(),
        d.arrangedBy || formatUnitArrangedBy(d, { isCommitteeView: body === 'COMMITTEE', isCongressView: isCongress }),
        d.donorType === 'ANONYMOUS' ? 'Anonymous' : (d.donorName || d.donorMemberId?.fullName || (d.donorType === 'MEMBER' ? 'Member' : '—')),
        d.paymentMode || '—',
        (d.amount || 0).toLocaleString(),
      ]),
  });
  if (data.donations.length) {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(sectionColor)
      .text(`Total Donations: PKR ${donTotal.toLocaleString()}`, PAGE_L, doc.y, {
        width: PAGE_R - PAGE_L, align: 'right',
      });
    doc.font('Helvetica').fillColor('#1a1a1a');
  }

  if (doc.y > doc.page.height - 220) doc.addPage(); else doc.moveDown(1.2);

  sectionTitle(`Expenses (${data.expenses.length})`);
  drawTable(doc, {
    sectionColor,
    emptyText: 'No expenses recorded in this period.',
    cols: [
      { label: 'Date', x: 40, w: 55 },
      { label: 'Unit', x: 95, w: 105, wrap: true },
      { label: 'Category', x: 200, w: 85 },
      { label: 'Description', x: 285, w: 135, wrap: true },
      { label: 'State', x: 420, w: 50 },
      { label: 'Amount (PKR)', x: 470, w: 85, align: 'right' },
    ],
    rows: data.expenses
      .slice()
      .sort((a, b) => new Date(b.incurredAt) - new Date(a.incurredAt))
      .map((e) => [
        new Date(e.incurredAt).toLocaleDateString(),
        e.arrangedBy || formatUnitArrangedBy(e, { isCommitteeView: body === 'COMMITTEE', isCongressView: isCongress }),
        e.category || '—',
        e.description || e.vendor || '—',
        e.state || '—',
        (e.amount || 0).toLocaleString(),
      ]),
  });
  if (data.expenses.length) {
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(sectionColor)
      .text(
        `Total Approved: PKR ${expApproved.toLocaleString()}`
        + (expPending ? `   ·   Pending: PKR ${expPending.toLocaleString()}` : ''),
        PAGE_L, doc.y, { width: PAGE_R - PAGE_L, align: 'right' },
      );
    doc.font('Helvetica').fillColor('#1a1a1a');
  }

  // ── Fund transfers — their own ledger, not expenses (non-Congress) ──
  if (!isCongress) {
    const xfers = [
      ...data.transfersIn.map((t) => ({ ...t, _dir: 'IN', _party: t.sourceName || t.sourceLevel })),
      ...data.transfersOut.map((t) => ({ ...t, _dir: 'OUT', _party: t.destinationName || t.destinationLevel })),
    ].sort((a, b) => new Date(b.transferredAt || b.createdAt) - new Date(a.transferredAt || a.createdAt));

    if (doc.y > doc.page.height - 220) doc.addPage(); else doc.moveDown(1.2);
    sectionTitle(`Fund Transfers (${xfers.length})`);
    drawTable(doc, {
      sectionColor,
      emptyText: 'No acknowledged fund transfers in this period.',
      cols: [
        { label: 'Date', x: 40, w: 62 },
        { label: 'Direction', x: 102, w: 62 },
        { label: 'Counterparty', x: 164, w: 176, wrap: true },
        { label: 'Mode', x: 340, w: 88 },
        { label: 'Amount (PKR)', x: 428, w: 127, align: 'right' },
      ],
      rows: xfers.map((t) => [
        new Date(t.transferredAt || t.createdAt).toLocaleDateString(),
        t._dir === 'IN' ? 'Incoming' : 'Outgoing',
        t._party || '—',
        t.mode || '—',
        (t.amount || 0).toLocaleString(),
      ]),
    });
    if (xfers.length) {
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(sectionColor)
        .text(
          `In: PKR ${xferInTotal.toLocaleString()}   ·   Out: PKR ${xferOutTotal.toLocaleString()}`,
          PAGE_L, doc.y, { width: PAGE_R - PAGE_L, align: 'right' },
        );
      doc.font('Helvetica').fillColor('#1a1a1a');
    }
  }

  _paginateFooters(doc, branding);
  doc.end();
});

// ─── MEETINGS-only Excel — Summary + Meetings + Activities + Members + Responsibilities
exports.unitMeetingsXlsx = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, from, to, scope, body } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');
  const data = await gatherUnitData({ unitLevel, unitId, from, to, scope, body });

  const branding = await _loadBrandingSafe();
  const headerArgb = _argb(branding?.reportBranding?.pdfHeaderColor
    || branding?.theme?.light?.primary);
  const orgName = branding?.identity?.organizationName
    || branding?.identity?.systemName
    || 'PKNAP';

  const DATETIME_FMT = 'dd-mmm-yyyy hh:mm';
  const DATE_FMT = 'dd-mmm-yyyy';

  const wb = new ExcelJS.Workbook();
  wb.creator = orgName;
  wb.created = new Date();

  // ── Summary — title block above a branded metric table ───────────
  const sum = wb.addWorksheet('Summary', { views: [{ showGridLines: false }] });
  sum.columns = [{ key: 'k', width: 34 }, { key: 'v', width: 30 }];

  sum.mergeCells('A1:B1');
  sum.getCell('A1').value = `${orgName} — ${bodyTierLabel(body, data.unitLevel) ? `${bodyTierLabel(body, data.unitLevel)} ` : ''}Meetings & Activities Report`;
  sum.getCell('A1').font = { bold: true, size: 15, color: { argb: headerArgb } };
  sum.getRow(1).height = 24;

  sum.mergeCells('A2:B2');
  sum.getCell('A2').value = `${data.unitLevel} · ${data.name}   ·   Period: ${from || 'all'} → ${to || 'all'}`;
  sum.getCell('A2').font = { size: 10, color: { argb: 'FF6B7280' } };
  sum.addRow([]);

  const sumHeaderRow = sum.addRow(['Metric', 'Value']);
  sumHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  sumHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerArgb } };
  sumHeaderRow.height = 20;

  const finalized = data.meetings.filter((m) => m.state === 'FINALIZED').length;
  const totalPhotos = data.meetings.reduce((a, m) => a + (m.photos || []).length, 0)
    + data.activities.reduce((a, x) => a + (x.photos || []).length, 0);
  [
    ['Active Members', data.members.length],
    ['Meetings', data.meetings.length],
    ['Finalized Meetings', finalized],
    ['Activities', data.activities.length],
    ['Completed Activities', data.activities.filter((a) => a.state === 'COMPLETED').length],
    ['Photographs Attached', totalPhotos],
    ['Responsibilities Pending', data.responsibilities.filter((r) => r.state === 'PENDING').length],
    ['Responsibilities Completed', data.responsibilities.filter((r) => r.state === 'COMPLETED').length],
  ].forEach(([k, v], i) => {
    const row = sum.addRow([k, v]);
    if (i % 2 === 1) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
    }
    row.getCell(2).font = { bold: true };
    row.getCell(2).alignment = { horizontal: 'left' };
  });

  // Dynamic columns — union of `reporting.includeInExport` fields
  // across every snapshot referenced by the result set. Stable
  // ordering: exportOrder then key. Missing values render as ''.
  const meetingDynCols = await eventExportService.columnsForMany(
    data.meetings.map((m) => m.configSnapshotId).filter(Boolean),
  );
  const activityDynCols = await eventExportService.columnsForMany(
    data.activities.map((a) => a.configSnapshotId).filter(Boolean),
  );

  // ── Meetings — attendance broken out so it is sortable ───────────
  const mt = wb.addWorksheet('Meetings');
  mt.columns = [
    { header: 'Date', key: 'd', width: 20, style: { numFmt: DATETIME_FMT } },
    { header: 'Arranged By', key: 'ab', width: 24 },
    { header: 'Type', key: 't', width: 16 },
    { header: 'Title', key: 'tt', width: 34 },
    { header: 'State', key: 's', width: 13 },
    { header: 'Body', key: 'b', width: 12 },
    { header: 'Venue', key: 'v', width: 26 },
    { header: 'Venue GPS', key: 'g', width: 20 },
    { header: 'Chair', key: 'c', width: 24 },
    { header: 'Roster', key: 'r', width: 9 },
    { header: 'Present', key: 'pr', width: 9 },
    { header: 'Late', key: 'la', width: 8 },
    { header: 'Absent', key: 'ab_count', width: 9 },
    { header: 'Attendance %', key: 'ap', width: 13, style: { numFmt: '0%' } },
    { header: 'Supervisor', key: 'sup', width: 11 },
    { header: 'Photos', key: 'p', width: 9 },
    { header: 'Description', key: 'desc', width: 46 },
    { header: 'Agenda', key: 'ag', width: 46 },
    { header: 'Activity Notes', key: 'an', width: 46 },
    { header: 'Upcoming Strategy', key: 'us', width: 46 },
    ...meetingDynCols.map((c) => ({ header: c.label, key: `dyn_${c.key}`, width: 20 })),
  ];
  data.meetings.forEach((m) => {
    const att = m.attendance || [];
    const present = att.filter((x) => x.status === 'PRESENT').length;
    const late = att.filter((x) => x.status === 'LATE').length;
    const absent = att.filter((x) => x.status === 'ABSENT').length;
    const row = {
      d: m.startAt ? new Date(m.startAt) : null,
      ab: m.arrangedBy || formatUnitArrangedBy(m, { isCommitteeView: body === 'COMMITTEE' }),
      t: m.type,
      tt: m.title || '',
      s: m.state,
      b: m.body || '',
      v: m.venue || '',
      g: (m.gpsLat != null && m.gpsLng != null)
        ? `${m.gpsLat.toFixed(6)}, ${m.gpsLng.toFixed(6)}` : '',
      c: m.chairpersonId?.fullName || '',
      r: att.length,
      pr: present,
      la: late,
      ab_count: absent,
      ap: att.length ? (present + late) / att.length : null,
      sup: m.supervisorAttended ? 'Yes' : 'No',
      p: (m.photos || []).length,
      desc: m.description || '',
      ag: m.agenda || '',
      an: m.activityNotes || '',
      us: m.upcomingStrategy || '',
    };
    const dyn = m.dynamicData || {};
    for (const col of meetingDynCols) {
      row[`dyn_${col.key}`] = _formatDynamicValue(col, dyn[col.key]);
    }
    mt.addRow(row);
  });
  _styleSheet(mt, headerArgb, { freezeColumns: 3 });

  // ── Activities — same depth as Meetings, incl. campaign metrics ──
  const ac = wb.addWorksheet('Activities');
  ac.columns = [
    { header: 'Date', key: 'd', width: 20, style: { numFmt: DATETIME_FMT } },
    { header: 'Ends', key: 'e', width: 20, style: { numFmt: DATETIME_FMT } },
    { header: 'Arranged By', key: 'ab', width: 24 },
    { header: 'Type', key: 't', width: 18 },
    { header: 'Title', key: 'tt', width: 34 },
    { header: 'State', key: 's', width: 13 },
    { header: 'Body', key: 'b', width: 12 },
    { header: 'Venue', key: 'v', width: 26 },
    { header: 'Venue GPS', key: 'g', width: 20 },
    { header: 'Lead', key: 'ld', width: 24 },
    { header: 'Participants', key: 'pn', width: 12 },
    { header: 'Participant Names', key: 'pl', width: 46 },
    { header: 'External Attendance Est.', key: 'ae', width: 20 },
    { header: 'Photos', key: 'ph', width: 9 },
    { header: 'Press Links', key: 'pr', width: 40 },
    { header: 'Households Visited', key: 'hv', width: 17 },
    { header: 'People Contacted', key: 'pc', width: 16 },
    { header: 'Pamphlets Distributed', key: 'pd', width: 19 },
    { header: 'Expected Joiners', key: 'ej', width: 15 },
    { header: 'Actual Joiners', key: 'aj', width: 14 },
    { header: 'Volunteer Hours', key: 'vh', width: 15 },
    { header: 'Description', key: 'desc', width: 46 },
    { header: 'Outcome Notes', key: 'on', width: 46 },
    ...activityDynCols.map((c) => ({ header: c.label, key: `dyn_${c.key}`, width: 20 })),
  ];
  data.activities.forEach((a) => {
    const parts = a.participants || [];
    const cmp = a.campaign || {};
    const row = {
      d: a.startAt ? new Date(a.startAt) : null,
      e: a.endAt ? new Date(a.endAt) : null,
      ab: a.arrangedBy || formatUnitArrangedBy(a, { isCommitteeView: body === 'COMMITTEE' }),
      t: a.type,
      tt: a.title || '',
      s: a.state,
      b: a.body || '',
      v: a.venue || '',
      g: (a.gps?.lat != null && a.gps?.lng != null)
        ? `${Number(a.gps.lat).toFixed(6)}, ${Number(a.gps.lng).toFixed(6)}` : '',
      ld: a.leadMemberId?.fullName || '',
      pn: parts.length,
      pl: parts.map((p) => p?.fullName).filter(Boolean).join(', '),
      ae: a.externalAttendanceEstimate || 0,
      ph: (a.photos || []).length,
      pr: (a.pressLinks || []).join('\n'),
      hv: cmp.householdsVisited ?? '',
      pc: cmp.peopleContacted ?? '',
      pd: cmp.pamphletsDistributed ?? '',
      ej: cmp.expectedJoiners ?? '',
      aj: cmp.actualJoiners ?? '',
      vh: cmp.volunteerHours ?? '',
      desc: a.description || '',
      on: a.outcomeNotes || '',
    };
    const dyn = a.dynamicData || {};
    for (const col of activityDynCols) {
      row[`dyn_${col.key}`] = _formatDynamicValue(col, dyn[col.key]);
    }
    ac.addRow(row);
  });
  _styleSheet(ac, headerArgb, { freezeColumns: 4 });

  const mb = wb.addWorksheet('Members');
  mb.columns = [
    { header: '#', key: 'n', width: 6 },
    { header: 'Member ID', key: 'mid', width: 28 },
    { header: 'Full Name', key: 'fn', width: 28 },
    { header: 'CNIC', key: 'c', width: 18 },
    { header: 'Phone', key: 'p', width: 16 },
  ];
  data.members.forEach((m, i) => mb.addRow({
    n: i + 1, mid: m.memberId, fn: m.fullName, c: m.cnic, p: m.phone,
  }));
  _styleSheet(mb, headerArgb, { freezeColumns: 1 });

  const rb = wb.addWorksheet('Responsibilities');
  rb.columns = [
    { header: 'Title', key: 't', width: 40 },
    { header: 'Assigned To', key: 'a', width: 28 },
    { header: 'Due', key: 'd', width: 16, style: { numFmt: DATE_FMT } },
    { header: 'State', key: 's', width: 14 },
    { header: 'Completed', key: 'c', width: 16, style: { numFmt: DATE_FMT } },
  ];
  data.responsibilities.forEach((r) => rb.addRow({
    t: r.title,
    a: r.assignedToMemberId?.fullName || '',
    d: r.dueDate ? new Date(r.dueDate) : null,
    s: r.state,
    c: r.completedAt ? new Date(r.completedAt) : null,
  }));
  _styleSheet(rb, headerArgb, { freezeColumns: 1 });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${data.unitLevel}-${data.name}${bodySuffix(body)}-meetings.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ─── MEETINGS-only PDF — full per-meeting detail with embedded photos
exports.unitMeetingsPdf = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, from, to, scope, body } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');
  const data = await gatherUnitData({ unitLevel, unitId, from, to, scope, body });
  const branding = await _loadBrandingSafe();
  const sectionColor = branding?.reportBranding?.pdfHeaderColor
    || branding?.theme?.light?.primary
    || '#0a3a6e';

  // Per-snapshot dynamic-field column lists. Each record renders
  // ONLY its own snapshot's exportable fields (per §10) so a 2025
  // meeting always uses 2025 columns, even when re-exported later.
  const meetingPdfDynColsBySnapshot = new Map();
  for (const id of new Set(data.meetings.map((m) => String(m.configSnapshotId || '')).filter(Boolean))) {
    meetingPdfDynColsBySnapshot.set(id, await eventExportService.columnsForMany([id]));
  }
  const activityPdfDynColsBySnapshot = new Map();
  for (const id of new Set(data.activities.map((a) => String(a.configSnapshotId || '')).filter(Boolean))) {
    activityPdfDynColsBySnapshot.set(id, await eventExportService.columnsForMany([id]));
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${data.unitLevel}-${data.name}${bodySuffix(body)}-meetings.pdf"`);
  // bufferPages lets the footer + "Page n of m" be stamped on every
  // page once the total is known, rather than only on the last one.
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  doc.pipe(res);

  const fmtDateTime = (d) => (d ? new Date(d).toLocaleString() : '—');
  const fmtGps = (lat, lng) => ((lat != null && lng != null)
    ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : null);
  const emptyNote = (text) => {
    doc.font('Helvetica-Oblique').fontSize(11).fillColor('#9aa3af').text(text);
    _resetText(doc);
  };

  applyBrandedHeader(doc, branding, `${bodyTierLabel(body, data.unitLevel) ? `${bodyTierLabel(body, data.unitLevel)} ` : ''}Meetings & Activities Report`,
    `${data.unitLevel} · ${data.name}  ·  Period: ${_periodLabel(from, to)}`);

  // ─── Summary ──────────────────────────────────────────────────────
  _sectionHeading(doc, 'Summary', sectionColor, { newPage: false });
  const finalized = data.meetings.filter((m) => m.state === 'FINALIZED').length;
  const totalPhotos = data.meetings.reduce((a, m) => a + (m.photos || []).length, 0)
    + data.activities.reduce((a, x) => a + (x.photos || []).length, 0);
  _kvTable(doc, [
    ['Active Members', data.members.length],
    ['Meetings', data.meetings.length],
    ['Finalized Meetings', finalized],
    ['Activities', data.activities.length],
    ['Completed Activities', data.activities.filter((a) => a.state === 'COMPLETED').length],
    ['Photographs Attached', totalPhotos],
    ['Pending Responsibilities', data.responsibilities.filter((r) => r.state === 'PENDING').length],
    ['Completed Responsibilities', data.responsibilities.filter((r) => r.state === 'COMPLETED').length],
  ], sectionColor);

  // ─── Meetings — one detail card per meeting ───────────────────────
  _sectionHeading(doc, `Meetings (${data.meetings.length})`, sectionColor);
  if (data.meetings.length === 0) emptyNote('No meetings recorded in this period.');

  data.meetings.forEach((m, idx) => {
    // Keep a card's header with at least some of its body.
    if (doc.y > _bottom(doc) - 160) doc.addPage();

    _recordHeader(doc, idx + 1, m.title || m.type,
      [m.type, m.state, fmtDateTime(m.startAt)], sectionColor);

    const att = m.attendance || [];
    const present = att.filter((a) => a.status === 'PRESENT').length;
    const late = att.filter((a) => a.status === 'LATE').length;
    const absent = att.filter((a) => a.status === 'ABSENT').length;
    _metaLines(doc, [
      ['Arranged By', m.arrangedBy || formatUnitArrangedBy(m, { isCommitteeView: body === 'COMMITTEE' })],
      ['Venue', m.venue || '—'],
      ['Venue GPS', fmtGps(m.gpsLat, m.gpsLng)],
      ['Chair', m.chairpersonId?.fullName || '—'],
      ['Body', m.body],
      ['Supervisor', m.supervisorAttended ? 'Attended' : null],
      ['Attendance', att.length
        ? `${present} present, ${late} late, ${absent} absent (of ${att.length} on roster)`
        : null],
    ]);

    // Description leads: it is the meeting's own account of itself and
    // reads as the lead-in to the agenda, not as another meta line.
    _paragraph(doc, 'Description', m.description, sectionColor);
    _paragraph(doc, 'Agenda', m.agenda, sectionColor);
    _paragraph(doc, 'Activity Notes', m.activityNotes, sectionColor);
    _paragraph(doc, 'Upcoming Strategy', m.upcomingStrategy, sectionColor);

    // Dynamic custom fields — pinned from the meeting's own snapshot
    // so historical exports keep their original column set.
    _dynamicFields(doc, meetingPdfDynColsBySnapshot.get(String(m.configSnapshotId || '')),
      m.dynamicData, sectionColor);
    _photoBlock(doc, m.photos, sectionColor);
    _recordSeparator(doc);
  });

  // ─── Activities — same card layout as meetings ────────────────────
  _sectionHeading(doc, `Activities (${data.activities.length})`, sectionColor);
  if (data.activities.length === 0) emptyNote('No activities recorded in this period.');

  data.activities.forEach((a, idx) => {
    if (doc.y > _bottom(doc) - 160) doc.addPage();

    _recordHeader(doc, idx + 1, a.title || a.type,
      [a.type, a.state, fmtDateTime(a.startAt)], sectionColor);

    const parts = a.participants || [];
    _metaLines(doc, [
      ['Arranged By', a.arrangedBy || formatUnitArrangedBy(a, { isCommitteeView: body === 'COMMITTEE' })],
      ['Venue', a.venue || '—'],
      ['Venue GPS', fmtGps(a.gps?.lat, a.gps?.lng)],
      ['Lead', a.leadMemberId?.fullName || '—'],
      ['Body', a.body],
      ['Ends', a.endAt ? fmtDateTime(a.endAt) : null],
      ['Participants', parts.length
        ? `${parts.length} — ${parts.map((p) => p?.fullName).filter(Boolean).join(', ')}`
        : null],
      ['External Attendance (est.)', a.externalAttendanceEstimate || null],
    ]);

    _paragraph(doc, 'Description', a.description, sectionColor);
    _paragraph(doc, 'Outcome Notes', a.outcomeNotes, sectionColor);

    // Campaign metrics only exist for campaign-shaped activities;
    // render the table only when at least one figure was recorded.
    const cmp = a.campaign || {};
    const campaignRows = [
      ['Households Visited', cmp.householdsVisited],
      ['People Contacted', cmp.peopleContacted],
      ['Pamphlets Distributed', cmp.pamphletsDistributed],
      ['Expected Joiners', cmp.expectedJoiners],
      ['Actual Joiners', cmp.actualJoiners],
      ['Volunteer Hours', cmp.volunteerHours],
    ].filter(([, v]) => v !== null && v !== undefined && v !== '');
    if (campaignRows.length > 0) {
      doc.moveDown(0.3);
      _blockLabel(doc, 'Campaign Metrics', sectionColor);
      doc.moveDown(0.2);
      _kvTable(doc, campaignRows, sectionColor, { keyWidth: 220, headers: ['Measure', 'Count'] });
    }

    if ((a.pressLinks || []).length > 0) {
      doc.moveDown(0.25);
      _blockLabel(doc, 'Press Links', sectionColor);
      doc.font('Helvetica').fontSize(9).fillColor('#1a4fa3');
      a.pressLinks.forEach((link) => doc.text(String(link), { link: String(link), underline: true }));
      _resetText(doc);
    }

    _dynamicFields(doc, activityPdfDynColsBySnapshot.get(String(a.configSnapshotId || '')),
      a.dynamicData, sectionColor);
    _photoBlock(doc, a.photos, sectionColor);
    _recordSeparator(doc);
  });

  _paginateFooters(doc, branding);
  doc.end();
});

// ─── ACTIVITIES-only Excel / PDF ─────────────────────────────────
exports.unitActivitiesXlsx = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, from, to, scope, body } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');
  const data = await gatherUnitData({ unitLevel, unitId, from, to, scope, body });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PKNAP';
  wb.created = new Date();

  const ac = wb.addWorksheet('Activities');
  ac.columns = [
    { header: '#', key: 'n', width: 6 },
    { header: 'Date', key: 'd', width: 14 },
    { header: 'Arranged By', key: 'ab', width: 24 },
    { header: 'Type', key: 't', width: 18 },
    { header: 'Title', key: 'ti', width: 36 },
    { header: 'Lead', key: 'l', width: 26 },
    { header: 'Participants', key: 'p', width: 40 },
    { header: 'Venue', key: 'v', width: 26 },
    { header: 'State', key: 's', width: 14 },
  ];
  data.activities.slice().sort((a, b) => new Date(b.startAt) - new Date(a.startAt)).forEach((a, i) => ac.addRow({
    n: i + 1,
    d: a.startAt ? new Date(a.startAt).toLocaleDateString() : '',
    ab: a.arrangedBy || formatUnitArrangedBy(a, { isCommitteeView: body === 'COMMITTEE' }),
    t: a.type || '',
    ti: a.title || '',
    l: a.leadMemberId?.fullName || '',
    p: (a.participants || []).map((p) => p?.fullName).filter(Boolean).join(', '),
    v: a.venue || '',
    s: a.state || '',
  }));
  ac.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${data.unitLevel}-${data.name}${bodySuffix(body)}-activities.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

exports.unitActivitiesPdf = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, from, to, scope, body } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');
  const data = await gatherUnitData({ unitLevel, unitId, from, to, scope, body });
  const branding = await _loadBrandingSafe();
  const sectionColor = branding?.reportBranding?.pdfHeaderColor || branding?.theme?.light?.primary || '#0a3a6e';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${data.unitLevel}-${data.name}${bodySuffix(body)}-activities.pdf"`);
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  doc.pipe(res);

  applyBrandedHeader(doc, branding, `${bodyTierLabel(body, data.unitLevel) ? `${bodyTierLabel(body, data.unitLevel)} ` : ''}Activities Report`, `${data.unitLevel} · ${data.name}  ·  Period: ${_periodLabel(from, to)}`);
  _sectionHeading(doc, `Activities (${data.activities.length})`, sectionColor, { newPage: false });
  if (data.activities.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(11).fillColor('#9aa3af').text('No activities recorded in this period.');
  }
  data.activities.forEach((a, idx) => {
    if (doc.y > _bottom(doc) - 120) doc.addPage();
    _recordHeader(doc, idx + 1, a.title || a.type, [a.type, a.state, a.startAt ? new Date(a.startAt).toLocaleString() : ''], sectionColor);
    _metaLines(doc, [
      ['Arranged By', a.arrangedBy || formatUnitArrangedBy(a, { isCommitteeView: body === 'COMMITTEE' })],
      ['Venue', a.venue || '—'],
      ['Lead', a.leadMemberId?.fullName || '—'],
      ['Participants', (a.participants || []).map((p) => p?.fullName).filter(Boolean).join(', ') || null],
      ['Body', a.body],
    ]);
    _paragraph(doc, 'Description', a.description, sectionColor);
    _paragraph(doc, 'Outcome Notes', a.outcomeNotes, sectionColor);
    _recordSeparator(doc);
  });
  _paginateFooters(doc, branding);
  doc.end();
});

// ─── TRANSFERS-only Excel / PDF ──────────────────────────────────
exports.unitTransfersXlsx = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, from, to, scope, body } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');
  const data = await gatherUnitData({ unitLevel, unitId, from, to, scope, body });

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PKNAP';
  wb.created = new Date();

  const out = wb.addWorksheet('Transfers Out');
  out.columns = [
    { header: '#', key: 'n', width: 6 },
    { header: 'Date', key: 'd', width: 18 },
    { header: 'Amount', key: 'a', width: 16 },
    { header: 'Destination', key: 'dest', width: 30 },
    { header: 'State', key: 's', width: 14 },
    { header: 'Note', key: 'note', width: 40 },
  ];
  data.transfersOut.slice().sort((a, b) => new Date(b.transferredAt) - new Date(a.transferredAt)).forEach((t, i) => out.addRow({
    n: i + 1,
    d: t.transferredAt ? new Date(t.transferredAt).toLocaleString() : '',
    a: t.amount || 0,
    dest: `${t.destinationLevel || ''} · ${t.destinationUnitId || ''}`,
    s: t.state || '',
    note: t.note || '',
  }));
  out.getRow(1).font = { bold: true };

  const inn = wb.addWorksheet('Transfers In');
  inn.columns = [
    { header: '#', key: 'n', width: 6 },
    { header: 'Date', key: 'd', width: 18 },
    { header: 'Amount', key: 'a', width: 16 },
    { header: 'Source', key: 'src', width: 30 },
    { header: 'State', key: 's', width: 14 },
    { header: 'Note', key: 'note', width: 40 },
  ];
  data.transfersIn.slice().sort((a, b) => new Date(b.transferredAt) - new Date(a.transferredAt)).forEach((t, i) => inn.addRow({
    n: i + 1,
    d: t.transferredAt ? new Date(t.transferredAt).toLocaleString() : '',
    a: t.amount || 0,
    src: `${t.sourceLevel || ''} · ${t.sourceUnitId || ''}`,
    s: t.state || '',
    note: t.note || '',
  }));
  inn.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${data.unitLevel}-${data.name}${bodySuffix(body)}-transfers.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

exports.unitTransfersPdf = asyncHandler(async (req, res) => {
  const { unitLevel, unitId, from, to, scope, body } = req.query;
  if (!unitLevel) throw new ApiError(400, 'VALIDATION_ERROR', 'unitLevel required');
  const data = await gatherUnitData({ unitLevel, unitId, from, to, scope, body });
  const branding = await _loadBrandingSafe();
  const sectionColor = branding?.reportBranding?.pdfHeaderColor || branding?.theme?.light?.primary || '#0a3a6e';

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${data.unitLevel}-${data.name}${bodySuffix(body)}-transfers.pdf"`);
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  doc.pipe(res);

  applyBrandedHeader(doc, branding, `${bodyTierLabel(body, data.unitLevel) ? `${bodyTierLabel(body, data.unitLevel)} ` : ''}Transfers Report`, `${data.unitLevel} · ${data.name}  ·  Period: ${_periodLabel(from, to)}`);
  _sectionHeading(doc, `Transfers Out (${data.transfersOut.length})`, sectionColor, { newPage: false });
  if (data.transfersOut.length === 0) doc.font('Helvetica-Oblique').fontSize(11).fillColor('#9aa3af').text('No outgoing transfers in this period.');
  data.transfersOut.forEach((t, i) => {
    if (doc.y > _bottom(doc) - 120) doc.addPage();
    _recordHeader(doc, i + 1, `${t.amount || 0} PKR`, [t.state, t.transferredAt ? new Date(t.transferredAt).toLocaleString() : ''], sectionColor);
    _metaLines(doc, [
      ['Destination', `${t.destinationLevel || ''} · ${t.destinationUnitId || ''}`],
      ['Note', t.note || ''],
    ]);
    _recordSeparator(doc);
  });

  _sectionHeading(doc, `Transfers In (${data.transfersIn.length})`, sectionColor);
  if (data.transfersIn.length === 0) doc.font('Helvetica-Oblique').fontSize(11).fillColor('#9aa3af').text('No incoming transfers in this period.');
  data.transfersIn.forEach((t, i) => {
    if (doc.y > _bottom(doc) - 120) doc.addPage();
    _recordHeader(doc, i + 1, `${t.amount || 0} PKR`, [t.state, t.transferredAt ? new Date(t.transferredAt).toLocaleString() : ''], sectionColor);
    _metaLines(doc, [
      ['Source', `${t.sourceLevel || ''} · ${t.sourceUnitId || ''}`],
      ['Note', t.note || ''],
    ]);
    _recordSeparator(doc);
  });
  _paginateFooters(doc, branding);
  doc.end();
});

exports.memberPerformancePdf = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { from, to } = req.query;
  const m = await Member.findById(id).lean();
  if (!m) throw new ApiError(404, 'NOT_FOUND', 'Member not found');

  const dateFilter = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to) dateFilter.$lte = new Date(to);
  const startClause = (Object.keys(dateFilter).length) ? { startAt: dateFilter } : {};

  const [meetingsTotal, meetingsPresent, meetingsLate, activitiesPart, activitiesLed, donAgg, respPending, respCompleted] = await Promise.all([
    Meeting.countDocuments({ 'attendance.memberId': m._id, state: 'FINALIZED', ...startClause }),
    Meeting.countDocuments({ attendance: { $elemMatch: { memberId: m._id, status: 'PRESENT' } }, state: 'FINALIZED', ...startClause }),
    Meeting.countDocuments({ attendance: { $elemMatch: { memberId: m._id, status: 'LATE' } }, state: 'FINALIZED', ...startClause }),
    Activity.countDocuments({ participants: m._id, ...startClause }),
    Activity.countDocuments({ leadMemberId: m._id, ...startClause }),
    Donation.aggregate([
      { $match: { donorMemberId: m._id, ...(Object.keys(dateFilter).length ? { receivedAt: dateFilter } : {}) } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Responsibility.countDocuments({ assignedToMemberId: m._id, state: 'PENDING' }),
    Responsibility.countDocuments({ assignedToMemberId: m._id, state: 'COMPLETED' }),
  ]);

  const [branding, homeUnit] = await Promise.all([
    _loadBrandingSafe(),
    m.basicUnitId ? BasicUnit.findById(m.basicUnitId).select('name').lean() : null,
  ]);
  const sectionColor = branding?.reportBranding?.pdfHeaderColor
    || branding?.theme?.light?.primary
    || '#0a3a6e';

  const absent = Math.max(0, meetingsTotal - meetingsPresent - meetingsLate);
  // "Attended" counts LATE as attendance — arriving late is still
  // showing up, and the unit dashboard scores it the same way.
  const attendanceRate = meetingsTotal
    ? Math.round(((meetingsPresent + meetingsLate) / meetingsTotal) * 100) : null;
  const respTotal = respPending + respCompleted;
  const completionRate = respTotal ? Math.round((respCompleted / respTotal) * 100) : null;
  const donCount = donAgg[0]?.count || 0;
  const donTotal = donAgg[0]?.total || 0;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="member-${m.memberId || m._id}-performance.pdf"`);
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  doc.pipe(res);

  applyBrandedHeader(doc, branding, 'Member Performance Report',
    `${m.fullName}  ·  ${m.memberId || ''}  ·  Period: ${_periodLabel(from, to)}`);

  // ─── Who this report is about ─────────────────────────────────────
  _infoCard(doc, [
    ['Member', m.fullName],
    ['Member ID', m.memberId || '—'],
    ['Status', m.status || '—'],
    ['CNIC', m.cnic],
    ['Phone', m.phone],
    ['Email', m.email],
    ['Basic Unit', homeUnit?.name],
    ['Gender', m.gender],
  ]);

  // ─── Headline figures ─────────────────────────────────────────────
  drawKpiBand(doc, [
    { label: 'Attendance Rate',
      value: attendanceRate === null ? 'n/a' : `${attendanceRate}%`,
      color: attendanceRate === null ? '#6b7280'
        : (attendanceRate >= 75 ? '#00a266' : (attendanceRate >= 50 ? '#e65f00' : '#cf2e2e')) },
    { label: 'Meetings', value: String(meetingsTotal) },
    { label: 'Activities', value: String(activitiesPart + activitiesLed) },
    { label: 'Donations', value: `PKR ${donTotal.toLocaleString()}` },
    { label: 'Tasks Completed',
      value: respTotal ? `${respCompleted}/${respTotal}` : '0',
      color: completionRate === null ? '#6b7280' : (completionRate >= 75 ? '#00a266' : '#e65f00') },
  ], sectionColor);

  // ─── Meeting attendance ───────────────────────────────────────────
  _sectionHeading(doc, 'Meeting Attendance', sectionColor, { newPage: false });
  if (meetingsTotal === 0) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor('#9aa3af')
      .text('This member was not on the roster of any finalized meeting in this period.');
    _resetText(doc);
    doc.moveDown(1);
  } else {
    _statBar(doc, [
      { label: 'Present', value: meetingsPresent, color: '#00a266' },
      { label: 'Late', value: meetingsLate, color: '#e6a700' },
      { label: 'Absent', value: absent, color: '#cf2e2e' },
    ]);
    _kvTable(doc, [
      ['Finalized meetings on roster', meetingsTotal],
      ['Present', meetingsPresent],
      ['Late', meetingsLate],
      ['Absent', absent],
      ['Attendance rate (present + late)', `${attendanceRate}%`],
    ], sectionColor, { headers: ['Measure', 'Value'] });
  }

  // ─── Activity engagement ──────────────────────────────────────────
  _sectionHeading(doc, 'Activity Engagement', sectionColor, { newPage: false });
  _kvTable(doc, [
    ['Activities participated in', activitiesPart],
    ['Activities led', activitiesLed],
    ['Total activity involvement', activitiesPart + activitiesLed],
  ], sectionColor, { headers: ['Measure', 'Value'] });

  // ─── Contributions ────────────────────────────────────────────────
  _sectionHeading(doc, 'Contributions', sectionColor, { newPage: false });
  _kvTable(doc, [
    ['Donations recorded', donCount],
    ['Total donated', `PKR ${donTotal.toLocaleString()}`],
    ['Average donation', donCount
      ? `PKR ${Math.round(donTotal / donCount).toLocaleString()}` : '—'],
  ], sectionColor, { headers: ['Measure', 'Value'] });

  // ─── Responsibilities ─────────────────────────────────────────────
  // Counted lifetime, not for the period — responsibilities carry no
  // startAt, so the period filter above never applied to them. Say so
  // rather than letting the figure read as period-scoped.
  _sectionHeading(doc, 'Responsibilities', sectionColor, { newPage: false });
  if (respTotal > 0) {
    _statBar(doc, [
      { label: 'Completed', value: respCompleted, color: '#00a266' },
      { label: 'Pending', value: respPending, color: '#e65f00' },
    ]);
  }
  _kvTable(doc, [
    ['Pending', respPending],
    ['Completed', respCompleted],
    ['Completion rate', completionRate === null ? '—' : `${completionRate}%`],
  ], sectionColor, { headers: ['Measure', 'Value'] });
  doc.font('Helvetica-Oblique').fontSize(8).fillColor('#6b7280')
    .text('Responsibility counts are lifetime totals — they are not limited to the reporting period.');
  _resetText(doc);

  _paginateFooters(doc, branding);
  doc.end();
});

// ─── Per-member Excel performance report ───────────────────────────
exports.memberPerformanceXlsx = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { from, to } = req.query;
  const m = await Member.findById(id).lean();
  if (!m) throw new ApiError(404, 'NOT_FOUND', 'Member not found');

  const dateFilter = {};
  if (from) dateFilter.$gte = new Date(from);
  if (to) dateFilter.$lte = new Date(to);
  const startClause = (Object.keys(dateFilter).length) ? { startAt: dateFilter } : {};

  const [
    meetingsTotal, meetingsPresent, meetingsLate,
    activitiesPart, activitiesLed,
    donAgg, respPending, respCompleted, respCancelled,
    homeUnit,
  ] = await Promise.all([
    Meeting.countDocuments({ 'attendance.memberId': m._id, state: 'FINALIZED', ...startClause }),
    Meeting.countDocuments({ attendance: { $elemMatch: { memberId: m._id, status: 'PRESENT' } }, state: 'FINALIZED', ...startClause }),
    Meeting.countDocuments({ attendance: { $elemMatch: { memberId: m._id, status: 'LATE' } }, state: 'FINALIZED', ...startClause }),
    Activity.countDocuments({ participants: m._id, ...startClause }),
    Activity.countDocuments({ leadMemberId: m._id, ...startClause }),
    Donation.aggregate([
      { $match: { donorMemberId: m._id, ...(Object.keys(dateFilter).length ? { receivedAt: dateFilter } : {}) } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Responsibility.countDocuments({ assignedToMemberId: m._id, state: 'PENDING' }),
    Responsibility.countDocuments({ assignedToMemberId: m._id, state: 'COMPLETED' }),
    Responsibility.countDocuments({ assignedToMemberId: m._id, state: 'CANCELLED' }),
    m.basicUnitId ? BasicUnit.findById(m.basicUnitId).select('name').lean() : null,
  ]);

  const absent = Math.max(0, meetingsTotal - meetingsPresent - meetingsLate);
  const attendanceRate = meetingsTotal
    ? Math.round(((meetingsPresent + meetingsLate) / meetingsTotal) * 100) : null;
  const respTotal = respPending + respCompleted + (respCancelled || 0);
  const completionRate = respTotal ? Math.round((respCompleted / respTotal) * 100) : null;
  const donCount = donAgg[0]?.count || 0;
  const donTotal = donAgg[0]?.total || 0;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'PKNAP';
  wb.created = new Date();

  const ws = wb.addWorksheet('Performance Summary');
  ws.columns = [{ header: 'Metric', key: 'k', width: 34 }, { header: 'Value', key: 'v', width: 30 }];
  ws.addRow({ k: 'Member Name', v: m.fullName });
  ws.addRow({ k: 'Member ID', v: m.memberId || '—' });
  ws.addRow({ k: 'CNIC', v: m.cnic });
  ws.addRow({ k: 'Phone', v: m.phone || '—' });
  ws.addRow({ k: 'Email', v: m.email || '—' });
  ws.addRow({ k: 'Basic Unit', v: homeUnit?.name || '—' });
  ws.addRow({ k: 'Status', v: m.status || 'ACTIVE' });
  ws.addRow({ k: 'Reporting Period', v: `${from || 'All time'} → ${to || 'Present'}` });
  ws.addRow({ k: '', v: '' });
  ws.addRow({ k: '─── MEETING ATTENDANCE ───', v: '' });
  ws.addRow({ k: 'Meetings on Roster (Finalized)', v: meetingsTotal });
  ws.addRow({ k: 'Present', v: meetingsPresent });
  ws.addRow({ k: 'Late', v: meetingsLate });
  ws.addRow({ k: 'Absent', v: absent });
  ws.addRow({ k: 'Attendance Rate', v: attendanceRate !== null ? `${attendanceRate}%` : 'N/A' });
  ws.addRow({ k: '', v: '' });
  ws.addRow({ k: '─── ACTIVITIES ───', v: '' });
  ws.addRow({ k: 'Activities Participated', v: activitiesPart });
  ws.addRow({ k: 'Activities Led', v: activitiesLed });
  ws.addRow({ k: 'Total Activities Involved', v: activitiesPart + activitiesLed });
  ws.addRow({ k: '', v: '' });
  ws.addRow({ k: '─── DONATIONS ───', v: '' });
  ws.addRow({ k: 'Donations Count', v: donCount });
  ws.addRow({ k: 'Total Donated (PKR)', v: donTotal });
  ws.addRow({ k: '', v: '' });
  ws.addRow({ k: '─── RESPONSIBILITIES ───', v: '' });
  ws.addRow({ k: 'Pending Tasks', v: respPending });
  ws.addRow({ k: 'Completed Tasks', v: respCompleted });
  ws.addRow({ k: 'Completion Rate', v: completionRate !== null ? `${completionRate}%` : 'N/A' });
  ws.getRow(1).font = { bold: true };

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="member-${m.memberId || m._id}-performance.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// ─── Per-meeting PDF — full details + embedded photographs ──────────
//
// Includes: header (type + title + state + venue + start/end + GPS),
// chairperson, agenda, attendance roster (Present/Late/Absent), notes,
// next-strategy, study-circle contributions if any, and every photo
// rendered with its capture timestamp + GPS coordinates.
exports.meetingPdf = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const m = await Meeting.findById(id)
    .populate('chairpersonId', 'fullName cnic memberId')
    .populate('attendance.memberId', 'fullName cnic memberId')
    .lean();
  if (!m) throw new ApiError(404, 'NOT_FOUND', 'Meeting not found');

  const filename = `meeting-${(m.title || m.type || 'minutes').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${id.slice(-6)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const branding = await _loadBrandingSafe();
  const sectionColor = branding?.reportBranding?.pdfHeaderColor
    || branding?.theme?.light?.primary
    || '#0a3a6e';

  const doc = new PDFDocument({ margin: 40, size: 'A4', autoFirstPage: true });
  doc.pipe(res);

  // ─── Header (branded)
  applyBrandedHeader(doc, branding, 'Meeting Minutes',
    `${m.title || m.type}  ·  Type: ${m.type}  ·  State: ${m.state}`);

  // ─── Meta block
  doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor).text('Details');
  doc.moveDown(0.2);
  doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a');
  const fmt = (d) => d ? new Date(d).toLocaleString() : '—';
  doc.text(`Start:  ${fmt(m.startAt)}`);
  if (m.endAt) doc.text(`End:    ${fmt(m.endAt)}`);
  doc.text(`Venue:  ${m.venue || '—'}`);
  if (m.gpsLat != null && m.gpsLng != null) {
    doc.text(`Venue GPS: ${m.gpsLat.toFixed(6)}, ${m.gpsLng.toFixed(6)}`);
  }
  doc.text(`Chair:  ${m.chairpersonId?.fullName || '—'}${m.chairpersonId?.memberId ? ` (${m.chairpersonId.memberId})` : ''}`);
  if (m.body) doc.text(`Body:   ${m.body}`);
  if (m.supervisorAttended) doc.text(`Supervisor: attended`);
  doc.moveDown(0.6);

  // ─── Description / agenda / notes
  if (m.description) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor).text('Description');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a').text(m.description, { align: 'justify' });
    doc.moveDown(0.6);
  }
  if (m.agenda) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor).text('Agenda');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a').text(m.agenda, { align: 'justify' });
    doc.moveDown(0.6);
  }
  if (m.activityNotes) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor).text('Activity Notes');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a').text(m.activityNotes, { align: 'justify' });
    doc.moveDown(0.6);
  }
  if (m.upcomingStrategy) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor).text('Upcoming Strategy');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(10).fillColor('#1a1a1a').text(m.upcomingStrategy, { align: 'justify' });
    doc.moveDown(0.6);
  }

  // ─── Attendance roster
  const att = m.attendance || [];
  if (att.length > 0) {
    const present = att.filter((a) => a.status === 'PRESENT').length;
    const late = att.filter((a) => a.status === 'LATE').length;
    const absent = att.filter((a) => a.status === 'ABSENT').length;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor)
      .text(`Attendance (${present} present · ${late} late · ${absent} absent · ${att.length} on roster)`);
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
    att.forEach((a) => {
      const name = a.memberId?.fullName || '(unknown)';
      const code = a.memberId?.memberId ? ` · ${a.memberId.memberId}` : '';
      doc.text(`  • [${a.status || '—'}] ${name}${code}`);
    });
    doc.moveDown(0.6);
  }

  // ─── Guest attendees (non-members)
  if (m.guestAttendees && m.guestAttendees.length > 0) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor).text(`Guest Attendees (${m.guestAttendees.length})`);
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
    m.guestAttendees.forEach((g) => doc.text(`  • ${g.name}${g.cnic ? ` (${g.cnic})` : ''}`));
    doc.moveDown(0.6);
  }

  // ─── Study-circle contributions
  if (m.studyContributions && m.studyContributions.length > 0) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(sectionColor).text('Study Contributions');
    doc.moveDown(0.2);
    doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
    m.studyContributions.forEach((s) => {
      doc.text(`  • ${s.topic || '(topic)'}: ${s.summary || ''}`);
    });
    doc.moveDown(0.6);
  }

  // ─── Photos — embed each one with metadata caption
  const photos = (m.photos || []).filter((p) => uploadDiskPath(p.url));
  if (photos.length > 0) {
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(15).fillColor(sectionColor).text(`Photographs (${photos.length})`, { align: 'center' });
    doc.moveDown(0.4);
    doc.strokeColor(sectionColor).lineWidth(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.6);

    photos.forEach((p, i) => {
      const diskPath = uploadDiskPath(p.url);
      if (!diskPath) return;
      // Each photo gets a roughly half-page block: image + caption.
      // Add a new page if remaining space is too small.
      const remaining = doc.page.height - doc.y - doc.page.margins.bottom;
      const blockHeight = 320;
      if (remaining < blockHeight) doc.addPage();

      const startY = doc.y;
      try {
        // Centre image, max 480 wide, max 280 tall — preserves aspect.
        doc.image(diskPath, { fit: [480, 280], align: 'center', valign: 'top' });
      } catch (err) {
        doc.font('Helvetica-Oblique').fontSize(9).fillColor('#dc2626')
          .text(`[Could not embed photo ${i + 1}: ${err.message}]`);
      }
      // Caption block
      doc.moveDown(0.4);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(sectionColor).text(`Photo ${i + 1} of ${photos.length}`);
      doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
      doc.text(`Captured: ${p.capturedAt ? new Date(p.capturedAt).toLocaleString() : 'not recorded'}`);
      if (p.gps?.lat != null && p.gps?.lng != null) {
        doc.text(`GPS:      ${Number(p.gps.lat).toFixed(6)}, ${Number(p.gps.lng).toFixed(6)}`);
      } else {
        doc.text(`GPS:      not recorded`);
      }
      if (p.sha256) {
        doc.fontSize(8).fillColor('#555c66').text(`SHA-256:  ${p.sha256.slice(0, 32)}…`);
      }
      doc.moveDown(0.8);
    });
  }

  // ─── Footer (branded — falls back to settings.reportBranding /
  //              identity.copyrightText, with timestamp as last resort)
  applyBrandedFooter(doc, branding);

  doc.end();
});

// PR U7 — exposed so reportTemplateService can reuse the data
// gathering layer without duplication. The existing controller
// actions above keep using the local function reference; the new
// service consumes the same code via this export.
module.exports.gatherUnitData = gatherUnitData;
