import { contrastRatio, contrastLevel } from '../../utils/contrast';

// ContrastBadge — small inline pill showing the WCAG conformance
// level for a fg/bg color pair. Used next to color pickers so admins
// see immediately when their pick fails accessibility.
//
// Pass a `target` ratio (default 4.5 for normal text) so the badge
// styling can match the spec the caller cares about. Returns null
// if either color is malformed (the caller's hex regex will surface
// the invalid value separately).

export default function ContrastBadge({ fg, bg, target = 4.5, label }) {
  if (!fg || !bg) return null;
  const ratio = contrastRatio(fg, bg);
  if (Number.isNaN(ratio)) return null;
  const level = contrastLevel(ratio);
  const ok = ratio >= target;
  const fmt = ratio.toFixed(2);

  return (
    <span
      title={`Contrast ${fmt} : 1${label ? ` (${label})` : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 600,
        background: ok ? 'rgba(22, 163, 74, 0.12)' : 'rgba(220, 38, 38, 0.12)',
        color: level.color,
        whiteSpace: 'nowrap',
      }}
    >
      {fmt} · {level.label}
    </span>
  );
}
