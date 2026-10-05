import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnit } from '../../context/UnitContext';
import { api } from '../../api/client';

const PKR = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });

export default function BreakdownPage() {
  const { t } = useTranslation();
  const { ctx } = useUnit();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!ctx) return;
    setBusy(true);
    api.get('/dashboard/subordinates', { params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId } })
      .then((r) => setRows(r.data.data))
      .finally(() => setBusy(false));
  }, [ctx]);

  if (!ctx) return <p>{t('common.selectUnitContext', 'Select a unit context first.')}</p>;
  if (ctx.unitLevel === 'BASIC_UNIT') return <p>{t('breakdown.noSubordinatesBasicUnit', 'Basic Units have no subordinates.')}</p>;

  const childLabelMap = {
    AREA: t('units.basicUnits', 'Basic Units'),
    DISTRICT: t('units.areas', 'Areas'),
    PROVINCE: t('units.districts', 'Districts'),
    CENTRAL: t('units.provinces', 'Provinces'),
  };
  const childLabel = childLabelMap[ctx.unitLevel] || t('breakdown.subordinateUnits', 'Subordinate Units');

  return (
    <div>
      <div className="page-header">
        <h2>{t('breakdown.headerTitle', '{{childLabel}} of {{unitName}}', { childLabel, unitName: ctx.unitName })}</h2>
      </div>

      {busy && <p>{t('common.loading', 'Loading…')}</p>}
      <table className="list">
        <thead>
          <tr>
            <th>{t('common.name', 'Name')}</th>
            <th>{t('breakdown.activeMembers', 'Active Members')}</th>
            <th>{t('breakdown.meetings30', 'Meetings (30d)')}</th>
            <th>{t('breakdown.activities30', 'Activities (30d)')}</th>
            <th style={{ textAlign: 'right' }}>{t('finance.donations', 'Donations')}</th>
            <th style={{ textAlign: 'right' }}>{t('finance.expenses', 'Expenses')}</th>
            <th style={{ textAlign: 'right' }}>{t('finance.balance', 'Balance')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan="7">{t('breakdown.noSubordinatesYet', 'No subordinate units yet.')}</td></tr>}
          {rows.map((r) => (
            <tr key={r._id}>
              <td>{r.name}{r.code ? ` (${r.code})` : ''}</td>
              <td>{r.members}</td>
              <td>{r.meetings30}</td>
              <td>{r.activities30 ?? 0}</td>
              <td style={{ textAlign: 'right' }}>{PKR.format(r.donations)}</td>
              <td style={{ textAlign: 'right' }}>{PKR.format(r.expenses)}</td>
              <td style={{ textAlign: 'right', color: r.balance < 0 ? 'var(--danger)' : 'inherit' }}>{PKR.format(r.balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
