import { useCallback, useMemo, useState } from 'react';
import useAnalytics from '../useAnalytics';
import CountUp from '../../CountUp';
import { SkeletonKpiGrid, SkeletonCard } from '../../Skeleton';
import { Donut } from '../../charts';
import Reveal from './Reveal';
import ProvinceMatrix from './ProvinceMatrix';
import ScopeBreadcrumb from '../ScopeBreadcrumb';
import AnalyticsFilters from '../AnalyticsFilters';
import MembershipAnalytics from '../MembershipAnalytics';
import MeetingsAnalytics from '../MeetingsAnalytics';
import CampaignsAnalytics from '../CampaignsAnalytics';
import ReportsAnalytics from '../ReportsAnalytics';
import { InactiveUnitsTable, InactiveMembersTable } from '../InactiveTables';

// ─── Command Centre ──────────────────────────────────────────────────
//
// The dashboard reads as SEVEN ACTS, top to bottom, each answering one
// question and handing the reader to the next:
//
//   1  Standing    how big is the party, right now
//   2  Provinces   where is it strong, and where is it silent
//   3  People      who is joining, and who is taking part
//   4  Work        campaigns being run
//   5  Governance  meetings planned vs actually held
//   6  Reports     what has been filed and what is still owed
//   7  Attention   what is broken and who is responsible
//
// The order is deliberate: totals give context, provinces give
// location, then the three things a party actually does, then the
// problems. Nothing collapses; each act reveals as it is reached.

const EMPTY_SCOPE = { provinceId: '', districtId: '', areaId: '', basicUnitId: '' };
const DRILL_KEY = {
  PROVINCE: 'provinceId', DISTRICT: 'districtId',
  AREA: 'areaId', BASIC_UNIT: 'basicUnitId',
};
const BELOW = {
  NATIONAL: ['provinceId', 'districtId', 'areaId', 'basicUnitId'],
  PROVINCE: ['districtId', 'areaId', 'basicUnitId'],
  DISTRICT: ['areaId', 'basicUnitId'],
  AREA: ['basicUnitId'],
  BASIC_UNIT: [],
};
const LEVEL_NOUN = {
  PROVINCE: 'Province', DISTRICT: 'District',
  AREA: 'Area', BASIC_UNIT: 'Basic unit',
};

const num = (v) => (v ?? 0).toLocaleString();
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
// Gauge and tone only mean something once the tier has units in it.
const unitStat = (u) => {
  if (!u || !u.total) return {};
  const p = pct(u.active, u.total);
  return { share: p, tone: p >= 50 ? 'good' : 'warn' };
};

/** One headline figure in the standing strip. */
function Stat({ value, label, sub, tone = 'brand', delay, share }) {
  return (
    <Reveal delay={delay} className="cc-stat-wrap">
      <div className={`cc-stat tone-${tone}`}>
        <div className="cc-stat-row">
          <div className="cc-stat-main">
            <div className="cc-stat-value">
              {typeof value === 'number' && isFinite(value)
                ? <CountUp value={value} format={num} />
                : value}
            </div>
            <div className="cc-stat-label">{label}</div>
          </div>
          {/* Only the tiles that describe a share get a gauge. Total
              membership is a count, not a proportion, and a ring on it
              would be inventing a denominator. */}
          {share != null && (
            <div className="cc-stat-gauge" aria-hidden="true">
              <Donut
                percent={share}
                label=""
                size={54}
                stroke={6}
                color={share >= 50 ? 'var(--success)' : 'var(--warning)'}
                trackColor="var(--surface-alt)"
              />
            </div>
          )}
        </div>
        {sub && <div className="cc-stat-sub">{sub}</div>}
      </div>
    </Reveal>
  );
}

/** Act header — a numbered step, so the page reads as a sequence. */
function Act({ n, title, lead, children, meta }) {
  return (
    <section className="cc-act">
      <Reveal className="cc-act-head">
        <div className="cc-act-marker" aria-hidden="true">{n}</div>
        <div className="cc-act-heading">
          <h3 className="cc-act-title">{title}</h3>
          {lead && <p className="cc-act-lead">{lead}</p>}
        </div>
        {meta && <div className="cc-act-meta">{meta}</div>}
      </Reveal>
      <div className="cc-act-body">{children}</div>
    </section>
  );
}

