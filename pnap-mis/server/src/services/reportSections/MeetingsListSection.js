const { formatUnitArrangedBy } = require('../../utils/unitFormat');

module.exports = {
  kind: 'MEETINGS_LIST',
  label: 'Meetings list',
  description: 'Table of meetings (date, type, arranged by, venue, chairperson, state, attendance). The XLSX form also carries each meeting\'s description; the PDF table has no room for prose.',
  defaultTitle: 'Meetings',
  defaultConfig: { limit: 100, includeAttendance: true, stateFilter: null },

  renderPdf(doc, section, ctx) {
    const cfg = { ...this.defaultConfig, ...(section.config || {}) };
    let rows = (ctx.meetings || []).slice();
    if (cfg.stateFilter) rows = rows.filter((m) => m.state === cfg.stateFilter);
    rows = rows.slice(0, cfg.limit);

    const title = section.title || this.defaultTitle;
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a1a1a').text(title, 40, 60);
    doc.moveDown(1);

    if (rows.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(11).fillColor('#9aa3af')
        .text('No meetings in this period.');
      return;
    }

    let y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151');
    doc.text('Date',         40,  y, { width: 75 });
    doc.text('Type',         118, y, { width: 52 });
    doc.text('Arranged By',  173, y, { width: 105 });
    doc.text('Venue',        282, y, { width: 110 });
    doc.text('Chairperson',  395, y, { width: 90 });
    doc.text('State',        488, y, { width: 42 });
    if (cfg.includeAttendance) doc.text('Pres.', 532, y, { width: 25 });
    y += 14;
    doc.moveTo(40, y - 2).lineTo(555, y - 2).strokeColor('#e5e7eb').stroke();

    doc.font('Helvetica').fontSize(8.5).fillColor('#1a1a1a');
    for (const m of rows) {
      const present = (m.attendance || []).filter((a) => a.status === 'PRESENT').length;
      const dateStr = m.startAt ? new Date(m.startAt).toLocaleDateString() : '—';
      const arrBy = m.arrangedBy || formatUnitArrangedBy(m);
      doc.text(dateStr,                       40,  y, { width: 75 });
      doc.text(String(m.type || m.typeCode || ''), 118, y, { width: 52 });
      doc.text(String(arrBy),                 173, y, { width: 105, ellipsis: true });
      doc.text(String(m.venue || '—'),        282, y, { width: 110, ellipsis: true });
      doc.text(m.chairpersonId?.fullName || '—', 395, y, { width: 90, ellipsis: true });
      doc.text(String(m.state || ''),         488, y, { width: 42 });
      if (cfg.includeAttendance) doc.text(String(present), 532, y, { width: 25 });
      y += 16;
      if (y > doc.page.height - 60) { doc.addPage(); y = 60; }
    }
    doc.y = y + 10;
  },

  renderXlsx(workbook, section, ctx) {
    const cfg = { ...this.defaultConfig, ...(section.config || {}) };
    let rows = (ctx.meetings || []).slice();
    if (cfg.stateFilter) rows = rows.filter((m) => m.state === cfg.stateFilter);
    rows = rows.slice(0, cfg.limit);

    const title = section.title || this.defaultTitle;
    const ws = workbook.addWorksheet(title.slice(0, 30));
    ws.columns = [
      { header: 'Date',        key: 'date',        width: 14 },
      { header: 'Arranged By', key: 'arrangedBy',  width: 22 },
      { header: 'Type',        key: 'type',        width: 10 },
      { header: 'Title',       key: 'title',       width: 30 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Venue',       key: 'venue',       width: 24 },
      { header: 'Chairperson', key: 'chair',       width: 24 },
      { header: 'State',       key: 'state',       width: 14 },
      { header: 'Present',     key: 'present',     width: 10 },
    ];
    for (const m of rows) {
      ws.addRow({
        date:        m.startAt ? new Date(m.startAt) : null,
        arrangedBy:  m.arrangedBy || formatUnitArrangedBy(m),
        type:        m.type || m.typeCode || '',
        title:       m.title || '',
        description: m.description || '',
        venue:       m.venue || '',
        chair:       m.chairpersonId?.fullName || '',
        state:       m.state || '',
        present:     (m.attendance || []).filter((a) => a.status === 'PRESENT').length,
      });
    }
    ws.getRow(1).font = { bold: true };
  },
};
