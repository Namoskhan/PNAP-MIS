// EXPENSES_TABLE — category / description / amount / state rows plus
// total row.

module.exports = {
  kind: 'EXPENSES_TABLE',
  label: 'Expenses table',
  description: 'Category, description, payee, amount, state, plus total row.',
  defaultTitle: 'Expenses',
  defaultConfig: { limit: 500, stateFilter: null },

  renderPdf(doc, section, ctx) {
    const cfg = { ...this.defaultConfig, ...(section.config || {}) };
    let rows = (ctx.expenses || []).slice();
    if (cfg.stateFilter) rows = rows.filter((e) => e.state === cfg.stateFilter);
    rows = rows.slice(0, cfg.limit);

    const title = section.title || this.defaultTitle;
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a1a1a').text(title, 40, 60);
    doc.moveDown(1);

    if (rows.length === 0) {
      doc.font('Helvetica-Oblique').fontSize(11).fillColor('#9aa3af')
        .text('No expenses in this period.');
      return;
    }

    let y = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#374151');
    doc.text('Date',         40,  y, { width: 80 });
    doc.text('Category',     125, y, { width: 80 });
    doc.text('Description',  210, y, { width: 200 });
    doc.text('State',        415, y, { width: 60 });
    doc.text('Amount',       480, y, { width: 75, align: 'right' });
    y += 14;
    doc.moveTo(40, y - 2).lineTo(555, y - 2).strokeColor('#e5e7eb').stroke();

    let total = 0;
    doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a');
    for (const e of rows) {
      const dateStr = e.incurredAt ? new Date(e.incurredAt).toLocaleDateString() : '—';
      doc.text(dateStr,                                  40,  y, { width: 80 });
      doc.text(String(e.category || ''),                 125, y, { width: 80 });
      doc.text(String(e.description || '—'),             210, y, { width: 200, ellipsis: true });
      doc.text(String(e.state || ''),                    415, y, { width: 60 });
      doc.text(`PKR ${(e.amount || 0).toLocaleString()}`, 480, y, { width: 75, align: 'right' });
      total += e.amount || 0;
      y += 16;
      if (y > doc.page.height - 60) { doc.addPage(); y = 60; }
    }

    y += 4;
    doc.moveTo(415, y - 2).lineTo(555, y - 2).strokeColor('#374151').stroke();
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1a1a1a');
    doc.text('Total', 415, y, { width: 60 });
    doc.text(`PKR ${total.toLocaleString()}`, 480, y, { width: 75, align: 'right' });
    doc.y = y + 20;
  },

  renderXlsx(workbook, section, ctx) {
    const cfg = { ...this.defaultConfig, ...(section.config || {}) };
    let rows = (ctx.expenses || []).slice();
    if (cfg.stateFilter) rows = rows.filter((e) => e.state === cfg.stateFilter);
    rows = rows.slice(0, cfg.limit);

    const title = section.title || this.defaultTitle;
    const ws = workbook.addWorksheet(title.slice(0, 30));
    ws.columns = [
      { header: 'Date',         key: 'date',    width: 14 },
      { header: 'Category',     key: 'cat',     width: 18 },
      { header: 'Description',  key: 'desc',    width: 32 },
      { header: 'Vendor',       key: 'vendor',  width: 22 },
      { header: 'Mode',         key: 'mode',    width: 16 },
      { header: 'State',        key: 'state',   width: 14 },
      { header: 'Amount (PKR)', key: 'amount',  width: 16 },
    ];
    let total = 0;
    for (const e of rows) {
      ws.addRow({
        date:   e.incurredAt ? new Date(e.incurredAt) : null,
        cat:    e.category || '',
        desc:   e.description || '',
        vendor: e.vendor || '',
        mode:   e.paymentMode || '',
        state:  e.state || '',
        amount: e.amount || 0,
      });
      total += e.amount || 0;
    }
    const totalRow = ws.addRow({ cat: 'TOTAL', amount: total });
    totalRow.font = { bold: true };
    ws.getRow(1).font = { bold: true };
  },
};
