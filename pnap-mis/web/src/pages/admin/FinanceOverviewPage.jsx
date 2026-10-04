import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, errorMessage } from '../../api/client';

const PKR = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });

export default function FinanceOverviewPage() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/admin/finance-overview')
      .then((r) => setData(r.data.data))
      .catch((e) => setErr(errorMessage(e)));
  }, []);

  if (err) return <div className="alert error">{err}</div>;
  if (!data) return <p>{t('common.loading', 'Loading…')}</p>;

  const totals = data.totals;
  return (
    <div>
      <div className="page-header"><h2>{t('admin.financeOverview')}</h2></div>
      <p className="muted">{t('admin.financeOverviewSub')}</p>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <Kpi label={t('admin.totalDonations')} value={PKR.format(totals.donations)} sub={`${totals.donationCount} ${t('admin.entries')}`} />
        <Kpi label={t('admin.approvedExpenses')} value={PKR.format(totals.expenses)} sub={`${totals.expenseCount} ${t('admin.entries')}`} />
        <Kpi label={t('admin.transfers')} value={PKR.format(totals.transfers)} sub={`${totals.transferCount} ${t('admin.entries')}`} />
        <Kpi label={t('admin.netBalance')} value={PKR.format(totals.netBalance)} accent={totals.netBalance < 0 ? 'danger' : 'good'} />
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{t('admin.byProvince')}</h3>
        <table className="list">
          <thead>
            <tr>
              <th>{t('admin.province')}</th>
              <th style={{ textAlign: 'right' }}>{t('admin.donations')}</th>
              <th style={{ textAlign: 'right' }}>{t('admin.expenses')}</th>
              <th style={{ textAlign: 'right' }}>{t('admin.netBalance')}</th>
            </tr>
          </thead>
          <tbody>
            {data.perProvince.length === 0 && <tr><td colSpan="4" className="muted">{t('admin.noData')}</td></tr>}
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
