import Reveal from './Reveal';

// ─── The provinces, one card each ────────────────────────────────────
//
// This single view answers eight separate questions that used to be
// eight separate blocks:
//
//   province-wise membership · province-wise basic units ·
//   province-wise area units · province-wise district units ·
//   province-wise ACTIVE basic units · active area units ·
//   active district units · and the inactive counterpart of each.
//
// They collapse into one card per province because they are all facts
// about the same thing. Reading them as eight stacked charts forced the
// operator to hold a province in their head and re-find it eight times;
// here a province is one object with its numbers attached.
//
// Every figure comes from a single /dashboard/org-breakdown row — no
// extra request, no client-side arithmetic beyond percentages.

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

export default function ProvinceMatrix({ rows, levelNoun = 'Province', onDrill }) {
  if (!rows || rows.length === 0) {
    return <p className="muted" style={{ margin: 0, fontSize: 13 }}>No {levelNoun.toLowerCase()}s in this view.</p>;
  }

  return (
    <div className="pm-grid">
      {rows.map((r, i) => {
        const m = r.members || {};
        const memberPct = m.activePct ?? pct(m.active, m.total);
        return (
          <Reveal key={r._id} delay={i * 60} className="pm-card-wrap">
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
          </Reveal>
        );
      })}
    </div>
  );
}
