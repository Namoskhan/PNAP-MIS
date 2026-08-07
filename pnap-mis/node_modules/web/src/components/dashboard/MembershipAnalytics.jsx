import { useState } from 'react';
import SmartKpi from '../SmartKpi';
import { SkeletonKpiGrid } from '../Skeleton';
import { HBar, AreaChart, StackedHBar, BRAND } from '../charts';
import { UsersIcon, ZapIcon, CheckIcon, MinusCircleIcon } from '../icons';
import useAnalytics from './useAnalytics';

// Section 3 — total and NEW membership, broken down at EVERY tier
// beneath the current scope: province-wise, district-wise, area-wise
// and basic-unit-wise.
//
// Four tiers x four measures is sixteen charts if rendered flat, so
// the tier is a switcher (the same `chip` control the inactive-units
// table already uses) and the four measures render for the selected
// tier. Drilling the dashboard into a province simply drops the
// province tab, since it would be a single bar.

const LEVEL_NOUN = {
  PROVINCE: 'Province', DISTRICT: 'District',
  AREA: 'Area', BASIC_UNIT: 'Basic Unit',
};

// Membership workflow state is a STATUS scale, not a categorical one:
// the values are ordered and carry meaning (in good standing → awaiting
// action → declined → off the roster). Status hues are reserved for
// exactly this and are never reused as "series 4" elsewhere.
const STATUS_META = [
  { key: 'ACTIVE', label: 'Active', color: 'var(--success)' },
  { key: 'PENDING_APPROVAL', label: 'Pending approval', color: 'var(--warning)' },
  { key: 'REJECTED', label: 'Rejected', color: 'var(--danger)' },
  { key: 'INACTIVE', label: 'Inactive', color: 'var(--muted)' },
  { key: 'SUSPENDED', label: 'Suspended', color: 'var(--tier-area)' },
  { key: 'EXPELLED', label: 'Expelled', color: 'var(--danger-strong)' },
  { key: 'DECEASED', label: 'Deceased', color: 'var(--muted-soft)' },
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

export default function MembershipAnalytics({ params, windowLabel, byStatus }) {
  const { data, loading, error } = useAnalytics('/dashboard/membership', params);
  const [tier, setTier] = useState(null);

  if (loading && !data) return <SkeletonKpiGrid count={4} />;
  if (error) return <div className="alert error">{error}</div>;
  if (!data) return null;

  const t = data.totals;
  const levels = data.levels || [];
  // Default to the broadest tier available; fall back if the scope
  // changed under a selection that no longer exists.
  const activeTier = levels.includes(tier) ? tier : levels[0] || null;
  const rows = activeTier ? (data.byLevel[activeTier] || []) : [];
  const noun = activeTier ? LEVEL_NOUN[activeTier] : null;
  const top = rows.slice(0, 10);

  // Zero-count states are dropped rather than drawn as empty rows —
  // an org with no expulsions shouldn't carry an "Expelled 0" bar.
  const statusRows = STATUS_META
    .map((m) => ({ label: m.label, value: byStatus?.[m.key] || 0, color: m.color }))
    .filter((r) => r.value > 0);
  const statusTotal = statusRows.reduce((s, r) => s + r.value, 0);

  return (
    <>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
        gap: 10, marginBottom: 12,
      }}>
        <SmartKpi
          label="Total Membership" value={t.total}
          icon={<UsersIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        <SmartKpi
          label="New Membership" value={t.newMembers}
          icon={<ZapIcon size={14} />}
          iconBg="var(--primary-tint)" iconColor="var(--primary)"
        />
        <SmartKpi
          label="Active" value={t.active}
          icon={<CheckIcon size={14} />}
          iconBg="var(--success-bg)" iconColor="var(--success)"
        />
        <SmartKpi
          label="Inactive" value={t.inactive}
          icon={<MinusCircleIcon size={14} />}
          iconBg="var(--surface-alt)" iconColor="var(--muted)"
        />
      </div>

      {levels.length > 1 && (
        <div style={{
          display: 'flex', gap: 6, flexWrap: 'wrap',
          alignItems: 'center', marginBottom: 10,
        }}>
          <span className="muted" style={{ fontSize: 12, marginRight: 2 }}>Break down by</span>
          {levels.map((lvl) => (
            <button
              key={lvl}
              type="button"
              className={`chip${activeTier === lvl ? ' on' : ''}`}
              onClick={() => setTier(lvl)}
            >
              {LEVEL_NOUN[lvl]}
            </button>
          ))}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: 10,
      }}>
        {/* Workflow state — a different question from "active", which
            on this dashboard means recent organizational work. A member
            can be status ACTIVE and still dormant, and this is where
            that distinction becomes visible. */}
        {statusRows.length > 0 && (
          <ChartCard
            title="Member status distribution"
            sub="Registration workflow state, not activity"
            meta={`${statusTotal.toLocaleString()} total`}
          >
            <HBar rows={statusRows} emptyLabel="No members registered yet." />
          </ChartCard>
        )}

        <ChartCard
          title="Registration trend"
          sub="New members per month, last 12 months"
          meta={`${t.newMembers.toLocaleString()} in ${windowLabel}`}
        >
          {data.trend && data.trend.length > 1 ? (
            <AreaChart
              values={data.trend.map((b) => b.newMembers)}
              labels={data.trend.map((b) => b.label)}
              height={140}
              color={BRAND.dark}
              fill={BRAND.tint}
            />
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>Not enough history yet.</p>
          )}
        </ChartCard>

        {noun && (
          <>
            <ChartCard title={`${noun}-wise membership`} sub="Total members">
              <HBar
                rows={top.map((r) => ({ label: r.name, value: r.total }))}
                accent={BRAND.dark}
                emptyLabel="No units in this scope."
              />
            </ChartCard>
            <ChartCard title={`${noun}-wise new membership`} sub={`Registered in the ${windowLabel}`}>
              <HBar
                rows={top.map((r) => ({ label: r.name, value: r.newMembers }))}
                accent={BRAND.bright}
                emptyLabel="No units in this scope."
              />
            </ChartCard>
            <ChartCard title={`${noun}-wise active members`} sub="Acted inside the window">
              <HBar
                rows={top.map((r) => ({ label: r.name, value: r.active }))}
                accent="var(--success)"
                emptyLabel="No units in this scope."
              />
            </ChartCard>
            <ChartCard title={`${noun}-wise inactive members`} sub="No activity inside the window">
              <HBar
                rows={top.map((r) => ({ label: r.name, value: r.inactive }))}
                accent="var(--muted-soft)"
                emptyLabel="No units in this scope."
              />
            </ChartCard>
          </>
        )}
      </div>

      {noun && rows.length > 0 && (
        <ChartCard
          title={`Every ${noun.toLowerCase()}, side by side`}
          sub="Bar length is how many members there are. The colours show how many of them are actually taking part."
          meta={`${rows.length} ${noun.toLowerCase()}${rows.length === 1 ? '' : 's'}`}
        >
          <StackedHBar
            rows={rows.map((r) => ({
              label: r.name,
              values: { active: r.active, inactive: r.inactive },
              note: r.newMembers,
            }))}
            series={[
              { key: 'active', label: 'Taking part', color: 'var(--success)' },
              { key: 'inactive', label: 'Not taking part', color: 'var(--muted-soft)' },
            ]}
            noteLabel="Joined recently"
            emptyLabel="No units in this scope."
          />
          <p className="muted" style={{ fontSize: 11.5, marginTop: 12, marginBottom: 0 }}>
            The green figure after each bar is how many people joined recently.
          </p>
        </ChartCard>
      )}

    </>
  );
}
