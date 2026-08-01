// Code-locked theme presets. Admin can pick from these as a starting
// point and tweak; once tweaked, settings.theme.presetName flips to
// 'CUSTOM'. Adding new presets is a code change (NOT a runtime
// configuration), which is the safety guarantee that keeps theming
// auditable: admins compose, never define new structural primitives.
//
// Color values are hex strings. The frontend's applyCssVars utility
// converts them to HSL/RGB triplets for the `:root { --color-x: ... }`
// CSS-variables plumbing.

// Corporate MIS blue — the system baseline. MUST stay in sync with
// the :root tokens in web/src/styles.css and the pre-JS fallback
// block in web/index.html so first paint, CSS defaults, and the
// runtime branding engine all agree on one palette.
const PKNAP_DEFAULT_LIGHT = {
  primary: '#1e40af', primaryDark: '#1e3a8a', secondary: '#0f172a', accent: '#3b82f6',

  background: '#f8fafc', surface: '#ffffff',
  sidebarBg: '#0f172a', sidebarFg: '#f1f5f9', navbarBg: '#ffffff',

  textPrimary: '#0f172a', textMuted: '#64748b', textInverse: '#ffffff',

  borderSoft: '#e2e8f0', borderStrong: '#cbd5e1', shadowAlpha: 0.08,

  success: '#059669', warning: '#d97706', danger: '#dc2626', info: '#0284c7',

  tierCentral: '#15803d', tierProvince: '#1e40af', tierDistrict: '#b45309',
  tierArea: '#c2410c', tierBasicUnit: '#475569',
};

const PKNAP_DEFAULT_DARK = {
  primary: '#3b82f6', primaryDark: '#2563eb', secondary: '#e2e8f0', accent: '#60a5fa',

  background: '#0f172a', surface: '#1e293b',
  sidebarBg: '#0b1220', sidebarFg: '#e2e8f0', navbarBg: '#1e293b',

  textPrimary: '#e2e8f0', textMuted: '#94a3b8', textInverse: '#020617',

  borderSoft: '#334155', borderStrong: '#475569', shadowAlpha: 0.3,

  success: '#34d399', warning: '#fbbf24', danger: '#f87171', info: '#38bdf8',

  tierCentral: '#4ade80', tierProvince: '#60a5fa', tierDistrict: '#fbbf24',
  tierArea: '#fb923c', tierBasicUnit: '#94a3b8',
};

const MIDNIGHT_LIGHT = {
  primary: '#1e40af', primaryDark: '#1e3a8a', secondary: '#0f172a', accent: '#0ea5e9',

  background: '#f8fafc', surface: '#ffffff',
  sidebarBg: '#0f172a', sidebarFg: '#f1f5f9', navbarBg: '#ffffff',

  textPrimary: '#0f172a', textMuted: '#64748b', textInverse: '#ffffff',

  borderSoft: '#e2e8f0', borderStrong: '#cbd5e1', shadowAlpha: 0.08,

  success: '#059669', warning: '#d97706', danger: '#dc2626', info: '#0284c7',

  tierCentral: '#059669', tierProvince: '#1e40af', tierDistrict: '#a16207',
  tierArea: '#c2410c', tierBasicUnit: '#475569',
};

const MIDNIGHT_DARK = {
  primary: '#3b82f6', primaryDark: '#2563eb', secondary: '#e2e8f0', accent: '#38bdf8',

  background: '#020617', surface: '#0f172a',
  sidebarBg: '#020617', sidebarFg: '#cbd5e1', navbarBg: '#0f172a',

  textPrimary: '#e2e8f0', textMuted: '#94a3b8', textInverse: '#020617',

  borderSoft: '#1e293b', borderStrong: '#334155', shadowAlpha: 0.4,

  success: '#10b981', warning: '#f59e0b', danger: '#ef4444', info: '#06b6d4',

  tierCentral: '#10b981', tierProvince: '#3b82f6', tierDistrict: '#f59e0b',
  tierArea: '#fb923c', tierBasicUnit: '#94a3b8',
};

const MINIMAL_LIGHT = {
  primary: '#374151', primaryDark: '#1f2937', secondary: '#6b7280', accent: '#9ca3af',

  background: '#ffffff', surface: '#f9fafb',
  sidebarBg: '#f9fafb', sidebarFg: '#1f2937', navbarBg: '#ffffff',

  textPrimary: '#111827', textMuted: '#6b7280', textInverse: '#ffffff',

  borderSoft: '#e5e7eb', borderStrong: '#d1d5db', shadowAlpha: 0.04,

  success: '#16a34a', warning: '#ca8a04', danger: '#dc2626', info: '#0891b2',

  // tierDistrict must clear the 3:1 pill-contrast check on the
  // near-white surface — #ca8a04 sat at 2.81:1 and made this preset
  // impossible to apply (the validator rejected its own factory
  // palette). yellow-700 keeps the amber identity and passes.
  tierCentral: '#16a34a', tierProvince: '#2563eb', tierDistrict: '#a16207',
  tierArea: '#ea580c', tierBasicUnit: '#6b7280',
};

const MINIMAL_DARK = {
  primary: '#9ca3af', primaryDark: '#6b7280', secondary: '#d1d5db', accent: '#e5e7eb',

  background: '#0a0a0a', surface: '#171717',
  sidebarBg: '#171717', sidebarFg: '#e5e7eb', navbarBg: '#171717',

  textPrimary: '#f3f4f6', textMuted: '#9ca3af', textInverse: '#0a0a0a',

  borderSoft: '#262626', borderStrong: '#404040', shadowAlpha: 0.3,

  success: '#22c55e', warning: '#eab308', danger: '#ef4444', info: '#06b6d4',

  tierCentral: '#22c55e', tierProvince: '#60a5fa', tierDistrict: '#eab308',
  tierArea: '#fb923c', tierBasicUnit: '#9ca3af',
};

const PRESETS = {
  PKNAP_DEFAULT: {
    code: 'PKNAP_DEFAULT',
    label: 'PKNAP Default',
    description: 'Corporate MIS blue with slate neutrals. The system\'s baseline.',
    light: PKNAP_DEFAULT_LIGHT,
    dark: PKNAP_DEFAULT_DARK,
  },
  MIDNIGHT: {
    code: 'MIDNIGHT',
    label: 'Midnight Blue',
    description: 'Deep navy with sky-blue accents. Calm and corporate.',
    light: MIDNIGHT_LIGHT,
    dark: MIDNIGHT_DARK,
  },
  MINIMAL: {
    code: 'MINIMAL',
    label: 'Minimal Gray',
    description: 'Neutral grayscale palette. Maximum contrast, minimum visual noise.',
    light: MINIMAL_LIGHT,
    dark: MINIMAL_DARK,
  },
};

function listPresets() {
  return Object.values(PRESETS);
}

function getPreset(code) {
  return PRESETS[String(code || '').toUpperCase()] || null;
}

module.exports = {
  PRESETS,
  listPresets,
  getPreset,
  // Direct exports for the seeder + the validator's "completeness"
  // check that wants to compare against a known-good shape.
  PKNAP_DEFAULT_LIGHT,
  PKNAP_DEFAULT_DARK,
};
