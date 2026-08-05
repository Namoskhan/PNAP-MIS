import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { SkeletonCard } from '../Skeleton';
import { Donut, PctBar } from '../charts';
import { InfoIcon } from '../icons';
import useAnalytics from './useAnalytics';

// Performance reporting inside the Reports section.
//
// Two reports, both driven by the SAME PerformanceRuleSet the unit
// dashboard's Member Performance page already uses — so a score here
// and a score there mean the same thing:
//
//   • Unit report   — the current scope (Province / District / Area /
//                     Basic Unit) scored 0–100, with the weighted
//                     contribution of each metric, plus a member
//                     leaderboard.
//   • Member report — one member's attendance, activities, donations,
//                     responsibilities and study contributions, with
//                     the existing PDF export.
//
// The unit is taken from the dashboard's scope rather than a second
// picker of its own: a report that disagreed with the breadcrumb above
// it would be worse than no report.

const PKR = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });

const LEVEL_LABEL = {
  CENTRAL: 'Central (National)', PROVINCE: 'Province',
  DISTRICT: 'District', AREA: 'Area', BASIC_UNIT: 'Basic Unit',
};

function scoreColor(v) {
  if (v == null) return 'var(--muted)';
  if (v >= 70) return 'var(--success)';
  if (v >= 40) return 'var(--warning)';
  return 'var(--danger)';
}

// ─── Unit performance ─────────────────────────────────────────────

