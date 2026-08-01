import { useEffect, useRef, useState } from 'react';
import { useBranding } from '../context/BrandingContext';

// Animate a numeric value from 0 (or `from`) to `value` over `duration`
// milliseconds using a cubic-out easing curve. Falls back to the raw
// formatted value when the user prefers reduced motion or when admin
// has disabled the count-up animation via dashboard appearance.
export default function CountUp({
  value,
  from = 0,
  duration = 800,
  format = (v) => Math.round(v).toLocaleString(),
}) {
  const branding = useBranding();
  const target = Number(value) || 0;
  const animationsOff = branding?.dashboard?.enableCountUpKpis === false
    || branding?.dashboard?.enableAnimations === false;

  const [display, setDisplay] = useState(target);
  const rafRef = useRef(null);
  const startRef = useRef(null);
  const lastTargetRef = useRef(target);

  useEffect(() => {
    if (animationsOff) { setDisplay(target); lastTargetRef.current = target; return; }
    const reduced = typeof window !== 'undefined'
      && window.matchMedia
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setDisplay(target); lastTargetRef.current = target; return; }

    const start = lastTargetRef.current === target ? from : lastTargetRef.current;
    lastTargetRef.current = target;
    startRef.current = null;

    function step(ts) {
      if (startRef.current == null) startRef.current = ts;
      const elapsed = ts - startRef.current;
      const t = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - t, 3); // cubic-out
      const current = start + (target - start) * eased;
      setDisplay(current);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    }
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration, from, animationsOff]);

  // Round before formatting — the animation interpolates through
  // fractional values, and custom format props (unlike the default)
  // don't round, which briefly rendered values like "0.351 / 2".
  return <>{format(Math.round(display))}</>;
}
