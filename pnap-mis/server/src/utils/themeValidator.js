// themeValidator — WCAG contrast checks + completeness checks for
// candidate theme palettes. Runs server-side on every settings
// update so admins can't ship a theme that makes the app unusable
// (white text on white background, etc.).
//
// Returns a structured result:
//   { ok: true, errors: [], warnings: [] }
// Callers throw an ApiError(400, 'THEME_VALIDATION', { errors }) on
// any non-empty errors[]. Warnings are surfaced to the UI but don't
// block save.

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// ─── sRGB → relative luminance (WCAG 2.x formula) ─────────────────

function _srgbChannel(c) {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function _luminance(hex) {
  const m = HEX_RE.exec(hex);
  if (!m) return NaN;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * _srgbChannel(r)
       + 0.7152 * _srgbChannel(g)
       + 0.0722 * _srgbChannel(b);
}

// contrast ratio per WCAG 2.x: (L_lighter + 0.05) / (L_darker + 0.05)
// Returns a number from 1 (no contrast) to 21 (max).
function contrastRatio(fgHex, bgHex) {
  const a = _luminance(fgHex);
  const b = _luminance(bgHex);
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  const lighter = Math.max(a, b);
  const darker  = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

// ─── Completeness ─────────────────────────────────────────────────

// The full set of palette tokens. A palette MUST set every one of
// these to be considered complete. Used by the import endpoint and
// the validator's "what's missing" check.
const REQUIRED_TOKENS = [
  'primary', 'primaryDark', 'secondary', 'accent',
  'background', 'surface',
  'sidebarBg', 'sidebarFg', 'navbarBg',
  'textPrimary', 'textMuted', 'textInverse',
  'borderSoft', 'borderStrong',
  'success', 'warning', 'danger', 'info',
  'tierCentral', 'tierProvince', 'tierDistrict', 'tierArea', 'tierBasicUnit',
];

function _isHex(v) {
  return typeof v === 'string' && HEX_RE.test(v);
}

// Walk every required token. Anything missing or non-hex is an error.
function validateCompleteness(palette, label) {
  const errors = [];
  for (const k of REQUIRED_TOKENS) {
    const v = palette?.[k];
    if (v === undefined || v === null || v === '') {
      errors.push({ path: `${label}.${k}`, message: `${k} is required` });
    } else if (!_isHex(v)) {
      errors.push({ path: `${label}.${k}`, message: `${k} must be a 6-digit hex (#RRGGBB)`, value: v });
    }
  }
  return errors;
}

// ─── Contrast pairs ───────────────────────────────────────────────

// Critical foreground/background pairs that must hit WCAG AA (4.5:1
// for normal text). Four pairs cover the visual disaster cases:
//   • body text unreadable on cards / page background
//   • button labels unreadable on primary actions
//   • sidebar nav unreadable on sidebar background
// `textInverse` semantically means "text that pairs with primary"
// (button labels). Don't pair it against sidebarBg — sidebarFg is
// the canonical sidebar text color and already covers that surface.
const CRITICAL_PAIRS_TEXT = [
  { fg: 'textPrimary', bg: 'surface',    label: 'Body text on cards' },
  { fg: 'textPrimary', bg: 'background', label: 'Body text on page background' },
  { fg: 'textInverse', bg: 'primary',    label: 'Button text on primary action' },
  { fg: 'sidebarFg',   bg: 'sidebarBg',  label: 'Sidebar text on sidebar background' },
];

// Tier badge colors must hit AA-large (3:1) against the surface
// they sit on — they're typically status pills, not body text.
const TIER_PAIRS_UI = [
  'tierCentral', 'tierProvince', 'tierDistrict', 'tierArea', 'tierBasicUnit',
].map((k) => ({ fg: k, bg: 'surface', label: `${k} pill on card` }));

function _checkPairs(palette, pairs, minRatio, label, errors, warnings) {
  for (const p of pairs) {
    const fgHex = palette?.[p.fg];
    const bgHex = palette?.[p.bg];
    if (!_isHex(fgHex) || !_isHex(bgHex)) continue; // completeness check covers this
    const ratio = contrastRatio(fgHex, bgHex);
    if (Number.isNaN(ratio)) continue;
    const formatted = ratio.toFixed(2);
    if (ratio < minRatio) {
      errors.push({
        path: `${label}.${p.fg}/${p.bg}`,
        message: `${p.label}: contrast ${formatted} : 1 is below ${minRatio} : 1`,
        actual: Number(formatted),
        threshold: minRatio,
      });
    } else if (ratio < minRatio + 0.5) {
      // Tight margin — flag as warning so the admin notices it's borderline.
      warnings.push({
        path: `${label}.${p.fg}/${p.bg}`,
        message: `${p.label}: contrast ${formatted} : 1 — close to the ${minRatio} : 1 threshold`,
        actual: Number(formatted),
      });
    }
  }
}

// ─── Public entry point ───────────────────────────────────────────

// validatePalette — runs both completeness AND contrast checks.
// `mode` is 'LIGHT' or 'DARK' purely for error labels (the math is
// the same regardless).
function validatePalette(palette, mode = 'LIGHT') {
  const label = mode.toLowerCase();
  const errors = [];
  const warnings = [];

  errors.push(...validateCompleteness(palette, label));

  // Only run contrast checks if completeness passed enough that the
  // critical tokens exist — otherwise we'd flood with NaN errors.
  _checkPairs(palette, CRITICAL_PAIRS_TEXT, 4.5, label, errors, warnings);
  _checkPairs(palette, TIER_PAIRS_UI,        3.0, label, errors, warnings);

  return { ok: errors.length === 0, errors, warnings };
}

// Validate a full theme block (light + dark + activeMode).
function validateTheme(theme) {
  const errors = [];
  const warnings = [];
  if (theme?.light) {
    const r = validatePalette(theme.light, 'LIGHT');
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  if (theme?.dark) {
    const r = validatePalette(theme.dark, 'DARK');
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  return { ok: errors.length === 0, errors, warnings };
}

module.exports = {
  contrastRatio,
  validateCompleteness,
  validatePalette,
  validateTheme,
  REQUIRED_TOKENS,
};
