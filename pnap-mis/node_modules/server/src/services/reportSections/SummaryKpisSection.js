// SUMMARY_KPIS — at-a-glance counts: members, meetings, activities,
// donations (count + total), expenses (count + total).

function _kpis(ctx) {
  const donAgg = (ctx.donations || []).reduce(
    (acc, d) => ({ count: acc.count + 1, total: acc.total + (d.amount || 0) }),
    { count: 0, total: 0 },
  );
  const expAgg = (ctx.expenses || []).reduce(
    (acc, e) => ({ count: acc.count + 1, total: acc.total + (e.amount || 0) }),
    { count: 0, total: 0 },
  );
  return {
    members:    (ctx.members || []).length,
    meetings:   (ctx.meetings || []).length,
    activities: (ctx.activities || []).length,
    donations:  donAgg,
    expenses:   expAgg,
  };
}

module.exports = {
  kind: 'SUMMARY_KPIS',
  label: 'Summary KPIs',
  description: 'At-a-glance counts of members, meetings, activities, donations, and expenses.',
  defaultTitle: 'Summary',
  defaultConfig: {},

  renderPdf(doc, section, ctx) {
    const k = _kpis(ctx);
    const title = section.title || this.defaultTitle;

    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(16).fillColor('#1a1a1a').text(title, 40, 60);
    doc.moveDown(1);

    const rows = [
      ['Active members',    String(k.members)],
      ['Meetings',          String(k.meetings)],
      ['Activities',        String(k.activities)],
      ['Donations',         `${k.donations.count} · PKR ${k.donations.total.toLocaleString()}`],
      ['Expenses',          `${k.expenses.count} · PKR ${k.expenses.total.toLocaleString()}`],
    ];

    let y = doc.y;
    for (const [label, value] of rows) {
      doc.font('Helvetica').fontSize(11).fillColor('#52606d').text(label, 60, y, { width: 200 });
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#1a1a1a').text(value, 280, y);
      y += 22;
    }
    doc.y = y + 10;
  },

  renderXlsx(workbook, section, ctx) {
    const k = _kpis(ctx);
    const title = section.title || this.defaultTitle;
    const ws = workbook.addWorksheet(title.slice(0, 30));
    ws.columns = [
      { header: 'Metric', key: 'metric', width: 28 },
      { header: 'Value',  key: 'value',  width: 30 },
    ];
    ws.addRow({ metric: 'Active members',  value: k.members });
    ws.addRow({ metric: 'Meetings',        value: k.meetings });
    ws.addRow({ metric: 'Activities',      value: k.activities });
    ws.addRow({ metric: 'Donations count', value: k.donations.count });
    ws.addRow({ metric: 'Donations total', value: k.donations.total });
    ws.addRow({ metric: 'Expenses count',  value: k.expenses.count });
    ws.addRow({ metric: 'Expenses total',  value: k.expenses.total });
    ws.getRow(1).font = { bold: true };
  },
};
