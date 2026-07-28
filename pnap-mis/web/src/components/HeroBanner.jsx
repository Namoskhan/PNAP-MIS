// Dashboard hero banner — greeting + date + optional unit subtitle and
// chip metrics. Used at the top of system + unit dashboards to set
// context with a glance.
//
// Renders a deep red gradient with subtle decorative shapes; works
// well above any KPI grid.

function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return 'Working late';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 21) return 'Good evening';
  return 'Working late';
}

function todayLong() {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function HeroBanner({
  name,
  subtitle,
  eyebrow,
  chips,        // [{ label, value, icon }]
  actions,      // ReactNode — buttons or links rendered on the right
  variant,      // 'default' | 'compact'
}) {
  const isCompact = variant === 'compact';
  return (
    <div className={`hero-banner ${isCompact ? 'hero-compact' : ''}`}>
      <div className="hero-decor hero-decor-1" aria-hidden="true" />
      <div className="hero-decor hero-decor-2" aria-hidden="true" />
      <div className="hero-content">
        <div className="hero-text">
          {eyebrow && <div className="hero-eyebrow">{eyebrow}</div>}
          <h2 className="hero-title">
            {greeting()}{name ? `, ${name}` : ''}
          </h2>
          {subtitle && <div className="hero-subtitle">{subtitle}</div>}
          <div className="hero-date">
            <span className="hero-live-dot" aria-hidden="true" />
            {todayLong()}
          </div>
        </div>
        {actions && <div className="hero-actions">{actions}</div>}
      </div>
      {chips && chips.length > 0 && (
        <div className="hero-chips">
          {chips.map((c, i) => (
            <div className="hero-chip" key={i}>
              {c.icon && <span className="hero-chip-icon">{c.icon}</span>}
              <span className="hero-chip-label">{c.label}</span>
              <span className="hero-chip-value">{c.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
