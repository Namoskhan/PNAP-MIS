import { useState } from 'react';
import SmartKpi from '../SmartKpi';
import { SkeletonKpiGrid } from '../Skeleton';
import { HBar, AreaChart, VBars, BRAND } from '../charts';
import { CalendarIcon, CheckIcon, ClockIcon, InfoIcon } from '../icons';
import useAnalytics from './useAnalytics';
import CongressManager from './CongressManager';

// Section 4 — meetings by state, by tier and body, plus a 12-month
// trend.
//
// "Body" here is Cabinet (executive) vs Committee, which is what the
// Meeting record actually stores. See the note rendered at the foot of
// this section about Jirga meetings.

const TIER_LABEL = {
  CENTRAL: 'Central', PROVINCE: 'Province', DISTRICT: 'District',
  AREA: 'Area', BASIC_UNIT: 'Basic Unit',
};
const BODY_LABEL = { EXECUTIVE: 'Cabinet', COMMITTEE: 'Committee' };

// Meeting lifecycle is a STATUS scale — ordered, with meaning attached
// to each step — so it wears the reserved status hues rather than a
// categorical set. Ordered as the workflow runs, not by size, so the
// shape of the pipeline is readable.
const STATE_META = [
  { key: 'DRAFT', label: 'Draft', color: 'var(--muted-soft)' },
  { key: 'SCHEDULED', label: 'Scheduled', color: 'var(--info)' },
  { key: 'IN_PROGRESS', label: 'In progress', color: 'var(--warning)' },
  { key: 'PENDING_REPORT', label: 'Pending report', color: 'var(--warning-strong)' },
  { key: 'FINALIZED', label: 'Finalized', color: 'var(--success)' },
  { key: 'CANCELLED', label: 'Cancelled', color: 'var(--danger)' },
];

function ChartCard({ title, sub, meta, children }) {
  return (
    <div className="chart-card">
      <div className="chart-card-head">
        <div>
          <div className="chart-card-title">{title}</div>
          {sub && <div className="chart-card-sub">{sub}</div>}
        </div>
        {meta && <div className="chart-card-meta">{meta}</div>}
      </div>
      {children}
    </div>
  );
}