function UnitPerformance({ unitLevel, unitId, from, to }) {
  const params = useMemo(() => {
    const p = { unitLevel };
    if (unitId) p.unitId = unitId;
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [unitLevel, unitId, from, to]);

  const { data, loading, error } = useAnalytics('/performance/unit', params);

  if (loading && !data) return <SkeletonCard lines={5} />;
  if (error) {
    return (
      <div className="alert error">
        {error}
        {/NO_RULESET|ruleset/i.test(error) && (
          <div style={{ marginTop: 6, fontSize: 13 }}>
            Scoring needs an active performance ruleset —{' '}
            <Link to="/admin/units/performance-rulesets">configure one</Link>.
          </div>
        )}
      </div>
    );
  }
  if (!data) return null;

  const noUnitEquivalent = (data.components || []).filter((c) => c.error === 'NO_UNIT_EQUIVALENT');

  return (
    <>
      <div className="dash-grid-3-2">
        <div className="chart-card">
          <div className="chart-card-head">
            <div>
              <div className="chart-card-title">{data.unit.name}</div>
              <div className="chart-card-sub">
                {LEVEL_LABEL[data.unit.level] || data.unit.level} ·{' '}
                {data.memberCount.toLocaleString()} active members ·{' '}
                ruleset “{data.ruleset.name}”
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, paddingTop: 4 }}>
            {(data.components || []).map((c) => (
              <div key={c.metric}>
                <PctBar
                  value={c.raw}
                  label={`${c.label || c.metric.replace(/_/g, ' ').toLowerCase()} · weight ${Math.round((c.weight || 0) * 100)}%`}
                />
                {c.detail && (
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    {c.metric === 'MEETING_ATTENDANCE'
                      && `${c.detail.attended} of ${c.detail.roster} seats filled across ${c.detail.meetings} finalized meeting${c.detail.meetings === 1 ? '' : 's'}`}
                    {c.metric === 'ACTIVITY_PARTICIPATION'
                      && `${c.detail.engaged} of ${c.detail.members} members took part in an activity`}
                    {c.metric === 'RESPONSIBILITY_COMPLETION'
                      && `${c.detail.completed} of ${c.detail.total} assigned responsibilities completed`}
                    {c.metric === 'DONATION_CONTRIBUTION'
                      && `${PKR.format(c.detail.total || 0)} total · ${PKR.format(c.detail.perMember || 0)} per member against a ${PKR.format(c.detail.cap || 0)} cap`}
                    {c.metric === 'STUDY_CONTRIBUTION'
                      && `${c.detail.contributors} of ${c.detail.members} members contributed to a study circle`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="chart-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="chart-card-head">
            <div>
              <div className="chart-card-title">Composite score</div>
              <div className="chart-card-sub">Weighted across all metrics</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '6px 0' }}>
            <Donut
              percent={Math.round(data.totalScore)}
              label="score"
              size={124}
              stroke={14}
              color={scoreColor(data.totalScore)}
              trackColor="var(--surface-alt)"
            />
          </div>
          <div className="muted" style={{ fontSize: 11.5, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            Same 0–100 scale as the individual member scores below, so a unit
            can be read against the people in it.
          </div>
        </div>
      </div>

      {noUnitEquivalent.length > 0 && (
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          <InfoIcon size={12} />{' '}
          {noUnitEquivalent.map((c) => c.metric).join(', ')} has no unit-level
          equivalent and was excluded rather than scored zero.
        </p>
      )}
    </>
  );
}

// ─── Member leaderboard ───────────────────────────────────────────

function MemberLeaderboard({ unitLevel, unitId, from, to, onPick }) {
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [unitLevel, unitId, from, to]);

  const params = useMemo(() => {
    const p = { unitLevel, page, limit: 10 };
    if (unitId) p.unitId = unitId;
    if (from) p.from = from;
    if (to) p.to = to;
    return p;
  }, [unitLevel, unitId, from, to, page]);

  const { data, loading, error } = useAnalytics('/performance/unit/members', params);

  if (error) return <div className="alert error">{error}</div>;

  return (
    <div className="chart-card" style={{ marginTop: 10 }}>
      <div className="chart-card-head">
        <div>
          <div className="chart-card-title">Member scores</div>
          <div className="chart-card-sub">
            Ranked within this page — scoring every member of a large unit at once
            is too expensive, so the list pages instead
          </div>
        </div>
        <div className="chart-card-meta">{(data?.total || 0).toLocaleString()} members</div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="list">
          <thead>
            <tr>
              <th>Member</th>
              <th style={{ textAlign: 'right' }}>Score</th>
              <th>Report</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && <tr><td colSpan="3" className="muted">Scoring members…</td></tr>}
            {data && data.items.length === 0 && (
              <tr><td colSpan="3" className="muted">No active members in this scope.</td></tr>
            )}
            {(data?.items || []).map((m) => (
              <tr key={m._id}>
                <td>
                  <strong>{m.fullName}</strong>
                  <div className="muted" style={{ fontSize: 12 }}>{m.memberCode || '—'}</div>
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: scoreColor(m.totalScore) }}>
                  {m.totalScore == null ? '—' : m.totalScore}
                </td>
                <td>
                  <button type="button" className="btn ghost sm" onClick={() => onPick(m._id)}>
                    View report
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data && data.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, gap: 10 }}>
          <span className="muted" style={{ fontSize: 12 }}>Page {data.page} of {data.pages}</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" className="btn secondary sm" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>← Prev</button>
            <button type="button" className="btn secondary sm" disabled={loading || page >= data.pages} onClick={() => setPage(page + 1)}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Individual member report ─────────────────────────────────────

function MemberReport({ memberId, from, to, onClear }) {
  const [report, setReport] = useState(null);
  const [score, setScore] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!memberId) { setReport(null); setScore(null); return undefined; }
    let alive = true;
    setBusy(true);
    setErr('');
    const p = {};
    if (from) p.from = from;
    if (to) p.to = to;
    Promise.all([
      api.get(`/performance/member/${memberId}`, { params: p }),
      // The weighted score is a separate endpoint and may 404 when no
      // ruleset is active — that must not blank the raw report.
      api.get(`/performance/member/${memberId}/score`, { params: p }).catch(() => null),
    ]).then(([r, s]) => {
      if (!alive) return;
      setReport(r.data.data);
      setScore(s?.data?.data || null);
    }).catch((e) => { if (alive) setErr(errorMessage(e)); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [memberId, from, to]);

  function downloadPdf() {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    const token = localStorage.getItem('pnap_token');
    // Same export the unit Performance page uses — a Bearer token
    // can't ride on a plain <a href>, so fetch then object-URL.
    fetch(`/api/exports/member/${memberId}/pdf?${qs.toString()}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then(async (res) => {
      if (!res.ok) { setErr('Export failed.'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `member-${memberId}-performance.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }).catch(() => setErr('Export failed.'));
  }

  if (!memberId) return null;
  if (busy && !report) return <SkeletonCard lines={5} />;
  if (err) return <div className="alert error">{err}</div>;
  if (!report) return null;

  const m = report.member;
  const stat = (label, value, sub) => (
    <div key={label}>
      <div className="muted" style={{ fontSize: 11.5 }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {sub && <div className="muted" style={{ fontSize: 11 }}>{sub}</div>}
    </div>
  );

  return (
    <div className="chart-card" style={{ marginTop: 10 }}>
      <div className="chart-card-head">
        <div>
          <div className="chart-card-title">{m.fullName}</div>
          <div className="chart-card-sub">
            {m.memberId || '—'}
            {m.phone ? ` · ${m.phone}` : ''}
            {report.roles?.length > 0 && ` · ${report.roles.map((r) => r.customRoleName || r.roleCode).join(', ')}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {score && (
            <span className="dash-section-badge" style={{ color: scoreColor(score.totalScore) }}>
              Score {score.totalScore}
            </span>
          )}
          <button type="button" className="btn secondary sm" onClick={downloadPdf}>Download PDF</button>
          <Link className="btn ghost sm" to={`/members/${m._id}`}>Profile</Link>
          <button type="button" className="btn ghost sm" onClick={onClear}>Close</button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12, paddingTop: 4,
      }}>
        {stat('Meetings on roster', report.meetings.totalRoster)}
        {stat('Present', report.meetings.present)}
        {stat('Late', report.meetings.late)}
        {stat('Absent', report.meetings.absent)}
        {stat('Attendance rate', report.meetings.attendanceRate == null ? '—' : `${report.meetings.attendanceRate}%`)}
        {stat('Activities participated', report.activities.participated)}
        {stat('Activities led', report.activities.led)}
        {stat('Donations', PKR.format(report.donations.total), `${report.donations.count} received`)}
        {stat('Responsibilities done', report.responsibilities.completed,
          report.responsibilities.completionRate == null ? undefined : `${report.responsibilities.completionRate}% completion`)}
        {stat('Responsibilities pending', report.responsibilities.pending)}
      </div>

      {report.studyContributions.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="muted" style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 6 }}>
            STUDY CIRCLE CONTRIBUTIONS
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="list">
              <thead><tr><th>Date</th><th>Topic</th><th>Summary</th></tr></thead>
              <tbody>
                {report.studyContributions.map((s, i) => (
                  <tr key={i}>
                    <td style={{ fontSize: 13 }}>{new Date(s.meetingDate).toLocaleDateString()}</td>
                    <td>{s.topic}</td>
                    <td style={{ fontSize: 13 }}>{s.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section entry point ──────────────────────────────────────────

export default function PerformanceReports({ unitLevel, unitId, scopeName, from, to, windowLabel }) {
  const [memberId, setMemberId] = useState(null);
  const [search, setSearch] = useState('');
  const [matches, setMatches] = useState([]);
  const [searching, setSearching] = useState(false);

  // Territorial filters for the member picker, independent of the
  // dashboard scope so an individual report can be pulled for anyone
  // without moving the whole dashboard off the unit being reviewed.
  const [filter, setFilter] = useState({ provinceId: '', districtId: '', areaId: '', basicUnitId: '' });
  const [provinces, setProvinces] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [areas, setAreas] = useState([]);
  const [units, setUnits] = useState([]);

  useEffect(() => {
    api.get('/org/provinces').then((r) => setProvinces(r.data.data || [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (!filter.provinceId) { setDistricts([]); return; }
    api.get('/org/districts', { params: { provinceId: filter.provinceId } })
      .then((r) => setDistricts(r.data.data || [])).catch(() => setDistricts([]));
  }, [filter.provinceId]);
  useEffect(() => {
    if (!filter.districtId) { setAreas([]); return; }
    api.get('/org/areas', { params: { districtId: filter.districtId } })
      .then((r) => setAreas(r.data.data || [])).catch(() => setAreas([]));
  }, [filter.districtId]);
  useEffect(() => {
    if (!filter.areaId) { setUnits([]); return; }
    api.get('/org/basic-units', { params: { areaId: filter.areaId } })
      .then((r) => setUnits(r.data.data || [])).catch(() => setUnits([]));
  }, [filter.areaId]);

  // Seed the filters from the dashboard scope, and reset the open
  // report when that scope moves — the member shown may not be in the
  // new scope at all.
  useEffect(() => {
    setMemberId(null);
    setSearch('');
    setMatches([]);
    setFilter({
      provinceId: unitLevel === 'CENTRAL' ? '' : '',
      districtId: '', areaId: '', basicUnitId: '',
    });
  }, [unitLevel, unitId]);

  // Debounced lookup. The narrowest territorial filter wins; with none
  // set it falls back to the dashboard's own scope, so the picker never
  // searches wider than the report the user is looking at unless they
  // deliberately widen it.
  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) { setMatches([]); setSearching(false); return undefined; }
    setSearching(true);
    const t = setTimeout(() => {
      const p = { q, limit: 12, status: 'ACTIVE' };
      if (filter.basicUnitId) p.basicUnitId = filter.basicUnitId;
      else if (filter.areaId) p.areaId = filter.areaId;
      else if (filter.districtId) p.districtId = filter.districtId;
      else if (filter.provinceId) p.provinceId = filter.provinceId;
      else if (unitLevel === 'PROVINCE') p.provinceId = unitId;
      else if (unitLevel === 'DISTRICT') p.districtId = unitId;
      else if (unitLevel === 'AREA') p.areaId = unitId;
      else if (unitLevel === 'BASIC_UNIT') p.basicUnitId = unitId;
      // members list requires an explicit opt-in when unscoped.
      else p.scope = 'all';
      api.get('/members', { params: p })
        .then((r) => setMatches(r.data.data || []))
        .catch(() => setMatches([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [search, filter, unitLevel, unitId]);

  const filterActive = !!(filter.provinceId || filter.districtId || filter.areaId || filter.basicUnitId);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 10, flexWrap: 'wrap', marginBottom: 8,
      }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 13.5 }}>Performance report</div>
          <div className="muted" style={{ fontSize: 12 }}>
            Reporting on <strong>{scopeName}</strong>
            {windowLabel ? ` over the ${windowLabel}` : ''} — use the scope bar or
            filters above to report on a different province, district, area or
            basic unit.
          </div>
        </div>
      </div>

      <UnitPerformance unitLevel={unitLevel} unitId={unitId} from={from} to={to} />

      <MemberLeaderboard
        unitLevel={unitLevel}
        unitId={unitId}
        from={from}
        to={to}
        onPick={setMemberId}
      />

      <div className="chart-card" style={{ marginTop: 10 }}>
        <div className="chart-card-head">
          <div>
            <div className="chart-card-title">Individual member report</div>
            <div className="chart-card-sub">
              Filter by province, district, area or basic unit, then search by
              name, member ID or CNIC
            </div>
          </div>
          {filterActive && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => setFilter({ provinceId: '', districtId: '', areaId: '', basicUnitId: '' })}
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Cascading territorial filters — narrowing a level clears
            everything beneath it so the filter can never describe an
            area that isn't in the chosen district. */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>
          <select
            value={filter.provinceId}
            onChange={(e) => setFilter({ provinceId: e.target.value, districtId: '', areaId: '', basicUnitId: '' })}
            aria-label="Filter by province"
          >
            <option value="">{unitLevel === 'CENTRAL' ? 'All provinces' : `Current scope (${scopeName})`}</option>
            {provinces.map((p) => <option key={p._id} value={p._id}>{p.name}</option>)}
          </select>
          <select
            value={filter.districtId}
            onChange={(e) => setFilter({ ...filter, districtId: e.target.value, areaId: '', basicUnitId: '' })}
            disabled={!filter.provinceId}
            aria-label="Filter by district"
          >
            <option value="">All districts</option>
            {districts.map((d) => <option key={d._id} value={d._id}>{d.name}</option>)}
          </select>
          <select
            value={filter.areaId}
            onChange={(e) => setFilter({ ...filter, areaId: e.target.value, basicUnitId: '' })}
            disabled={!filter.districtId}
            aria-label="Filter by area"
          >
            <option value="">All areas</option>
            {areas.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>
          <select
            value={filter.basicUnitId}
            onChange={(e) => setFilter({ ...filter, basicUnitId: e.target.value })}
            disabled={!filter.areaId}
            aria-label="Filter by basic unit"
          >
            <option value="">All basic units</option>
            {units.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
          </select>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Type at least 2 characters…"
          style={{ width: '100%', maxWidth: 380 }}
          aria-label="Search members"
        />

        {search.trim().length >= 2 && !searching && matches.length === 0 && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            No members match “{search.trim()}” in this scope.
          </p>
        )}
        {matches.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
            {matches.map((m) => (
              <button
                key={m._id}
                type="button"
                className={`chip${memberId === m._id ? ' on' : ''}`}
                onClick={() => setMemberId(m._id)}
              >
                {m.fullName}
                <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                  {m.memberId || m.cnic}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <MemberReport memberId={memberId} from={from} to={to} onClear={() => setMemberId(null)} />
    </div>
  );
}
