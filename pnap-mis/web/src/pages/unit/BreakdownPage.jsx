import { useEffect, useState } from 'react';
import { useUnit } from '../../context/UnitContext';
import { api } from '../../api/client';

const PKR = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });

const CHILD_LABEL = {
  AREA: 'Basic Units',
  DISTRICT: 'Areas',
  PROVINCE: 'Districts',
  CENTRAL: 'Provinces',
};

export default function BreakdownPage() {
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

  if (!ctx) return <p>Select a unit context first.</p>;
  if (ctx.unitLevel === 'BASIC_UNIT') return <p>Basic Units have no subordinates.</p>;

  const childLabel = CHILD_LABEL[ctx.unitLevel];

  return (
    <div>
      <div className="page-header">
        <h2>{childLabel} of {ctx.unitName}</h2>
      </div>

      {busy && <p>Loading…</p>}
      <table className="list">
        <thead>
          <tr>
            <th>Name</th>
            <th>Active Members</th>
            <th>Meetings (30d)</th>
            <th>Activities (30d)</th>
            <th style={{ textAlign: 'right' }}>Donations</th>
            <th style={{ textAlign: 'right' }}>Expenses</th>
            <th style={{ textAlign: 'right' }}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan="7">No subordinate units yet.</td></tr>}
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
