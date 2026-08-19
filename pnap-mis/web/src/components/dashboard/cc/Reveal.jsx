import { useEffect, useRef, useState } from 'react';

// Scroll-reveal wrapper.
//
// The dashboard is long, so it is read as a sequence rather than a
// single screen. Revealing each block as it arrives gives that sequence
// a rhythm — the page feels like it is briefing you rather than dumping
// on you.
//
// Two rules it follows:
//   * It reveals ONCE and disconnects. Content that re-animates every
//     time it scrolls past is a distraction, not a flourish.
//   * It respects prefers-reduced-motion by showing everything
//     immediately. Motion is decoration here; the data is the point.
export default function Reveal({ children, delay = 0, as: Tag = 'div', className = '' }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (shown) return undefined;

    const reduced = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const el = ref.current;
    // No observer (older browser, test env) or motion is unwelcome:
    // show it now rather than risk content that never appears.
    if (reduced || !el || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return undefined;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.05 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);

  return (
    <Tag
      ref={ref}
      className={`cc-reveal${shown ? ' in' : ''} ${className}`}
      style={{ transitionDelay: shown ? `${delay}ms` : '0ms' }}
    >
      {children}
    </Tag>
  );
}
