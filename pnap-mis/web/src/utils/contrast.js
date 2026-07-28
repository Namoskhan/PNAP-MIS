// Client-side WCAG 2.x contrast math. Mirrors
// server/src/utils/themeValidator.js so the admin UI shows
// real-time contrast feedback as colors are tweaked, without a
// round-trip per keystroke. Server still owns the authoritative
// validation at save time.

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function _srgbChannel(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function luminance(hex) {
  if (!HEX_RE.test(hex)) return NaN;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * _srgbChannel(r)
       + 0.7152 * _srgbChannel(g)
       + 0.0722 * _srgbChannel(b);
}

// contrast ratio per WCAG 2.x: (L_lighter + 0.05) / (L_darker + 0.05)
export function contrastRatio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  const lighter = Math.max(a, b);
  const darker  = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

// Map a ratio to a WCAG conformance level. Used by ContrastBadge.
//   ≥ 7    → AAA (normal text)
//   ≥ 4.5  → AA  (normal text)
//   ≥ 3    → AA-large (large text / UI components)
//   < 3    → Fail
export function contrastLevel(ratio) {
  if (Number.isNaN(ratio)) return { code: 'UNKNOWN', label: '—', color: '#9ca3af' };
  if (ratio >= 7)   return { code: 'AAA',   label: 'AAA',   color: '#16a34a' };
  if (ratio >= 4.5) return { code: 'AA',    label: 'AA',    color: '#16a34a' };
  if (ratio >= 3)   return { code: 'AA-LG', label: 'AA-lg', color: '#d97706' };
  return                  { code: 'FAIL',  label: 'Fail',  color: '#dc2626' };
}

// Normalize user input — accept '#abc', 'abc', 'aabbcc' etc., return
// '#aabbcc'. Returns the input verbatim if we can't make sense of it
// (the consumer shows an inline pattern-mismatch hint).
export function normalizeHex(input) {
  if (!input) return '';
  let s = String(input).trim().toLowerCase();
  if (s.startsWith('#')) s = s.slice(1);
  if (/^[0-9a-f]{3}$/.test(s)) {
    s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  }
  if (/^[0-9a-f]{6}$/.test(s)) return `#${s}`;
  return input; // give back as-is so the input field doesn't blank
}
