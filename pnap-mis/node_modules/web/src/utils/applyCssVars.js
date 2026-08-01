// applyCssVars — runtime CSS variable injection for the branding
// engine. Writes settings.theme.* values to document.documentElement
// as inline custom properties. Keeps the existing styles.css var
// names so every existing rule (`var(--primary)`, `var(--surface)`,
// etc.) reads the new theme automatically.
//
// Mapping note: the SystemSettings palette uses camelCase token
// names (`textPrimary`, `borderSoft`); the legacy CSS uses
// kebab-case + shorter names (`--text`, `--border`). The map below
// is the bridge. New palette tokens that don't have a legacy
// counterpart (sidebarBg, secondary, accent, tier*) are written
// under new var names for future styles to consume.

// Palette field → CSS variable name. Order matches the model's
// themePaletteSchema for easy auditing.
const PALETTE_TO_CSS_VAR = {
  primary: '--primary',
  primaryDark: '--primary-dark',
  secondary: '--secondary',
  accent: '--accent',

  background: '--bg',
  surface: '--surface',
  sidebarBg: '--sidebar-bg',
  sidebarFg: '--sidebar-fg',
  navbarBg: '--navbar-bg',

  textPrimary: '--text',
  textMuted: '--muted',
  textInverse: '--text-inverse',

  borderSoft: '--border',
  borderStrong: '--border-strong',

  success: '--success',
  warning: '--warning',
  danger: '--danger',
  info: '--info',

  tierCentral: '--tier-central',
  tierProvince: '--tier-province',
  tierDistrict: '--tier-district',
  tierArea: '--tier-area',
  tierBasicUnit: '--tier-basic-unit',
};

// Apply a palette object to :root. Skips empty/null values so a
// partial palette doesn't blank out vars the legacy CSS depends on.
export function applyPalette(palette) {
  if (!palette || typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [key, varName] of Object.entries(PALETTE_TO_CSS_VAR)) {
    const v = palette[key];
    if (v) root.style.setProperty(varName, v);
  }
  // shadowAlpha is special — it's a number, used in shadow rules.
  if (typeof palette.shadowAlpha === 'number') {
    root.style.setProperty('--shadow-alpha', String(palette.shadowAlpha));
  }
}

// Apply typography. Maps to a small handful of vars; legacy
// styles.css already reads `--radius` for border radius so we
// alias `borderRadius` → `--radius`.
export function applyTypography(typography) {
  if (!typography || typeof document === 'undefined') return;
  const root = document.documentElement;
  if (typography.fontFamily) {
    root.style.setProperty('--font-family', typography.fontFamily);
    // Apply to body too — some browsers don't inherit through `:root`
    document.body.style.fontFamily = typography.fontFamily;
  }
  if (typography.headingFontFamily) {
    root.style.setProperty('--font-heading', typography.headingFontFamily);
  }
  if (typeof typography.baseFontSize === 'number') {
    root.style.setProperty('--font-size-base', `${typography.baseFontSize}px`);
  }
  if (typeof typography.borderRadius === 'number') {
    // Legacy convention: --radius is the default. Add a numeric
    // value, no `px` since CSS rules may multiply or compose.
    root.style.setProperty('--radius', `${typography.borderRadius}px`);
  }
  if (typeof typography.spacingScale === 'number') {
    root.style.setProperty('--space-scale', String(typography.spacingScale));
  }
}

// Set the active mode by toggling a data attribute on <html>.
// CSS rules can target `[data-theme="dark"]` for dark-mode overrides
// when we wire the dark palette in PR B4.
export function setMode(mode) {
  if (typeof document === 'undefined') return;
  const m = (mode === 'DARK') ? 'dark' : 'light';
  document.documentElement.dataset.theme = m;
  // Also expose under a class for legacy tools that don't read data-*.
  document.documentElement.classList.toggle('theme-dark', m === 'dark');
  document.documentElement.classList.toggle('theme-light', m === 'light');
}

// Resolve activeMode='AUTO' to LIGHT or DARK using the OS preference.
export function resolveMode(activeMode) {
  if (activeMode !== 'AUTO') return activeMode || 'LIGHT';
  if (typeof window === 'undefined' || !window.matchMedia) return 'LIGHT';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'DARK' : 'LIGHT';
}

// Convenience: apply a full theme block (palette + mode) in one call.
// Used by BrandingProvider on initial load + on settings refresh.
export function applyTheme(theme) {
  if (!theme) return;
  const mode = resolveMode(theme.activeMode);
  const palette = mode === 'DARK' ? (theme.dark || theme.light) : (theme.light || theme.dark);
  applyPalette(palette);
  setMode(mode);
}
