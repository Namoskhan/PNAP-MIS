const { formatUnitArrangedBy } = require('../../utils/unitFormat');

module.exports = {
  kind: 'ACTIVITIES_LIST',
  label: 'Activities list',
  description: 'Table of activities (date, type, arranged by, title, venue, state, photo count).',
  defaultTitle: 'Activities',
  defaultConfig: { limit: 100, stateFilter: null },

  renderPdf(doc, section, ctx) {
    const cfg = { ...this.defaultConfig, ...(section.config || {}) };
    let rows = (ctx.activities || []).slice();
    if (cfg.stateFilter) rows = rows.filter((a) => a.state === cfg.stateFilter);
    rows = rows.slice(0, cfg.limit);

    const title = section.title || this.defaultTitle;
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a1a1a').text(title, 40, 60);
    doc.moveDown(1);

    if (rows.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(11).fillColor('#9aa3af')
        .text('No activities in this period.');
      return;
    }

    let y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151');
    doc.text('Date',         40,  y, { width: 75 });
    doc.text('Type',         118, y, { width: 60 });
    doc.text('Arranged By',  180, y, { width: 105 });
    doc.text('Title',        288, y, { width: 145 });
    doc.text('Venue',        436, y, { width: 80 });
    doc.text('State',        520, y, { width: 35 });
    y += 14;
    doc.moveTo(40, y - 2).lineTo(555, y - 2).strokeColor('#e5e7eb').stroke();

    doc.font('Helvetica').fontSize(8.5).fillColor('#1a1a1a');
    for (const a of rows) {
      const dateStr = a.startAt ? new Date(a.startAt).toLocaleDateString() : '—';
      const arrBy = a.arrangedBy || formatUnitArrangedBy(a);
      doc.text(dateStr,                       40,  y, { width: 75 });
      doc.text(String(a.type || a.typeCode || ''), 118, y, { width: 60 });
      doc.text(String(arrBy),                 180, y, { width: 105, ellipsis: true });
      doc.text(String(a.title || '—'),        288, y, { width: 145, ellipsis: true });
      doc.text(String(a.venue || '—'),        436, y, { width: 80, ellipsis: true });
      doc.text(String(a.state || ''),         520, y, { width: 35 });
      y += 16;
      if (y > doc.page.height - 60) { doc.addPage(); y = 60; }
    }
    doc.y = y + 10;
  },

  renderXlsx(workbook, section, ctx) {
    const cfg = { ...this.defaultConfig, ...(section.config || {}) };
    let rows = (ctx.activities || []).slice();
    if (cfg.stateFilter) rows = rows.filter((a) => a.state === cfg.stateFilter);
    rows = rows.slice(0, cfg.limit);

    const title = section.title || this.defaultTitle;
    const ws = workbook.addWorksheet(title.slice(0, 30));
    ws.columns = [
      { header: 'Date',        key: 'date',        width: 14 },
      { header: 'Arranged By', key: 'arrangedBy',  width: 22 },
      { header: 'Type',        key: 'type',        width: 14 },
      { header: 'Title',       key: 'title',       width: 30 },
      { header: 'Venue',       key: 'venue',       width: 22 },
      { header: 'State',       key: 'state',       width: 14 },
      { header: 'Photos',      key: 'photos',      width: 8 },
    ];
    for (const a of rows) {
      ws.addRow({
        date:        a.startAt ? new Date(a.startAt) : null,
        arrangedBy:  a.arrangedBy || formatUnitArrangedBy(a),
        type:        a.type || a.typeCode || '',
        title:       a.title || '',
        venue:       a.venue || '',
        state:       a.state || '',
        photos:      (a.photos || []).length,
      });
    }
    ws.getRow(1).font = { bold: true };
  },
};
