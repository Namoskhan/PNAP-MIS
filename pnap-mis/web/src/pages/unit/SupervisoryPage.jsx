import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useUnit } from '../../context/UnitContext';
import { api } from '../../api/client';

export default function SupervisoryPage() {
  const { t } = useTranslation();
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

  if (!ctx) return <p>{t('common.selectUnitContext', 'Select a unit context first.')}</p>;
  if (ctx.unitLevel === 'BASIC_UNIT') return <p className="muted">{t('supervisory.noLevelBelowBasicUnit', 'Basic Units have no level below them to supervise.')}</p>;

  return (
    <div>
      <div className="page-header">
        <h2>{t('supervisory.complianceTitle', 'Supervisory Compliance · {{unitName}}', { unitName: ctx.unitName })}</h2>
      </div>

      <div className="toolbar">
        <label>{t('supervisory.window', 'Window:')}&nbsp;
          <select value={days} onChange={(e) => setDays(parseInt(e.target.value, 10))}>
            <option value={30}>{t('dates.last30Days', 'Last 30 days')}</option>
            <option value={90}>{t('dates.last90Days', 'Last 90 days')}</option>
            <option value={180}>{t('dates.last180Days', 'Last 180 days')}</option>
            <option value={365}>{t('dates.last12Months', 'Last 12 months')}</option>
          </select>
        </label>
        <label>{t('supervisory.threshold', 'Threshold:')}&nbsp;
          <select value={threshold} onChange={(e) => setThreshold(parseInt(e.target.value, 10))}>
            <option value={50}>50%</option>
            <option value={60}>{t('supervisory.defaultThreshold', '60% (default)')}</option>
            <option value={75}>75%</option>
            <option value={90}>90%</option>
          </select>
        </label>
      </div>

      {busy && <p>{t('common.loading', 'Loading…')}</p>}

      {data && (
        <table className="list">
          <thead>
            <tr>
              <th>{data.childLevel ? data.childLevel.replace('_', ' ') : t('supervisory.subordinateLevel', 'Subordinate Unit')}</th>
              <th>{t('supervisory.finalizedMeetings', 'Finalized Meetings')}</th>
              <th>{t('supervisory.withSupervisor', 'With Supervisor')}</th>
              <th>{t('supervisory.compliancePct', 'Compliance %')}</th>
              <th>{t('common.status', 'Status')}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && <tr><td colSpan="5" className="muted">{t('supervisory.noSubordinateUnitsInScope', 'No subordinate units in this scope.')}</td></tr>}
            {data.rows.map((r) => (
              <tr key={r._id}>
                <td>{r.name}{r.code ? ` (${r.code})` : ''}</td>
                <td>{r.meetingsFinalized}</td>
                <td>{r.meetingsWithSupervisor}</td>
                <td>{r.compliancePct === null ? '—' : `${r.compliancePct}%`}</td>
                <td>
                  {r.compliancePct === null && <span className="muted">{t('common.noData', 'No data')}</span>}
                  {r.compliancePct !== null && (
                    r.breach
                      ? <span className="badge REJECTED">{t('supervisory.belowThreshold', 'Below {{threshold}}%', { threshold: data.threshold })}</span>
                      : <span className="badge ACTIVE">{t('common.ok', 'OK')}</span>
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
