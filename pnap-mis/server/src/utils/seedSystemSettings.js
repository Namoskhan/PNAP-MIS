const SystemSettings = require('../models/SystemSettings');
const themePresets = require('./themePresets');

// seedSystemSettings — idempotent insert of the SystemSettings
// singleton on first boot. Identity defaults match PKNAP; theme
// gets PKNAP_DEFAULT light + dark palettes.
//
// Idempotent: only inserts when the doc is missing. Once admin
// edits anything, the seeder NEVER overwrites (every subsequent
// boot is a no-op).

async function seedSystemSettings() {
  const existing = await SystemSettings.findById('singleton');
  if (existing) {
    // Reconcile: a DB that is still on the stock preset (admin never
    // customized — settingsService flips presetName to 'CUSTOM' on
    // any palette edit) follows the preset definition when it changes
    // in code. Without this, the palette stored at first boot would
    // shadow every later code-level preset update forever.
    const presetName = existing.theme?.presetName;
    const known = themePresets.getPreset(presetName);
    if (known) {
      const stored = JSON.stringify({
        light: existing.theme?.light || {},
        dark: existing.theme?.dark || {},
      });
      const current = JSON.stringify({ light: known.light, dark: known.dark });
      if (stored !== current) {
        existing.theme.light = known.light;
        existing.theme.dark = known.dark;
        existing.markModified('theme');
        await existing.save();
        return { inserted: 0, reconciled: 1 };
      }
    }
    return { inserted: 0 };
  }

  const preset = themePresets.PRESETS.PKNAP_DEFAULT;
  await SystemSettings.create({
    _id: 'singleton',
    identity: {
      systemName: 'PNAP-MIS',
      shortName: 'PKNAP',
      organizationName: 'PKNAP',
      footerText: '© PKNAP. All rights reserved.',
      loginTitle: 'Welcome to PKNAP',
      browserTabTitle: 'PNAP-MIS',
      metaDescription: 'Hierarchical organization management for PKNAP.',
      copyrightText: '© PKNAP',
    },
    logos: {},  // populated by the upload pipeline (PR B3)
    theme: {
      activeMode: 'LIGHT',
      presetName: 'PKNAP_DEFAULT',
      light: preset.light,
      dark: preset.dark,
    },
    typography: {
      fontFamily: 'Inter, system-ui, sans-serif',
      headingFontFamily: 'Inter, system-ui, sans-serif',
      baseFontSize: 14,
      headingScale: 1.2,
      borderRadius: 8,
      spacingScale: 1.0,
    },
    dashboard: {
      enableAnimations: true,
      enableCountUpKpis: true,
      chartStyle: 'MODERN',
      compactMode: false,
      glassmorphism: false,
      sidebarDefaultCollapsed: false,
    },
    loginPage: {
      backgroundUrl: '',
      heroText: '',
      welcomeMessage: 'Sign in to continue',
      slogan: '',
      cardStyle: 'SOLID',
    },
    reportBranding: {
      showLogoOnPdf: true,
      showLogoOnXlsx: true,
      pdfFooterText: '',
      pdfHeaderColor: '',
    },
    settingsVersion: 1,
  });

  return { inserted: 1 };
}

module.exports = { seedSystemSettings };
