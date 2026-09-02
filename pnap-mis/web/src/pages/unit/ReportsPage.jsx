import { useEffect, useState, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useUnit } from '../../context/UnitContext';
import { useAuth } from '../../context/AuthContext';
import { api, errorMessage } from '../../api/client';
import { getCommitteeTierLabel, getRegularTierLabel } from '../../utils/unitFormat';
import UnitSwitcher from '../../components/UnitSwitcher';
import { CongressIcon } from '../../components/icons';

const PKR = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });

function downloadAuthed(path, filename) {
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
  const isCongressView = queryBody === 'CONGRESS';
  const isJirgaView = queryBody === 'JIRGA';
  const isCommitteeView = queryBody === 'COMMITTEE';
  const { user, setActiveRole, allRoles } = useAuth();
  const { ctx, setCtx, provinces, districts, areas, units } = useUnit();

  function handleSwitchToCentral() {
    const rolesList = allRoles || user?.allRoles || user?.roles || [];
    const isSuper = rolesList.includes('SUPER_ADMIN') || user?.isBootstrap;
    const isCentral = rolesList.includes('CENTRAL_ADMIN');
    if (isSuper && setActiveRole) {
      setActiveRole('SUPER_ADMIN');
    } else if (isCentral && setActiveRole) {
      setActiveRole('CENTRAL_ADMIN');
    }
    api.get('/org/central')
      .then((r) => setCtx({ unitLevel: 'CENTRAL', unitId: r.data.data._id, unitName: r.data.data.name || 'PKNAP Central' }))
      .catch(() => setCtx({ unitLevel: 'CENTRAL', unitId: 'CENTRAL', unitName: 'PKNAP Central' }));
  }

  const [showSwitcher, setShowSwitcher] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [scope, setScope] = useState('subtree');
  const [members, setMembers] = useState([]);
  const [memberId, setMemberId] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Quick date presets
  function applyDatePreset(preset) {
    const now = new Date();
    if (preset === 'THIS_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setFrom(start.toISOString().split('T')[0]);
      setTo(end.toISOString().split('T')[0]);
    } else if (preset === 'LAST_MONTH') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      setFrom(start.toISOString().split('T')[0]);
      setTo(end.toISOString().split('T')[0]);
    } else if (preset === '30_DAYS') {
      const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      setFrom(start.toISOString().split('T')[0]);
      setTo(now.toISOString().split('T')[0]);
    } else if (preset === 'YTD') {
      const start = new Date(now.getFullYear(), 0, 1);
      setFrom(start.toISOString().split('T')[0]);
      setTo(now.toISOString().split('T')[0]);
    } else if (preset === 'CLEAR') {
      setFrom('');
      setTo('');
    }
  }

  // Fetch the member's performance report whenever the member or date range changes
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
    const bodyTarget = isCongressView ? 'CONGRESS' : (isJirgaView ? 'JIRGA' : (isCommitteeView ? 'COMMITTEE' : 'GENERAL_BODY'));
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
  }, [ctx, isCommitteeView, isJirgaView, isCongressView]);

  function unitParams(kind) {
    if (!ctx) return '';
    const p = new URLSearchParams({ unitLevel: ctx.unitLevel, unitId: ctx.unitId });
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    if (ctx.unitLevel === 'BASIC_UNIT') {
      p.set('scope', 'own');
    } else if (!isCongressView && scope) {
      p.set('scope', scope);
    }
    if (isCongressView) {
      p.set('body', 'CONGRESS');
      p.set('scope', 'own');
    } else if (isJirgaView) {
      p.set('body', 'JIRGA');
    } else if (isCommitteeView) {
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
    if (!ctx) return;
    setErr(''); setBusy(true);
    try {
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      const bodySuffix = isCongressView ? '-congress' : (isJirgaView ? '-jirga' : (isCommitteeView ? '-committee' : (kind === 'finance' ? '-executive' : '')));
      const scopeSuffix = (ctx.unitLevel !== 'BASIC_UNIT' && !isCongressView && scope === 'subtree') ? '-aggregated' : '';
      const safeUnit = (ctx.unitName || ctx.unitLevel).replace(/[^a-zA-Z0-9_-]/g, '_');
      await downloadAuthed(
        `/api/exports/unit/${kind}/${format}?${unitParams(kind)}`,
        `${ctx.unitLevel}-${safeUnit}-${kind}${bodySuffix}${scopeSuffix}.${ext}`,
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
      await downloadAuthed(
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
      await downloadAuthed(
        `/api/exports/member/${memberId}/xlsx?${p.toString()}`,
        `member-${memberId}-performance.xlsx`,
      );
    } catch (e) { setErr('Export failed: ' + (e.message || 'unknown')); }
    finally { setBusy(false); }
  }

  if (!ctx) {
    return (
      <div style={{ maxWidth: 800, margin: '20px auto' }}>
        <UnitSwitcher />
      </div>
    );
  }

  // If user opened Congress stream but is below Central tier, show guidance card
  if (isCongressView && ctx?.unitLevel !== 'CENTRAL') {
    return (
      <div>
        <div className="page-header">
          <h2>National Congress Reports · قومي کانګرس</h2>
        </div>
        <div className="card" style={{ maxWidth: 680, margin: '20px auto', textAlign: 'center', padding: '32px 24px' }}>
          <div style={{ display: 'inline-flex', padding: 14, borderRadius: '50%', background: 'var(--surface-alt)', marginBottom: 16 }}>
            <CongressIcon size={36} />
          </div>
          <h3 style={{ marginTop: 0 }}>National Congress operates exclusively at the Central Level</h3>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            Under the PKNAP constitution, the <strong>National Congress (قومي کانګرس)</strong> is the supreme representative assembly operating at the Central tier. Lower tiers operate via <strong>Sobayi Jirga</strong> (Province) and <strong>Zilla &amp; Elaqayi Committees</strong> (District &amp; Area).
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 24, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              onClick={handleSwitchToCentral}
            >
              Switch to Central Unit Context →
            </button>
          </div>
        </div>
      </div>
    );
  }

  const committeeTier = getCommitteeTierLabel(ctx.unitLevel);
  const committeeTierFormatted = committeeTier
    ? (committeeTier.toLowerCase().endsWith('committee') ? committeeTier : `${committeeTier} Committee`)
    : 'Committee';
  const jirgaTier = ctx.unitLevel === 'CENTRAL' ? 'Qomi Jirga' : 'Sobayi Jirga';
  const hasSubordinates = ctx.unitLevel !== 'BASIC_UNIT';

  const scopeDescription = isCongressView ? (
    'National Congress Assembly Records (Central)'
  ) : (isJirgaView ? (
    scope === 'subtree' ? `Aggregated ${jirgaTier} Report (Including all subordinate tiers)` : `${jirgaTier} Direct Records Only`
  ) : (isCommitteeView ? {
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
  }[ctx.unitLevel] || ''));

  const pageTitle = isCongressView
    ? 'National Congress Reports · PKNAP Central'
    : (isJirgaView
      ? `${jirgaTier} Reports · ${ctx.unitName}`
      : (isCommitteeView
      ? `${committeeTierFormatted} Reports · ${ctx.unitName}`
      : `Reports · ${ctx.unitName}`));

  const meetingsReportTitle = isCongressView
    ? 'National Congress Meetings & Activities Report'
    : (isJirgaView
      ? `${jirgaTier} Meetings & Activities Report`
      : (isCommitteeView
      ? `${committeeTierFormatted} Meetings & Activities Report`
      : 'Meetings & Activities Report'));

  const financeReportTitle = isCongressView
    ? 'National Congress Finance Report'
    : (isJirgaView
      ? `${jirgaTier} Finance Report`
      : (isCommitteeView
      ? `${committeeTierFormatted} Finance Report`
      : 'Finance Report'));

  return (
    <div>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>{pageTitle}</h2>
          <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
            Active Tier: <strong>{ctx.unitLevel.replace('_', ' ')}</strong> · Unit: <strong>{ctx.unitName}</strong>
          </div>
        </div>
        {!isCongressView && (
          <button
            type="button"
            className="btn secondary"
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
            onClick={() => setShowSwitcher((v) => !v)}
          >
            <span>🔄</span>
            <span>{showSwitcher ? 'Hide Unit Switcher' : 'Switch Unit Context'}</span>
          </button>
        )}
      </div>

      {/* Unit Switcher Collapsible Card */}
      {showSwitcher && (
        <div style={{ marginBottom: 16 }}>
          <UnitSwitcher />
        </div>
      )}

      {err && <div className="alert error" style={{ marginBottom: 16 }}>{err}</div>}

      {/* Scope & Date Filter Card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Report Scope &amp; Period Filter</h3>

        {hasSubordinates && !isCongressView && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
              Data Aggregation Scope
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`btn ${scope === 'subtree' ? '' : 'secondary'}`}
                style={{ flex: 1, minWidth: 240, textAlign: 'center', padding: '10px 16px' }}
                onClick={() => setScope('subtree')}
              >
                📊 <strong>Aggregated</strong> (Include all subordinate units roll-up)
              </button>
              <button
                type="button"
                className={`btn ${scope === 'own' ? '' : 'secondary'}`}
                style={{ flex: 1, minWidth: 200, textAlign: 'center', padding: '10px 16px' }}
                onClick={() => setScope('own')}
              >
                🏢 <strong>This Unit Tier Only</strong> (Direct unit records)
              </button>
            </div>
          </div>
        )}

        {/* Quick Date Presets */}
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Quick Date Range</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => applyDatePreset('THIS_MONTH')}>This Month</button>
            <button type="button" className="btn secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => applyDatePreset('LAST_MONTH')}>Last Month</button>
            <button type="button" className="btn secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => applyDatePreset('30_DAYS')}>Last 30 Days</button>
            <button type="button" className="btn secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => applyDatePreset('YTD')}>Year to Date</button>
            <button type="button" className="btn secondary" style={{ fontSize: 12, padding: '4px 10px', color: 'var(--danger)' }} onClick={() => applyDatePreset('CLEAR')}>Clear Dates</button>
          </div>
        </div>

        <div className="form-grid">
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
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-soft)', background: 'var(--surface-alt)', padding: '10px 14px', borderRadius: 'var(--radius)', borderLeft: '4px solid var(--primary)' }}>
            📊 <strong>Report Mode:</strong> {scopeDescription}
          </div>
        )}
      </div>

      {/* Meetings & Activities Report Card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{meetingsReportTitle}</h3>
        <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
          {isCongressView
            ? 'National Congress meetings (with embedded photos), congress activities, and responsibilities.'
            : (isCommitteeView
              ? 'Committee meetings (with embedded photos), committee activities, and committee responsibilities.'
              : 'Executive & General Body meetings (with embedded photos), executive activities, and responsibilities.')}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={() => downloadUnit('meetings', 'pdf')}>Download PDF</button>
          <button className="btn secondary" disabled={busy} onClick={() => downloadUnit('meetings', 'xlsx')}>Download Excel</button>
        </div>
      </div>

      {/* Activities-Only Report Card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Activities &amp; Field Operations Report</h3>
        <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
          Detailed record of public events, protests, membership drives, door-to-door campaigns, and field initiatives with GPS verification.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={() => downloadUnit('activities', 'pdf')}>Download PDF</button>
          <button className="btn secondary" disabled={busy} onClick={() => downloadUnit('activities', 'xlsx')}>Download Excel</button>
        </div>
      </div>

      {/* Finance Report Card */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{financeReportTitle}</h3>
        <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
          {isCongressView
            ? 'National Congress donations ledger, expenses ledger, and congress net balance for the period.'
            : (isCommitteeView
              ? 'Committee donations ledger, expenses ledger, and the committee net balance for the period.'
              : 'Executive donations ledger, expenses ledger, fund transfers, and net balance for the period.')}
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" disabled={busy} onClick={() => downloadUnit('finance', 'pdf')}>Download PDF</button>
          <button className="btn secondary" disabled={busy} onClick={() => downloadUnit('finance', 'xlsx')}>Download Excel</button>
        </div>
      </div>

      {/* Member Performance Report Card */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>
          {isCongressView ? 'Congress Member Performance Report' : (isCommitteeView ? 'Committee Member Performance Report' : 'Individual Performance Report')}
        </h3>
        <p className="muted" style={{ marginTop: -4, marginBottom: 12 }}>
          {isCongressView
            ? 'Performance scorecard and attendance report for National Congress members.'
            : (isCommitteeView
              ? 'Performance scorecard and attendance report for committee members.'
              : 'Performance scorecard and attendance report for executive committee and subordinate members.')}
        </p>
        <div className="form-grid" style={{ alignItems: 'end' }}>
          <div className="field">
            <label>{isCongressView ? 'Congress Member' : (isCommitteeView ? 'Committee Member' : 'Member')}</label>
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
