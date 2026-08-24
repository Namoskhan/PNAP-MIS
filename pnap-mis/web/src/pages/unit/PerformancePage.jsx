import { useEffect, useState } from 'react';
import { useUnit } from '../../context/UnitContext';
import { api, errorMessage } from '../../api/client';

import dialog from '../../components/dialog';
const PKR = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });

export default function PerformancePage() {
  const { ctx } = useUnit();
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!ctx) return;
    const params = { status: 'ACTIVE', limit: 500 };
    if (ctx.unitLevel === 'BASIC_UNIT') params.basicUnitId = ctx.unitId;
    else if (ctx.unitLevel === 'AREA') params.areaId = ctx.unitId;
    else if (ctx.unitLevel === 'DISTRICT') params.districtId = ctx.unitId;
    else if (ctx.unitLevel === 'PROVINCE') params.provinceId = ctx.unitId;
    // Central has no unit key on Member; scope:'all' is the explicit
    // opt-in the members endpoint requires when no unit filter is sent.
    else if (ctx.unitLevel === 'CENTRAL') params.scope = 'all';
    api.get('/members', { params }).then((r) => setMembers(r.data.data)).catch(() => {});
  }, [ctx]);

  async function load() {
    if (!memberId) return;
    setErr(''); setBusy(true); setReport(null);
    try {
      const params = {};
      if (from) params.from = from;
      if (to) params.to = to;
      const r = await api.get(`/performance/member/${memberId}`, { params });
      setReport(r.data.data);
    } catch (e) { setErr(errorMessage(e)); }
    finally { setBusy(false); }
  }

  function downloadPdf() {
    if (!memberId) return;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const tokenKey = 'pnap_token';
    const token = localStorage.getItem(tokenKey);
    fetch(`/api/exports/member/${memberId}/pdf?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (res) => {
      if (!res.ok) { dialog.alert('Export failed.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `member-${memberId}-performance.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });
  }

  function downloadXlsx() {
    if (!memberId) return;
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const tokenKey = 'pnap_token';
    const token = localStorage.getItem(tokenKey);
    fetch(`/api/exports/member/${memberId}/xlsx?${params.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (res) => {
      if (!res.ok) { dialog.alert('Export failed.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `member-${memberId}-performance.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });
  }

  if (!ctx) return <p>Select a unit context first.</p>;

  return (
    <div>
      <div className="page-header"><h2>Member Performance · {ctx.unitName}</h2></div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="form-grid">
          <div className="field">
            <label>Member</label>
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">— pick a member —</option>
              {members.map((m) => <option key={m._id} value={m._id}>{m.fullName} · {m.memberId || m.cnic}</option>)}
            </select>
          </div>
          <div className="field">
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="field" style={{ alignSelf: 'end' }}>
            <button className="btn" disabled={!memberId || busy} onClick={load}>{busy ? 'Loading…' : 'Generate'}</button>
          </div>
        </div>
      </div>

      {err && <div className="alert error">{err}</div>}

      {report && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ margin: 0 }}>{report.member.fullName}</h3>
                <div className="muted">{report.member.memberId} · CNIC {report.member.cnic} · {report.member.phone}</div>
                {report.roles?.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 13 }}>
                    Roles: {report.roles.map((r) => r.customRoleName || r.roleCode).join(', ')}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn secondary" onClick={downloadPdf}>Download PDF</button>
                <button className="btn secondary" onClick={downloadXlsx}>Download Excel</button>
              </div>
            </div>
          </div>

          <div className="kpi-grid">
            <Kpi label="Meetings on roster" value={report.meetings.totalRoster} />
            <Kpi label="Present" value={report.meetings.present} accent="good" />
            <Kpi label="Late" value={report.meetings.late} />
            <Kpi label="Absent" value={report.meetings.absent} accent={report.meetings.absent > 0 ? 'danger' : undefined} />
            {report.meetings.attendanceRate !== null && (
              <Kpi label="Attendance Rate" value={`${report.meetings.attendanceRate}%`} accent={report.meetings.attendanceRate >= 70 ? 'good' : 'danger'} />
            )}
            <Kpi label="Activities Participated" value={report.activities.participated} />
            <Kpi label="Activities Led" value={report.activities.led} />
            <Kpi label="Donations" value={PKR.format(report.donations.total)} sub={`${report.donations.count} donations`} />
            <Kpi label="Responsibilities Pending" value={report.responsibilities.pending} />
            <Kpi label="Responsibilities Completed" value={report.responsibilities.completed} accent="good" />
            {report.responsibilities.completionRate !== null && (
              <Kpi label="Completion Rate" value={`${report.responsibilities.completionRate}%`} accent={report.responsibilities.completionRate >= 70 ? 'good' : 'danger'} />
            )}
          </div>

          {report.studyContributions.length > 0 && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>Study Contributions</h3>
              <table className="list">
                <thead><tr><th>Date</th><th>Topic</th><th>Summary</th></tr></thead>
                <tbody>
                  {report.studyContributions.map((s, i) => (
                    <tr key={i}>
                      <td>{new Date(s.meetingDate).toLocaleDateString()}</td>
                      <td>{s.topic}</td>
                      <td>{s.summary}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
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
