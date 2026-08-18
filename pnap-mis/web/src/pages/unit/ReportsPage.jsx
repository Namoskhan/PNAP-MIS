import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUnit } from '../../context/UnitContext';
import { api, errorMessage } from '../../api/client';

const PKR = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });

// SRS §6.1 "view reports" + §13.2 + §15. Single hub for unit-level
// exports and per-member performance PDFs.
function downloadAuthed(path, filename) {
  const token = localStorage.getItem('pnap_token');
  return fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    .then(async (res) => {
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });
}

function downloadAuthed2(path, filename) {
  const token = localStorage.getItem('pnap_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  return fetch(path, { headers })
    .then(async (res) => {
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    });
}

export default function ReportsPage() {
  const location = useLocation();
  const initialBody = new URLSearchParams(location.search).get('body') === 'COMMITTEE' ? 'COMMITTEE' : '';
  const { ctx } = useUnit();
  const [body, setBody] = useState(initialBody);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Fetch the member's performance report whenever the member or
  // date range changes, so the Senior Mawin can preview before
  // downloading the PDF.
  useEffect(() => {
    if (!memberId) { setReport(null); return; }
    setReportLoading(true); setErr('');
    const params = {};
    if (from) params.from = from;
    if (to) params.to = to;
    api.get(`/performance/member/${memberId}`, { params })
      .then((r) => setReport(r.data.data))
      .catch((e) => { setReport(null); setErr(errorMessage(e)); })
      .finally(() => setReportLoading(false));
  }, [memberId, from, to]);

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

  function unitParams() {
    const p = new URLSearchParams({ unitLevel: ctx.unitLevel, unitId: ctx.unitId });
    if (from) p.set('from', from);
    if (to) p.set('to', to);
      if (typeof body !== 'undefined' && body) p.set('body', body);
      return p.toString();
    }

  async function downloadUnit(kind, format) {
    setErr(''); setBusy(true);
    try {
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      await downloadAuthed2(
        `/api/exports/unit/${kind}/${format}?${unitParams()}`,
              `${ctx.unitLevel}-${ctx.unitName}-${kind}${body ? `-${body.toLowerCase()}` : ''}.${ext}`,
      );
    } catch (e) { setErr('Export failed: ' + (e.message || 'unknown')); }
    finally { setBusy(false); }
  }

  async function downloadMemberPdf() {
    if (!memberId) return;
    setErr(''); setBusy(true);
    try {
      const p = new URLSearchParams();
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      await downloadAuthed2(
        `/api/exports/member/${memberId}/pdf?${p.toString()}`,
        `member-${memberId}-performance.pdf`,
      );
    } catch (e) { setErr('Export failed: ' + (e.message || 'unknown')); }
    finally { setBusy(false); }
  }

  if (!ctx) return <p>Select a unit context first.</p>;

  return (
    <div>
      <div className="page-header"><h2>Reports · {ctx.unitName}</h2></div>

      {err && <div className="alert error">{err}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Date range (optional)</h3>
        <div className="form-grid">
          <div className="field">
            <label>From</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>To</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{body === 'COMMITTEE' ? 'Committee Meetings & Activities Report' : 'Meetings & Activities Report'}</h3>
        <p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>
          Roster, meetings (with embedded photos), activities, and pending/completed responsibilities.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={() => downloadUnit('meetings', 'pdf')}>Download PDF</button>
          <button className="btn secondary" disabled={busy} onClick={() => downloadUnit('meetings', 'xlsx')}>Download Excel</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{body === 'COMMITTEE' ? 'Committee Finance Report' : 'Finance Report'}</h3>
        <p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>
          Donations ledger, expenses ledger, and the unit's net balance for the period.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={() => downloadUnit('finance', 'pdf')}>Download PDF</button>
          <button className="btn secondary" disabled={busy} onClick={() => downloadUnit('finance', 'xlsx')}>Download Excel</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Individual Performance Report</h3>
        <div className="form-grid" style={{ alignItems: 'end' }}>
          <div className="field">
            <label>Member</label>
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">— pick a member —</option>
              {members.map((m) => <option key={m._id} value={m._id}>{m.fullName} · {m.memberId || m.cnic}</option>)}
            </select>
          </div>
          <div className="field">
            <button className="btn" disabled={busy || !memberId} onClick={downloadMemberPdf}>Download PDF</button>
          </div>
        </div>

        {memberId && reportLoading && <p className="muted" style={{ marginTop: 14 }}>Loading preview…</p>}
        {memberId && !reportLoading && report && (
          <div style={{ marginTop: 18, paddingTop: 18, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              {report.member.photoUrl
                ? <img src={report.member.photoUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                : <div style={{ width: 64, height: 64, borderRadius: 8, background: 'var(--surface-alt)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: 'var(--muted)' }}>
                    {(report.member.fullName || '?').charAt(0).toUpperCase()}
                  </div>}
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{report.member.fullName}</div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {report.member.memberId || '—'} · {report.member.cnic}
                  {report.member.phone && <> · {report.member.phone}</>}
                </div>
                {report.roles?.length > 0 && (
                  <div style={{ marginTop: 4, fontSize: 12 }}>
                    {report.roles.map((r, i) => (
                      <span key={i} className="badge ACTIVE" style={{ marginRight: 4 }}>
                        {r.customRoleName || r.roleCode} @ {r.unitLevel}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="kpi-grid">
              <div className="kpi">
                <div className="label">Meetings (roster)</div>
                <div className="value">{report.meetings.totalRoster}</div>
                <div className="hint">finalized in range</div>
              </div>
              <div className="kpi kpi-good">
                <div className="label">Present</div>
                <div className="value">{report.meetings.present}</div>
                {report.meetings.late > 0 && <div className="hint">+{report.meetings.late} late</div>}
              </div>
              <div className="kpi kpi-danger">
                <div className="label">Absent</div>
                <div className="value">{report.meetings.absent}</div>
              </div>
              <div className="kpi">
                <div className="label">Attendance Rate</div>
                <div className="value">{report.meetings.attendanceRate != null ? `${report.meetings.attendanceRate}%` : '—'}</div>
              </div>
              <div className="kpi">
                <div className="label">Activities</div>
                <div className="value">{report.activities.participated}</div>
                <div className="hint">{report.activities.led} led</div>
              </div>
              <div className="kpi">
                <div className="label">Donations Collected</div>
                <div className="value">{PKR.format(report.donations.total)}</div>
                <div className="hint">{report.donations.count} entries</div>
              </div>
              <div className="kpi">
                <div className="label">Responsibilities</div>
                <div className="value">{report.responsibilities.completed}/{report.responsibilities.total}</div>
                <div className="hint">{report.responsibilities.completionRate != null ? `${report.responsibilities.completionRate}% done` : '—'} · {report.responsibilities.pending} pending</div>
              </div>
              <div className="kpi">
                <div className="label">Study Contributions</div>
                <div className="value">{report.studyContributions?.length || 0}</div>
                <div className="hint">study-circle talks</div>
              </div>
            </div>

            {report.studyContributions?.length > 0 && (
              <>
                <h4 style={{ marginTop: 16, marginBottom: 8 }}>Study Circle Contributions</h4>
                <table className="list">
                  <thead>
                    <tr><th>Date</th><th>Meeting</th><th>Topic</th><th>Summary</th></tr>
                  </thead>
                  <tbody>
                    {report.studyContributions.map((s, i) => (
                      <tr key={i}>
                        <td>{s.meetingDate ? new Date(s.meetingDate).toLocaleDateString() : '—'}</td>
                        <td>{s.meetingTitle || '—'}</td>
                        <td>{s.topic || '—'}</td>
                        <td>{s.summary || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {(report.range.from || report.range.to) && (
              <p className="muted" style={{ marginTop: 12, fontSize: 12 }}>
                Range: {report.range.from || '—'} → {report.range.to || 'today'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
