// DONATIONS_TABLE — donor / amount / mode / received-at rows plus a
// total row.

module.exports = {
  kind: 'DONATIONS_TABLE',
  label: 'Donations table',
  description: 'Donor name, amount, payment mode, received date, plus total row.',
  defaultTitle: 'Donations',
  defaultConfig: { limit: 500 },

  renderPdf(doc, section, ctx) {
    const cfg = { ...this.defaultConfig, ...(section.config || {}) };
    const rows = (ctx.donations || []).slice(0, cfg.limit);
    const title = section.title || this.defaultTitle;

    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a1a1a').text(title, 40, 60);
    doc.moveDown(1);

    if (rows.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(11).fillColor('#9aa3af')
        .text('No donations in this period.');
      return;
    }

    let y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151');
    doc.text('Date',     40,  y, { width: 90 });
    doc.text('Donor',    135, y, { width: 200 });
    doc.text('Mode',     345, y, { width: 80 });
    doc.text('Amount',   430, y, { width: 100, align: 'right' });
    y += 14;
    doc.moveTo(40, y - 2).lineTo(555, y - 2).strokeColor('#e5e7eb').stroke();

    let total = 0;
    doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
    for (const d of rows) {
      const dateStr = d.receivedAt ? new Date(d.receivedAt).toLocaleDateString() : '—';
      const donorName = d.donorType === 'ANONYMOUS'
        ? 'Anonymous'
        : (d.donorName || d.donorMemberId?.fullName || (d.donorType === 'MEMBER' ? 'Member' : '—'));
      doc.text(dateStr,                                    40,  y, { width: 90 });
      doc.text(String(donorName),                          135, y, { width: 200, ellipsis: true });
      doc.text(String(d.paymentMode || ''),                345, y, { width: 80 });
      doc.text(`PKR ${(d.amount || 0).toLocaleString()}`,  430, y, { width: 100, align: 'right' });
      total += d.amount || 0;
      y += 16;
      if (y > doc.page.height - 60) { doc.addPage(); y = 60; }
    }

    y += 4;
    doc.moveTo(345, y - 2).lineTo(555, y - 2).strokeColor('#374151').stroke();
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1a1a1a');
    doc.text('Total', 345, y, { width: 80 });
    doc.text(`PKR ${total.toLocaleString()}`, 430, y, { width: 100, align: 'right' });
    doc.y = y + 20;
  },

  renderXlsx(workbook, section, ctx) {
    const cfg = { ...this.defaultConfig, ...(section.config || {}) };
    const rows = (ctx.donations || []).slice(0, cfg.limit);
    const title = section.title || this.defaultTitle;

    const ws = workbook.addWorksheet(title.slice(0, 30));
    ws.columns = [
      { header: 'Date',         key: 'date',    width: 14 },
      { header: 'Donor name',   key: 'donor',   width: 26 },
      { header: 'Donor type',   key: 'type',    width: 16 },
      { header: 'CNIC',         key: 'cnic',    width: 18 },
      { header: 'Mode',         key: 'mode',    width: 16 },
      { header: 'Amount (PKR)', key: 'amount',  width: 16 },
    ];
    let total = 0;
    for (const d of rows) {
      const donorName = d.donorType === 'ANONYMOUS'
        ? 'Anonymous'
        : (d.donorName || d.donorMemberId?.fullName || (d.donorType === 'MEMBER' ? 'Member' : ''));
      ws.addRow({
        date:   d.receivedAt ? new Date(d.receivedAt) : null,
        donor:  donorName,
        type:   d.donorType || '',
        cnic:   d.donorCnic || '',
        mode:   d.paymentMode || '',
        amount: d.amount || 0,
      });
      total += d.amount || 0;
    }
    const totalRow = ws.addRow({ donor: 'TOTAL', amount: total });
    totalRow.font = { bold: true };
    ws.getRow(1).font = { bold: true };
  },
};
