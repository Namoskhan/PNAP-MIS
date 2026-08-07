import { useState } from 'react';
import SmartKpi from '../SmartKpi';
import { SkeletonKpiGrid } from '../Skeleton';
import {
  HBar, AreaChart, VBars, BRAND,
  StackedColumns, StackedHBar, Heatmap, CATEGORICAL, rampSteps,
} from '../charts';
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
  // The yearly columns can be split by body or by tier. Two separate
  // charts would force the reader to hold one in memory to compare;
  // one chart with a toggle keeps the axis and scale fixed.
  const [yearSplit, setYearSplit] = useState('BODY');
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

  // The year x tier x body matrix is a heatmap, not a list: one row per
  // period, one column per tier+body pair, shaded by conducted count.
  // Built from exactly the rows the table used, so the numbers match.
  const matrixCols = [];
  const colSeen = new Set();
  const matrixRows = [];
  const rowSeen = new Set();
  const matrixCells = {};
  matrix.forEach((r) => {
    const ck = `${r.level}|${r.body}`;
    if (!colSeen.has(ck)) {
      colSeen.add(ck);
      matrixCols.push({
        key: ck,
        label: TIER_LABEL[r.level] || r.level,
        sublabel: BODY_LABEL[r.body] || r.body,
      });
    }
    const rk = String(r.year);
    if (!rowSeen.has(rk)) {
      rowSeen.add(rk);
      matrixRows.push({ key: rk, label: r.label });
    }
    if (!matrixCells[rk]) matrixCells[rk] = {};
    matrixCells[rk][ck] = r.conducted;
  });

  const yearSeries = yearSplit === 'BODY'
    ? bodiesPresent.map((b, i) => ({
        key: b,
        label: BODY_LABEL[b] || b,
        // Bodies are identities, not magnitudes — categorical hues.
        color: CATEGORICAL[i % CATEGORICAL.length],
      }))
    : tiersPresent.map((tr, i) => ({
        key: tr,
        label: TIER_LABEL[tr] || tr,
        // Tiers are an ordered hierarchy, so they take the sequential
        // ramp: depth in the party reads as depth of colour. Steps are
        // spread across the ramp so three tiers do not come out as three
        // near-identical pale blues.
        color: rampSteps(tiersPresent.length)[i],
      }));

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

      {/* Year x body and year x tier, the two cuts asked for — as columns
          rather than a grid of numbers. */}
      {yearly.length > 0 && (bodiesPresent.length > 0 || tiersPresent.length > 0) && (
        <div className="chart-card" style={{ marginTop: 10 }}>
          <div className="chart-card-head">
            <div>
              <div className="chart-card-title">
                Conducted by year, split by {yearSplit === 'BODY' ? 'body' : 'tier'}
              </div>
              <div className="chart-card-sub">{data.yearBasisLabel}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`chip${yearSplit === 'BODY' ? ' on' : ''}`}
                onClick={() => setYearSplit('BODY')}
                disabled={bodiesPresent.length === 0}
              >
                By body
              </button>
              <button
                type="button"
                className={`chip${yearSplit === 'TIER' ? ' on' : ''}`}
                onClick={() => setYearSplit('TIER')}
                disabled={tiersPresent.length === 0}
              >
                By tier
              </button>
            </div>
          </div>
          <StackedColumns
            groups={yearly.map((y) => ({
              label: axisLabel(y),
              sublabel: `${y.conducted.toLocaleString()} of ${y.total.toLocaleString()}`,
              values: yearSplit === 'BODY'
                ? Object.fromEntries(bodiesPresent.map((b) => [b, y.bodies[b]?.conducted ?? 0]))
                : Object.fromEntries(tiersPresent.map((tr) => [tr, y.tiers[tr]?.conducted ?? 0])),
            }))}
            series={yearSeries}
            height={240}
            colWidth={Math.max(58, Math.min(150, slotWidth))}
            emptyLabel="No conducted meetings on record."
          />
        </div>
      )}

      {matrix.length > 0 && (
        <div className="chart-card" style={{ marginTop: 10 }}>
          <div className="chart-card-head">
            <div>
              <div className="chart-card-title">Year · tier · body detail</div>
              <div className="chart-card-sub">
                Conducted meetings in every combination on record — darker is busier
              </div>
            </div>
            <div className="chart-card-meta">{matrixCols.length} combinations</div>
          </div>
          {/* A real <table>, so this doubles as the accessible table view of
              the shaded chart above it. */}
          <Heatmap
            rowHeader="Period"
            valueNoun="conducted"
            rows={matrixRows}
            cols={matrixCols}
            cells={matrixCells}
            emptyLabel="Nothing on record yet."
          />
        </div>
      )}

      {tiers.length > 0 && (
        <div className="chart-card" style={{ marginTop: 10 }}>
          <div className="chart-card-head">
            <div>
              <div className="chart-card-title">Breakdown by tier and body</div>
              <div className="chart-card-sub">
                Conducted vs still scheduled, {windowLabel}
              </div>
            </div>
          </div>
          {/* Conducted and scheduled are lifecycle STATES, so they wear the
              reserved status hues rather than categorical ones. */}
          <StackedHBar
            rows={tiers.map((r) => ({
              label: `${TIER_LABEL[r.level] || r.level} ${BODY_LABEL[r.body] || r.body}`,
              values: { conducted: r.conducted, scheduled: r.scheduled },
            }))}
            series={[
              { key: 'conducted', label: 'Conducted', color: 'var(--success)' },
              { key: 'scheduled', label: 'Scheduled', color: 'var(--warning)' },
            ]}
            emptyLabel="No meetings in this window."
          />
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
