const { z } = require('zod');

// Zod validators for the SystemSettings PATCH endpoint. The patch
// is deeply merged onto the live document, so every section + every
// field within is OPTIONAL. The settingsService runs themeValidator
// against the merged result for WCAG / completeness checks AFTER
// these shape validations pass.

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a 6-digit hex (#RRGGBB)');

const identitySchema = z.object({
  systemName:        z.string().min(1).max(80).optional(),
  shortName:         z.string().min(1).max(40).optional(),
  organizationName:  z.string().min(1).max(120).optional(),
  footerText:        z.string().max(300).optional(),
  loginTitle:        z.string().max(120).optional(),
  browserTabTitle:   z.string().max(80).optional(),
  metaDescription:   z.string().max(300).optional(),
  copyrightText:     z.string().max(120).optional(),
}).strict().optional();

const themePaletteSchema = z.object({
  primary: hex.optional(), primaryDark: hex.optional(),
  secondary: hex.optional(), accent: hex.optional(),

  background: hex.optional(), surface: hex.optional(),
  sidebarBg: hex.optional(), sidebarFg: hex.optional(), navbarBg: hex.optional(),

  textPrimary: hex.optional(), textMuted: hex.optional(), textInverse: hex.optional(),

  borderSoft: hex.optional(), borderStrong: hex.optional(),
  shadowAlpha: z.number().min(0).max(1).optional(),

  success: hex.optional(), warning: hex.optional(),
  danger: hex.optional(), info: hex.optional(),

  tierCentral: hex.optional(), tierProvince: hex.optional(),
  tierDistrict: hex.optional(), tierArea: hex.optional(), tierBasicUnit: hex.optional(),
}).strict().optional();

const themeSchema = z.object({
  activeMode: z.enum(['LIGHT', 'DARK', 'AUTO']).optional(),
  presetName: z.string().min(1).max(40).optional(),
  light: themePaletteSchema,
  dark: themePaletteSchema,
}).strict().optional();

const typographySchema = z.object({
  fontFamily:        z.string().min(1).max(120).optional(),
  headingFontFamily: z.string().min(1).max(120).optional(),
  baseFontSize:      z.number().int().min(12).max(18).optional(),
  headingScale:      z.number().min(1.0).max(1.5).optional(),
  borderRadius:      z.number().int().min(0).max(24).optional(),
  spacingScale:      z.number().min(0.8).max(1.5).optional(),
}).strict().optional();

const dashboardSchema = z.object({
  enableAnimations:        z.boolean().optional(),
  enableCountUpKpis:       z.boolean().optional(),
  chartStyle:              z.enum(['CLASSIC', 'MODERN']).optional(),
  compactMode:             z.boolean().optional(),
  glassmorphism:           z.boolean().optional(),
  sidebarDefaultCollapsed: z.boolean().optional(),
}).strict().optional();

const loginPageSchema = z.object({
  backgroundUrl:   z.string().max(500).optional(),
  heroText:        z.string().max(300).optional(),
  welcomeMessage:  z.string().max(200).optional(),
  slogan:          z.string().max(200).optional(),
  cardStyle:       z.enum(['SOLID', 'GLASS']).optional(),
}).strict().optional();

const reportBrandingSchema = z.object({
  showLogoOnPdf:   z.boolean().optional(),
  showLogoOnXlsx:  z.boolean().optional(),
  pdfFooterText:   z.string().max(300).optional(),
  pdfHeaderColor:  z.union([hex, z.literal('')]).optional(),
}).strict().optional();

// The omnibus PATCH schema. Every section is optional; deep-merge
// applies on the server. settingsService runs themeValidator on the
// merged result for WCAG / completeness.
const settingsPatchSchema = z.object({
  identity:       identitySchema,
  theme:          themeSchema,
  typography:     typographySchema,
  dashboard:      dashboardSchema,
  loginPage:      loginPageSchema,
  reportBranding: reportBrandingSchema,
  // Optional admin note attached to the SettingsVersion + audit
  // entry. Useful for "why did we change this?" forensics.
  changeNote: z.string().max(300).optional(),
}).strict();

// Restore endpoint — admin can attach a note explaining why they're
// rolling back. versionNumber comes from the URL param.
const restoreSchema = z.object({
  changeNote: z.string().max(300).optional(),
}).strict();

// Import endpoint — accepts a previously-exported bundle. Bundle
// shape is loose because it carries schemaVersion for forward-compat;
// the service validates the inner `bundle` object after merge.
const importSchema = z.object({
  schemaVersion: z.number().int().optional(),
  exportedAt: z.string().optional(),
  bundle: z.record(z.any()),
  changeNote: z.string().max(300).optional(),
}).strict();

module.exports = {
  settingsPatchSchema,
  restoreSchema,
  importSchema,
};
