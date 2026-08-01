import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { useUnit } from '../../context/UnitContext';

export default function NationalPage() {
  const { setCtx } = useUnit();
  const [congress, setCongress] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/central/congress').then((r) => r.data.data),
      api.get('/central/alerts').then((r) => r.data.data),
    ]).then(([c, a]) => { setCongress(c); setAlerts(a); }).finally(() => setBusy(false));
  }, []);

  function jumpToCentral() {
    setCtx({ unitLevel: 'CENTRAL', unitId: 'CENTRAL', unitName: 'Central' });
  }

  if (busy) return <p>Loading…</p>;
  if (!congress) return <p>No data.</p>;

  const c = congress.composition;
  const s = congress.structure;
  const totalCongress = c.centralCabinetSize + c.provincialOfficeholders + c.districtOfficeholders + c.areaOfficeholders + c.activeMembers;

  return (
    <div>
      <div className="page-header">
        <h2>National Congress / Qomi Jirga</h2>
        <Link className="btn secondary" to="/unit" onClick={jumpToCentral}>Open Central Unit Dashboard →</Link>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Country-Wide Structure</h3>
        <div className="kpi-grid">
          <div className="kpi"><div className="label">Provinces</div><div className="value">{s.provinces}</div></div>
          <div className="kpi"><div className="label">Districts</div><div className="value">{s.districts}</div></div>
          <div className="kpi"><div className="label">Areas</div><div className="value">{s.areas}</div></div>
          <div className="kpi"><div className="label">Basic Units</div><div className="value">{s.basicUnits}</div></div>
          <div className="kpi"><div className="label">Active Members</div><div className="value">{c.activeMembers.toLocaleString()}</div></div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>National Congress Composition</h3>
        <p className="hint" style={{ marginTop: 0 }}>
          Per SRS §3.2.5, the National Congress is the supreme body comprising the
          Central Cabinet, all Provincial / District / Area committees, and every
          registered party worker.
        </p>
        <table className="list">
          <thead><tr><th>Body</th><th style={{ textAlign: 'right' }}>Members</th></tr></thead>
          <tbody>
            <tr><td>Central Cabinet</td><td style={{ textAlign: 'right' }}>{c.centralCabinetSize}</td></tr>
            <tr><td>Provincial Presidents & General Secretaries</td><td style={{ textAlign: 'right' }}>{c.provincialOfficeholders}</td></tr>
            <tr><td>District Secretaries & Senior Mawins</td><td style={{ textAlign: 'right' }}>{c.districtOfficeholders}</td></tr>
            <tr><td>Area Secretaries & Senior Mawins</td><td style={{ textAlign: 'right' }}>{c.areaOfficeholders}</td></tr>
            <tr><td>All registered active members</td><td style={{ textAlign: 'right' }}>{c.activeMembers.toLocaleString()}</td></tr>
            <tr style={{ fontWeight: 700, background: 'var(--surface-alt)' }}>
              <td>Total Eligible</td>
              <td style={{ textAlign: 'right' }}>{totalCongress.toLocaleString()}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>Central Cabinet</h3>
        {congress.centralCabinet.length === 0 && (
          <p className="muted">Central cabinet has not been formed yet. Switch unit context to <strong>Central</strong> and use Cabinet & Roles to assign Chairman, Co-Chairman, Secretary General, etc.</p>
        )}
        {congress.centralCabinet.length > 0 && (
          <table className="list">
            <thead><tr><th>Role</th><th>Member</th><th>Member ID</th><th>Phone</th></tr></thead>
            <tbody>
              {congress.centralCabinet.map((c) => (
                <tr key={c._id}>
                  <td><strong>{c.roleCode}</strong>{c.customRoleName ? ` (${c.customRoleName})` : ''}</td>
                  <td>{c.memberId?.fullName}</td>
                  <td>{c.memberId?.memberId || '—'}</td>
                  <td>{c.memberId?.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>National Alerts</h3>
        {alerts.length === 0 && <p className="muted">No active alerts. The party is in good standing.</p>}
        {alerts.length > 0 && (
          <ul style={{ paddingLeft: 18 }}>
            {alerts.map((a, i) => (
              <li key={i} style={{ marginBottom: 6 }}>
                <span className={`badge ${a.severity === 'WARN' ? 'PENDING' : 'ACTIVE'}`} style={{ marginRight: 8 }}>{a.severity}</span>
                <strong>{a.kind}:</strong> {a.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
