import { useId, useState } from 'react';
import { ChevronRightIcon } from '../icons';

// Collapsible section shell for the executive dashboard.
//
// The point of the shell is lazy work, not just lazy paint: children
// are not mounted at all until the section is first opened, so a
// closed section issues no request and renders nothing. Once opened it
// stays mounted, so re-opening is instant and in-section state
// (pagination, sub-tabs) survives a collapse.
//
// Expand/collapse animates via the 0fr → 1fr grid-row technique in
// styles.css, which animates to the content's natural height without a
// hard-coded max-height that would clip a long section.
export default function DashboardSection({
  title,
  subtitle,
  badge,
  defaultOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [everOpened, setEverOpened] = useState(defaultOpen);
  const bodyId = useId();

  function toggle() {
    setOpen((o) => !o);
    setEverOpened(true);
  }

  return (
    <section className={`dash-section${open ? ' open' : ''}`}>
      <button
        type="button"
        className="dash-section-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={toggle}
      >
        <ChevronRightIcon size={16} className="dash-section-caret" />
        <span className="dash-section-heading">
          <span className="dash-section-title">{title}</span>
          {subtitle && <span className="dash-section-sub" style={{ display: 'block' }}>{subtitle}</span>}
        </span>
        {badge != null && <span className="dash-section-badge">{badge}</span>}
      </button>

      <div className="dash-section-wrap" id={bodyId} role="region" aria-label={title}>
        <div className="dash-section-clip">
          <div className="dash-section-body">
            {/* Mounted on first open and kept thereafter — see above. */}
            {everOpened ? children : null}
          </div>
        </div>
      </div>
    </section>
  );
}
