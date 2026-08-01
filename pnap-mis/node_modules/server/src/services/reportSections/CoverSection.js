// COVER section — title page for PDF reports. XLSX rendering is a
// no-op since spreadsheets don't have a "cover page" concept.

module.exports = {
  kind: 'COVER',
  label: 'Cover page',
  description: 'Title page with template name, unit name, date range, and generation timestamp.',
  defaultTitle: 'Report',
  defaultConfig: { subtitle: '' },

  renderPdf(doc, section, ctx) {
    const title = section.title || ctx.template?.name || 'Report';
    const subtitle = section.config?.subtitle || ctx.name;

    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(28).fillColor('#1a1a1a')
      .text(title, 40, 200, { align: 'center', width: 515 });

    if (subtitle) {
      doc.moveDown(1);
      doc.font('Helvetica').fontSize(16).fillColor('#374151')
        .text(subtitle, { align: 'center', width: 515 });
    }

    if (ctx.from || ctx.to) {
      doc.moveDown(2);
      const range = `${ctx.from ? new Date(ctx.from).toLocaleDateString() : '—'}` +
                    `  to  ${ctx.to ? new Date(ctx.to).toLocaleDateString() : '—'}`;
      doc.font('Helvetica').fontSize(11).fillColor('#52606d')
        .text(range, { align: 'center', width: 515 });
    }

    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#9aa3af')
      .text(`Generated ${new Date().toLocaleString()}`,
            40, doc.page.height - 60, { align: 'center', width: 515 });
  },

  renderXlsx(/* workbook, section, ctx */) {
    // Cover sheets aren't a thing in spreadsheets — skip.
  },
};
