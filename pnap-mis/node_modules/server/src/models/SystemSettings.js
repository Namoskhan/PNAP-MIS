const mongoose = require('mongoose');

// SystemSettings — the SINGLETON document holding every piece of
// runtime branding state. Pinned with a literal _id of 'singleton'
// so there's exactly one row and `findById('singleton')` is the
// canonical lookup. Mongoose's _id-must-be-ObjectId default is
// overridden here to a String type.
//
// Two-layer design:
//   • This document is admin-editable (every field).
//   • The CSS variable namespace + component layout that consumes
//     these values is code-locked.
//
// Branding asset URLs (logos, login background) are populated by
// the upload pipeline that lands in PR B3. PR B1 ships the schema +
// service + endpoints; the URL fields stay empty until uploads land.

const themePaletteSchema = new mongoose.Schema(
  {
    primary: String, primaryDark: String, secondary: String, accent: String,

    background: String, surface: String,
    sidebarBg: String, sidebarFg: String, navbarBg: String,

    textPrimary: String, textMuted: String, textInverse: String,

    borderSoft: String, borderStrong: String, shadowAlpha: Number,

    success: String, warning: String, danger: String, info: String,

    tierCentral: String, tierProvince: String, tierDistrict: String,
    tierArea: String, tierBasicUnit: String,
  },
  { _id: false }
);

const logoSlotSchema = new mongoose.Schema(
  {
    url: String,
    uploadedAt: Date,
    sizeBytes: Number,
    contentType: String,
  },
  { _id: false }
);

const systemSettingsSchema = new mongoose.Schema(
  {
    // String _id, not ObjectId — singleton invariant.
    _id: { type: String, default: 'singleton' },

    identity: {
      systemName:        { type: String, default: 'PNAP-MIS' },
      shortName:         { type: String, default: 'PKNAP' },
      organizationName:  { type: String, default: 'PKNAP' },
      footerText:        { type: String, default: '© PKNAP. All rights reserved.' },
      loginTitle:        { type: String, default: 'Welcome to PKNAP' },
      browserTabTitle:   { type: String, default: 'PNAP-MIS' },
      metaDescription:   { type: String, default: 'Hierarchical organization management for PKNAP.' },
      copyrightText:     { type: String, default: '© PKNAP' },
    },

    logos: {
      sidebar:     logoSlotSchema,
      sidebarDark: logoSlotSchema,
      login:       logoSlotSchema,
      favicon:     logoSlotSchema,
      print:       logoSlotSchema,
    },

    theme: {
      activeMode:  { type: String, enum: ['LIGHT', 'DARK', 'AUTO'], default: 'LIGHT' },
      presetName:  { type: String, default: 'PKNAP_DEFAULT' },
      light:       themePaletteSchema,
      dark:        themePaletteSchema,
    },

    typography: {
      fontFamily:        { type: String, default: 'Inter, system-ui, sans-serif' },
      headingFontFamily: { type: String, default: 'Inter, system-ui, sans-serif' },
      baseFontSize:      { type: Number, default: 14, min: 12, max: 18 },
      headingScale:      { type: Number, default: 1.2, min: 1.0, max: 1.5 },
      borderRadius:      { type: Number, default: 8, min: 0, max: 24 },
      spacingScale:      { type: Number, default: 1.0, min: 0.8, max: 1.5 },
    },

    dashboard: {
      enableAnimations:        { type: Boolean, default: true },
      enableCountUpKpis:       { type: Boolean, default: true },
      chartStyle:              { type: String, enum: ['CLASSIC', 'MODERN'], default: 'MODERN' },
      compactMode:             { type: Boolean, default: false },
      glassmorphism:           { type: Boolean, default: false },
      sidebarDefaultCollapsed: { type: Boolean, default: false },
    },

    loginPage: {
      backgroundUrl:   { type: String, default: '' },
      heroText:        { type: String, default: '' },
      welcomeMessage:  { type: String, default: 'Sign in to continue' },
      slogan:          { type: String, default: '' },
      cardStyle:       { type: String, enum: ['SOLID', 'GLASS'], default: 'SOLID' },
    },

    reportBranding: {
      showLogoOnPdf:   { type: Boolean, default: true },
      showLogoOnXlsx:  { type: Boolean, default: true },
      pdfFooterText:   { type: String, default: '' },
      pdfHeaderColor:  { type: String, default: '' },
    },

    // Bumps on every save. SettingsVersion rows pin to this number.
    settingsVersion: { type: Number, default: 1 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, _id: false } // _id declared on the field above with default 'singleton'
);

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);
