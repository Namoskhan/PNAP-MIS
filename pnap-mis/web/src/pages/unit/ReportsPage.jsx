import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useUnit } from '../../context/UnitContext';
import { api, errorMessage } from '../../api/client';
import { getCommitteeTierLabel, getRegularTierLabel } from '../../utils/unitFormat';

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
  const queryBody = new URLSearchParams(location.search).get('body');
  const isCommitteeView = queryBody === 'COMMITTEE';
  const { ctx } = useUnit();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [scope, setScope] = useState('subtree');
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
    setMemberId('');
    setReport(null);
    const bodyTarget = isCommitteeView ? 'COMMITTEE' : 'GENERAL_BODY';
    api.get('/meetings/eligible-attendees', {
      params: { unitLevel: ctx.unitLevel, unitId: ctx.unitId, body: bodyTarget },
    })
      .then((r) => setMembers(r.data.data || []))
      .catch(() => {
        const params = { status: 'ACTIVE', limit: 500 };
        if (ctx.unitLevel === 'BASIC_UNIT') params.basicUnitId = ctx.unitId;
        else if (ctx.unitLevel === 'AREA') params.areaId = ctx.unitId;
        else if (ctx.unitLevel === 'DISTRICT') params.districtId = ctx.unitId;
        else if (ctx.unitLevel === 'PROVINCE') params.provinceId = ctx.unitId;
        else if (ctx.unitLevel === 'CENTRAL') params.scope = 'all';
        api.get('/members', { params }).then((r) => setMembers(r.data.data || [])).catch(() => {});
      });
  }, [ctx, isCommitteeView]);

  function unitParams(kind) {
    const p = new URLSearchParams({ unitLevel: ctx.unitLevel, unitId: ctx.unitId });
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (ctx.unitLevel !== 'BASIC_UNIT' && scope) p.set('scope', scope);
    if (isCommitteeView) {
      p.set('body', 'COMMITTEE');
    } else {
      if (kind === 'meetings') {
        p.set('body', 'NON_COMMITTEE');
      } else if (kind === 'finance') {
        p.set('body', 'EXECUTIVE');
      }
    }
    return p.toString();
  }

  async function downloadUnit(kind, format) {
    setErr(''); setBusy(true);
    try {
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      const bodySuffix = isCommitteeView ? '-committee' : (kind === 'finance' ? '-executive' : '');
      const scopeSuffix = (ctx.unitLevel !== 'BASIC_UNIT' && scope === 'subtree') ? '-aggregated' : '';
      await downloadAuthed2(
        `/api/exports/unit/${kind}/${format}?${unitParams(kind)}`,
        `${ctx.unitLevel}-${ctx.unitName}-${kind}${bodySuffix}${scopeSuffix}.${ext}`,
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

  async function downloadMemberXlsx() {
    if (!memberId) return;
    setErr(''); setBusy(true);
    try {
      const p = new URLSearchParams();
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      await downloadAuthed2(
        `/api/exports/member/${memberId}/xlsx?${p.toString()}`,
        `member-${memberId}-performance.xlsx`,
      );
    } catch (e) { setErr('Export failed: ' + (e.message || 'unknown')); }
    finally { setBusy(false); }
  }

  if (!ctx) return <p>Select a unit context first.</p>;

  const committeeTier = getCommitteeTierLabel(ctx.unitLevel);
  const regularTier = getRegularTierLabel(ctx.unitLevel);

  const scopeDescription = isCommitteeView ? {
    BASIC_UNIT: 'Basic Unit Level (Direct unit records)',
    AREA: scope === 'subtree' ? 'Aggregated Elaqai Committee Report (Roll-up of all subordinate Basic Units + Elaqai Committee activities)' : 'Elaqai Committee Level Only (Records authored directly at Elaqai)',
    DISTRICT: scope === 'subtree' ? 'Aggregated Zilla Committee Report (Roll-up of all subordinate Elaqai Committees & Basic Units + Zilla Committee activities)' : 'Zilla Committee Level Only (Records authored directly at Zilla)',
    PROVINCE: scope === 'subtree' ? 'Aggregated Sobayi Committee Report (Roll-up of all subordinate Zilla, Elaqai Committees & Basic Units + Sobayi Committee activities)' : 'Sobayi Committee Level Only (Records authored directly at Sobayi)',
    CENTRAL: scope === 'subtree' ? 'Aggregated Central Committee Report (Nationwide roll-up across all subordinate Sobayi, Zilla, and Elaqai Committees)' : 'Central Committee Level Only (Records authored directly at Central)',
  }[ctx.unitLevel] || '' : {
    BASIC_UNIT: 'Basic Unit Level (Direct unit records)',
    AREA: scope === 'subtree' ? 'Aggregated Area Report (Roll-up of all subordinate Basic Units + Area activities)' : 'Area Level Only (Records authored directly at Area)',
    DISTRICT: scope === 'subtree' ? 'Aggregated District Report (Roll-up of all subordinate Areas & Basic Units + District activities)' : 'District Level Only (Records authored directly at District)',
    PROVINCE: scope === 'subtree' ? 'Aggregated Province Report (Roll-up of all subordinate Districts, Areas & Basic Units + Province activities)' : 'Province Level Only (Records authored directly at Province)',
    CENTRAL: scope === 'subtree' ? 'Aggregated Central Report (Nationwide roll-up across all subordinate tiers)' : 'Central Level Only (Records authored directly at Central)',
  }[ctx.unitLevel] || '';

  const pageTitle = isCommitteeView
    ? `${committeeTier ? `${committeeTier} Committee` : 'Committee'} Reports · ${ctx.unitName}`
    : `Reports · ${ctx.unitName}`;

  const meetingsReportTitle = isCommitteeView
    ? `${committeeTier ? `${committeeTier} Committee ` : 'Committee '}Meetings & Activities Report`
    : 'Meetings & Activities Report';

  const financeReportTitle = isCommitteeView
    ? `${committeeTier ? `${committeeTier} Committee ` : 'Committee '}Finance Report`
    : 'Finance Report';

  return (
    <div>
      <div className="page-header">
        <h2>{pageTitle}</h2>
      </div>

      {err && <div className="alert error">{err}</div>}

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Report Scope & Period Filter</h3>
        <div className="form-grid">
          {ctx.unitLevel !== 'BASIC_UNIT' && (
            <div className="field">
              <label>Data Aggregation Scope</label>
              <select value={scope} onChange={(e) => setScope(e.target.value)}>
                <option value="subtree">Aggregated (Include all subordinate units roll-up)</option>
                <option value="own">This unit tier only</option>
              </select>
            </div>
          )}
          <div className="field">
            <label>From Date</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field">
            <label>To Date</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        {scopeDescription && (
          <div style={{ marginTop: 10, fontSize: 13, color: 'var(--text-soft)', background: 'var(--surface-alt)', padding: '8px 12px', borderRadius: 'var(--radius)' }}>
            📊 <strong>Report Mode:</strong> {scopeDescription}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{meetingsReportTitle}</h3>
        <p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>
          {isCommitteeView
            ? 'Committee meetings (with embedded photos), committee activities, and committee responsibilities.'
            : 'Executive & General Body meetings (with embedded photos), executive activities, and responsibilities.'}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={() => downloadUnit('meetings', 'pdf')}>Download PDF</button>
          <button className="btn secondary" disabled={busy} onClick={() => downloadUnit('meetings', 'xlsx')}>Download Excel</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{financeReportTitle}</h3>
        <p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>
          {isCommitteeView
            ? 'Committee donations ledger, expenses ledger, and the committee net balance for the period.'
            : 'Executive donations ledger, expenses ledger, and the executive net balance for the period.'}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={() => downloadUnit('finance', 'pdf')}>Download PDF</button>
          <button className="btn secondary" disabled={busy} onClick={() => downloadUnit('finance', 'xlsx')}>Download Excel</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>{isCommitteeView ? 'Committee Member Performance Report' : 'Individual Performance Report'}</h3>
        <p className="muted" style={{ marginTop: -4, marginBottom: 10 }}>
          {isCommitteeView
            ? 'Performance scorecard and attendance report for committee members.'
            : 'Performance scorecard and attendance report for executive committee and subordinate members.'}
        </p>
        <div className="form-grid" style={{ alignItems: 'end' }}>
          <div className="field">
            <label>{isCommitteeView ? 'Committee Member' : 'Member'}</label>
            <select value={memberId} onChange={(e) => setMemberId(e.target.value)}>
              <option value="">— pick a member —</option>
              {members.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.fullName} · {m.memberId || m.cnic}{m.roleText ? ` (${m.roleText})` : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn" disabled={busy || !memberId} onClick={downloadMemberPdf}>Download PDF</button>
            <button className="btn secondary" disabled={busy || !memberId} onClick={downloadMemberXlsx}>Download Excel</button>
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
            </div>

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
