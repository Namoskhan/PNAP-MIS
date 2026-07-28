import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';

const PKR = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });

export default function FinanceOverviewPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/admin/finance-overview')
      .then((r) => setData(r.data.data))
      .catch((e) => setErr(errorMessage(e)));
  }, []);

  if (err) return <div className="alert error">{err}</div>;
  if (!data) return <p>Loading…</p>;

  const t = data.totals;
  return (
    <div>
      <div className="page-header"><h2>Finance Overview (System-wide)</h2></div>
      <p className="muted">Aggregated finance across the entire party.</p>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi label="Total Donations" value={PKR.format(t.donations)} sub={`${t.donationCount} entries`} />
        <Kpi label="Approved Expenses" value={PKR.format(t.expenses)} sub={`${t.expenseCount} entries`} />
        <Kpi label="Acknowledged Transfers" value={PKR.format(t.transfers)} sub={`${t.transferCount} entries`} />
        <Kpi label="Net Balance" value={PKR.format(t.netBalance)} accent={t.netBalance < 0 ? 'danger' : 'good'} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>By Province</h3>
        <table className="list">
          <thead>
            <tr>
              <th>Province</th>
              <th style={{ textAlign: 'right' }}>Donations</th>
              <th style={{ textAlign: 'right' }}>Expenses</th>
              <th style={{ textAlign: 'right' }}>Net Balance</th>
            </tr>
          </thead>
          <tbody>
            {data.perProvince.length === 0 && <tr><td colSpan="4" className="muted">No data.</td></tr>}
            {data.perProvince.map((p) => (
              <tr key={p._id}>
                <td><strong>{p.name}</strong> {p.code && <span className="muted">({p.code})</span>}</td>
                <td style={{ textAlign: 'right' }}>{PKR.format(p.donations)} <span className="muted" style={{ fontSize: 12 }}>({p.donationCount})</span></td>
                <td style={{ textAlign: 'right' }}>{PKR.format(p.expenses)} <span className="muted" style={{ fontSize: 12 }}>({p.expenseCount})</span></td>
                <td style={{ textAlign: 'right', color: p.netBalance < 0 ? 'var(--danger)' : 'var(--success)', fontWeight: 600 }}>
                  {PKR.format(p.netBalance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, accent }) {
  return (
    <div className={`kpi ${accent === 'danger' ? 'kpi-danger' : ''} ${accent === 'good' ? 'kpi-good' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value ?? 0}</div>
      {sub && <div className="hint">{sub}</div>}
    </div>
  );
}
