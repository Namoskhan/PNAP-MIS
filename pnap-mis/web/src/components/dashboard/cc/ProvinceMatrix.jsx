import { useMemo, useState } from 'react';
import Reveal from './Reveal';
import { SearchIcon, XIcon } from '../../icons';

// ─── The child units, one card each ──────────────────────────────────
//
// This single view answers eight separate questions that used to be
// eight separate blocks:
//
//   province-wise membership · province-wise basic units ·
//   province-wise area units · province-wise district units ·
//   province-wise ACTIVE basic units · active area units ·
//   active district units · and the inactive counterpart of each.
//
// They collapse into one card per unit because they are all facts about
// the same thing. Reading them as eight stacked charts forced the
// operator to hold a province in their head and re-find it eight times;
// here a unit is one object with its numbers attached.
//
// Every figure comes from a single /dashboard/org-breakdown row — no
// extra request, no client-side arithmetic beyond percentages.
//
// The grid SCROLLS inside a bounded box. This list is unbounded —
// drilling into a province with 42 districts rendered 42 cards in one
// block, roughly 4,000px of section — and a dashboard panel has to stay
// a predictable height. The filter is there so a specific unit can be
// found by name instead of by scrolling to it.

// Above this many rows the per-card reveal is dropped: 300+ observers
// each with a staggered delay is both expensive and badly timed inside a
// scroll container, where most cards start out clipped.
const ANIMATE_UP_TO = 12;
const FILTER_FROM = 8;          // below this, a search box is just clutter

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const num = (v) => (v ?? 0).toLocaleString();

// One tier's active/total split. The bar is the point: "3 of 6" makes
// you do the division, the bar does not.
function TierBar({ label, active, total }) {
  const p = pct(active, total);
  return (
    <div className="pm-tier">
      <div className="pm-tier-head">
        <span className="pm-tier-label">{label}</span>
        <span className="pm-tier-num">
          <strong>{num(active)}</strong>
          <span className="pm-tier-of"> of {num(total)}</span>
        </span>
      </div>
      <div className="pm-tier-track" title={`${p}% working`}>
        <div
          className="pm-tier-fill"
          style={{
            width: `${p}%`,
            background: p >= 50 ? 'var(--success)' : p > 0 ? 'var(--warning)' : 'var(--muted-soft)',
          }}
        />
      </div>
    </div>
  );
}

function UnitCard({ r, onDrill }) {
  const m = r.members || {};
  const memberPct = m.activePct ?? pct(m.active, m.total);
  return (
    <div className={`pm-card${r.isActiveUnit ? '' : ' dormant'}`}>
      <div className="pm-head">
        <button
          type="button"
          className="pm-name"
          onClick={() => onDrill?.(r.level, r._id, r.name)}
          title={`Open ${r.name}`}
        >
          {r.name}
        </button>
        <span className={`pm-flag ${r.isActiveUnit ? 'on' : 'off'}`}>
          {r.isActiveUnit ? 'Working' : 'Silent'}
        </span>
      </div>

      {/* Members lead — the number everything else exists to serve. */}
      <div className="pm-members">
        <span className="pm-members-value">{num(m.total)}</span>
        <span className="pm-members-label">members</span>
        <span className="pm-members-split">
          {num(m.active)} taking part · {num(m.inactive)} not
        </span>
        <div className="pm-members-track">
          <div className="pm-members-fill" style={{ width: `${memberPct}%` }} />
        </div>
      </div>

      <div className="pm-tiers">
        <TierBar label="Districts" active={r.districts?.active} total={r.districts?.total} />
        <TierBar label="Areas" active={r.areas?.active} total={r.areas?.total} />
        <TierBar label="Basic units" active={r.basicUnits?.active} total={r.basicUnits?.total} />
      </div>

      {r.officer?.fullName ? (
        <div className="pm-officer">
          <span className="pm-officer-label">In charge</span>
          {r.officer.fullName}
          <span className="pm-officer-role">
            {String(r.officer.roleCode || '').replace(/_/g, ' ').toLowerCase()}
          </span>
        </div>
      ) : (
        <div className="pm-officer pm-officer-none">No office bearer on record</div>
      )}
    </div>
  );
}

export default function ProvinceMatrix({ rows, levelNoun = 'Province', onDrill }) {
  const [query, setQuery] = useState('');
  const noun = levelNoun.toLowerCase();
  const all = rows || [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) => `${r.name} ${r.code || ''}`.toLowerCase().includes(q));
  }, [all, query]);

  if (all.length === 0) {
    return <p className="muted" style={{ margin: 0, fontSize: 13 }}>No {noun}s in this view.</p>;
  }

  const showFilter = all.length >= FILTER_FROM;
  const animate = filtered.length <= ANIMATE_UP_TO;
  // A short list should size to its content rather than leave dead space
  // inside a fixed box.
  const scrolls = filtered.length > ANIMATE_UP_TO;

  return (
    <div className="pm">
      {showFilter && (
        <div className="pm-toolbar">
          <div className="pm-search">
            <span className="pm-search-icon" aria-hidden="true"><SearchIcon size={15} /></span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Filter ${noun}s by name…`}
              aria-label={`Filter ${noun}s by name`}
            />
            {query && (
              <button
                type="button"
                className="pm-search-clear"
                onClick={() => setQuery('')}
                aria-label="Clear filter"
              ><XIcon size={13} /></button>
            )}
          </div>
          <div className="pm-count">
            {filtered.length === all.length
              ? `${num(all.length)} ${noun}${all.length === 1 ? '' : 's'}`
              : `${num(filtered.length)} of ${num(all.length)} ${noun}${all.length === 1 ? '' : 's'}`}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
          No {noun} matches “{query}”.
        </p>
      ) : (
        <div className={`pm-scroll${scrolls ? ' on' : ''}`}>
          <div className="pm-grid">
            {filtered.map((r, i) => (
              animate
                ? (
                  <Reveal key={r._id} delay={i * 45} className="pm-card-wrap">
                    <UnitCard r={r} onDrill={onDrill} />
                  </Reveal>
                )
                : (
                  <div key={r._id} className="pm-card-wrap">
                    <UnitCard r={r} onDrill={onDrill} />
                  </div>
                )
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
