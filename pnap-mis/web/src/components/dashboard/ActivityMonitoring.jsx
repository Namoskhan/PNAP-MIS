import { SkeletonCard } from '../Skeleton';
import { AreaChart, PieChart, HBar, BRAND } from '../charts';
import { ZapIcon } from '../icons';
import useAnalytics from './useAnalytics';

// Section 7 — what "active" actually means, made visible: the trend of
// recorded organizational activity, the active/inactive split at every
// tier, and the latest events.
//
// Active/inactive here is never derived from logins, dashboard visits
// or page views — only from recorded organizational actions
// (attendance, meetings, transfers, approvals, and so on).

const ACTIVE_COLOR = 'var(--success)';
const INACTIVE_COLOR = 'var(--muted-soft)';

// Categorical palette for activity KINDS — identity, not magnitude, so
// it needs distinct hues rather than steps of one. The brand ramp is
// all blues; used categorically its adjacent steps are indistinguishable
// to a colourblind reader, so this is a separate, validated set.
//
// Checked with the palette validator against the app's light surface:
// lightness band, chroma floor, CVD separation (worst adjacent pair
// deutan ΔE 12.8 / tritan 7.8), normal-vision floor 28.8, and 3:1
// contrast all pass. Tritan sits in the floor band, which is legal only
// with secondary encoding — hence HBar, whose rows are always directly
// labelled, rather than a pie read by colour alone.
//
// Assigned in fixed order and never cycled: past the sixth kind,
// everything folds into "Other" instead of repeating a hue.
const CATEGORY_COLORS = ['#2563eb', '#ea580c', '#0d9488', '#c026d3', '#a16207', '#7c3aed'];
const CATEGORY_MAX = 6;

const CATEGORY_LABEL = {
  MEETING: 'Meetings',
  ATTENDANCE: 'Attendance',
  ACTIVITY: 'Activities',
  FINANCE: 'Finance',
  REPORT: 'Reports',
  MEMBER: 'Membership',
  ROLE: 'Cabinet roles',
  COMMUNICATION: 'Announcements',
  ORGANIZATION: 'Org management',
  ADMIN: 'Administration',
  OTHER: 'Other',
};

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

function split(active, inactive) {
  return [
    { label: 'Active', value: active, color: ACTIVE_COLOR },
    { label: 'Inactive', value: inactive, color: INACTIVE_COLOR },
  ];
}

export default function ActivityMonitoring({ params, summary, windowLabel }) {
  const trend = useAnalytics('/dashboard/activity-trend', { ...params, months: 12 });
  const feed = useAnalytics('/dashboard/activity', { ...params, limit: 12 });

  const org = summary?.organization;
  const mem = summary?.membership;
  const buckets = trend.data?.buckets || [];
  const rawCategories = trend.data?.byCategory || [];

  // Fixed order, never cycled — the seventh kind and beyond fold into
  // a single "Other" row rather than reusing a colour that already
  // means something else.
  const categories = rawCategories.slice(0, CATEGORY_MAX).map((c, i) => ({
    label: CATEGORY_LABEL[c.category] || c.category,
    value: c.events,
    color: CATEGORY_COLORS[i],
  }));
  const overflow = rawCategories.slice(CATEGORY_MAX);
  if (overflow.length) {
    categories.push({
      label: `Other (${overflow.length} kinds)`,
      value: overflow.reduce((s, c) => s + c.events, 0),
      color: 'var(--muted-soft)',
    });
  }

  return (
    <>
      <div className="dash-grid-3-2">
        <ChartCard
          title="Monthly activity trend"
          sub="Recorded organizational actions per month"
          meta={`${buckets.reduce((s, b) => s + b.events, 0).toLocaleString()} events`}
        >
          {trend.loading && !trend.data ? (
            <SkeletonCard lines={4} />
          ) : buckets.length > 1 ? (
            <AreaChart
              values={buckets.map((b) => b.events)}
              labels={buckets.map((b) => b.label)}
              height={150}
              color={BRAND.dark}
              fill={BRAND.tint}
              valueLabel={String(buckets[buckets.length - 1].events)}
            />
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Not enough history yet.</p>
          )}
        </ChartCard>

        <ChartCard title="Recent activity" sub="Latest recorded actions">
          {feed.loading && !feed.data ? (
            <SkeletonCard lines={5} />
          ) : !feed.data || feed.data.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              Nothing recorded in this window.
            </p>
          ) : (
            <div className="dash-feed" style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {feed.data.map((a) => (
                <div key={a._id} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 13 }}>
                  <ZapIcon size={12} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <strong>{a.action.replace(/_/g, ' ').toLowerCase()}</strong>
                      {a.targetLabel && <span className="muted"> · {a.targetLabel}</span>}
                    </div>
                    <div className="muted" style={{ fontSize: 11 }}>
                      {a.member?.fullName || 'System'}
                      {a.province?.name ? ` · ${a.province.name}` : ''}
                      {' · '}
                      {new Date(a.occurredAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>

      {/* Two measures over the same months, kept as SEPARATE charts.
          Events run in the hundreds and active members in the tens;
          putting both on one plot would need a second y-axis, which
          makes the crossings meaningless. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 10, marginTop: 10,
      }}>
        <ChartCard
          title="Members active per month"
          sub="Distinct members who did organizational work"
          meta={buckets.length ? `${buckets[buckets.length - 1].activeMembers} this month` : undefined}
        >
          {buckets.length > 1 ? (
            <AreaChart
              values={buckets.map((b) => b.activeMembers)}
              labels={buckets.map((b) => b.label)}
              height={140}
              color="var(--success)"
              fill="var(--success-bg)"
              valueLabel={String(buckets[buckets.length - 1].activeMembers)}
            />
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Not enough history yet.</p>
          )}
        </ChartCard>

        <ChartCard
          title="Activity by kind"
          sub="What the organization actually spends its effort on"
          meta={`${categories.reduce((s, c) => s + c.value, 0).toLocaleString()} events`}
        >
          <HBar rows={categories} emptyLabel="Nothing recorded in this window." />
        </ChartCard>
      </div>

      {org && mem && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
          gap: 10, marginTop: 10,
        }}>
          <ChartCard title="Active vs inactive members" sub={windowLabel}>
            <PieChart segments={split(mem.active, mem.inactive)} size={104} />
          </ChartCard>
          <ChartCard title="Active vs inactive basic units" sub="By key office-bearer activity">
            <PieChart segments={split(org.basicUnits.active, org.basicUnits.inactive)} size={104} />
          </ChartCard>
          <ChartCard title="Active vs inactive areas" sub="By key office-bearer activity">
            <PieChart segments={split(org.areas.active, org.areas.inactive)} size={104} />
          </ChartCard>
          <ChartCard title="Active vs inactive districts" sub="By key office-bearer activity">
            <PieChart segments={split(org.districts.active, org.districts.inactive)} size={104} />
          </ChartCard>
        </div>
      )}

      {/* The exclusion is the part nobody guesses, so it is the part kept. */}
      <p className="muted" style={{ fontSize: 12, marginTop: 12, marginBottom: 0 }}>
        Active = one recorded organizational action in the window. Logins and page
        views do not count. A unit is active when one of its key office bearers is.
      </p>
    </>
  );
}
