import { useEffect, useState } from 'react';
import { useUnit } from '../../context/UnitContext';
import { api } from '../../api/client';

export default function SupervisoryPage() {
  const { ctx } = useUnit();
  const [days, setDays] = useState(90);
  const [threshold, setThreshold] = useState(60);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    if (!ctx || ctx.unitLevel === 'BASIC_UNIT') return;
    setBusy(true);
    try {
      const r = await api.get('/committee/supervisory-compliance', {
        params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId, days, threshold },
      });
      setData(r.data.data);
    } finally { setBusy(false); }
  }
  useEffect(() => { reload(); }, [ctx, days, threshold]);

  if (!ctx) return <p>Select a unit context first.</p>;
  if (ctx.unitLevel === 'BASIC_UNIT') return <p className="muted">Basic Units have no level below them to supervise.</p>;

  return (
    <div>
      <div className="page-header">
        <h2>Supervisory Compliance · {ctx.unitName}</h2>
      </div>

      <div className="toolbar">
        <label>Window:&nbsp;
          <select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={180}>Last 180 days</option>
            <option value={365}>Last 12 months</option>
          </select>
        </label>
        <label>Threshold:&nbsp;
          <select value={threshold} onChange={(e) => setThreshold(parseInt(e.target.value, 10))}>
            <option value={50}>50%</option>
            <option value={60}>60% (default)</option>
            <option value={75}>75%</option>
            <option value={90}>90%</option>
          </select>
        </label>
      </div>

      {busy && <p>Loading…</p>}

      {data && (
        <table className="list">
          <thead>
            <tr>
              <th>{data.childLevel.replace('_', ' ')}</th>
              <th>Finalized Meetings</th>
              <th>With Supervisor</th>
              <th>Compliance %</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && <tr><td colSpan="5" className="muted">No subordinate units in this scope.</td></tr>}
            {data.rows.map((r) => (
              <tr key={r._id}>
                <td>{r.name}{r.code ? ` (${r.code})` : ''}</td>
                <td>{r.meetingsFinalized}</td>
                <td>{r.meetingsWithSupervisor}</td>
                <td>{r.compliancePct === null ? '—' : `${r.compliancePct}%`}</td>
                <td>
                  {r.compliancePct === null && <span className="muted">No data</span>}
                  {r.compliancePct !== null && (
                    r.breach
                      ? <span className="badge REJECTED">Below {data.threshold}%</span>
                      : <span className="badge ACTIVE">OK</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
