import { useEffect, useRef, useState } from 'react';

// Section shell for the executive dashboard.
//
// NOT collapsible. An admin panel should show its content, not make the
// operator hunt for it behind eight closed drawers — so every section
// is permanently open and they read down the page one after another.
//
// That removes the collapse, but it must not resurrect the problem the
// collapse was solving. Closed sections used to mount nothing, which is
// what kept a page of twelve aggregations from firing them all at once
// on load. So the lazy work is kept and the trigger is changed: a
// section mounts when it comes NEAR the viewport rather than when it is
// clicked.
//
// rootMargin is deliberately large — the request starts roughly a
// screen before the section is reached, so by the time the reader
// scrolls to it the content is already there. The laziness is invisible;
// only the thundering herd on first paint is gone.
//
// `eager` opts the first section out of the observer entirely: it is
// above the fold, so waiting for an intersection callback would just
// delay the one thing everybody reads first.

export default function DashboardSection({
  title,
  subtitle,
  badge,
  eager = false,
  // Accepted and ignored — the old API had it, and a stale caller
  // passing defaultOpen should not crash or, worse, hide a section.
  defaultOpen,
  children,
}) {
  const ref = useRef(null);
  const [mounted, setMounted] = useState(eager || defaultOpen === true);

  useEffect(() => {
    if (mounted) return undefined;
    const el = ref.current;
    // No IntersectionObserver (old browser, jsdom): mount immediately
    // rather than leave the section permanently blank.
    if (!el || typeof IntersectionObserver === 'undefined') {
      setMounted(true);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true);
          io.disconnect();
        }
      },
      { rootMargin: '600px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [mounted]);

  return (
    <section className="dash-section" ref={ref}>
      <div className="dash-section-head">
        <div className="dash-section-heading">
          <h3 className="dash-section-title">{title}</h3>
          {subtitle && <p className="dash-section-sub">{subtitle}</p>}
        </div>
        {badge != null && <span className="dash-section-badge">{badge}</span>}
      </div>

      <div className="dash-section-body">
        {mounted ? children : <div className="dash-section-placeholder" aria-hidden="true" />}
      </div>
    </section>
  );
}