export default function MeetingsAnalytics({ params, windowLabel }) {
  // Calendar vs the Pakistani fiscal year the finance module already
  // uses, so a meeting count and a finance total for the same labelled
  // year cover the same span.
  const [yearBasis, setYearBasis] = useState('CALENDAR');
  const [years, setYears] = useState(5);
  const [showCongress, setShowCongress] = useState(false);
  const { data, loading, error, reload } = useAnalytics(
    '/dashboard/meetings',
    { ...params, yearBasis, years },
  );

  if (loading && !data) return <SkeletonKpiGrid count={4} />;
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return null;

  const t = data.totals;
  const tiers = data.byTier || [];
  const yearly = data.yearly || [];
  const matrix = data.yearlyMatrix || [];
  const tiersPresent = data.tiersPresent || [];
  const bodiesPresent = data.bodiesPresent || [];

  // Each bar needs a slot at least as wide as its own label, or the
  // axis becomes unreadable. Labels render at 11px, roughly 6.2 units
  // per character in the SVG's coordinate space. Congress labels
  // ("13th National Congress → 14th National Congress") are far longer
  // than year labels, so this is measured from the real strings rather
  // than assumed. 44 units is the floor — enough for a short year plus
  // breathing room. Capped so a pathological label can't produce a
  // multi-thousand-pixel canvas.
  // Congress periods carry a short axis form ("14th National Congress")
  // alongside the full one used in tables ("13th … → 14th …"); the long
  // version cannot be made to fit a bar axis at any sane width.
  const axisLabel = (y) => y.shortLabel || y.label;
  const longestLabel = yearly.reduce((n, y) => Math.max(n, axisLabel(y).length), 0);
  // +12 units of gutter so adjacent labels don't touch at the extremes.
  const slotWidth = Math.min(200, Math.max(44, Math.round(longestLabel * 6.2) + 12));
  const chartWidth = Math.max(240, yearly.length * slotWidth);

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 10, marginBottom: 12,
      }}>
        <SmartKpi
          label="Total Meetings" value={t.total}
          icon={<CalendarIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        <SmartKpi
          label="Conducted" value={t.conducted}
          icon={<CheckIcon size={14} />}
          iconBg="var(--success-bg)" iconColor="var(--success)"
        />
        <SmartKpi
          label="Scheduled" value={t.scheduled}
          icon={<ClockIcon size={14} />}
          iconBg="var(--warning-bg)" iconColor="var(--warning)"
        />
        <SmartKpi
          label="Overdue Reports" value={t.overdueReports}
          icon={<InfoIcon size={14} />}
          iconBg="var(--danger-bg)" iconColor="var(--danger)"
        />
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 10,
      }}>
        <ChartCard
          title="Meeting trend"
          sub="Meetings per month, last 12 months"
          meta={`${t.total.toLocaleString()} in ${windowLabel}`}
        >
          {data.trend && data.trend.length > 1 ? (
            <AreaChart
              values={data.trend.map((b) => b.total)}
              labels={data.trend.map((b) => b.label)}
              height={140}
              color={BRAND.dark}
              fill={BRAND.tint}
            />
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Not enough history yet.</p>
          )}
        </ChartCard>

        {/* Where meetings sit in their lifecycle — the pipeline behind
            the headline "conducted" number. */}
        <ChartCard title="Meetings by state" sub={`Lifecycle position, ${windowLabel}`}>
          <HBar
            rows={STATE_META
              .map((s) => ({ label: s.label, value: data.byState?.[s.key] || 0, color: s.color }))
              .filter((r) => r.value > 0)}
            emptyLabel="No meetings in this window."
          />
        </ChartCard>

        <ChartCard title="Meetings by tier and body" sub={`Cabinet vs Committee, ${windowLabel}`}>
          <HBar
            rows={tiers.map((r) => ({
              label: `${TIER_LABEL[r.level] || r.level} ${BODY_LABEL[r.body] || r.body}`,
              value: r.total,
            }))}
            accent={BRAND.mid}
            emptyLabel="No meetings in this window."
          />
        </ChartCard>
      </div>

      {/* ── Yearly view ──────────────────────────────────────────
          Deliberately independent of the date-range filter: a
          "last 30 days" window would collapse a multi-year report
          to a single bar. Territorial scope still applies. */}
      <div className="chart-card" style={{ marginTop: 10 }}>
        <div className="chart-card-head">
          <div>
            <div className="chart-card-title">Conducted meetings by year</div>
            <div className="chart-card-sub">
              {data.yearBasisLabel} · all years, independent of the date filter
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`chip${yearBasis === 'CALENDAR' ? ' on' : ''}`}
              onClick={() => setYearBasis('CALENDAR')}
            >
              Calendar
            </button>
            <button
              type="button"
              className={`chip${yearBasis === 'FISCAL' ? ' on' : ''}`}
              onClick={() => setYearBasis('FISCAL')}
            >
              Fiscal Jul–Jun
            </button>
            <button
              type="button"
              className={`chip${yearBasis === 'CONGRESS' ? ' on' : ''}`}
              onClick={() => setYearBasis('CONGRESS')}
            >
              Congress to Congress
            </button>
            {yearBasis !== 'CONGRESS' && (
              <select
                value={years}
                onChange={(e) => setYears(Number(e.target.value))}
                aria-label="Years to show"
              >
                {[3, 5, 10].map((n) => <option key={n} value={n}>{n} years</option>)}
              </select>
            )}
            {yearBasis === 'CONGRESS' && (
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setShowCongress((v) => !v)}
              >
                {showCongress ? 'Hide calendar' : 'Manage calendar'}
              </button>
            )}
          </div>
        </div>

        {/* Congress mode needs dates before it can bucket anything.
            Say so and offer the fix rather than drawing an empty chart. */}
        {yearBasis === 'CONGRESS' && data.congressConfigured === false ? (
          <div className="alert info" style={{ marginBottom: 0 }}>
            No Congress dates recorded yet, so there are no periods to report on.
            Add them with <strong>Manage calendar</strong> above — two Congresses
            give one closed period, and the most recent always opens a period that
            is still running.
          </div>
        ) : yearly.length === 0 ? (
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>No meetings on record.</p>
        ) : (
          <>
            {/* Value bar = conducted, track behind = total scheduled,
                so the shortfall is visible without a second chart.

                Width is sized to the data rather than left at the
                default: ten bars in a 240-unit viewBox gives each label
                ~22 units to live in, and "FY 2024–25" needs nearer 60,
                so they collide into an unreadable smear. Below the
                wrapper's min-width the chart scrolls sideways instead
                of compressing further. */}
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: chartWidth }}>
                <VBars
                  rows={yearly.map((y) => ({ label: axisLabel(y), value: y.conducted, total: y.total }))}
                  height={150}
                  width={chartWidth}
                  color={BRAND.dark}
                  trackColor={BRAND.tint}
                />
              </div>
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>
              Solid = conducted (finalized) · light track = total held
              {yearly.length > 6 && ' · scroll sideways for the full range'}
            </div>
          </>
        )}

        {/* Meetings older than the first Congress belong to no period.
            Reported rather than folded into period one, so the bars
            always reconcile against the totals. */}
        {yearBasis === 'CONGRESS' && data.unassignedMeetings > 0 && (
          <p className="muted" style={{ fontSize: 12, marginTop: 8, marginBottom: 0 }}>
            <InfoIcon size={12} /> {data.unassignedMeetings.toLocaleString()} meeting
            {data.unassignedMeetings === 1 ? '' : 's'} predate the earliest Congress on
            record and fall outside every period. Add the earlier Congress to bring
            them in.
          </p>
        )}

        {yearBasis === 'CONGRESS' && showCongress && (
          <CongressManager onChanged={() => reload(true)} />
        )}
      </div>

      {/* Year x body and year x tier, the two cuts asked for. */}
      {yearly.length > 0 && (bodiesPresent.length > 0 || tiersPresent.length > 0) && (
        <div className="chart-card" style={{ marginTop: 10 }}>
          <div className="chart-card-head">
            <div>
              <div className="chart-card-title">Conducted by year, body and tier</div>
              <div className="chart-card-sub">{data.yearBasisLabel}</div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="list">
              <thead>
                <tr>
                  <th>Year</th>
                  {bodiesPresent.map((b) => (
                    <th key={b} style={{ textAlign: 'right' }}>{BODY_LABEL[b] || b}</th>
                  ))}
                  {tiersPresent.map((tr) => (
                    <th key={tr} style={{ textAlign: 'right' }}>{TIER_LABEL[tr] || tr}</th>
                  ))}
                  <th style={{ textAlign: 'right' }}>Conducted</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {yearly.slice().reverse().map((y) => (
                  <tr key={y.year}>
                    <td><strong>{y.label}</strong></td>
                    {bodiesPresent.map((b) => (
                      <td key={b} style={{ textAlign: 'right' }}>
                        {(y.bodies[b]?.conducted ?? 0).toLocaleString()}
                      </td>
                    ))}
                    {tiersPresent.map((tr) => (
                      <td key={tr} style={{ textAlign: 'right' }}>
                        {(y.tiers[tr]?.conducted ?? 0).toLocaleString()}
                      </td>
                    ))}
                    <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>
                      {y.conducted.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>{y.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {matrix.length > 0 && (
        <div className="chart-card" style={{ marginTop: 10 }}>
          <div className="chart-card-head">
            <div>
              <div className="chart-card-title">Year · tier · body detail</div>
              <div className="chart-card-sub">Every combination on record, newest first</div>
            </div>
            <div className="chart-card-meta">{matrix.length} rows</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="list">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Tier</th>
                  <th>Body</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Conducted</th>
                  <th style={{ textAlign: 'right' }}>Scheduled</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map((r) => (
                  <tr key={`${r.year}-${r.level}-${r.body}`}>
                    <td><strong>{r.label}</strong></td>
                    <td>{TIER_LABEL[r.level] || r.level}</td>
                    <td>{BODY_LABEL[r.body] || r.body}</td>
                    <td style={{ textAlign: 'right' }}>{r.total.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>
                      {r.conducted.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.scheduled.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tiers.length > 0 && (
        <div className="chart-card" style={{ marginTop: 10 }}>
          <div className="chart-card-head">
            <div>
              <div className="chart-card-title">Breakdown by tier and body</div>
              <div className="chart-card-sub">Within the {windowLabel}</div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="list">
              <thead>
                <tr>
                  <th>Tier</th>
                  <th>Body</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Conducted</th>
                  <th style={{ textAlign: 'right' }}>Scheduled</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((r) => (
                  <tr key={`${r.level}-${r.body}`}>
                    <td><strong>{TIER_LABEL[r.level] || r.level}</strong></td>
                    <td>{BODY_LABEL[r.body] || r.body}</td>
                    <td style={{ textAlign: 'right' }}>{r.total.toLocaleString()}</td>
                    <td style={{ textAlign: 'right', color: 'var(--success)', fontWeight: 600 }}>
                      {r.conducted.toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.scheduled.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* An honest gap is more useful than a fabricated zero. */}
      {data.jirgaTracked === false && (
        <div className="alert info" style={{ marginTop: 12 }}>
          <strong>Jirga meetings are not counted anywhere above.</strong>{' '}
          A meeting stores its body as <em>Cabinet</em> or <em>Committee</em> only —
          Jirga exists in this system as a membership roster (Qomi / Sobayi Jirga),
          never as a property of a meeting. Every Jirga meeting held so far is
          therefore recorded as one of the other two, so there is no count to show
          and no way to separate them retrospectively. Making it countable means
          adding JIRGA as a third meeting body, which changes how meetings are
          created — a change to the meeting module rather than to this dashboard.
        </div>
      )}
    </>
  );
}
