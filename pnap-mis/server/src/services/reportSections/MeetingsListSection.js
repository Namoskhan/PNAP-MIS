// MEETINGS_LIST — table of meetings within the report's date range.
// Config knobs:
//   limit           — cap output rows (default 100)
//   includeAttendance — append PRESENT count column (default true)
//   stateFilter     — only include meetings in given state (optional)

module.exports = {
  kind: 'MEETINGS_LIST',
  label: 'Meetings list',
  description: 'Table of meetings (date, type, venue, chairperson, state, attendance).',
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
    doc.text('Date',         40,  y, { width: 90 });
    doc.text('Type',         135, y, { width: 60 });
    doc.text('Venue',        200, y, { width: 140 });
    doc.text('Chairperson',  345, y, { width: 110 });
    doc.text('State',        460, y, { width: 60 });
    if (cfg.includeAttendance) doc.text('Pres.', 525, y, { width: 30 });
    y += 14;
    doc.moveTo(40, y - 2).lineTo(555, y - 2).strokeColor('#e5e7eb').stroke();

    doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
    for (const m of rows) {
      const present = (m.attendance || []).filter((a) => a.status === 'PRESENT').length;
      const dateStr = m.startAt ? new Date(m.startAt).toLocaleDateString() : '—';
      doc.text(dateStr,                       40,  y, { width: 90 });
      doc.text(String(m.type || m.typeCode || ''), 135, y, { width: 60 });
      doc.text(String(m.venue || '—'),        200, y, { width: 140, ellipsis: true });
      doc.text(m.chairpersonId?.fullName || '—', 345, y, { width: 110, ellipsis: true });
      doc.text(String(m.state || ''),         460, y, { width: 60 });
      if (cfg.includeAttendance) doc.text(String(present), 525, y, { width: 30 });
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
      { header: 'Type',        key: 'type',        width: 10 },
      { header: 'Title',       key: 'title',       width: 30 },
      { header: 'Venue',       key: 'venue',       width: 24 },
      { header: 'Chairperson', key: 'chair',       width: 24 },
      { header: 'State',       key: 'state',       width: 14 },
      { header: 'Present',     key: 'present',     width: 10 },
    ];
    for (const m of rows) {
      ws.addRow({
        date:    m.startAt ? new Date(m.startAt) : null,
        type:    m.type || m.typeCode || '',
        title:   m.title || '',
        venue:   m.venue || '',
        chair:   m.chairpersonId?.fullName || '',
        state:   m.state || '',
        present: (m.attendance || []).filter((a) => a.status === 'PRESENT').length,
      });
    }
    ws.getRow(1).font = { bold: true };
  },
};