export default function CommandCenter() {
  const [scope, setScope] = useState(EMPTY_SCOPE);
  const [filters, setFilters] = useState({ days: 365, memberStatus: '', orgStatus: '' });

  const params = useMemo(() => {
    const p = { days: filters.days };
    for (const [k, v] of Object.entries(scope)) if (v) p[k] = v;
    if (filters.memberStatus) p.memberStatus = filters.memberStatus;
    if (filters.orgStatus) p.orgStatus = filters.orgStatus;
    return p;
  }, [scope, filters]);

  const summary = useAnalytics('/dashboard/summary', params, { poll: 60000 });
  const scopeInfo = useAnalytics('/dashboard/scope', params);
  const org = useAnalytics('/dashboard/org-breakdown', params);

  const drillTo = useCallback((level, id) => {
    setScope((s) => {
      const next = { ...s };
      for (const k of BELOW[level] || []) next[k] = '';
      if (DRILL_KEY[level]) next[DRILL_KEY[level]] = String(id);
      return next;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const navigateTo = useCallback((level) => {
    setScope((s) => {
      if (level === 'NATIONAL') return EMPTY_SCOPE;
      const next = { ...s };
      for (const k of BELOW[level] || []) next[k] = '';
      return next;
    });
  }, []);

  const s = summary.data;
  const trail = scopeInfo.data?.trail;
  const scopeName = trail?.length ? trail[trail.length - 1].name : 'the whole country';
  const windowLabel = `last ${filters.days} days`;
  const childNoun = LEVEL_NOUN[org.data?.level] || 'Province';

  const periodFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - filters.days);
    return d.toISOString().slice(0, 10);
  }, [filters.days]);

  const o = s?.organization;

  return (
    <div className="cc">
      {/* ── Masthead ── */}
      <header className="cc-masthead">
        <div>
          <div className="cc-eyebrow">Command Centre</div>
          <h2 className="cc-title">
            {scope.provinceId ? scopeName : 'National Standing'}
          </h2>
        </div>
        <div className="cc-live" title="Headline totals refresh every minute">
          <span className="cc-live-dot" aria-hidden="true" />
          Live
        </div>
      </header>

      {scope.provinceId && (
        <div className="dash-scope-bar">
          <ScopeBreadcrumb trail={trail} onNavigate={navigateTo} />
          <button type="button" className="btn secondary sm" onClick={() => navigateTo('NATIONAL')}>
            Back to the whole country
          </button>
        </div>
      )}

      <AnalyticsFilters
        scope={scope}
        filters={filters}
        onScope={(next) => setScope({ ...EMPTY_SCOPE, ...next })}
        onFilters={setFilters}
        busy={summary.loading}
      />

      {summary.error && <div className="alert error">{summary.error}</div>}

      {/* ── ACT 1 — Standing ── */}
      <Act
        n="1"
        title="Where the party stands"
      >
        {summary.loading && !s ? <SkeletonKpiGrid count={5} /> : s && (
          <div className="cc-stats">
            <Stat delay={0} value={s.membership.total} label="Total membership"
              sub={`${num(s.membership.newMembers)} joined in the ${windowLabel}`} />
            <Stat delay={70} value={o.basicUnits.total} label="Basic units"
              sub={`${num(o.basicUnits.active)} working · ${num(o.basicUnits.inactive)} silent`}
              {...unitStat(o.basicUnits)} />
            <Stat delay={140} value={o.areas.total} label="Area units"
              sub={`${num(o.areas.active)} working · ${num(o.areas.inactive)} silent`}
              {...unitStat(o.areas)} />
            <Stat delay={210} value={o.districts.total} label="District units"
              sub={`${num(o.districts.active)} working · ${num(o.districts.inactive)} silent`}
              {...unitStat(o.districts)} />
            <Stat delay={280} value={o.provinces.total} label="Provincial parties"
              sub={`${num(o.provinces.active)} working · ${num(o.provinces.inactive)} silent`}
              {...unitStat(o.provinces)} />
          </div>
        )}
      </Act>

      {/* ── ACT 2 — Provinces ── */}
      <Act
        n="2"
        title={`Every ${childNoun.toLowerCase()}, side by side`}
        lead="Click any name to drill in."
        meta={org.data?.rows ? `${org.data.rows.length} ${childNoun.toLowerCase()}s` : null}
      >
        {org.loading && !org.data ? <SkeletonCard lines={5} />
          : org.error ? <div className="alert error">{org.error}</div>
          : (
            <ProvinceMatrix
              rows={org.data?.rows || []}
              levelNoun={childNoun}
              onDrill={drillTo}
            />
          )}
      </Act>

      {/* ── ACT 3 — People ── */}
      <Act
        n="3"
        title="Who is joining, and who is taking part"
        meta={s ? `${num(s.membership.newMembers)} new` : null}
      >
        <MembershipAnalytics params={params} windowLabel={windowLabel} byStatus={s?.membership.byStatus} />
      </Act>

      {/* ── ACT 4 — Work ── */}
      <Act
        n="4"
        title="Coordination campaigns"
        meta={s ? `${num(s.campaigns.running)} running` : null}
      >
        <CampaignsAnalytics params={params} windowLabel={windowLabel} />
      </Act>

      {/* ── ACT 5 — Governance ── */}
      <Act
        n="5"
        title="Meetings and governance"
        lead="Scheduled against held, by tier, body and year."
        meta={s ? `${num(s.meetings.conducted)} of ${num(s.meetings.total)} held` : null}
      >
        <MeetingsAnalytics params={params} windowLabel={windowLabel} />
      </Act>

      {/* ── ACT 6 — Reports ── */}
      <Act
        n="6"
        title="Reports"
        meta={s ? `${num(s.reports.outstanding)} owed` : null}
      >
        <ReportsAnalytics params={params} periodFrom={periodFrom} scope={scope} />
      </Act>

      {/* ── ACT 7 — Attention ── */}
      <Act
        n="7"
        title="Needs attention"
        lead="With the officer responsible for each."
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <InactiveUnitsTable params={params} />
          <InactiveMembersTable params={params} />
        </div>
      </Act>
    </div>
  );
}
