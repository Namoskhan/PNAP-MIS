// Enhanced KPI card matching the mockup style:
// header with icon + label, big value + trend chip, full-width
// sparkline anchored to the bottom edge of the card.

import { Sparkline, BRAND } from './charts';
import CountUp from './CountUp';

function TrendBadge({ delta, inverse }) {
  if (delta == null || !isFinite(delta)) return null;
  const isUp = delta > 0;
  const isDown = delta < 0;
  // For "good when down" metrics (e.g. expenses), set inverse=true
  const isGood = inverse ? isDown : isUp;
  if (delta === 0) return null;
  const color = isGood ? 'var(--success)' : 'var(--danger)';
  const arrow = isUp ? '▲' : '▼';
  const magnitude = Math.round(Math.abs(delta));
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color,
      display: 'inline-flex', alignItems: 'center', gap: 2,
    }}>
      {arrow} {magnitude}{typeof delta === 'number' && Math.abs(delta) <= 100 && '%'}
    </span>
  );
}

export default function SmartKpi({
  label,
  value,
  icon,
  trend,           // number — delta % vs previous
  trendInverse,    // bool — true when "down is good" (e.g. expenses)
  spark,           // number[] — recent values for sparkline
  sparkColor,
  sparkFill,
  iconBg,          // override icon-circle background tint
  iconColor,       // override icon color
  onClick,
  format = (v) => (v == null ? '—' : v.toLocaleString()),
}) {
  const clickable = typeof onClick === 'function';
  return (
    <div
      className={`skpi${clickable ? ' clickable' : ''}`}
      onClick={clickable ? onClick : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={(e) => { if (clickable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(e); } }}
    >
      <div className="skpi-body">
        <div className="skpi-head">
          <div
            className="skpi-icon"
            aria-hidden="true"
            style={{
              background: iconBg || BRAND.tint,
              color: iconColor || BRAND.dark,
            }}
          >
            {icon}
          </div>
          <span className="skpi-label">{label}</span>
        </div>
        <div className="skpi-row">
          <div className="skpi-value">
            {typeof value === 'number' && isFinite(value)
              ? <CountUp value={value} format={format} />
              : format(value)}
          </div>
          <TrendBadge delta={trend} inverse={trendInverse} />
        </div>
      </div>
      {spark && spark.length > 1 && (
        <div className="skpi-spark-full">
          <Sparkline values={spark} color={sparkColor || BRAND.dark} fill={sparkFill || 'rgba(30,64,175,0.10)'} height={24} />
        </div>
      )}
    </div>
  );
}
